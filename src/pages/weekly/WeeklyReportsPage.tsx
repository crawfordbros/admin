import { propertyLocation } from "../../lib/propertyAddress";
import { PropertyAddress } from "../../components/PropertyAddress";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  errorMessage,
  useApi,
  type WeeklyAdminView,
  type WeeklyRecipients,
  type WeeklyReport,
  type WeeklyRow,
  type WeeklyScope,
  type WeeklySendResult,
} from "../../lib/api";
import { addDays, formatCount, formatDay, replyHours, timeAgo } from "../../lib/format";
import { lastCompletedWeek } from "../../lib/dates";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button, Loading } from "../../components/ui";
import { Avatar, EmptyState, PageHeader, Pill, Skeleton, StatusBadge } from "../../components/display";
import { SegmentedControl } from "../../components/controls";
import { DotStrip } from "../../components/charts/charts";
import { SearchField } from "../../components/FilterBar";
import { DataTable } from "../../components/DataTable";
import { Modal } from "../../components/overlay";
import { OrgLogo, PropertyPhoto } from "../../components/brand";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { propertyPath } from "../admin/paths";

type Group = WeeklyAdminView["groups"][number];
type SendTarget = { scope: WeeklyScope; id?: string; label: string };
// Older API responses without night dates: the default Sunday–Thursday calendar.
const NIGHTS = ["Sun", "Mon", "Tue", "Wed", "Thu"];

/** /admin/reporting: every property's week, sent or downloaded per property, organization or all (ADMIN_PORTAL_SPEC 7.3). */
export function WeeklyReportsPage() {
  const api = useApi();
  const { params, update } = useQueryState();
  const [sending, setSending] = useState<SendTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  useAdminPage("Reporting");

  const latest = lastCompletedWeek();
  const week = params.get("week") ?? latest;
  const q = params.get("q") ?? "";
  const delivery = (params.get("delivery") ?? "all") as "all" | "sent" | "failed";
  const byOrg = params.get("group") !== "none";

  const view = useQuery({ queryKey: ["admin", "weekly", week], queryFn: () => api<WeeklyAdminView>(`/admin/weekly-reports?week=${week}`), placeholderData: (p) => p });
  const nextRun = useQuery({ queryKey: ["admin", "weekly", "next-run"], queryFn: () => api<{ at: string; covers: { start: string; end: string } }>("/admin/weekly-reports/next-run") });
  const report = (propertyId: string) => api<WeeklyReport>(`/portal/properties/${propertyId}/report?week=${week}`);

  const data = view.data;
  const all = data?.groups.flatMap((g) => g.rows) ?? [];
  // Each property's organization, for the ungrouped list.
  const orgOf = new Map(data?.groups.flatMap((g) => g.rows.map((r) => [r.propertyId, g.org] as const)) ?? []);
  const needle = q.trim().toLowerCase();
  const keep = (r: WeeklyRow) =>
    (!needle || r.name.toLowerCase().includes(needle) || r.city?.toLowerCase().includes(needle)) && (delivery === "all" || (delivery === "sent" ? r.delivery === "sent" : r.delivery === "failed" || r.delivery === "bounced"));
  const groups: Group[] = byOrg
    ? (data?.groups ?? []).map((g) => ({ ...g, rows: g.rows.filter(keep) })).filter((g) => g.rows.length > 0)
    : data
      ? [{ org: { id: null, name: "All properties", logoVersion: null, representative: null, rollupSentAt: null }, rows: all.filter(keep).sort((a, b) => a.name.localeCompare(b.name)) }]
      : [];

  /** Runs a download with a busy label, reporting failures as a toast. */
  const download = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const propertyPdf = (r: WeeklyRow) =>
    download(`pdf:${r.propertyId}`, async () => {
      const [{ downloadReportPdf }, rep] = await Promise.all([import("../../lib/report-pdf"), report(r.propertyId)]);
      downloadReportPdf(rep);
    });
  // The organization's PDF always covers every one of its properties, whatever the search or
  // delivery filter is hiding on screen.
  const orgPdf = (shownGroup: Group) =>
    download(`org:${shownGroup.org.id}`, async () => {
      const g = data!.groups.find((x) => x.org.id === shownGroup.org.id) ?? shownGroup;
      const [{ buildOrgPdf, orgFileName }, reports] = await Promise.all([import("../../lib/report-pdf"), Promise.all(g.rows.map((r) => report(r.propertyId)))]);
      buildOrgPdf(g.org.name, data!.week.label, g.rows, reports).save(orgFileName(g.org.name, week));
    });
  const zipAll = () =>
    download("zip", async () => {
      const [{ buildReportPdf, reportFileName }, { zipSync }] = await Promise.all([import("../../lib/report-pdf"), import("fflate")]);
      const files: Record<string, Uint8Array> = {};
      let done = 0;
      // A few at a time keeps the browser responsive and the API unhurried.
      for (let i = 0; i < all.length; i += 4) {
        const batch = await Promise.all(all.slice(i, i + 4).map((r) => report(r.propertyId)));
        for (const rep of batch) files[reportFileName(rep)] = new Uint8Array(buildReportPdf(rep).output("arraybuffer"));
        done += batch.length;
        setBusy(`zip:${done}`);
      }
      const blob = new Blob([zipSync(files) as BlobPart], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `cbes-weekly-reports-${week}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

  const zipping = busy?.startsWith("zip");
  const atLatest = week >= latest;

  return (
    <>
      <PageHeader
        title="Reporting"
        description="Sent every Monday at 7:00 AM Eastern to each property's Property Manager. Send again or download any property or organization."
        actions={
          <>
            <Button variant="secondary" disabled={!all.length || Boolean(busy)} onClick={zipAll}>
              <Icon name="download" size={18} strokeWidth={2} />
              {zipping ? (busy === "zip" ? "Preparing…" : `Preparing ${busy!.slice(4)} of ${all.length}…`) : "Download all (ZIP)"}
            </Button>
            <Button disabled={!all.length} onClick={() => setSending({ scope: "all", label: "every property" })}>
              <Icon name="send" size={18} strokeWidth={2} />
              Send all again
            </Button>
          </>
        }
      />

      <section className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-line bg-white px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" aria-label="Previous week" className="size-[38px] min-h-0! px-0!" onClick={() => update({ week: addDays(week, -7) })}>
            <Icon name="chevron-left" size={18} strokeWidth={2.2} />
          </Button>
          <div>
            <p className="m-0 text-[12px] font-semibold text-muted">Report week</p>
            <p aria-live="polite" className="m-0 font-heading text-xl font-bold text-navy-ink">
              {data?.week.label ?? <Skeleton className="h-6 w-60" />}
            </p>
          </div>
          <Button variant="secondary" aria-label="Next week" className="size-[38px] min-h-0! px-0!" disabled={atLatest} onClick={() => update({ week: addDays(week, 7) === latest ? null : addDays(week, 7) })}>
            <Icon name="chevron-right" size={18} strokeWidth={2.2} />
          </Button>
        </div>
        {data && (
          <dl className="m-0 flex flex-wrap gap-7">
            {(
              [
                ["Properties", formatCount(data.summary.properties), ""],
                ["Sent", formatCount(data.summary.sent), ""],
                ["Failed", formatCount(data.summary.failed), data.summary.failed ? "text-danger" : ""],
                ["Resident issues", formatCount(data.summary.residentReports), ""],
                ["Violations", formatCount(data.summary.violations), ""],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="text-[12.5px] text-muted">{label}</dt>
                <dd className={cx("m-0 font-heading text-[22px] font-bold text-navy-ink", tone)}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {data && data.summary.noManager > 0 && (
        <p role="status" className="m-0 rounded-lg bg-warning-bg px-4 py-3 text-[15px] font-semibold text-warning">
          {data.summary.noManager} {data.summary.noManager === 1 ? "property has" : "properties have"} no Property Manager to receive the report. Invite one from the property's Team tab.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField label="Search properties" placeholder="Search properties" value={q} onChange={(v) => update({ q: v })} />
        <SegmentedControl
          label="Delivery"
          value={delivery}
          onChange={(v) => update({ delivery: v === "all" ? null : v })}
          options={[
            { value: "all", label: `All ${all.length}` },
            { value: "sent", label: `Sent ${all.filter((r) => r.delivery === "sent").length}` },
            { value: "failed", label: `Failed ${all.filter((r) => r.delivery === "failed" || r.delivery === "bounced").length}` },
          ]}
        />
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          Group by
          <select value={byOrg ? "org" : "none"} onChange={(e) => update({ group: e.target.value === "none" ? "none" : null })} className="h-10 rounded-[10px] border border-field bg-white px-2.5 text-[13px]">
            <option value="org">Organization</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>

      {view.error && <Alert>{errorMessage(view.error)}</Alert>}
      {view.isPending && <Loading />}
      {data && groups.length === 0 && (
        <section className="rounded-[14px] border border-line bg-white">
          <EmptyState icon="calendar" title="No properties match" body={all.length ? "Clear the search or delivery filter." : "There are no active properties for this week."} />
        </section>
      )}
      {groups.map((g) => (
        <OrgCard
          key={g.org.id ?? g.org.name}
          group={g}
          week={week}
          showOrg={!byOrg}
          orgOf={orgOf}
          busy={busy}
          onOrgPdf={() => orgPdf(g)}
          onSendOrg={() => g.org.id && setSending({ scope: "organization", id: g.org.id, label: g.org.name })}
          onPdf={propertyPdf}
          onSend={(r) => setSending({ scope: "property", id: r.propertyId, label: r.name })}
        />
      ))}

      {nextRun.data && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 flex-none items-center justify-center rounded-[11px] bg-tint-2 text-navy">
              <Icon name="calendar" strokeWidth={2} />
            </span>
            <div>
              <p className="m-0 font-bold">
                Next run:{" "}
                {new Date(nextRun.data.at).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} Eastern
              </p>
              <p className="m-0 text-[13.5px] text-muted">
                Covers {shortDay(nextRun.data.covers.start)} – {shortDay(nextRun.data.covers.end)}. Organization roll-ups go to each Representative; the all-properties roll-up goes to the CBES admins.
              </p>
            </div>
          </div>
          <Link to="/admin/settings#reports" className="text-[14px] font-bold">
            Change schedule
          </Link>
        </section>
      )}

      {sending && <SendModal week={week} weekLabel={data?.week.label ?? ""} target={sending} onClose={() => setSending(null)} />}
    </>
  );
}

const shortDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

function OrgCard({
  group,
  week,
  showOrg,
  orgOf,
  busy,
  onOrgPdf,
  onSendOrg,
  onPdf,
  onSend,
}: {
  group: Group;
  week: string;
  showOrg: boolean;
  orgOf: Map<string, Group["org"]>;
  busy: string | null;
  onOrgPdf: () => void;
  onSendOrg: () => void;
  onPdf: (r: WeeklyRow) => void;
  onSend: (r: WeeklyRow) => void;
}) {
  const { org, rows } = group;
  const meta = [`${rows.length} ${rows.length === 1 ? "property" : "properties"}`, org.representative && `Representative ${org.representative}`, org.rollupSentAt && `roll-up sent ${timeAgo(org.rollupSentAt)}`].filter(Boolean).join(" · ");
  const topViolations = Math.max(1, ...rows.map((r) => r.violations));
  return (
    <section aria-labelledby={`org-${org.id ?? "none"}`} className="overflow-hidden rounded-[14px] border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-line bg-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          {org.id && <OrgLogo org={{ id: org.id, name: org.name, logoVersion: org.logoVersion }} size={40} />}
          <div>
            <h2 id={`org-${org.id ?? "none"}`} className="m-0 text-lg text-ink">
              {org.name}
            </h2>
            {!showOrg && <p className="mt-0.5 mb-0 text-[13px] text-muted">{meta}</p>}
          </div>
        </div>
        {org.id && !showOrg && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-[38px]! px-3! text-[13px]" disabled={Boolean(busy)} onClick={onOrgPdf}>
              <Icon name="download" size={16} strokeWidth={2} />
              {busy === `org:${org.id}` ? "Preparing…" : "Org PDF"}
            </Button>
            <Button variant="outline" className="min-h-[38px]! border-[1.5px]! px-3! text-[13px]" onClick={onSendOrg}>
              <Icon name="send" size={16} strokeWidth={2} />
              Send org report
            </Button>
          </div>
        )}
      </div>
      <DataTable
        label={`${org.name} weekly reports`}
        rows={rows}
        rowKey={(r) => r.propertyId}
        minWidth={1100}
        empty={null}
        columns={[
          {
            key: "property",
            header: "Property",
            cell: (r) => {
              const own = orgOf.get(r.propertyId) ?? org;
              return (
                <span className="flex items-center gap-2.5">
                  <span className="block size-[34px] flex-none overflow-hidden rounded-lg">{own.id ? <PropertyPhoto orgId={own.id} property={{ id: r.propertyId, photoVersion: r.photoVersion }} /> : <span className="block size-full bg-tint-2" />}</span>
                  <span>
                    <strong className="block">{r.name}</strong><PropertyAddress property={r} />
                    <span className="text-[12px] text-muted">{[showOrg && own.name, r.units && `${formatCount(r.units)} units`].filter(Boolean).join(" · ")}</span>
                  </span>
                </span>
              );
            },
          },
          {
            key: "nights",
            header: "Nights",
            cell: (r) =>
              r.valetStatus === "ok" ? (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <DotStrip
                    size={10}
                    label={`${r.nights.serviced} of ${r.nights.scheduled} nights serviced`}
                    items={r.nights.byNight.map((on, i) => ({ label: `${r.nights.dates?.[i] ? formatDay(r.nights.dates[i]) : (NIGHTS[i] ?? `Night ${i + 1}`)}: ${on ? "serviced" : "no clock-in"}`, tone: on ? "success" : "danger" }))}
                  />
                  {r.nights.serviced}/{r.nights.scheduled}
                </span>
              ) : (
                <span className="text-[12.5px] text-muted">{r.valetStatus === "no_job" ? "No Connecteam job" : r.valetStatus === "not_configured" ? "Connecteam off" : "Couldn't load"}</span>
              ),
          },
          { key: "clock", header: "Avg clock-in", cell: (r) => r.avgClockIn ?? "—" },
          {
            key: "reports",
            header: "Resident issues",
            cell: (r) => (
              <>
                <strong>{r.residentReports}</strong> <span className="text-muted">({r.resolved} resolved)</span>
              </>
            ),
          },
          { key: "reply", header: "Avg reply", cell: (r) => replyHours(r.avgReplyHours) },
          {
            key: "violations",
            header: "Violations",
            cell: (r) => (
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="block h-[7px] w-[46px] overflow-hidden rounded bg-tint-2">
                  <span className="block h-full bg-navy" style={{ width: `${(r.violations / topViolations) * 100}%` }} />
                </span>
                {r.violations}
              </span>
            ),
          },
          { key: "overwatch", header: "Overwatch", cell: (r) => (r.overwatchUnits ? `${r.overwatchUnits} unit${r.overwatchUnits === 1 ? "" : "s"}` : "—") },
          {
            key: "to",
            header: "Sent to",
            cell: (r) =>
              r.manager ? (
                <span className="flex items-center gap-1.5 text-[12.5px]">
                  <Avatar name={r.manager.name} seed={r.manager.email} size={24} />
                  {r.manager.name}
                  {r.recipients > 1 && <span className="text-muted">+{r.recipients - 1}</span>}
                </span>
              ) : (
                <Pill tone="warning">No Property Manager</Pill>
              ),
          },
          {
            key: "delivery",
            header: "Delivery",
            cell: (r) => (
              <span className="flex flex-col items-start gap-0.5">
                <StatusBadge kind="delivery" status={r.delivery} />
                {(r.delivery === "failed" || r.delivery === "bounced") && (
                  <Link to={`${propertyPath(orgOf.get(r.propertyId)?.id ?? null, r.propertyId)}?tab=team`} title={r.lastError ?? undefined} className="text-[12px] font-bold">
                    Fix recipient
                  </Link>
                )}
                {r.delivery === "sent" && r.lastRunAt && <span className="text-[11.5px] text-muted">{timeAgo(r.lastRunAt)}</span>}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            srHeader: "Actions",
            cell: (r) => (
              <span className="flex justify-end gap-1.5">
                <a href={`/portal/properties/${r.propertyId}/report?week=${week}`} target="_blank" rel="noreferrer" aria-label={`Preview ${r.name} report (opens in a new tab)`} className="flex size-[34px] items-center justify-center rounded-[9px] border border-line text-ink hover:bg-canvas">
                  <Icon name="eye" size={16} strokeWidth={2} />
                </a>
                <button type="button" aria-label={`Download ${r.name} PDF`} disabled={Boolean(busy)} onClick={() => onPdf(r)} className="flex size-[34px] items-center justify-center rounded-[9px] border border-line bg-white text-ink hover:bg-canvas disabled:opacity-50">
                  <Icon name={busy === `pdf:${r.propertyId}` ? "clock" : "download"} size={16} strokeWidth={2} />
                </button>
                <button type="button" aria-label={`Send ${r.name} report again`} disabled={!r.recipients} onClick={() => onSend(r)} className="flex size-[34px] items-center justify-center rounded-[9px] bg-navy text-white hover:bg-navy-dark disabled:opacity-40">
                  <Icon name="send" size={16} strokeWidth={2} />
                </button>
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}

const KIND_LABELS = { manager: "Property Manager", member: "Gets the report", representative: "Rep", admin: "CBES admin" } as const;

/** Shows exactly who will get the email before anything is sent. */
function SendModal({ week, weekLabel, target, onClose }: { week: string; weekLabel: string; target: SendTarget; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = new URLSearchParams({ week, scope: target.scope });
  if (target.id) query.set("id", target.id);
  const who = useQuery({ queryKey: ["admin", "weekly", "recipients", query.toString()], queryFn: () => api<WeeklyRecipients>(`/admin/weekly-reports/recipients?${query}`) });
  const send = useMutation({
    mutationFn: () => api<WeeklySendResult>("/admin/weekly-reports/send", { method: "POST", body: JSON.stringify({ week, scope: target.scope, ...(target.id ? { id: target.id } : {}) }) }),
    onSuccess: async (r) => {
      toast.success(`Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}.`);
      if (r.failed) toast.error(`${r.failed} email${r.failed === 1 ? "" : "s"} didn't go through. Check the Delivery column.`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "weekly"] });
      onClose();
    },
  });
  const list = who.data?.recipients ?? [];
  return (
    <Modal
      title={target.scope === "all" ? "Send every report again" : `Send ${target.label}'s report${target.scope === "organization" ? "s" : ""}`}
      context={weekLabel}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!list.length || send.isPending} onClick={() => send.mutate()}>
            <Icon name="send" size={18} strokeWidth={2} />
            {send.isPending ? "Sending…" : `Send to ${list.length} ${list.length === 1 ? "person" : "people"}`}
          </Button>
        </>
      }
    >
      {who.isPending && <Loading label="Finding recipients…" />}
      {who.error && <Alert>{errorMessage(who.error)}</Alert>}
      {who.data && (
        <div className="flex flex-col gap-3">
          {list.length === 0 ? (
            <p className="m-0 text-muted">Nobody would get this report. Invite a Property Manager from the property's Team tab.</p>
          ) : (
            <ul aria-label="Recipients" className="m-0 flex max-h-72 list-none flex-col gap-2 overflow-y-auto p-0">
              {list.map((r) => (
                <li key={`${r.email}-${r.kind}-${r.propertyId ?? "all"}`} className="flex items-center gap-2.5 text-[14px]">
                  <Avatar name={r.name ?? r.email} seed={r.email} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words">{r.name ?? r.email}</span>
                    <span className="block text-[12.5px] text-muted">{KIND_LABELS[r.kind]}{r.propertyName && <span className="block">{r.propertyName}<PropertyAddress property={propertyLocation(r)} /></span>}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {who.data.skippedNoManager.length > 0 && (
            <p className="m-0 rounded-lg bg-warning-bg px-3 py-2 text-[13px] font-semibold text-warning">
              Skipped, no Property Manager: {who.data.skippedNoManager.join(", ")}
            </p>
          )}
          {send.error && <Alert>{errorMessage(send.error)}</Alert>}
        </div>
      )}
    </Modal>
  );
}
