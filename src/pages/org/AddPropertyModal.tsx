import { useId, useRef, useState, type FormEvent } from "react";
import { Field, PhotoPicker, Section, input, useSlugCheck } from "./propertyFormParts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ApiError, errorMessage, useApi, type ContractType, type InviteResult, type NewPropertyInvite, type OrganizationDetail, type PropertyProfile, type PropertyType, type StaffOption } from "../../lib/api";
import { CONTRACT_LABELS, PROPERTY_ROLE_LABELS, PROPERTY_TYPE_LABELS } from "../../lib/format";
import { MAX_IMAGE_BYTES, squareWebp } from "../../lib/images";
import { staticMapUrl, placesAvailable } from "../../lib/places";
import { slugify } from "../../lib/slug";
import { Alert, Button } from "../../components/ui";
import { Avatar, Pill } from "../../components/display";
import { AddressField } from "../../components/AddressField";
import { Modal } from "../../components/overlay";
import { OrgLogo } from "../../components/brand";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { cx } from "../../components/styles";
import { propertyPath } from "../admin/paths";

export type OrgOutletContext = { detail: OrganizationDetail; area: "admin" | "portal"; isAdmin: boolean };

type Invite = NewPropertyInvite & { key: number };

const AdminsOnly = () => <Pill tone="gold" className="py-0.5! text-[11px]">CBES admins only</Pill>;

/**
 * Add a property to an organization (ADMIN_PORTAL_SPEC 7.9). Opens over the organization page at
 * …/organizations/:orgId/properties/new for admins and the organization's representatives.
 */
export function AddPropertyModal() {
  const { detail, area, isAdmin } = useOutletContext<OrgOutletContext>();
  const { organization, properties } = detail;
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Back to the organization page this opened over.
  const close = () => navigate("..");

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [zip, setZip] = useState("");
  const [place, setPlace] = useState<{ lat: number | null; lng: number | null; googlePlaceId: string } | null>(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState("");
  const [buildings, setBuildings] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType | "">("");
  const [startDate, setStartDate] = useState("");
  const [contract, setContract] = useState<ContractType | "">("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [jobId, setJobId] = useState("");
  const [stewardId, setStewardId] = useState("");
  const [invites, setInvites] = useState<Invite[]>([{ key: 0, email: "", name: "", role: "manager" }]);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(1);

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const slugCheck = useSlugCheck(organization.id, effectiveSlug);
  const stewards = useQuery({
    queryKey: ["admin", "stewards"],
    queryFn: () => api<{ items: StaffOption[] }>("/admin/stewards"),
    enabled: isAdmin,
  });

  const filled = invites.filter((i) => i.email.trim());
  const count = properties.length + 1;
  const submitLabel = filled.length ? `Add property and send ${filled.length} invite${filled.length === 1 ? "" : "s"}` : "Add property";

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return setErrors((e) => ({ ...e, photo: "That image is over 5 MB. Choose a smaller one." }));
    try {
      const blob = await squareWebp(file);
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
      setErrors((e) => {
        const rest = { ...e };
        delete rest.photo;
        return rest;
      });
    } catch (err) {
      setErrors((e) => ({ ...e, photo: errorMessage(err) }));
    }
  };

  const validate = () => {
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Enter the property name";
    const n = Number(units);
    if (!units || !Number.isInteger(n) || n < 1 || n > 5000) found.unitCount = "Enter the number of units, 1 to 5,000";
    const seen = new Map<string, number>();
    invites.forEach((inv, i) => {
      const email = inv.email.trim().toLowerCase();
      if (!email) return;
      if (!/^\S+@\S+\.\S+$/.test(email)) found[`invites.${i}.email`] = "Enter a valid email address";
      else if (seen.has(email)) found[`invites.${i}.email`] = "This email is already on the list";
      seen.set(email, i);
    });
    return found;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      let photoUploadId: string | undefined;
      if (photo) {
        ({ uploadId: photoUploadId } = await api<{ uploadId: string }>(`/organizations/${organization.id}/photo-uploads`, {
          method: "POST",
          body: photo.blob,
          headers: { "Content-Type": photo.blob.type },
        }));
      }
      const res = await api<{ property: PropertyProfile; invitations: InviteResult[] }>(`/organizations/${organization.id}/properties`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          county: county.trim() || undefined,
          zip: zip.trim() || undefined,
          ...(place ?? {}),
          photoUploadId,
          unitCount: Number(units),
          buildingCount: buildings ? Number(buildings) : undefined,
          propertyType: propertyType || undefined,
          serviceStartDate: startDate || undefined,
          contractType: contract || undefined,
          slug: effectiveSlug || undefined,
          ...(isAdmin ? { connecteamJobId: jobId.trim() || undefined, stewardUserId: stewardId || undefined } : {}),
          invites: filled.map(({ email, name: n, role }) => ({ email: email.trim(), name: n?.trim() || undefined, role })),
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization", organization.id] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
      const sent = res.invitations.filter((i) => i.status !== "failed").length;
      const failed = res.invitations.filter((i) => i.status === "failed");
      toast.success(sent ? `${res.property.name} added. ${sent} invitation${sent === 1 ? "" : "s"} sent.` : `${res.property.name} added.`);
      if (failed.length) toast.error(`These invitations weren't sent: ${failed.map((f) => `${f.email}${f.error ? ` (${f.error})` : ""}`).join(", ")}. Invite them again from the property's Team tab.`);
      navigate(area === "admin" ? propertyPath(organization.id, res.property.id) : `/portal/properties/${res.property.id}`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  const autofilled = Boolean(place);
  const fill = autofilled ? "bg-subtle" : "";

  return (
    <Modal
      size="lg"
      title="Add a property"
      icon={<OrgLogo org={organization} size={44} />}
      context={`${organization.name} · ${properties.length} of ${organization.propertyLimit} properties`}
      onClose={close}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 text-[13px] text-muted">
            <span aria-hidden="true" className="block h-1.5 w-[120px] overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-navy" style={{ width: `${Math.min(100, (count / organization.propertyLimit) * 100)}%` }} />
            </span>
            This will be property {count} of {organization.propertyLimit}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="add-property" disabled={saving}>
              {saving ? "Adding…" : submitLabel}
            </Button>
          </span>
        </div>
      }
    >
      <form id="add-property" onSubmit={submit} noValidate className="flex flex-col gap-7">
        <Section n={1} title="Location">
          <AddressField
            value={address}
            error={errors.address}
            onChange={(v) => {
              setAddress(v);
              setPlace(null);
            }}
            onPlace={(p) => {
              setAddress(p.address);
              setCity(p.city);
              setCounty(p.county);
              setZip(p.zip);
              setPlace({ lat: p.lat, lng: p.lng, googlePlaceId: p.googlePlaceId });
              if (!name.trim() && p.establishment) setName(p.establishment);
            }}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-3">
              <Field label="City" error={errors.city}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={errors.city ? true : undefined} value={city} onChange={(e) => setCity(e.target.value)} className={cx(input, fill)} />}
              </Field>
              <Field label="County" error={errors.county}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={errors.county ? true : undefined} value={county} onChange={(e) => setCounty(e.target.value)} className={cx(input, fill)} />}
              </Field>
              <Field label="ZIP" error={errors.zip}>
                {(id, d) => <input id={id} inputMode="numeric" autoComplete="postal-code" aria-describedby={d} aria-invalid={errors.zip ? true : undefined} value={zip} onChange={(e) => setZip(e.target.value)} className={cx(input, fill)} />}
              </Field>
              {autofilled && (
                <p role="status" className="m-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-success sm:col-span-3">
                  <Icon name="check" size={15} strokeWidth={2.6} />
                  Filled in from the address. Edit if anything is off.
                </p>
              )}
            </div>
            {place?.lat != null && place.lng != null && placesAvailable() ? (
              <img src={staticMapUrl(place.lat, place.lng)} alt={`Map of ${address}`} className="h-[130px] w-full rounded-xl border border-line object-cover" />
            ) : (
              <div aria-hidden="true" className="hidden h-[130px] items-center justify-center rounded-xl border border-dashed border-placeholder bg-canvas text-[12.5px] text-muted md:flex">
                Map appears when you pick an address
              </div>
            )}
          </div>
        </Section>

        <Section n={2} title="Profile">
          <div className="flex flex-wrap gap-5">
            <PhotoPicker url={photo?.url ?? null} error={errors.photo ?? errors.photoUploadId} onPick={pickPhoto} onRemove={() => setPhoto(null)} />
            <div className="grid min-w-0 flex-[1_1_400px] grid-cols-2 gap-3">
              <Field label="Property name" error={errors.name} className="col-span-2">
                {(id, d) => <input id={id} required aria-describedby={d} aria-invalid={errors.name ? true : undefined} value={name} onChange={(e) => setName(e.target.value)} className={input} />}
              </Field>
              <Field label="Units" error={errors.unitCount}>
                {(id, d) => <input id={id} type="number" inputMode="numeric" min={1} max={5000} required aria-describedby={d} aria-invalid={errors.unitCount ? true : undefined} value={units} onChange={(e) => setUnits(e.target.value)} className={input} />}
              </Field>
              <Field label="Buildings" hint="Optional" error={errors.buildingCount}>
                {(id, d) => <input id={id} type="number" inputMode="numeric" min={1} max={500} aria-describedby={d} aria-invalid={errors.buildingCount ? true : undefined} value={buildings} onChange={(e) => setBuildings(e.target.value)} className={input} />}
              </Field>
              <fieldset className="col-span-2 m-0 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[13.5px] font-semibold">Property type</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                    <label
                      key={t}
                      className={cx(
                        "flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-[13.5px] focus-within:ring-2 focus-within:ring-gold",
                        propertyType === t ? "border-2 border-navy bg-tint-2 font-bold" : "border border-field font-semibold hover:bg-canvas",
                      )}
                    >
                      <input type="radio" name="propertyType" value={t} checked={propertyType === t} onChange={() => setPropertyType(t)} className="accent-navy" />
                      {PROPERTY_TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        </Section>

        <Section n={3} title="Service">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Service start date" error={errors.serviceStartDate}>
              {(id, d) => <input id={id} type="date" aria-describedby={d} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />}
            </Field>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[13.5px] font-semibold">Contract</legend>
              <div className="flex rounded-[10px] bg-canvas p-[3px]">
                {(Object.keys(CONTRACT_LABELS) as ContractType[]).map((c) => (
                  <label
                    key={c}
                    className={cx(
                      "relative flex-1 cursor-pointer rounded-lg px-1 py-2.5 text-center text-[13px] focus-within:ring-2 focus-within:ring-gold",
                      contract === c ? "bg-white font-bold text-navy-ink shadow-[0_1px_2px_rgba(26,28,94,0.15)]" : "font-semibold text-muted",
                    )}
                  >
                    <input type="radio" name="contract" value={c} checked={contract === c} onChange={() => setContract(c)} className="absolute opacity-0" />
                    {CONTRACT_LABELS[c]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              label="Resident report web address"
              error={errors.slug}
              hint={slugCheck.available === false ? undefined : "Printed in the QR code on every container."}
            >
              {(id, d) => (
                <>
                  <span className="flex h-11 overflow-hidden rounded-[10px] border border-field focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25">
                    <span className="flex items-center border-r border-field bg-canvas px-2.5 text-[14px] font-semibold text-muted">/report?p=</span>
                    <input
                      id={id}
                      aria-describedby={[d, `${id}-check`].filter(Boolean).join(" ")}
                      aria-invalid={errors.slug || slugCheck.available === false ? true : undefined}
                      value={effectiveSlug}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setSlug(e.target.value.toLowerCase());
                      }}
                      className="min-w-0 flex-1 border-0 px-2.5 text-[14px] outline-none"
                    />
                  </span>
                  <span id={`${id}-check`} aria-live="polite" className="text-[12px]">
                    {slugCheck.available === false && (
                      <span className="font-semibold text-danger">
                        Another property uses this address.
                        {slugCheck.suggestion && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="font-bold text-navy underline"
                              onClick={() => {
                                setSlugEdited(true);
                                setSlug(slugCheck.suggestion!);
                              }}
                            >
                              Use {slugCheck.suggestion}
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </>
              )}
            </Field>
            {isAdmin && (
              <Field label="Connecteam job ID" extra={<AdminsOnly />} hint="Links valet clock-ins to this property's weekly report." error={errors.connecteamJobId}>
                {(id, d) => <input id={id} placeholder="e.g. 48213" aria-describedby={d} value={jobId} onChange={(e) => setJobId(e.target.value)} className={input} />}
              </Field>
            )}
          </div>
        </Section>

        <Section n={4} title="People">
          <p className="-mt-1.5 mb-0 text-[13px] text-muted">
            Invite the property's team. They set a password and two-step verification from the invitation email. Representatives of {organization.name} already see this property.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {invites.map((inv, i) => {
              const set = (patch: Partial<Invite>) => setInvites((all) => all.map((x) => (x.key === inv.key ? { ...x, ...patch } : x)));
              const err = errors[`invites.${i}.email`] ?? errors[`invites.${i}`];
              return (
                <li key={inv.key} className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_40px] sm:items-start">
                  <div>
                    <label className={cx("flex h-11 items-center gap-2 rounded-[10px] border px-3 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25", err ? "border-danger" : "border-field")}>
                      <span className="sr-only">Email for person {i + 1}</span>
                      <Icon name="mail" size={16} strokeWidth={2} className="text-muted" />
                      <input type="email" placeholder="Email" autoComplete="off" aria-invalid={err ? true : undefined} value={inv.email} onChange={(e) => set({ email: e.target.value })} className="min-w-0 flex-1 border-0 text-[14px] outline-none" />
                    </label>
                    {err && <p className="mt-1 mb-0 text-[13px] font-semibold text-danger">{err}</p>}
                  </div>
                  <label>
                    <span className="sr-only">Name for person {i + 1}</span>
                    <input placeholder="Name (optional)" autoComplete="off" value={inv.name ?? ""} onChange={(e) => set({ name: e.target.value })} className={input} />
                  </label>
                  <label>
                    <span className="sr-only">Role for person {i + 1}</span>
                    {/* Reps invite Property Managers. */}
                    <select value={inv.role} disabled={!isAdmin} onChange={(e) => set({ role: e.target.value as Invite["role"] })} className={input}>
                      {(["manager"] as const).map((r) => (
                        <option key={r} value={r}>
                          {PROPERTY_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove person ${i + 1}`}
                    onClick={() => setInvites((all) => (all.length > 1 ? all.filter((x) => x.key !== inv.key) : [{ ...all[0], email: "", name: "" }]))}
                    className="flex size-10 items-center justify-center rounded-[10px] border border-line text-muted hover:bg-canvas"
                  >
                    <Icon name="trash" size={16} strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
          {invites.length < 20 && (
            <button
              type="button"
              onClick={() => setInvites((all) => [...all, { key: nextKey.current++, email: "", name: "", role: "manager" }])}
              className="inline-flex h-[38px] items-center gap-1.5 self-start rounded-[10px] border border-dashed border-placeholder bg-white px-3 text-[13px] font-bold text-navy hover:bg-canvas"
            >
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Add another person
            </button>
          )}
          {isAdmin && <StewardPicker options={stewards.data?.items} value={stewardId} onChange={setStewardId} error={errors.stewardUserId} />}
        </Section>

        {formError && <Alert>{formError}</Alert>}
      </form>
    </Modal>
  );
}

function StewardPicker({ options, value, onChange, error }: { options: StaffOption[] | undefined; value: string; onChange: (id: string) => void; error?: string }) {
  const id = useId();
  const chosen = options?.find((o) => o.id === value);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-subtle px-3.5 py-3">
      {chosen ? <Avatar name={chosen.name} seed={chosen.id} size={38} /> : <span aria-hidden="true" className="flex size-[38px] items-center justify-center rounded-full bg-neutral-bg text-muted"><Icon name="users" size={18} /></span>}
      <span className="min-w-0 flex-[1_1_200px]">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          CBES Steward for this property <AdminsOnly />
        </span>
        <span className="block font-bold">{chosen ? `${chosen.name} · ${chosen.propertyCount ?? 0} properties` : "Not assigned yet"}</span>
      </span>
      <label htmlFor={id} className="sr-only">
        Steward
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className="h-10 rounded-[10px] border border-field bg-white px-2.5 text-[13.5px]">
        <option value="">No Steward yet</option>
        {options?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {options && options.length === 0 && <p className="m-0 w-full text-[12.5px] text-muted">No Stewards have accounts yet. Assign one later from the property's Team tab.</p>}
      {error && <p className="m-0 w-full text-[13px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
