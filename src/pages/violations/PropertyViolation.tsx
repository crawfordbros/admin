import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type Resolution, type ViolationDetail, type ViolationEvent } from "../../lib/api";
import { RESOLUTION_LABELS, serviceNight, serviceTime, unitLabel, weekdayName } from "../../lib/format";
import { Stepper, type Step } from "../../components/controls";
import { Avatar, Pill, StatusBadge } from "../../components/display";
import { Icon } from "../../components/icons";
import { ResolutionPicker } from "../../components/portal/ResolutionPicker";
import { cx } from "../../components/styles";
import { useToast } from "../../components/Toast";
import { Alert, Button } from "../../components/ui";
import { useCourtesyNotices } from "../portal/violations/useCourtesyNotices";
import { unwrap } from "./paths";
import { Gallery } from "./ViolationDetailPage";

const card = "rounded-2xl border border-line bg-white p-5";
const CBES_ROLES = new Set(["admin", "super_admin", "lead", "valet"]);

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Monday, Oct 26" for a YYYY-MM-DD night. */
const nightLabel = (date: string) => `${weekdayName(date)}, ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
/** "Mon, Oct 26 at 9:14 PM", in Atlanta time. */
function at(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}
const roleTag = (role: string) => (CBES_ROLES.has(role) ? "CBES" : role === "representative" ? "Representative" : "Property manager");

function timeline(v: ViolationDetail): Step[] {
  const open = v.status === "sent";
  return [
    { label: "Logged by valet", sub: `${serviceTime(v.loggedAt)} · ${v.valet.name}`, state: "done" },
    { label: "Reviewed by CBES", sub: v.sentBy?.name ?? "CBES", state: "done" },
    { label: "Sent to property", sub: `${v.sentAt ? serviceTime(v.sentAt) : "Sent"}${open ? " · waiting on you" : ""}`, state: open ? "current" : "done" },
    {
      label: "Resolved",
      sub: open ? "—" : [v.resolvedAt ? serviceTime(v.resolvedAt) : null, v.resolvedBy?.name ?? "CBES", v.resolution ? RESOLUTION_LABELS[v.resolution] : null].filter(Boolean).join(" · "),
      state: open ? "todo" : "done",
    },
  ];
}

/** What a property-visible event says happened. */
function describe(e: ViolationEvent): string {
  if (e.kind !== "status") return "";
  if (e.toStatus === "resolved") return "marked it resolved";
  if (e.toStatus === "sent") return e.fromStatus === "resolved" ? "reopened it" : "sent it to your property";
  return "updated it";
}

/** "Notes with CBES": the property's thread with CBES. Residents never see it. */
function PropertyNotes({ v, readOnly, onAdded }: { v: ViolationDetail; readOnly: boolean; onAdded: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api(`/portal/violations/${v.id}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim() }) }),
    onSuccess: async () => {
      setBody("");
      setError(null);
      toast.success("Note posted.");
      await onAdded();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const events = [...v.events].reverse().filter((e) => e.kind === "note" || e.kind === "status");
  return (
    <section aria-labelledby="notes-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="border-b border-row-line px-[22px] py-4">
        <h2 id="notes-title" className="m-0 text-[18px]">
          Notes with CBES
        </h2>
        <p className="m-0 mt-0.5 text-[13px] text-muted">CBES and your property team see these notes. Residents never do.</p>
      </div>
      {events.length > 0 && (
        <ol className="m-0 flex list-none flex-col px-[22px] py-2">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 border-b border-row-line py-3.5 last:border-b-0">
              <Avatar name={e.actor?.name ?? "CBES"} seed={e.actor?.id} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-[14px]">{e.actor?.name ?? "CBES"}</strong>
                  {e.actor && <Pill tone={CBES_ROLES.has(e.actor.role) ? "navy" : "gold"} className="py-0.5! text-[11px]">{roleTag(e.actor.role)}</Pill>}
                  {e.kind === "status" && <span className="text-[13px] text-muted">{describe(e)}</span>}
                  <span className="text-[12px] text-muted">{serviceTime(e.createdAt)}</span>
                </span>
                {e.body && <span className="mt-1 block text-[14px] leading-normal whitespace-pre-wrap">{e.body}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <form
          className="flex flex-col gap-2.5 px-[22px] pt-4 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return setError("Write the note first.");
            add.mutate();
          }}
        >
          <label htmlFor="property-note" className="text-[13.5px] font-semibold">
            Add a note for CBES
          </label>
          <textarea
            id="property-note"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ask a question or tell CBES what you did…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "property-note-error" : "property-note-hint"}
            className="resize-y rounded-[10px] border border-field px-3 py-2.5 text-[14px] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25"
          />
          {error && (
            <p id="property-note-error" role="alert" className="m-0 text-[13px] font-semibold text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span id="property-note-hint" className="text-[12.5px] text-muted">
              {v.steward ? `Your Steward ${v.steward.name} and CBES admins get an email.` : "CBES admins get an email."}
            </span>
            <Button type="submit" disabled={add.isPending} className="min-h-10! px-4! text-[13.5px]">
              {add.isPending ? "Posting…" : "Post note"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** "Update status": resolve (saying how) or reopen. The property closes violations; CBES sees how. */
function UpdateStatus({ v, onSaved, chooseResolved }: { v: ViolationDetail; onSaved: (v: ViolationDetail, message: string) => void; chooseResolved: number }) {
  const api = useApi();
  const [status, setStatus] = useState<"sent" | "resolved">(v.status === "resolved" ? "resolved" : "sent");
  const [resolution, setResolution] = useState<Resolution | null>(v.resolution);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(chooseResolved);
  // The header's "Mark resolved" picks Resolved here.
  if (seen !== chooseResolved) {
    setSeen(chooseResolved);
    setStatus("resolved");
  }
  const changing = status !== v.status;
  const save = useMutation({
    mutationFn: () =>
      api<{ violation: ViolationDetail }>(`/portal/violations/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify(status === "resolved" ? { status, resolution, note: note.trim() || undefined } : { status, note: note.trim() || undefined }),
      }).then(unwrap),
    onSuccess: (updated) => {
      setNote("");
      setError(null);
      onSaved(updated, status === "resolved" ? "Marked resolved." : "Reopened.");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submit = () => {
    if (!changing) return setError(v.status === "resolved" ? "It's already resolved. Choose Sent to property to reopen it." : "Choose Resolved to close it.");
    if (status === "resolved" && !resolution) return setError("Choose how you handled it.");
    if (status === "resolved" && resolution === "other" && !note.trim()) return setError("Tell CBES what you did.");
    save.mutate();
  };
  return (
    <section id="update-status" aria-labelledby="update-status-title" className="flex flex-col gap-3 rounded-2xl border-2 border-success bg-white p-5">
      <h2 id="update-status-title" className="m-0 text-[17px]">
        Update status
      </h2>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "sent" | "resolved")}
          className="h-11 rounded-[10px] border border-field bg-white px-2.5 text-[14px] font-bold text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25"
        >
          <option value="sent">Sent to property (open)</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      {status === "resolved" && v.status === "sent" && <ResolutionPicker value={resolution} onChange={setResolution} />}
      {changing && (
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
          {status === "resolved" && resolution === "other" ? "Note for CBES" : "Note for CBES (optional)"}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-y rounded-[10px] border border-field px-3 py-2 text-[14px] font-normal text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25" />
        </label>
      )}
      {error && <Alert>{error}</Alert>}
      <button type="button" onClick={submit} disabled={save.isPending} className="h-11 rounded-[10px] bg-success text-[14px] font-bold text-white hover:opacity-90 disabled:opacity-60">
        {save.isPending ? "Saving…" : "Save status"}
      </button>
      <p className="m-0 text-[12px] text-muted">Your property closes violations. Resolved ones stay in reports, and you can reopen them. CBES sees the status and how you handled it.</p>
    </section>
  );
}

function DetailsCard({ v }: { v: ViolationDetail }) {
  const rows: [string, ReactNode][] = [
    ["Type", v.typeLabel],
    ["Pickup night", nightLabel(serviceNight(v.loggedAt))],
    ["Building and unit", [v.building && `Building ${v.building}`, unitLabel(v.unit)].filter(Boolean).join(" · ")],
    ["Logged by", `${v.valet.name}, CBES valet`],
    ["Reviewed by", v.sentBy ? `${v.sentBy.name}, CBES` : "CBES"],
    ["Sent to property", v.sentAt ? at(v.sentAt) : "—"],
  ];
  return (
    <section aria-labelledby="details-title" className={cx(card, "px-[22px]")}>
      <h2 id="details-title" className="m-0 mb-3.5 text-[18px]">
        Details
      </h2>
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3.5 text-[14px]">
        {rows.map(([k, val]) => (
          <div key={k}>
            <dt className="text-[12.5px] font-semibold text-muted">{k}</dt>
            <dd className="m-0 mt-0.5 font-bold">{val}</dd>
          </div>
        ))}
      </dl>
      {v.note && (
        <div className="mt-4 rounded-xl bg-subtle px-4 py-3.5 text-[14px] leading-normal">
          <span className="mb-1 block text-[12.5px] font-bold text-muted">Valet's note</span>
          {v.note}
        </div>
      )}
    </section>
  );
}

function UnitHistory({ v, previewQuery }: { v: ViolationDetail; previewQuery: string }) {
  const atThreshold = v.unitCount30d >= v.overwatchThreshold;
  return (
    <section aria-labelledby="unit-history-title" className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="unit-history-title" className="m-0 text-[17px]">
          {unitLabel(v.unit)} history
        </h2>
        <Pill tone="navy" className="py-0.5! text-[11px]">
          Overwatch · Phase 2
        </Pill>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px]">
        {v.unitHistory.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2">
            <span>
              <strong className="block">{h.typeLabel}</strong>
              <span className="text-[12px] text-muted">
                {h.id === v.id ? `V-${h.refNo}` : <Link to={`/portal/violations/${h.id}${previewQuery}`}>V-{h.refNo}</Link>} · {serviceTime(h.loggedAt).replace(/ \d.*$/, "")}
              </span>
            </span>
            <StatusBadge kind="portalViolation" status={h.status as "sent" | "resolved"} />
          </li>
        ))}
      </ul>
      {atThreshold && (
        <p className="mt-3.5 mb-0 border-t border-row-line pt-3 text-[12.5px] text-muted">
          {v.unitCount30d} violations in {v.overwatchDays} days reaches the Overwatch threshold. Alerts for watched units arrive in Phase 2.
        </p>
      )}
    </section>
  );
}

/**
 * The property's violation page (REP_PORTAL_SPEC 7.6): photos, details and notes with CBES, and the
 * status the property controls. `readOnly` is the admin's manager preview: no changes at all.
 */
export function PropertyViolation({ v, queryKey, readOnly, previewQuery }: { v: ViolationDetail; queryKey: unknown[]; readOnly: boolean; previewQuery: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const api = useApi();
  const notices = useCourtesyNotices();
  const [chooseResolved, setChooseResolved] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ["portal", "violations"] }), queryClient.invalidateQueries({ queryKey: ["portal", "nav-counts"] }), queryClient.invalidateQueries({ queryKey: ["rep"] })]);
  const saved = (updated: ViolationDetail, message: string) => {
    queryClient.setQueryData(queryKey, updated);
    toast.success(message);
    void refresh();
  };
  const reopen = useMutation({
    mutationFn: () => api<{ violation: ViolationDetail }>(`/portal/violations/${v.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) }).then(unwrap),
    onSuccess: (updated) => saved(updated, "Reopened."),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const open = v.status === "sent";
  const where = [v.propertyName, v.building && `Building ${v.building}`, unitLabel(v.unit), `Logged ${at(v.loggedAt)} by ${v.valet.name}`].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-[18px]">
      <Link to={`/portal/violations?property=${v.propertyId}`} className="inline-flex items-center gap-1.5 self-start text-[14px] font-bold no-underline">
        <Icon name="chevron-left" size={16} strokeWidth={2.2} />
        All violations
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_420px]">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-muted">V-{v.refNo}</span>
            <StatusBadge kind="portalViolation" status={v.status as "sent" | "resolved"} />
            {v.repeat && (
              <Pill tone="danger">
                {ordinal(v.unitCount30d)} for this unit in {v.overwatchDays} days
              </Pill>
            )}
          </p>
          <h1 className="mt-1.5 mb-0 text-[30px] text-navy-ink">{v.typeLabel}</h1>
          <p className="mt-1.5 mb-0 text-[14px] text-muted">{where}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => notices.download([v])} disabled={notices.busy}>
            <Icon name="file" size={18} strokeWidth={2} />
            {notices.busy ? "Preparing…" : "Courtesy notice (PDF)"}
          </Button>
          {!readOnly && open && (
            <button
              type="button"
              onClick={() => {
                setChooseResolved((n) => n + 1);
                statusRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                statusRef.current?.querySelector("select")?.focus();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-success px-[18px] text-[14px] font-bold text-white hover:opacity-90"
            >
              <Icon name="check" size={18} strokeWidth={2.6} />
              Mark resolved
            </button>
          )}
          {!readOnly && !open && (
            <Button variant="secondary" onClick={() => reopen.mutate()} disabled={reopen.isPending}>
              {reopen.isPending ? "Reopening…" : "Reopen"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Gallery area="portal" v={v} />
          <DetailsCard v={v} />
          <PropertyNotes v={v} readOnly={readOnly} onAdded={() => queryClient.invalidateQueries({ queryKey })} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          {!readOnly && (
            <div ref={statusRef}>
              <UpdateStatus key={v.status} v={v} onSaved={saved} chooseResolved={chooseResolved} />
            </div>
          )}
          <section aria-labelledby="timeline-title" className={card}>
            <h2 id="timeline-title" className="m-0 mb-3.5 text-[17px]">
              Timeline
            </h2>
            <Stepper steps={timeline(v)} label="Where this violation is" orientation="vertical" />
          </section>
          <UnitHistory v={v} previewQuery={previewQuery} />
        </aside>
      </div>
    </div>
  );
}
