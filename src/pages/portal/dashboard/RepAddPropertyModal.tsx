import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ApiError, errorMessage, useApi, type InviteResult, type PropertyProfile, type RepDashboard, type TrashOutWindow } from "../../../lib/api";
import { nextSunday } from "../../../lib/format";
import { MAX_IMAGE_BYTES, squareWebp } from "../../../lib/images";
import { placesAvailable, staticMapUrl } from "../../../lib/places";
import { slugify } from "../../../lib/slug";
import { AddressField } from "../../../components/AddressField";
import { OrgLogo } from "../../../components/brand";
import { Icon } from "../../../components/icons";
import { Modal } from "../../../components/overlay";
import { cx } from "../../../components/styles";
import { useToast } from "../../../components/Toast";
import { Alert, Button } from "../../../components/ui";
import { InviteRows, ManagerPicker, blankInvite, filledInvites, inviteErrors, type NewInviteRow } from "../../../components/portal/team";
import { Field, PhotoPicker, Section, input, useSlugCheck } from "../../org/propertyFormParts";

export type DashboardOutletContext = { dashboard: RepDashboard };

/** Counties CBES serves (REP_PORTAL_SPEC 7.3). South Fulton is in Fulton County. */
const SERVICE_COUNTIES = ["dekalb", "gwinnett", "cobb", "fulton"];
const inServiceArea = (county: string) => SERVICE_COUNTIES.includes(county.trim().toLowerCase().replace(/\s+county$/, ""));

const TRASH_OUT: { value: TrashOutWindow; label: string }[] = [
  { value: "18:00-20:00", label: "6–8 PM, pickup from 8 PM" },
  { value: "19:00-21:00", label: "7–9 PM, pickup from 9 PM" },
];

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/**
 * Add a property as a Representative (REP_PORTAL_SPEC 7.3). Opens over the dashboard at
 * /portal/organizations/:orgId/properties/new. The property is live as soon as it's saved; there is
 * no approval step. CBES's own fields (contract, Connecteam job, Steward) aren't asked here.
 */
export function RepAddPropertyModal() {
  const { dashboard } = useOutletContext<DashboardOutletContext>();
  const { organization } = dashboard;
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const close = () => navigate("..");

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [zip, setZip] = useState("");
  const [place, setPlace] = useState<{ lat: number | null; lng: number | null; googlePlaceId: string } | null>(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState("");
  const [buildings, setBuildings] = useState("");
  const [startDate, setStartDate] = useState(nextSunday);
  const [trashOut, setTrashOut] = useState<TrashOutWindow>("18:00-20:00");
  const [pressureWashing, setPressureWashing] = useState(false);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [invites, setInvites] = useState<NewInviteRow[]>([blankInvite(0)]);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The resident report address comes from the name; if it's taken, use the free one CBES suggests.
  const slug = slugify(name);
  const slugCheck = useSlugCheck(organization.id, slug);
  const effectiveSlug = slugCheck.available === false && slugCheck.suggestion ? slugCheck.suggestion : slug;

  const invitesToSend = filledInvites(invites);
  const count = organization.propertyCount + 1;
  const submitLabel = invitesToSend.length ? `Add property and invite ${people(invitesToSend.length)}` : "Add property";

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
    const found: Record<string, string> = { ...inviteErrors(invites) };
    if (!address.trim()) found.address = "Enter the street address";
    if (!name.trim()) found.name = "Enter the property name";
    const n = Number(units);
    if (!units || !Number.isInteger(n) || n < 1 || n > 5000) found.unitCount = "Enter the number of units, 1 to 5,000";
    if (!startDate) found.serviceStartDate = "Choose the first service night";
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
          address: address.trim(),
          city: city.trim() || undefined,
          county: county.trim() || undefined,
          zip: zip.trim() || undefined,
          ...(place ?? {}),
          photoUploadId,
          unitCount: Number(units),
          buildingCount: buildings ? Number(buildings) : undefined,
          serviceStartDate: startDate,
          trashOutWindow: trashOut,
          pressureWashing,
          slug: effectiveSlug || undefined,
          managerUserIds: managerIds,
          invites: invitesToSend,
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rep", "dashboard", organization.id] }),
        queryClient.invalidateQueries({ queryKey: ["organization", organization.id] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["portal", "nav-counts"] }),
      ]);
      toast.success(`${res.property.name} added.`);
      const failed = res.invitations.filter((i) => i.status === "failed");
      if (failed.length) toast.error(`These invitations weren't sent: ${failed.map((f) => `${f.email}${f.error ? ` (${f.error})` : ""}`).join(", ")}. Invite them again from Team and settings.`);
      close();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError(`You've reached ${organization.propertyLimit} properties. Email office@cbenvironments.com to raise the limit.`);
      } else if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const { slug: slugError, ...rest } = err.fieldErrors;
        setErrors(slugError ? { ...rest, name: rest.name ?? "Another property already uses this name. Add something to tell them apart." } : rest);
      } else setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  const fill = place ? "bg-subtle" : "";

  return (
    <Modal
      size="lg"
      title="Add a property"
      icon={<OrgLogo org={organization} size={44} />}
      context={`${organization.name} · ${organization.propertyCount} of ${organization.propertyLimit} properties`}
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
            <Button type="submit" form="rep-add-property" disabled={saving}>
              {saving ? "Adding…" : submitLabel}
            </Button>
          </span>
        </div>
      }
    >
      <form id="rep-add-property" onSubmit={submit} noValidate className="flex flex-col gap-7">
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-3">
              <Field label="City" error={errors.city}>
                {(id, d) => <input id={id} aria-describedby={d} value={city} onChange={(e) => setCity(e.target.value)} className={cx(input, fill)} />}
              </Field>
              <Field label="County" error={errors.county}>
                {(id, d) => <input id={id} aria-describedby={d} value={county} onChange={(e) => setCounty(e.target.value)} className={cx(input, fill)} />}
              </Field>
              <Field label="ZIP" error={errors.zip}>
                {(id, d) => <input id={id} inputMode="numeric" autoComplete="postal-code" aria-describedby={d} value={zip} onChange={(e) => setZip(e.target.value)} className={cx(input, fill)} />}
              </Field>
              {county.trim() && (
                <p role="status" className={cx("m-0 flex items-center gap-1.5 text-[12.5px] font-semibold sm:col-span-3", inServiceArea(county) ? "text-success" : "text-warning")}>
                  <Icon name={inServiceArea(county) ? "check" : "alert-circle"} size={15} strokeWidth={2.6} />
                  {inServiceArea(county) ? `Inside the CBES service area (${county.trim().replace(/\s+county$/i, "")} County).` : "Outside our usual area. CBES will reach out."}
                </p>
              )}
            </div>
            {place?.lat != null && place.lng != null && placesAvailable() ? (
              <img src={staticMapUrl(place.lat, place.lng)} alt={`Map of ${address}`} className="h-[120px] w-full rounded-xl border border-line object-cover" />
            ) : (
              <div aria-hidden="true" className="hidden h-[120px] items-center justify-center rounded-xl border border-dashed border-placeholder bg-canvas text-[12.5px] text-muted md:flex">
                Map appears when you pick an address
              </div>
            )}
          </div>
        </Section>

        <Section n={2} title="Profile">
          <div className="flex flex-wrap gap-5">
            <PhotoPicker url={photo?.url ?? null} error={errors.photo ?? errors.photoUploadId} onPick={pickPhoto} onRemove={() => setPhoto(null)} />
            <div className="grid min-w-0 flex-[1_1_400px] grid-cols-2 content-start gap-3">
              <Field label="Property name" error={errors.name} className="col-span-2">
                {(id, d) => <input id={id} required aria-describedby={d} aria-invalid={errors.name ? true : undefined} value={name} onChange={(e) => setName(e.target.value)} className={input} />}
              </Field>
              <Field label="Units" error={errors.unitCount}>
                {(id, d) => <input id={id} type="number" inputMode="numeric" min={1} max={5000} required aria-describedby={d} aria-invalid={errors.unitCount ? true : undefined} value={units} onChange={(e) => setUnits(e.target.value)} className={input} />}
              </Field>
              <Field label="Buildings" hint="Optional" error={errors.buildingCount}>
                {(id, d) => <input id={id} type="number" inputMode="numeric" min={1} max={500} aria-describedby={d} aria-invalid={errors.buildingCount ? true : undefined} value={buildings} onChange={(e) => setBuildings(e.target.value)} className={input} />}
              </Field>
            </div>
          </div>
        </Section>

        <Section n={3} title="Service">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Service start date" hint="Valet service begins this night." error={errors.serviceStartDate}>
              {(id, d) => <input id={id} type="date" required aria-describedby={d} aria-invalid={errors.serviceStartDate ? true : undefined} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />}
            </Field>
            <Field label="Trash-out window" error={errors.trashOutWindow}>
              {(id, d) => (
                <select id={id} aria-describedby={d} value={trashOut} onChange={(e) => setTrashOut(e.target.value as TrashOutWindow)} className={input}>
                  {TRASH_OUT.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[13.5px] font-semibold focus-within:ring-2 focus-within:ring-gold sm:col-span-2">
              <input type="checkbox" checked={pressureWashing} onChange={(e) => setPressureWashing(e.target.checked)} className="mt-0.5 size-[18px] flex-none accent-navy" />
              <span>
                Include yearly spot pressure washing
                <span className="block text-[12.5px] font-normal text-muted">Around trash areas and compactors, once a year.</span>
              </span>
            </label>
          </div>
        </Section>

        <Section n={4} title="Property managers">
          <p className="-mt-1.5 mb-0 text-[13px] text-muted">Pick people already on your team or invite someone new. Managers only see the properties you assign them.</p>
          <ManagerPicker orgId={organization.id} value={managerIds} onChange={setManagerIds} />
          {errors.managerUserIds && <p className="m-0 text-[13px] font-semibold text-danger">{errors.managerUserIds}</p>}
          <InviteRows value={invites} onChange={setInvites} roles={["manager"]} errors={errors} />
        </Section>

        <p className="m-0 rounded-xl bg-success-bg px-4 py-3.5 text-[13.5px] text-success">
          <strong>What happens next:</strong> the property is live right away. Managers you picked can see it now, new invites go out by email, and CBES is notified so we can assign your Steward and print the
          resident QR codes.
        </p>

        {formError && <Alert>{formError}</Alert>}
      </form>
    </Modal>
  );
}
