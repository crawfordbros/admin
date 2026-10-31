import { PropertyAddress } from "../../../components/PropertyAddress";
import { invalidateProperties } from "../../../lib/invalidateProperties";
import { validatePropertyAddress } from "../../../lib/propertyAddress";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, useApi, type PropertyHome, type TrashOutWindow } from "../../../lib/api";
import { MAX_IMAGE_BYTES, squareWebp } from "../../../lib/images";
import { Modal } from "../../../components/overlay";
import { useToast } from "../../../components/Toast";
import { Alert, Button } from "../../../components/ui";
import { Field, PhotoPicker, input } from "../../org/propertyFormParts";

const TRASH_OUT: { value: TrashOutWindow; label: string }[] = [
  { value: "18:00-20:00", label: "6–8 PM, pickup from 8 PM" },
  { value: "19:00-21:00", label: "7–9 PM, pickup from 9 PM" },
];

/**
 * A Representative edits the property basics (REP_PORTAL_SPEC 7.2): name, photo, address, size and
 * service details. Steward, Connecteam job and contract stay CBES's.
 */
export function EditPropertyModal({ home, onClose }: { home: PropertyHome; onClose: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const p = home.property;
  const orgId = p.organizationId ?? "";
  const [name, setName] = useState(p.name);
  const [address, setAddress] = useState(p.address ?? "");
  const [city, setCity] = useState(p.city ?? "");
  const [zip, setZip] = useState(p.zip ?? "");
  const [county, setCounty] = useState(p.county ?? "");
  const [units, setUnits] = useState(p.unitCount ? String(p.unitCount) : "");
  const [buildings, setBuildings] = useState(p.buildingCount ? String(p.buildingCount) : "");
  const [trashOut, setTrashOut] = useState<TrashOutWindow>(p.trashOutWindow ?? "18:00-20:00");
  const [pressureWashing, setPressureWashing] = useState(Boolean(p.pressureWashing));
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return setErrors((e) => ({ ...e, photo: "That image is over 5 MB. Choose a smaller one." }));
    try {
      const blob = await squareWebp(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setErrors((e) => ({ ...e, photo: errorMessage(err) }));
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validatePropertyAddress({ address, city, zip });
    if (!name.trim()) found.name = "Enter the property name";
    const n = Number(units);
    if (!units || !Number.isInteger(n) || n < 1 || n > 5000) found.unitCount = "Enter the number of units, 1 to 5,000";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      let photoUploadId: string | undefined;
      if (photo) {
        ({ uploadId: photoUploadId } = await api<{ uploadId: string }>(`/organizations/${orgId}/photo-uploads`, { method: "POST", body: photo.blob, headers: { "Content-Type": photo.blob.type } }));
      }
      await api(`/organizations/${orgId}/properties/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          city: city.trim(),
          zip: zip.trim(),
          county: county.trim(),
          unitCount: n,
          buildingCount: buildings ? Number(buildings) : "",
          trashOutWindow: trashOut,
          pressureWashing,
          ...(photoUploadId ? { photoUploadId } : {}),
        }),
      });
      await invalidateProperties(queryClient);
      toast.success("Property saved.");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      size="lg"
      title="Edit property"
      context={<span>{p.name}<PropertyAddress property={p} /></span>}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-property" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-property" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-5">
          <PhotoPicker url={photo?.url ?? null} error={errors.photo ?? errors.photoUploadId} onPick={pickPhoto} onRemove={() => setPhoto(null)} />
          <div className="grid min-w-0 flex-[1_1_400px] grid-cols-2 content-start gap-3">
            <Field label="Property name" error={errors.name} className="col-span-2">
              {(id, d) => <input id={id} required aria-describedby={d} aria-invalid={errors.name ? true : undefined} value={name} onChange={(e) => setName(e.target.value)} className={input} />}
            </Field>
            <Field label="Units" error={errors.unitCount}>
              {(id, d) => <input id={id} type="number" inputMode="numeric" min={1} required aria-describedby={d} aria-invalid={errors.unitCount ? true : undefined} value={units} onChange={(e) => setUnits(e.target.value)} className={input} />}
            </Field>
            <Field label="Buildings" hint="Optional" error={errors.buildingCount}>
              {(id, d) => <input id={id} type="number" inputMode="numeric" min={1} aria-describedby={d} value={buildings} onChange={(e) => setBuildings(e.target.value)} className={input} />}
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Street address" hint="Required" error={errors.address} className="sm:col-span-3">
            {(id, d) => <input id={id} autoComplete="street-address" aria-describedby={d} required aria-invalid={errors.address ? true : undefined} value={address} onChange={(e) => setAddress(e.target.value)} className={input} />}
          </Field>
          <Field label="City" hint="Required" error={errors.city}>
            {(id, d) => <input id={id} aria-describedby={d} required aria-invalid={errors.city ? true : undefined} value={city} onChange={(e) => setCity(e.target.value)} className={input} />}
          </Field>
          <Field label="ZIP" hint="Required" error={errors.zip}>
            {(id, d) => <input id={id} required autoComplete="postal-code" aria-describedby={d} aria-invalid={errors.zip ? true : undefined} value={zip} onChange={(e) => setZip(e.target.value)} className={input} />}
          </Field>
          <Field label="County" error={errors.county}>
            {(id, d) => <input id={id} aria-describedby={d} value={county} onChange={(e) => setCounty(e.target.value)} className={input} />}
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
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[13.5px] font-semibold focus-within:ring-2 focus-within:ring-gold">
          <input type="checkbox" checked={pressureWashing} onChange={(e) => setPressureWashing(e.target.checked)} className="mt-0.5 size-[18px] flex-none accent-navy" />
          <span>
            Include yearly spot pressure washing
            <span className="block text-[12.5px] font-normal text-muted">Around trash areas and compactors, once a year.</span>
          </span>
        </label>
        <p className="m-0 text-[13px] text-muted">
          To change the contract, Steward or service start, email <a href="mailto:office@cbenvironments.com">office@cbenvironments.com</a>.
        </p>
        {formError && <Alert>{formError}</Alert>}
      </form>
    </Modal>
  );
}
