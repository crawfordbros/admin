import { propertyLocation } from "../../lib/propertyAddress";
import { PropertyAddress } from "../../components/PropertyAddress";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { errorMessage, useApi, type Person, type StaffOption, type ViolationDetail, type ViolationEvent, type ViolationStatus, type ViolationType } from "../../lib/api";
import { dateTime, serviceTime, timeAgo } from "../../lib/format";
import { useAuthedImage } from "../../lib/images";
import { placesAvailable, staticMapUrl } from "../../lib/places";
import { Alert, Button, Loading, SelectField } from "../../components/ui";
import { Avatar, Pill } from "../../components/display";
import { statusLabel } from "../../components/displayUtils";
import { SegmentedControl, Stepper, type Step } from "../../components/controls";
import { Modal } from "../../components/overlay";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { photoPath, unwrap, violationPath, type ViolationArea } from "./paths";
import { DismissModal } from "./shared";

const STATUSES: ViolationStatus[] = ["new", "in_review", "sent", "resolved", "dismissed"];
const card = "rounded-[14px] border border-line bg-white p-5";

/** /admin/violations/:id (ADMIN_PORTAL_SPEC 7.5). */
export function ViolationDetailPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const back = (location.state as { back?: string } | null)?.back ?? "";
  const [dismissing, setDismissing] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const key = ["admin", "violation", id];
  const { data: v, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<{ violation: ViolationDetail } | ViolationDetail>(`/admin/violations/${id}`).then(unwrap) });
  useAdminPage(v ? `V-${v.refNo}` : null, v && [{ label: "Violations", to: `/admin/violations${back}` }, { label: `V-${v.refNo}` }]);

  const patch = useMutation({
    mutationFn: (body: { status?: ViolationStatus; typeKey?: string; reason?: string }) =>
      api<{ violation: ViolationDetail }>(`/admin/violations/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(unwrap),
    onSuccess: async (updated, body) => {
      queryClient.setQueryData(key, updated);
      toast.success(body.status ? `Marked ${statusLabel("violation", body.status).toLowerCase()}.` : "Violation updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "violations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const sendable = v.status === "new" || v.status === "in_review";

  return (
    <div className="flex flex-col gap-5">
      <Link to={`/admin/violations${back}`} className="inline-flex items-center gap-1.5 self-start text-[14px] font-bold no-underline print:hidden">
        <Icon name="chevron-left" size={16} strokeWidth={2.2} />
        All violations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-[52px] flex-none items-center justify-center rounded-[14px] bg-warning-bg text-warning">
            <Icon name="alert-triangle" size={26} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-bold text-muted">
              V-{v.refNo} · Logged {serviceTime(v.loggedAt).replace(/^(Tonight|Today)/, (m) => m.toLowerCase() + " at")}
            </p>
            <h1 className="mt-0.5 mb-0 text-[24px] text-navy-ink sm:text-[28px]">
              {v.typeLabel} · Unit {v.unit}
            </h1>
            <p className="mt-1 mb-0 text-[14px]">{v.propertyName}<PropertyAddress property={propertyLocation(v)} /></p>
            <p className="mt-1 mb-0 text-[14px] text-muted">{[v.building && `Building ${v.building}`, v.orgName].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="flex items-center gap-2 text-[13px] font-bold">
            Status
            <select
              value={v.status}
              disabled={patch.isPending}
              onChange={(e) => {
                const status = e.target.value as ViolationStatus;
                if (status === "dismissed") setDismissing(true);
                else patch.mutate({ status });
              }}
              className="h-[42px] rounded-[10px] border-[1.5px] border-navy bg-tint-2 px-3 text-[14px] font-bold text-navy-ink"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel("violation", s)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          {sendable && (
            <Button disabled={patch.isPending} onClick={() => patch.mutate({ status: "sent" })}>
              <Icon name="send" size={18} strokeWidth={2} />
              Send to property
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-[14px] border border-line bg-white px-[18px] py-3.5">
        <Stepper label="Progress" steps={steps(v)} />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1.4_1_520px] flex-col gap-5">
          <Gallery area="admin" v={v} />
          <Notes area="admin" v={v} onAdded={() => queryClient.invalidateQueries({ queryKey: key })} />
        </div>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Details v={v} area="admin" onType={(typeKey) => patch.mutate({ typeKey })} />
          <People v={v} action={<button type="button" onClick={() => setReassigning(true)} className="mt-3.5 h-[38px] w-full rounded-[9px] border border-dashed border-placeholder bg-white text-[13px] font-bold text-navy hover:bg-canvas print:hidden">Reassign valet or Steward</button>} />
          <UnitHistoryCard v={v} area="admin" />
        </div>
      </div>

      {dismissing && (
        <DismissModal
          count={1}
          onClose={() => setDismissing(false)}
          onDismiss={async (reason) => {
            await patch.mutateAsync({ status: "dismissed", reason });
            setDismissing(false);
          }}
        />
      )}
      {reassigning && (
        <ReassignModal
          v={v}
          onClose={() => setReassigning(false)}
          onDone={(updated) => {
            queryClient.setQueryData(key, updated);
            setReassigning(false);
            toast.success("Reassigned.");
          }}
        />
      )}
    </div>
  );
}

function steps(v: ViolationDetail): Step[] {
  const managers = v.people.propertyManagers.map((p) => p.name).join(", ");
  const logged: Step = { label: "Logged", sub: `${v.valet.name} · ${serviceTime(v.loggedAt).replace(/^(Tonight|Today) /, "")}`, state: "done" };
  if (v.status === "dismissed") {
    const reason = v.events.find((e) => e.kind === "status" && e.toStatus === "dismissed")?.body;
    return [logged, { label: "Dismissed", sub: reason ?? "Not a violation", state: "done" }];
  }
  const at = { new: 1, in_review: 1, sent: 2, resolved: 4 }[v.status];
  const list: Omit<Step, "state">[] = [
    { label: "In review", sub: "CBES checks photo and type" },
    { label: "Sent to property", sub: managers || "The property's managers" },
    { label: "Resolved", sub: "Closed by property or CBES" },
  ];
  return [logged, ...list.map((s, i) => ({ ...s, state: i + 1 < at ? "done" : i + 1 === at ? "current" : "todo" }) as Step)];
}

function AuthedImg({ path, version, alt, className }: { path: string; version: string; alt: string; className?: string }) {
  const src = useAuthedImage(path, version);
  return src ? <img src={src} alt={alt} className={className} /> : <span aria-hidden="true" className={cx("block bg-navy-night", className)} />;
}

export function Gallery({ area, v }: { area: ViolationArea; v: ViolationDetail }) {
  const [at, setAt] = useState(0);
  const photo = v.photos[Math.min(at, v.photos.length - 1)];
  const main = useAuthedImage(photo ? photoPath(area, v.id, photo.id) : null, photo?.id ?? null);
  const caption = [photo?.takenAt ? dateTime(photo.takenAt) : null, v.gps?.accuracyM != null ? `GPS ±${Math.round(v.gps.accuracyM)} m` : null].filter(Boolean).join(" · ");
  return (
    <section className={cx(card, "p-4!")} aria-label="Photos">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-[#1e2160] text-[14px] text-nav-pill">
        {!photo ? (
          <span className="flex flex-col items-center gap-2.5">
            <Icon name="camera" size={44} strokeWidth={1.5} />
            No photos
          </span>
        ) : main ? (
          <img src={main} alt={`Photo ${at + 1} of ${v.photos.length}: ${v.typeLabel}, unit ${v.unit}`} className="size-full object-contain" />
        ) : (
          <span role="status">Loading photo…</span>
        )}
        {caption && <span className="absolute bottom-3 left-3 rounded-md bg-black/55 px-2 py-1 text-[12px] font-bold text-white">{caption}</span>}
        {main && (
          <span className="absolute top-3 right-3 flex gap-1.5 print:hidden">
            <a href={main} target="_blank" rel="noreferrer" aria-label="Zoom" className="flex size-[34px] items-center justify-center rounded-[9px] bg-white/90 text-navy-ink hover:bg-white">
              <Icon name="zoom-in" size={16} strokeWidth={2} />
            </a>
            <a href={main} download={`V-${v.refNo}-${at + 1}.webp`} aria-label="Download" className="flex size-[34px] items-center justify-center rounded-[9px] bg-white/90 text-navy-ink hover:bg-white">
              <Icon name="download" size={16} strokeWidth={2} />
            </a>
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {v.photos.length > 1 &&
          v.photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Photo ${i + 1}`}
              aria-pressed={i === at}
              onClick={() => setAt(i)}
              className={cx("h-16 w-[84px] overflow-hidden rounded-[10px]", i === at ? "border-[2.5px] border-navy" : "border border-line opacity-80 hover:opacity-100")}
            >
              <AuthedImg path={photoPath(area, v.id, p.id)} version={p.id} alt="" className="size-full object-cover" />
            </button>
          ))}
        <span className="ml-auto text-[12.5px] text-muted">Photos show trash and doorways only, never people.</span>
      </div>
    </section>
  );
}

const ROLE_NAMES: Record<string, string> = {
  valet: "Valet",
  lead: "Steward",
  manager: "Property Manager",
  representative: "Rep",
  admin: "Admin",
  super_admin: "Admin",
};

function describe(e: ViolationEvent): string {
  switch (e.kind) {
    case "logged":
      return "logged this violation";
    case "status":
      return e.toStatus === "dismissed" ? "dismissed it" : `moved it to ${statusLabel("violation", e.toStatus ?? "new").toLowerCase()}`;
    case "note":
      return e.mentions.length ? `added a note and notified ${e.mentions.map((m) => m.name).join(", ")}` : "added a note";
    case "reassigned":
      return "reassigned it";
    case "sent":
      return "sent it to the property";
    default:
      return "updated it";
  }
}

/**
 * Notes ping the people checked under them by email and in their portal. CBES-only notes never
 * reach the property; property managers can only be notified on notes the property can see.
 */
export function Notes({
  area,
  v,
  onAdded,
  staff,
  readOnly,
}: {
  area: ViolationArea;
  v: ViolationDetail;
  onAdded: () => Promise<unknown>;
  /** A valet or Steward replying from the portal: CBES-only notes to the CBES people on it. */
  staff?: boolean;
  /** Notes are listed but can't be added (an admin previewing the manager view). */
  readOnly?: boolean;
}) {
  const api = useApi();
  const toast = useToast();
  const propertySide = area === "portal" && !staff;
  const { valet, steward, propertyManagers, representatives, admins } = v.people;
  const cbes: Person[] = [valet, ...(steward ? [steward] : []), ...(propertySide ? [] : admins)];
  const property: Person[] = staff ? [] : propertySide ? propertyManagers : [...propertyManagers, ...representatives];
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"cbes" | "property">(propertySide ? "property" : "cbes");
  const [notify, setNotify] = useState<Set<string>>(() => new Set(propertySide || staff ? [] : [valet.id, ...(steward ? [steward.id] : [])]));
  const [error, setError] = useState<string | null>(null);

  // Account ids are Clerk user ids, so the author can be left off the list.
  const { userId } = useAuth();
  const candidates = [...cbes, ...property].filter((p, i, all) => p.id !== userId && all.findIndex((x) => x.id === p.id) === i);
  const allowed = (p: Person) => visibility === "property" || !property.some((x) => x.id === p.id) || cbes.some((x) => x.id === p.id);
  const chosen = candidates.filter((p) => notify.has(p.id) && allowed(p));

  const add = useMutation({
    mutationFn: () =>
      api<{ event: ViolationEvent }>(`/${area}/violations/${v.id}/notes`, {
        method: "POST",
        body: JSON.stringify(propertySide ? { body: body.trim(), notifyUserIds: chosen.map((p) => p.id) } : { body: body.trim(), visibility, notifyUserIds: chosen.map((p) => p.id) }),
      }),
    onSuccess: async () => {
      setBody("");
      setError(null);
      toast.success(chosen.length ? `Note added. Notified ${chosen.map((p) => p.name).join(", ")}.` : "Note added.");
      await onAdded();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // The API decides which events each person sees (the property never gets CBES-only notes).
  const events = v.events;

  return (
    <section className={card} aria-labelledby="notes-title">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="notes-title" className="m-0 text-lg text-ink">
          Notes and activity
        </h2>
        <span className="text-[12.5px] text-muted">Notes ping the people you choose by email and in their portal</span>
      </div>

      {!readOnly && (
      <form
        className="mb-[18px] flex flex-col gap-2.5 rounded-xl border-[1.5px] border-navy p-3 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return setError("Write the note first.");
          add.mutate();
        }}
      >
        <label htmlFor="note" className="sr-only">
          Add a note
        </label>
        <textarea
          id="note"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "note-error" : undefined}
          placeholder={propertySide ? "Add a note for CBES and the property team" : "Add a note for the valet, Steward or property"}
          className="resize-y border-0 text-[14px] text-ink outline-none"
        />
        {error && (
          <p id="note-error" role="alert" className="m-0 text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}
        <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
          <legend className="float-left mr-1 p-0 text-[12.5px] font-bold text-muted">Notify:</legend>
          {candidates.map((p) => {
            const ok = allowed(p);
            const on = notify.has(p.id) && ok;
            return (
              <label
                key={p.id}
                title={ok ? undefined : "Choose “Also show property” to notify the property's team"}
                className={cx(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 text-[12.5px] font-bold",
                  on ? "border-[1.5px] border-navy bg-tint-2" : "border border-field bg-white",
                  !ok && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!ok}
                  onChange={(e) =>
                    setNotify((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                  className="accent-navy"
                />
                <Avatar name={p.name} seed={p.id} size={20} />
                {p.name} <span className="font-semibold text-muted">· {ROLE_NAMES[p.role] ?? p.role}</span>
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-row-line pt-2.5">
          {propertySide || staff ? (
            <span className="text-[12.5px] text-muted">{staff ? "Only the CBES team can see your note." : "CBES and this property's team can see your note."}</span>
          ) : (
            <SegmentedControl
              size="sm"
              label="Who can see this note"
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "cbes", label: "CBES team only" },
                { value: "property", label: "Also show property" },
              ]}
            />
          )}
          <Button type="submit" disabled={add.isPending} className="min-h-10! px-4! text-[14px]">
            {add.isPending ? "Adding…" : chosen.length ? `Add note and notify ${chosen.length}` : "Add note"}
          </Button>
        </div>
      </form>
      )}

      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3">
            {e.actor ? <Avatar name={e.actor.name} seed={e.actor.id} size={34} /> : <span aria-hidden="true" className="flex size-[34px] flex-none items-center justify-center rounded-full bg-neutral-bg text-muted"><Icon name="clock" size={16} /></span>}
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13.5px]">
                <strong>{e.actor?.name ?? "CBES"}</strong> <span className="text-muted">{describe(e)}</span> <span className="text-[12px] text-muted">· {timeAgo(e.createdAt)}</span>
              </p>
              {e.body && (
                <div className={cx("mt-1.5 rounded-xl px-3 py-2.5 text-[14px] leading-normal whitespace-pre-wrap", e.visibility === "property" ? "bg-info-bg" : "bg-canvas")}>
                  {e.body}
                  {e.visibility === "property" && !propertySide && <span className="mt-1 block text-[11.5px] font-bold text-info">Visible to property</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Details({ v, area, onType }: { v: ViolationDetail; area: ViolationArea; onType?: (typeKey: string) => void }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const types = useQuery({ queryKey: ["admin", "violation-types"], queryFn: () => api<{ items: ViolationType[] }>("/admin/violation-types"), enabled: editing, staleTime: 10 * 60_000 });
  const rows: [string, ReactNode][] = [
    ["Organization", v.orgId && area === "admin" ? <Link to={`/admin/organizations/${v.orgId}`}>{v.orgName}</Link> : v.orgName],
    ["Property", <span>{area === "admin" && v.orgId ? <Link to={`/admin/organizations/${v.orgId}/properties/${v.propertyId}`}>{v.propertyName}</Link> : v.propertyName}<PropertyAddress property={propertyLocation(v)} /></span>],
    ["Building · Unit", [v.building && `Building ${v.building}`, v.unit].filter(Boolean).join(" · ")],
    [
      "Type",
      editing && onType ? (
        <select
          aria-label="Type"
          defaultValue={v.typeKey}
          onChange={(e) => {
            onType(e.target.value);
            setEditing(false);
          }}
          className="h-9 rounded-lg border border-field px-2 text-[14px]"
        >
          {(types.data?.items ?? [{ key: v.typeKey, label: v.typeLabel }]).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="flex items-center gap-1.5">
          {v.typeLabel}
          {onType && (
            <button type="button" aria-label="Change type" onClick={() => setEditing(true)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-canvas print:hidden">
              <Icon name="edit" size={14} />
            </button>
          )}
        </span>
      ),
    ],
    ["Valet note", v.note ?? <span className="text-muted">None</span>],
    ["Logged", `${dateTime(v.loggedAt)} (synced ${new Date(v.syncedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })})`],
  ];
  if (v.gps) rows.push(["Location", `${v.gps.lat.toFixed(4)}, ${v.gps.lng.toFixed(4)}${v.gps.accuracyM != null ? ` · ±${Math.round(v.gps.accuracyM)} m` : ""}`]);
  return (
    <section className={card}>
      <h2 className="m-0 mb-3.5 text-[17px] text-ink">Details</h2>
      <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[14px]">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 font-semibold break-words">{val}</dd>
          </div>
        ))}
      </dl>
      {v.gps && placesAvailable() && <img src={staticMapUrl(v.gps.lat, v.gps.lng)} alt={`Map of where V-${v.refNo} was logged`} className="mt-3.5 h-[120px] w-full rounded-xl border border-line object-cover" />}
    </section>
  );
}

export function People({ v, action }: { v: ViolationDetail; action?: ReactNode }) {
  const valetName = v.valet.name.split(" ")[0];
  const rows: { p: Person; role: string; tag?: ReactNode }[] = [
    { p: v.valet, role: "Valet · logged this" },
    ...(v.steward ? [{ p: v.steward, role: `Steward · ${valetName}'s direct manager` }] : []),
    ...v.people.propertyManagers.map((p) => ({ p, role: `${ROLE_NAMES[p.role] ?? "Property Manager"} · gets it when sent` })),
    ...v.people.representatives.map((p) => ({ p, role: "Representative · weekly report" })),
  ];
  return (
    <section className={card}>
      <h2 className="m-0 mb-3.5 text-[17px] text-ink">People</h2>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {rows.map(({ p, role, tag }) => (
          <li key={`${p.id}-${role}`} className="flex items-center gap-3">
            <Avatar name={p.name} seed={p.id} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold">{p.name}</span>
              <span className="block text-[12.5px] text-muted">{role}</span>
            </span>
            {tag}
          </li>
        ))}
      </ul>
      {action}
    </section>
  );
}

export function UnitHistoryCard({ v, area }: { v: ViolationDetail; area: ViolationArea }) {
  const at = v.unitCount30d >= v.overwatchThreshold;
  return (
    <section className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] text-ink">Unit {v.unit} history</h2>
        <Pill tone={at ? "danger" : "neutral"}>
          {v.unitCount30d} in {v.overwatchDays} days
        </Pill>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px]">
        {v.unitHistory.map((h) => (
          <li key={h.id} className="flex justify-between gap-3">
            <span>
              {h.typeLabel} · {serviceTime(h.loggedAt).replace(/ \d.*$/, "")}
              {h.status === "dismissed" && <span className="text-muted"> (dismissed)</span>}
            </span>
            {h.id === v.id ? <span className="text-muted">V-{h.refNo}</span> : <Link to={violationPath(area, h.id)}>V-{h.refNo}</Link>}
          </li>
        ))}
      </ul>
      {at && <p className="mt-3 mb-0 text-[12.5px] text-muted">At the Overwatch threshold. Overwatch tools arrive in Phase 2.</p>}
    </section>
  );
}

function ReassignModal({ v, onClose, onDone }: { v: ViolationDetail; onClose: () => void; onDone: (v: ViolationDetail) => void }) {
  const api = useApi();
  const valets = useQuery({ queryKey: ["admin", "valets"], queryFn: () => api<{ items: StaffOption[] }>("/admin/valets") });
  const stewards = useQuery({ queryKey: ["admin", "stewards"], queryFn: () => api<{ items: StaffOption[] }>("/admin/stewards") });
  const [valet, setValet] = useState(v.valet.id);
  const [steward, setSteward] = useState(v.steward?.id ?? "");
  const save = useMutation({
    mutationFn: () =>
      api<{ violation: ViolationDetail }>(`/admin/violations/${v.id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ ...(valet !== v.valet.id ? { valetUserId: valet } : {}), ...(steward && steward !== v.steward?.id ? { stewardUserId: steward } : {}) }),
      }).then(unwrap),
    onSuccess: onDone,
  });
  const withCurrent = (items: StaffOption[] | undefined, current: Person | null) => (current && !items?.some((i) => i.id === current.id) ? [{ id: current.id, name: current.name, email: "" }, ...(items ?? [])] : (items ?? []));
  return (
    <Modal
      title="Reassign valet or Steward"
      context={`V-${v.refNo} · ${v.typeLabel} · Unit ${v.unit}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending || (valet === v.valet.id && steward === (v.steward?.id ?? ""))} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Valet" value={valet} onChange={(e) => setValet(e.target.value)}>
          {withCurrent(valets.data?.items, v.valet).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Steward" value={steward} onChange={(e) => setSteward(e.target.value)}>
          {!v.steward && <option value="">No Steward</option>}
          {withCurrent(stewards.data?.items, v.steward).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        {save.error && (
          <div className="sm:col-span-2">
            <Alert>{errorMessage(save.error)}</Alert>
          </div>
        )}
      </div>
    </Modal>
  );
}
