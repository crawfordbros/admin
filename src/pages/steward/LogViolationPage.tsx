import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../../lib/api";
import { useCompleteTraining, useCrewProfile } from "../../lib/steward/crew";
import { useOutbox } from "../../lib/steward/outbox";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { clockTime, useCrewProperty, usePosition, useTonight, type Fix } from "../../lib/steward/shifts";
import { compressPhoto, recentUnits, rememberUnit, typeName, useUnitHistory, useViolationTypes } from "../../lib/steward/violations";
import { Field, Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { BottomAction, CtaButton, ScreenHeader } from "../../components/steward/ui";
import { cx } from "../../components/styles";
import { useScreenTitle } from "./useScreenTitle";
import { useNow } from "./tonight/useNow";

type Photo = { id: string; blob: Blob; url: string; takenAt: string | null };

const MAX_PHOTOS = 4;
const FRESH_FIX_MS = 2 * 60_000;
const WEAK_GPS_M = 25;

/**
 * Screen 9, Log a violation (docs/design/steward/Steward-LogViolation). The camera opens first; 1 to 4
 * photos are shrunk on the phone. Then building, unit, type and an optional note; the time and GPS are
 * added. Saving puts it in the outbox, so it works without signal. `?practice=1` is the training run,
 * which sends nothing.
 */
export function LogViolationPage() {
  const { t, locale } = useStewardPreferences();
  const [params] = useSearchParams();
  const practice = params.get("practice") === "1";
  const navigate = useNavigate();
  const { userId } = useAuth();
  const profile = useCrewProfile().data!;
  const tonight = useTonight().data;
  const types = useViolationTypes();
  const outbox = useOutbox();
  const practiceDone = useCompleteTraining();
  const { position, locate } = usePosition();
  const now = useNow();
  useScreenTitle(practice ? t("log.practiceTitle") : t("log.title"));

  const properties = profile.properties;
  const [propertyId, setPropertyId] = useState<string | null>(() => (practice ? null : (tonight?.onShift?.propertyId ?? properties[0]?.id ?? null)));
  const property = useCrewProperty(propertyId ?? undefined).data?.property;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [building, setBuilding] = useState("");
  const [unit, setUnit] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"photos" | "unit" | "typeKey" | "property", string>>>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const [practiced, setPracticed] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const typeLegend = useId();

  // My buildings first, then the rest of the property's.
  const buildings = useMemo(() => {
    const mine = properties.find((p) => p.id === propertyId)?.buildings ?? [];
    const all = practice ? ["1", "2", "3"] : (property?.buildings.map((b) => b.name) ?? mine);
    return [...all.filter((b) => mine.includes(b)), ...all.filter((b) => !mine.includes(b))];
  }, [practice, property, properties, propertyId]);
  // Until someone picks one, the first of their own buildings.
  const chosenBuilding = building && buildings.includes(building) ? building : (buildings[0] ?? "");

  const history = useUnitHistory(practice ? null : propertyId, unit.length >= 1 ? unit : "");
  const repeat = history.data && history.data.count >= 1 && history.data.count + 1 >= history.data.threshold.count ? history.data : null;

  useEffect(() => {
    void locate();
    // The camera opens first on phones. Browsers may block it without a fresh tap; then the Add photo tile does it.
    if (window.matchMedia?.("(pointer: coarse)").matches) camera.current?.click();
  }, [locate]);

  // Free the previews when leaving the screen (removing one frees it straight away).
  const previews = useRef<Photo[]>([]);
  useEffect(() => {
    previews.current = photos;
  }, [photos]);
  useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setFailure("");
    const room = MAX_PHOTOS - photos.length;
    const added: Photo[] = [];
    for (const file of [...files].slice(0, room)) {
      try {
        const blob = await compressPhoto(file);
        added.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : null });
      } catch {
        setFailure(t("log.photoTooBig"));
      }
    }
    if (added.length) {
      setPhotos((list) => [...list, ...added].slice(0, MAX_PHOTOS));
      setErrors((e) => ({ ...e, photos: undefined }));
    }
  }

  function removePhoto(id: string) {
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return list.filter((p) => p.id !== id);
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const missing = {
      photos: photos.length ? undefined : t("log.needPhoto"),
      unit: unit.trim() ? undefined : t("log.needUnit"),
      typeKey: typeKey ? undefined : t("log.needType"),
      property: practice || propertyId ? undefined : t("log.needProperty"),
    };
    setErrors(missing);
    if (Object.values(missing).some(Boolean)) return;
    if (practice) {
      practiceDone.mutate("practice_log");
      setPracticed(true);
      return;
    }
    setSaving(true);
    setFailure("");
    try {
      const fix: Fix =
        position.status === "ok" && Date.now() - position.at < FRESH_FIX_MS ? { lat: position.lat, lng: position.lng, accuracyM: position.accuracyM } : await locate();
      const type = types.data!.find((x) => x.key === typeKey)!;
      const clientId = crypto.randomUUID();
      const now = new Date().toISOString();
      const sent = await outbox.enqueue({
        kind: "violation",
        id: clientId,
        userId: userId!,
        createdAt: now,
        data: {
          clientId,
          propertyId: propertyId!,
          building: chosenBuilding || null,
          unit: unit.trim(),
          typeKey,
          note: note.trim() || null,
          loggedAt: now,
          ...(fix.lat != null && fix.lng != null ? { lat: fix.lat, lng: fix.lng, gpsAccuracyM: fix.accuracyM ?? undefined } : {}),
          photoTakenAt: photos.map((p) => p.takenAt),
        },
        photos: photos.map((p) => ({ blob: p.blob, takenAt: p.takenAt })),
        summary: { typeLabel: type.label, typeLabelEs: type.labelEs, unit: unit.trim(), building: chosenBuilding || null, propertyName: property?.name ?? "" },
        attempts: 0,
      });
      rememberUnit(propertyId!, unit.trim());
      navigate("/steward/violations", { state: { saved: { type: typeName(type, locale), unit: unit.trim(), offline: !sent } } });
    } catch (err) {
      setFailure(errorMessage(err));
      setSaving(false);
    }
  }

  if (!practice && properties.length === 0) {
    return (
      <>
        <ScreenHeader back={{ to: "/steward", label: t("violations.close"), icon: "close" }} title={t("log.title")} />
        <div className="flex flex-col gap-3 pt-2">
          <Notice tone="warn">{t("log.noProperty")}</Notice>
          <Link to="/steward/violations/new?practice=1" className="font-bold">
            {t("log.tryPractice")}
          </Link>
        </div>
      </>
    );
  }

  const gps =
    position.status === "ok"
      ? position.accuracyM > WEAK_GPS_M
        ? { text: t("log.gpsWeak", { m: position.accuracyM }), tone: "text-st-warn" }
        : { text: t("log.gps", { m: position.accuracyM }), tone: "text-st-ok" }
      : position.status === "locating" || position.status === "idle"
        ? { text: t("checkin.locating"), tone: "text-st-text-3" }
        : { text: t("log.gpsNone"), tone: "text-st-warn" };
  const recent = recentUnits(propertyId);

  return (
    <form onSubmit={save} noValidate className="flex flex-1 flex-col">
      <ScreenHeader
        back={{ to: practice ? "/steward/setup/done" : "/steward", label: t("violations.close"), icon: "close" }}
        eyebrow={practice ? t("log.practiceNote") : property?.name ?? properties.find((p) => p.id === propertyId)?.name}
        title={practice ? t("log.practiceTitle") : t("log.title")}
      />

      <div className="flex flex-col gap-3.5 pt-1">
        {!practice && properties.length > 1 && !tonight?.onShift && (
          <div role="radiogroup" aria-label={t("log.property")} className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:px-0">
            {properties.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === propertyId}
                onClick={() => setPropertyId(p.id)}
                className={cx("min-h-9 flex-none rounded-full px-3 text-[13px] font-bold", p.id === propertyId ? "bg-st-cta text-st-on-cta" : "border border-st-border text-st-text-2")}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div>
          <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden data-photo="violation" onChange={(e) => {
              const input = e.currentTarget;
              void addPhotos(input.files).then(() => (input.value = ""));
            }}
          />
          <ul className="m-0 flex list-none gap-2.5 overflow-x-auto p-0">
            {photos.map((p, i) => (
              <li key={p.id} className="relative size-[108px] flex-none overflow-hidden rounded-[14px] bg-st-track">
                <img src={p.url} alt={t("log.photoLabel", { n: i + 1 })} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label={t("log.removePhoto", { n: i + 1 })}
                  className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/70 text-white"
                >
                  <Icon name="close" size={14} strokeWidth={2.6} />
                </button>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li className="min-w-[108px] flex-1">
                <button
                  type="button"
                  onClick={() => camera.current?.click()}
                  aria-describedby="photo-rule"
                  className={cx(
                    "flex h-[108px] w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed text-[13.5px] font-bold",
                    errors.photos ? "border-st-bad" : "border-st-avatar-ink",
                  )}
                >
                  <Icon name={photos.length ? "plus" : "camera"} size={24} strokeWidth={2.2} />
                  {t("log.addPhoto")}
                  <span className="text-[11.5px] font-semibold text-st-text-3">{t("log.photoCount", { n: photos.length })}</span>
                </button>
              </li>
            )}
          </ul>
          <p id="photo-rule" className={cx("mt-1.5 mb-0 text-[12.5px]", errors.photos ? "font-semibold text-st-bad" : "text-st-text-3")}>
            {errors.photos ?? t("log.photoRule")}
          </p>
        </div>

        <div className="grid grid-cols-[1fr_1.3fr] gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="log-building" className="text-[13.5px] font-semibold">
              {t("log.building")}
            </label>
            <select
              id="log-building"
              value={chosenBuilding}
              onChange={(e) => setBuilding(e.target.value)}
              className="h-[54px] min-w-0 rounded-xl border border-st-border bg-st-raised px-3 text-base font-bold text-st-text"
            >
              {buildings.length === 0 && <option value="">{t("log.noBuilding")}</option>}
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {t("tonight.bldg", { name: b })}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t("log.unit")}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            maxLength={40}
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setErrors((x) => ({ ...x, unit: undefined }));
            }}
            error={errors.unit}
            className="[&_input]:h-[54px] [&_input]:text-lg [&_input]:font-bold"
          />
        </div>
        {recent.length > 0 && (
          <div className="-mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-st-text-3">{t("log.recent")}</span>
            {recent.map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} className="min-h-9 rounded-full border border-st-border px-3 text-[13px] font-bold">
                {u}
              </button>
            ))}
          </div>
        )}
        {repeat && (
          <p role="status" className="-mt-1.5 mb-0 flex items-center gap-2 rounded-[10px] bg-st-warn-bg px-3 py-2 text-[12.5px] font-bold text-st-warn">
            <Icon name="violations" size={16} strokeWidth={2.2} className="flex-none" />
            {t("log.repeat", { unit: unit.trim(), count: repeat.count, days: repeat.threshold.days, next: repeat.count + 1 })}
          </p>
        )}

        <fieldset className="m-0 border-0 p-0" aria-describedby={errors.typeKey ? typeLegend : undefined}>
          <legend className="mb-2 p-0 text-sm font-semibold">{t("log.type")}</legend>
          <div role="radiogroup" aria-label={t("log.type")} className="grid grid-cols-2 gap-2">
            {(types.data ?? []).map((type) => {
              const on = type.key === typeKey;
              return (
                <button
                  key={type.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setTypeKey(type.key);
                    setErrors((x) => ({ ...x, typeKey: undefined }));
                  }}
                  className={cx(
                    "min-h-[52px] rounded-xl border-2 px-2 text-[14.5px]",
                    on ? "border-st-cta bg-st-cta font-bold text-st-on-cta" : "border-st-border bg-transparent font-semibold text-st-text",
                  )}
                >
                  {typeName(type, locale)}
                </button>
              );
            })}
          </div>
          {errors.typeKey && (
            <p id={typeLegend} className="mt-1.5 mb-0 text-[13px] font-semibold text-st-bad">
              {errors.typeKey}
            </p>
          )}
        </fieldset>

        <Field label={t("log.note")} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        {errors.property && <Notice>{errors.property}</Notice>}
        {failure && <Notice>{failure}</Notice>}
        {practiced && <Notice tone="ok">{t("log.practiceDone")}</Notice>}
      </div>

      <BottomAction>
        <p className="m-0 flex justify-center gap-3.5 text-[12.5px] text-st-text-2">
          <span>{clockTime(now, locale)}</span>
          {!practice && <span className={cx("font-bold", gps.tone)}>{gps.text}</span>}
          <span>{practice ? t("log.practiceNote") : t("log.savesOffline")}</span>
        </p>
        <CtaButton type="submit" disabled={saving || types.isPending}>
          {saving ? t("log.saving") : practice ? t("log.savePractice") : t("log.save")}
        </CtaButton>
      </BottomAction>
    </form>
  );
}
