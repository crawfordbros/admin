import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type PortalReportHistory, type PortalReportSummary, type WeeklyReport } from "../../../lib/api";
import { addDays, nyToday, replyHours } from "../../../lib/format";
import { useQueryState } from "../../../lib/useQueryState";
import { usePortalPage } from "../../../components/admin/adminPage";
import { GroupedBars, HBarList, Legend } from "../../../components/charts/charts";
import { SegmentedControl } from "../../../components/controls";
import { KpiTile, Pill, Skeleton, TileSkeletons, type Tone } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { useRepContext } from "../../../components/portal/RepContext";
import { useToast } from "../../../components/Toast";
import { Alert, Button } from "../../../components/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Sunday that starts the last week to have fully ended, in Atlanta: the newest one with a report. */
function lastFullWeek(now = new Date()) {
  const today = nyToday(now);
  return addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay() - 7);
}

/** "6 fewer than last week" (good) / "1 more than last week" (bad, for things that should go down). */
function change(value: number, previous: number): { text: string; tone: Tone } {
  if (value === previous) return { text: "Same as last week", tone: "neutral" };
  const n = Math.abs(value - previous);
  return value < previous ? { text: `${n} fewer than last week`, tone: "good" } : { text: `${n} more than last week`, tone: "bad" };
}

/** "Monday, Nov 2 at 7 AM ET" */
const sendTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).replace(":00", "")} ET`;
};

const card = "rounded-2xl border border-line bg-white";
const smallButton = "h-8 rounded-lg border border-field bg-white px-2.5 text-[12.5px] font-bold text-navy hover:bg-canvas disabled:opacity-60";

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * /portal/reports (REP_PORTAL_SPEC 7.8): the numbers CBES emails every Monday, for an organization
 * (Representatives) or one property, any past week, with PDFs and email.
 */
export function RepReportsPage() {
  const api = useApi();
  const toast = useToast();
  const ctx = useRepContext();
  const { params, update } = useQueryState();
  const [busy, setBusy] = useState<string | null>(null);
  usePortalPage("Reports");

  const isRep = ctx.kind === "organization";
  // Managers only ever see their properties; Representatives choose the organization or one property.
  const scopeKind = isRep && params.get("scope") !== "property" ? "organization" : "property";
  const orgId = params.get("org") ?? ctx.org?.id ?? null;
  const propertyId = params.get("property") ?? (isRep ? ctx.properties[0]?.id : ctx.property?.id) ?? null;
  const week = params.get("week");
  const scopeQuery = scopeKind === "organization" ? orgId && `scope=organization&org=${orgId}` : propertyId && `scope=property&property=${propertyId}`;

  const summary = useQuery({
    queryKey: ["portal", "reports", "summary", scopeQuery, week],
    queryFn: () => api<PortalReportSummary>(`/portal/reports/summary?${scopeQuery}${week ? `&week=${week}` : ""}`),
    enabled: Boolean(scopeQuery),
    placeholderData: (prev) => prev,
  });
  const history = useQuery({
    queryKey: ["portal", "reports", "history", scopeQuery],
    queryFn: () => api<PortalReportHistory>(`/portal/reports/history?${scopeQuery}`),
    enabled: Boolean(scopeQuery),
  });
  const d = summary.data;
  const shownWeek = d?.week.start ?? week ?? lastFullWeek();
  const newest = lastFullWeek();

  const emailMe = useMutation({
    mutationFn: () =>
      api<{ sentTo: string }>("/portal/reports/email-me", {
        method: "POST",
        body: JSON.stringify({ scope: scopeKind, id: scopeKind === "organization" ? orgId : propertyId, week: shownWeek }),
      }),
    onSuccess: ({ sentTo }) => toast.success(`Sent to ${sentTo}.`),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const report = (id: string, w: string) => api<WeeklyReport>(`/portal/properties/${id}/report?week=${w}`);
  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key);
    try {
      await job();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const propertyPdf = (id: string, w = shownWeek) =>
    run(`pdf:${id}:${w}`, async () => {
      const [{ downloadReportPdf }, r] = await Promise.all([import("../../../lib/report-pdf"), report(id, w)]);
      downloadReportPdf(r);
    });
  const orgPdf = (w = shownWeek) =>
    run(`org:${w}`, async () => {
      // Another week's PDF needs that week's numbers.
      const s = w === shownWeek && d ? d : await api<PortalReportSummary>(`/portal/reports/summary?scope=organization&org=${orgId}&week=${w}`);
      const [{ buildOrgPdf, orgFileName }, reports] = await Promise.all([import("../../../lib/report-pdf"), Promise.all(s.rows.map((r) => report(r.propertyId, w)))]);
      buildOrgPdf(s.scope.name, `Week of ${s.week.label}`, s.rows, reports).save(orgFileName(s.scope.name, w));
    });
  const zip = () =>
    run("zip", async () => {
      if (!d) return;
      const [{ buildReportPdf, reportFileName }, { zipSync }] = await Promise.all([import("../../../lib/report-pdf"), import("fflate")]);
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < d.rows.length; i += 4) {
        const batch = await Promise.all(d.rows.slice(i, i + 4).map((r) => report(r.propertyId, shownWeek)));
        for (const r of batch) files[reportFileName(r)] = new Uint8Array(buildReportPdf(r).output("arraybuffer"));
      }
      save(new Blob([zipSync(files) as BlobPart], { type: "application/zip" }), `cbes-weekly-reports-${shownWeek}.zip`);
    });

  const k = d?.kpis;
  const sent = k ? change(k.violationsSent.value, k.violationsSent.previous) : null;
  const issues = k ? change(k.residentIssues.value, k.residentIssues.previous) : null;
  const totals = d?.byProperty.reduce(
    (t, r) => ({ violations: t.violations + r.violations, resolved: t.resolved + r.resolved, issues: t.issues + r.issues, repeat: t.repeat + r.repeatUnits }),
    { violations: 0, resolved: 0, issues: 0, repeat: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-[1_1_420px]">
          <h1 className="m-0 text-[30px] text-navy-ink">Reports</h1>
          <p className="mt-1.5 mb-0 text-[14.5px] text-muted">The same numbers CBES emails every Monday at 7 AM ET, for your whole organization or one property.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => emailMe.mutate()} disabled={!d || emailMe.isPending}>
            <Icon name="mail" size={18} strokeWidth={2} />
            {emailMe.isPending ? "Sending…" : "Email me"}
          </Button>
          {scopeKind === "organization" && (
            <Button variant="secondary" onClick={zip} disabled={!d || busy === "zip"}>
              <Icon name="download" size={18} strokeWidth={2} />
              {busy === "zip" ? "Preparing…" : "All properties (ZIP)"}
            </Button>
          )}
          <Button onClick={() => (scopeKind === "organization" ? orgPdf() : propertyId && propertyPdf(propertyId))} disabled={!d || Boolean(busy?.startsWith("org:") || busy?.startsWith("pdf:"))}>
            <Icon name="file" size={18} strokeWidth={2} />
            Download PDF
          </Button>
        </div>
      </div>

      <section aria-label="Which report" className={`${card} flex flex-wrap items-center justify-between gap-3 px-3.5 py-3`}>
        <div className="flex flex-wrap items-center gap-2.5">
          {isRep && (
            <SegmentedControl
              label="Report scope"
              value={scopeKind}
              onChange={(v) => update(v === "organization" ? { scope: "organization", org: orgId, property: null } : { scope: "property", property: propertyId, org: null })}
              options={[
                { value: "organization", label: "Organization" },
                { value: "property", label: "One property" },
              ]}
            />
          )}
          {(isRep || ctx.properties.length > 1) && (
            <label className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-subtle px-3 text-[13.5px] font-semibold text-muted">
              Property
              <select
                value={scopeKind === "organization" ? "" : (propertyId ?? "")}
                disabled={scopeKind === "organization"}
                onChange={(e) => update({ scope: "property", property: e.target.value, org: null })}
                className="border-0 bg-transparent text-[13.5px] font-bold text-ink outline-none disabled:text-muted"
              >
                {scopeKind === "organization" && <option value="">All {plural(ctx.properties.length, "property", "properties")}</option>}
                {ctx.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous week" onClick={() => update({ week: addDays(shownWeek, -7) })} className="flex size-[38px] items-center justify-center rounded-[10px] border border-field bg-white hover:bg-canvas">
            <Icon name="chevron-left" size={16} strokeWidth={2.2} />
          </button>
          <span aria-live="polite" className="min-w-[210px] text-center text-[14px] font-bold">
            Week of {d?.week.label ?? "…"}
          </span>
          <button
            type="button"
            aria-label="Next week"
            disabled={shownWeek >= newest}
            onClick={() => update({ week: addDays(shownWeek, 7) >= newest ? null : addDays(shownWeek, 7) })}
            className="flex size-[38px] items-center justify-center rounded-[10px] border border-field bg-white hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="chevron-right" size={16} strokeWidth={2.2} />
          </button>
        </div>
      </section>

      {summary.error ? (
        <Alert>
          {errorMessage(summary.error)}{" "}
          <Button variant="secondary" onClick={() => summary.refetch()} className="ml-2 min-h-9 px-3 py-1 text-[14px]">
            Retry
          </Button>
        </Alert>
      ) : !d || !k ? (
        <div className="flex flex-col gap-5">
          <TileSkeletons count={6} />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
            <KpiTile
              label="Service nights"
              value={k.serviceNights.scheduled ? `${k.serviceNights.serviced} of ${k.serviceNights.scheduled}` : "—"}
              delta={{
                text: k.serviceNights.scheduled ? plural(k.serviceNights.activeProperties, "active property", "active properties") : "No service nights scheduled",
                tone: k.serviceNights.scheduled && k.serviceNights.serviced === k.serviceNights.scheduled ? "good" : "neutral",
              }}
            />
            <KpiTile label="Violations sent" value={k.violationsSent.value} delta={sent!} />
            <KpiTile label="Resolved by property" value={k.resolvedByProperty.value} delta={{ text: k.resolvedByProperty.pct === null ? "None sent" : `${k.resolvedByProperty.pct}% of sent`, tone: "neutral" }} />
            <KpiTile label="Resident issues" value={k.residentIssues.value} delta={issues!} />
            <KpiTile
              label="CBES first reply"
              value={replyHours(k.avgFirstReplyHours.value)}
              delta={{ text: k.avgFirstReplyHours.allUnder24h ? "All under 24 hours" : k.residentIssues.value ? "Average this week" : "No issues this week", tone: k.avgFirstReplyHours.allUnder24h ? "good" : "neutral" }}
            />
            <KpiTile label="Compliments" value={k.compliments} delta={{ text: "From residents", tone: "neutral" }} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
            <section aria-labelledby="trend-title" className={`${card} p-5`}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="trend-title" className="m-0 text-[18px]">
                  Violations sent, last 8 weeks
                </h2>
                <Legend
                  items={[
                    { label: "Sent", tone: "navy" },
                    { label: "Resolved by property", tone: "navy-light" },
                  ]}
                />
              </div>
              <GroupedBars
                label={`Violations sent and resolved by the property, the 8 weeks to ${d.week.label}`}
                highlight={md(d.week.start)}
                data={d.trend.map((t) => ({ label: md(t.weekStart), sent: t.sent, resolved: t.resolvedByProperty }))}
                series={[
                  { key: "sent", label: "Sent", tone: "navy" },
                  { key: "resolved", label: "Resolved by property", tone: "navy-light" },
                ]}
              />
            </section>
            <section aria-labelledby="types-title" className={`${card} p-5`}>
              <h2 id="types-title" className="m-0 mb-3.5 text-[18px]">
                By type this week
              </h2>
              {d.byType.length ? (
                <HBarList label="Violations by type this week" items={d.byType.map((t) => ({ key: t.label, label: t.label, value: t.count }))} />
              ) : (
                <p className="m-0 text-[13.5px] text-muted">No violations sent this week.</p>
              )}
              <h3 className="mt-5 mb-2.5 text-[15px]">Resident issues this week</h3>
              <p className="m-0 text-[13.5px] text-muted">{d.issuesSummary}</p>
            </section>
          </div>

          {scopeKind === "organization" && (
            <section aria-labelledby="by-property-title" className={`${card} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-row-line px-5 py-4">
                <h2 id="by-property-title" className="m-0 text-[18px]">
                  By property
                </h2>
                <span className="text-[12.5px] text-muted">Week of {d.week.label}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
                  <thead>
                    <tr className="bg-subtle text-left text-[12px] text-muted">
                      {["Property", "Service nights", "Violations", "Resolved", "Resident issues", "Avg first reply", "Repeat units"].map((h, i) => (
                        <th key={h} scope="col" className={i === 0 ? "px-5 py-2.5 font-bold" : "px-2 py-2.5 font-bold"}>
                          {h}
                        </th>
                      ))}
                      <th scope="col" className="px-5 py-2.5 text-right font-bold">
                        Report
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.byProperty.map((r) => (
                      <tr key={r.propertyId} className="border-t border-row-line">
                        <td className="px-5 py-3">
                          <span className="block font-bold">{r.name}</span>
                          <span className="block text-[12px] text-muted">{r.managerName ? `PM ${r.managerName}` : "No manager yet"}</span>
                        </td>
                        <td className="px-2 py-3">{r.nights}</td>
                        <td className="px-2 py-3 font-bold">{r.violations}</td>
                        <td className="px-2 py-3">{r.resolved}</td>
                        <td className="px-2 py-3">{r.issues}</td>
                        <td className="px-2 py-3">{replyHours(r.avgReplyHours)}</td>
                        <td className="px-2 py-3">{r.repeatUnits ? <Pill tone="danger">{r.repeatUnits}</Pill> : <span className="text-muted">0</span>}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => propertyPdf(r.propertyId)} disabled={busy === `pdf:${r.propertyId}:${shownWeek}`} aria-label={`PDF for ${r.name}`} className={smallButton}>
                            PDF
                          </button>{" "}
                          <Link to={`/portal/properties/${r.propertyId}`} aria-label={`Open ${r.name}`} className="ml-1.5 text-[12.5px] font-bold no-underline hover:underline">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {totals && (
                      <tr className="border-t-2 border-line bg-subtle font-bold">
                        <td className="px-5 py-3">All properties</td>
                        <td className="px-2 py-3">{k.serviceNights.scheduled ? `${k.serviceNights.serviced} of ${k.serviceNights.scheduled}` : "—"}</td>
                        <td className="px-2 py-3">{totals.violations}</td>
                        <td className="px-2 py-3">{totals.resolved}</td>
                        <td className="px-2 py-3">{totals.issues}</td>
                        <td className="px-2 py-3">{replyHours(k.avgFirstReplyHours.value)}</td>
                        <td className="px-2 py-3">{totals.repeat}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <section aria-labelledby="history-title" className={`${card} overflow-hidden`}>
              <h2 id="history-title" className="m-0 border-b border-row-line px-5 py-4 text-[18px]">
                Past Monday reports
              </h2>
              {history.data?.items.length ? (
                <ul className="m-0 list-none p-0">
                  {history.data.items.map((h) => (
                    <li key={h.weekStart} className="flex flex-wrap items-center justify-between gap-3 border-b border-row-line px-5 py-3 text-[13.5px] last:border-b-0">
                      <span>
                        <strong className="block">
                          Week of {md(h.weekStart)} – {md(addDays(h.weekStart, 6))}
                        </strong>
                        <span className="text-[12px] text-muted">
                          {h.status === "sent" ? `Sent ${sendTime(h.sentAt)} to ${plural(h.recipients, "person", "people")}` : "Didn't send. CBES is looking into it."}
                        </span>
                      </span>
                      <span className="flex gap-1.5">
                        {scopeKind === "organization" ? (
                          <button type="button" onClick={() => update({ week: h.weekStart >= newest ? null : h.weekStart })} aria-label={`View the week of ${md(h.weekStart)}`} className={smallButton}>
                            View
                          </button>
                        ) : (
                          <Link to={`/portal/properties/${propertyId}/report?week=${h.weekStart}`} aria-label={`View the week of ${md(h.weekStart)}`} className={`${smallButton} inline-flex items-center no-underline`}>
                            View
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => (scopeKind === "organization" ? orgPdf(h.weekStart) : propertyId && propertyPdf(propertyId, h.weekStart))}
                          aria-label={`PDF for the week of ${md(h.weekStart)}`}
                          className={smallButton}
                        >
                          PDF
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 px-5 py-6 text-[13.5px] text-muted">No Monday reports yet. The first goes out the Monday after service starts.</p>
              )}
            </section>

            <section aria-labelledby="recipients-title" className="flex flex-col gap-3 rounded-2xl bg-navy-ink p-5 text-white">
              <h2 id="recipients-title" className="m-0 text-[17px] text-white">
                Who gets the Monday report
              </h2>
              <p className="m-0 text-[13px] text-nav-pill">Next send: {sendTime(d.nextRunAt)}</p>
              {d.recipients.length ? (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px]">
                  {d.recipients.map((r) => (
                    <li key={`${r.name}-${r.scope}`} className="flex justify-between gap-2">
                      <span className="font-bold">{r.name}</span>
                      <span className="text-[12.5px] text-nav-pill">{r.scope}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[13px] text-nav-pill">Nobody yet. Add a property manager to start the Monday email.</p>
              )}
              {isRep && orgId && (
                <Link to={`/portal/organizations/${orgId}/settings`} className="inline-flex h-[38px] items-center self-start rounded-[10px] bg-white px-3.5 text-[13.5px] font-bold text-navy-ink no-underline hover:bg-tint-2 hover:text-navy-ink">
                  Change in Team and settings
                </Link>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
