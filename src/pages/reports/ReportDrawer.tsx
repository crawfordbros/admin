import { propertyLocation } from "../../lib/propertyAddress";
import { PropertyAddress } from "../../components/PropertyAddress";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApi, type ReportDetail, type ReportEvent, type ReportStatus } from "../../lib/api";
import { dateTime, formatDay, timeAgo } from "../../lib/format";
import { useAuthedImage } from "../../lib/images";
import { Alert, Button, Loading } from "../../components/ui";
import { Avatar } from "../../components/display";
import { statusLabel } from "../../components/displayUtils";
import { SegmentedControl } from "../../components/controls";
import { Drawer } from "../../components/overlay";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { IssueIcon, ReplyClockChip, SourceChip } from "./shared";

const STATUSES: ReportStatus[] = ["new", "assigned", "in_progress", "resolved", "closed"];

function describe(e: ReportEvent): string {
  switch (e.kind) {
    case "created":
      return e.actor ? "logged this issue" : "sent this issue";
    case "status":
      return `marked it ${statusLabel("report", e.toStatus ?? "new").toLowerCase()}`;
    case "assigned":
      return e.assignee ? `assigned it to ${e.assignee.name}` : "unassigned it";
    case "reply":
      return "replied to the resident by email";
    case "call":
      return "called the resident";
    default:
      return "added an internal comment";
  }
}

function Photo({ reportId, photoId, n }: { reportId: string; photoId: string; n: number }) {
  const src = useAuthedImage(`/admin/reports/${reportId}/photos/${photoId}`, photoId);
  return src ? (
    <a href={src} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-lg border border-line">
      <img src={src} alt={`Resident photo ${n}`} className="size-full object-cover" />
    </a>
  ) : (
    <span aria-hidden="true" className="block size-24 animate-pulse rounded-lg bg-neutral-bg" />
  );
}

/** /admin/issues/:id — one issue in a drawer over the list. The only place the resident's contact shows. */
export function ReportDrawer() {
  const { id = "" } = useParams();
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const key = ["admin", "report", id];
  const { data: r, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<ReportDetail>(`/admin/reports/${id}`) });
  const assignees = useQuery({ queryKey: ["admin", "assignees"], queryFn: () => api<{ items: { id: string; name: string }[] }>("/admin/assignees") });
  useAdminPage(r ? `Issue #${r.refNo}` : null, r && [{ label: "Issues", to: `/admin/issues${location.search}` }, { label: `#${r.refNo}` }]);
  const close = () => navigate({ pathname: "/admin/issues", search: location.search });

  const saved = async (report: ReportDetail, message: string) => {
    queryClient.setQueryData(key, report);
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
  };
  const patch = useMutation({
    mutationFn: (body: { status?: ReportStatus; assigneeUserId?: string | null }) => api<{ report: ReportDetail }>(`/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: ({ report }) => saved(report, "Issue updated."),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Drawer
      title={r ? r.issueLabel : "Issue"}
      context={r ? `#${r.refNo} · ${dateTime(r.createdAt)}` : undefined}
      icon={r && <IssueIcon issueKey={r.issueKey} />}
      onClose={close}
    >
      {isPending && <Loading />}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {r && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <ReplyClockChip clock={r.replyClock} />
            <SourceChip source={r.source} />
            <span className="text-[13px] text-muted">
              <span>{r.propertyName}<PropertyAddress property={propertyLocation(r)} /></span>
              {r.unit ? ` · ${[r.building && `Bldg ${r.building}`, `Unit ${r.unit}`].filter(Boolean).join(" · ")}` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Status
              <select value={r.status} disabled={patch.isPending} onChange={(e) => patch.mutate({ status: e.target.value as ReportStatus })} className="min-h-10 rounded-lg border border-field bg-white px-2.5 text-[14px] font-normal">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel("report", s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Assigned to
              <select value={r.assignee?.id ?? ""} disabled={patch.isPending} onChange={(e) => patch.mutate({ assigneeUserId: e.target.value || null })} className="min-h-10 rounded-lg border border-field bg-white px-2.5 text-[14px] font-normal">
                <option value="">Unassigned</option>
                {(assignees.data?.items ?? (r.assignee ? [r.assignee] : [])).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section aria-labelledby="resident" className="rounded-xl bg-subtle p-4">
            <h2 id="resident" className="m-0 mb-2 text-[15px] text-ink">
              Resident
            </h2>
            <p className="m-0 font-semibold">{r.reporterName}</p>
            <p className="m-0 text-[14px]">
              {r.contactMethod === "email" ? <a href={`mailto:${r.reporterContact}`}>{r.reporterContact}</a> : <a href={`tel:${r.reporterContact}`}>{r.reporterContact}</a>}
              {!r.reporterPhone && <span className="text-muted"> · prefers {r.contactMethod === "email" ? "email" : "a phone call"}</span>}
            </p>
            {r.reporterPhone && (
              <p className="m-0 text-[14px]">
                <a href={`tel:${r.reporterPhone}`}>{r.reporterPhone}</a>
                <span className="text-muted"> · OK to call</span>
              </p>
            )}
            {r.issueDate && <p className="mt-1 mb-0 text-[13px] text-muted">Happened {formatDay(r.issueDate)}</p>}
            {r.description && <p className="mt-2.5 mb-0 text-[14.5px] leading-relaxed whitespace-pre-wrap">{r.description}</p>}
            {r.photos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.photos.map((p, i) => (
                  <Photo key={p.id} reportId={r.id} photoId={p.id} n={i + 1} />
                ))}
              </div>
            )}
          </section>

          <Respond report={r} onSaved={saved} />

          <section aria-labelledby="timeline">
            <h2 id="timeline" className="m-0 mb-3 text-[15px] text-ink">
              Timeline
            </h2>
            <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
              {r.events.map((e) => (
                <li key={e.id} className="flex gap-2.5">
                  {e.actor ? <Avatar name={e.actor.name} seed={e.actor.id} size={30} /> : <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-full bg-neutral-bg text-muted"><Icon name="message" size={14} /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[13.5px]">
                      <strong>{e.actor?.name ?? r.reporterName}</strong> <span className="text-muted">{describe(e)}</span> <span className="text-[12px] text-muted">· {timeAgo(e.createdAt)}</span>
                    </p>
                    {e.body && <p className={cx("mt-1 mb-0 rounded-lg px-3 py-2 text-[14px] whitespace-pre-wrap", e.kind === "comment" ? "bg-gold-tint" : "bg-canvas")}>{e.body}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Drawer>
  );
}

/**
 * Reply to the resident (email from office@), log a call for residents who asked for one, or leave an
 * internal comment. The first reply or call stops the 24-hour clock.
 */
function Respond({ report, onSaved }: { report: ReportDetail; onSaved: (r: ReportDetail, message: string) => Promise<void> }) {
  const api = useApi();
  const [mode, setMode] = useState<"reply" | "comment">("reply");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const byEmail = report.contactMethod === "email";
  const path = mode === "comment" ? "comments" : byEmail ? "replies" : "calls";
  const send = useMutation({
    mutationFn: () => api<{ report: ReportDetail }>(`/admin/reports/${report.id}/${path}`, { method: "POST", body: JSON.stringify({ body: body.trim() }) }),
    onSuccess: async ({ report: updated }) => {
      setBody("");
      setError(null);
      await onSaved(updated, mode === "comment" ? "Comment added." : byEmail ? `Reply sent to ${report.reporterContact}.` : "Call logged.");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const label = mode === "comment" ? "Internal comment" : byEmail ? `Reply to ${report.reporterName}` : `What you told ${report.reporterName} on the phone`;
  return (
    <section aria-label="Respond" className="flex flex-col gap-2.5 rounded-xl border-[1.5px] border-navy p-3">
      <SegmentedControl
        size="sm"
        label="Respond with"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: "reply", label: byEmail ? "Reply to resident" : "Log a call" },
          { value: "comment", label: "Internal comment" },
        ]}
      />
      <label htmlFor="respond" className="text-[13px] font-semibold">
        {label}
      </label>
      <textarea id="respond" rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby="respond-hint" className="resize-y rounded-lg border border-field px-3 py-2 text-[14px] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25" />
      <p id="respond-hint" className="m-0 text-[12.5px] text-muted">
        {mode === "comment" ? "Only CBES sees comments." : byEmail ? "Sent from office@mail.cbenvironments.com. Replies go to office@cbenvironments.com." : "This resident asked for a call. Log it here after you call."}
      </p>
      {error && <Alert>{error}</Alert>}
      <Button disabled={!body.trim() || send.isPending} onClick={() => send.mutate()} className="self-end">
        {send.isPending ? "Saving…" : mode === "comment" ? "Add comment" : byEmail ? "Send reply" : "Log call"}
      </Button>
    </section>
  );
}
