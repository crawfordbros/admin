import { useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type AdminOverview, type AttentionItem, type OverviewKpi, type OverviewRange, type TonightStatus } from "../../lib/api";
import { clockLabel, formatCount, greeting, longDay, replyHours, VALET_STATUS_TEXT, weekdayName } from "../../lib/format";
import { useQueryState } from "../../lib/useQueryState";
import { useAdminPage } from "../../components/admin/adminPage";
import { SegmentedControl } from "../../components/controls";
import { EmptyState, KpiTile, Pill, Skeleton, TileSkeletons, type Tone } from "../../components/display";
import type { PillTone } from "../../components/displayUtils";
import { GroupedBars, Legend } from "../../components/charts/charts";
import { OrgLogo } from "../../components/brand";
import { Icon, type IconName } from "../../components/icons";
import { Alert } from "../../components/ui";
import { cx } from "../../components/styles";
import { propertyPath } from "../admin/paths";

const RANGES: { value: OverviewRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
const PREVIOUS: Record<OverviewRange, string> = { today: "yesterday", "7d": "the previous 7 days", "30d": "the previous 30 days" };
const card = "min-w-0 rounded-[14px] border border-line bg-white p-5";

/** /admin: what needs Nick or Nigel tonight, at a glance (ADMIN_PORTAL_SPEC 7.1). */
export function OverviewPage() {
  const api = useApi();
  const { user } = useUser();
  const { params, update } = useQueryState();
  useAdminPage("Overview");

  const range = (RANGES.some((r) => r.value === params.get("range")) ? params.get("range") : "7d") as OverviewRange;
  const overview = useQuery({
    queryKey: ["admin", "overview", range],
    queryFn: () => api<AdminOverview>(`/admin/overview?range=${range}`),
    placeholderData: (p) => p,
    refetchInterval: 60_000,
  });
  const data = overview.data;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 mb-1 text-[13px] font-bold tracking-[0.12em] text-gold-text uppercase">{longDay()}</p>
          <h1 className="m-0 text-[26px] font-bold text-navy-ink sm:text-[30px]">
            {greeting()}
            {user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="mt-1.5 mb-0 text-[15px] text-muted">{data ? serviceLine(data.service) : <span className="invisible">Loading tonight's service</span>}</p>
        </div>
        <SegmentedControl label="Time range" options={RANGES} value={range} onChange={(v) => update({ range: v === "7d" ? null : v })} />
      </div>

      {overview.isError && !data && <Alert>{errorMessage(overview.error)}</Alert>}

      {data ? <Kpis data={data} range={range} /> : !overview.isError && <TileSkeletons count={5} />}

      <div className="flex flex-wrap gap-5">
        <section aria-labelledby="ov-activity" className={cx(card, "flex-[2_1_560px]")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="ov-activity" className="m-0 text-lg text-navy-ink">
                Activity, last 8 weeks
              </h2>
              <p className="mt-0.5 mb-0 text-[13px] text-muted">Resident reports and valet violations across all organizations</p>
            </div>
            <Legend
              items={[
                { label: "Violations", tone: "navy" },
                { label: "Resident reports", tone: "gold-light" },
              ]}
            />
          </div>
          {data ? (
            <GroupedBars
              label="Violations and resident reports per week, last 8 weeks"
              data={data.activity.map((w) => ({ label: shortDate(w.weekStart), violations: w.violations, reports: w.residentReports }))}
              series={[
                { key: "violations", label: "Violations", tone: "navy" },
                { key: "reports", label: "Resident reports", tone: "gold-light" },
              ]}
            />
          ) : (
            <Skeleton className="h-[220px]" />
          )}
        </section>

        <section aria-labelledby="ov-attention" className={cx(card, "flex-[1_1_320px]")}>
          <h2 id="ov-attention" className="m-0 text-lg text-navy-ink">
            Needs attention
          </h2>
          <p className="mt-0.5 mb-3.5 text-[13px] text-muted">Most urgent first</p>
          {data ? <Attention items={data.attention} /> : <RowSkeletons />}
        </section>
      </div>

      <div className="flex flex-wrap gap-5">
        <section aria-labelledby="ov-tonight" className={cx(card, "flex-[1_1_460px]")}>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <h2 id="ov-tonight" className="m-0 text-lg text-navy-ink">
              Tonight's service
            </h2>
            {data?.service.tonight && data.service.valetStatus === "ok" && (
              <Pill tone="success">
                <span aria-hidden="true" className="size-[7px] rounded-full bg-success" />
                Live from Connecteam
              </Pill>
            )}
          </div>
          {data ? <Tonight data={data} /> : <RowSkeletons />}
        </section>

        <section aria-labelledby="ov-orgs" className={cx(card, "flex-[1_1_460px]")}>
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <h2 id="ov-orgs" className="m-0 text-lg text-navy-ink">
              Organizations at a glance
            </h2>
            <Link to="/admin/organizations" className="text-[13px] font-bold">
              All organizations
            </Link>
          </div>
          {data ? <Orgs orgs={data.orgs} /> : <RowSkeletons />}
        </section>
      </div>
    </>
  );
}

function serviceLine(s: AdminOverview["service"]): string {
  if (s.holidayName) return `No service tonight for ${s.holidayName}.${s.nextServiceNight ? ` Next service night: ${weekdayName(s.nextServiceNight)}.` : ""}`;
  if (!s.tonight) return `No service tonight.${s.nextServiceNight ? ` Next service night: ${weekdayName(s.nextServiceNight)}.` : ""}`;
  if (s.valetStatus !== "ok") return `Tonight is a service night, starting at ${clockLabel(s.startTime)}.`;
  return `Tonight is a service night. ${s.clockedIn} of ${s.total} ${s.total === 1 ? "property has" : "properties have"} a valet clocked in.`;
}

const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** "+6 vs the previous 7 days", colored by whether the change is good. */
function change(k: OverviewKpi, range: OverviewRange, { lowerIsBetter = false, unit = "" } = {}): { text: string; tone: Tone } | null {
  if (k.value === null || k.previous === null) return null;
  const d = k.value - k.previous;
  if (Math.abs(d) < 0.05) return { text: `Same as ${PREVIOUS[range]}`, tone: "neutral" };
  const amount = Number.isInteger(d) ? Math.abs(d) : Math.abs(d).toFixed(1);
  return { text: `${d > 0 ? "+" : "−"}${amount}${unit} vs ${PREVIOUS[range]}`, tone: (lowerIsBetter ? d < 0 : d > 0) ? "good" : "bad" };
}

function Kpis({ data, range }: { data: AdminOverview; range: OverviewRange }) {
  const k = data.kpis;
  const reply = k.avgFirstReplyHours.value;
  const tiles = [
    {
      label: "Open resident reports",
      value: formatCount(k.openReports.value ?? 0),
      delta: k.openReports.note ? { text: k.openReports.note, tone: "bad" as const } : change(k.openReports, range, { lowerIsBetter: true }),
      icon: "message" as const,
      iconTone: "navy" as const,
      spark: k.openReports.spark,
      to: "/admin/reports?tab=open&dates=all",
    },
    {
      label: "Avg first reply",
      value: replyHours(reply),
      delta: change(k.avgFirstReplyHours, range, { lowerIsBetter: true, unit: "h" }) ?? (reply !== null ? { text: reply <= 24 ? "Within the 24h promise" : "Over the 24h promise", tone: reply <= 24 ? ("good" as const) : ("bad" as const) } : null),
      icon: "clock" as const,
      iconTone: "success" as const,
      spark: k.avgFirstReplyHours.spark,
      to: `/admin/reports?dates=${range}`,
    },
    {
      label: range === "today" ? "Violations today" : `Violations, ${range === "7d" ? "7" : "30"} days`,
      value: formatCount(k.violations.value ?? 0),
      delta: change(k.violations, range, { lowerIsBetter: true }),
      icon: "alert-triangle" as const,
      iconTone: "warning" as const,
      spark: k.violations.spark,
      to: `/admin/violations?stage=all&dates=${range}`,
    },
    {
      label: "Overwatch units",
      value: formatCount(k.overwatchUnits.value ?? 0),
      delta: { text: k.overwatchUnits.note ?? "Phase 2 preview", tone: "neutral" as const },
      icon: "eye" as const,
      iconTone: "neutral" as const,
      spark: k.overwatchUnits.spark.length > 1 ? k.overwatchUnits.spark : undefined,
      to: "/admin/overwatch",
    },
    {
      label: "New quote requests",
      value: formatCount(k.newQuotes.value ?? 0),
      delta: k.newQuotes.note ? { text: k.newQuotes.note, tone: "bad" as const } : { text: "None waiting over 24h", tone: "neutral" as const },
      icon: "mail" as const,
      iconTone: "gold" as const,
      spark: k.newQuotes.spark,
      to: "/admin/quotes",
    },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} delta={t.delta ?? undefined} spark={t.spark && t.spark.length > 1 ? t.spark : undefined} />
      ))}
    </div>
  );
}

const ATTENTION: Record<AttentionItem["kind"], { icon: IconName; tile: string; tag: PillTone }> = {
  report_due: { icon: "clock", tile: "bg-danger-bg text-danger", tag: "danger" },
  violations_to_review: { icon: "alert-triangle", tile: "bg-warning-bg text-warning", tag: "warning" },
  no_clock_in: { icon: "alert-circle", tile: "bg-danger-bg text-danger", tag: "navy" },
  quote_waiting: { icon: "mail", tile: "bg-gold-tint text-gold-text", tag: "gold" },
  invites_stale: { icon: "users", tile: "bg-tint-2 text-navy", tag: "navy" },
  property_needs_setup: { icon: "building", tile: "bg-warning-bg text-warning", tag: "warning" },
};

function Attention({ items }: { items: AttentionItem[] }) {
  if (!items.length)
    return (
      <p className="m-0 flex items-center gap-2.5 rounded-xl bg-success-bg px-3.5 py-3 text-[14px] font-semibold text-success">
        <Icon name="check" size={18} strokeWidth={2.4} />
        Nothing is waiting on you right now.
      </p>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.slice(0, 6).map((a) => {
        const look = ATTENTION[a.kind];
        return (
          <li key={`${a.kind}:${a.link}`}>
            <Link to={a.link} className="flex items-center gap-3 rounded-xl bg-subtle p-3 text-ink no-underline hover:bg-tint-2 hover:text-ink">
              <span className={cx("flex size-9 flex-none items-center justify-center rounded-[10px]", look.tile)}>
                <Icon name={look.icon} size={18} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{a.title}</span>
                <span className="block text-[12.5px] text-muted">{a.subtitle}</span>
              </span>
              <Pill tone={look.tag}>{a.tag}</Pill>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const TONIGHT: Record<Exclude<TonightStatus, "not_service_night">, [string, PillTone]> = {
  done: ["Done", "success"],
  in_progress: ["In progress", "navy"],
  no_clock_in: ["No clock-in", "danger"],
  not_linked: ["Not linked", "muted"],
};

function Tonight({ data }: { data: AdminOverview }) {
  const s = data.service;
  if (!s.tonight)
    return (
      <EmptyState
        icon="calendar"
        title={s.holidayName ? `No service for ${s.holidayName}` : "No service tonight"}
        body={s.nextServiceNight ? `Next service night: ${weekdayName(s.nextServiceNight)}, from ${clockLabel(s.startTime)}.` : "No service nights are set. Choose them in Settings."}
      />
    );
  if (s.valetStatus !== "ok") return <p className="m-0 rounded-xl bg-subtle px-3.5 py-3 text-[14px] text-muted">{VALET_STATUS_TEXT[s.valetStatus]}</p>;
  if (!data.tonight.length) return <p className="m-0 text-[14px] text-muted">No active properties yet.</p>;
  const order: TonightStatus[] = ["no_clock_in", "in_progress", "done", "not_linked", "not_service_night"];
  const rows = [...data.tonight].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name));
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map((t) => {
        const [label, tone] = t.status === "not_service_night" ? ["No service", "muted" as const] : TONIGHT[t.status];
        // Until the valet close-out reports buildings done, the bar shows clock-in state: full when
        // the valets have clocked out, half while they're working.
        const pct = t.progressPct ?? (t.status === "done" ? 100 : t.status === "in_progress" ? 50 : 0);
        return (
          <li key={t.propertyId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[14px] sm:grid-cols-[minmax(0,1fr)_120px_96px]">
            <span className="min-w-0">
              <Link to={propertyPath(t.orgId, t.propertyId)} className="block truncate font-bold text-ink no-underline hover:underline">
                {t.name}
              </Link>
              <span className="block truncate text-[12.5px] text-muted">
                {[t.orgName, t.stewardName ? `Steward ${t.stewardName}` : "No Steward assigned"].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span
              role="progressbar"
              aria-label={`${t.name} progress`}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={t.progressPct === null ? label : `${pct}%`}
              className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-tint-2 sm:order-none sm:col-span-1"
            >
              <span className={cx("block h-full rounded-full", pct === 100 ? "bg-success" : "bg-navy")} style={{ width: `${pct}%` }} />
            </span>
            <span className="justify-self-end">
              <Pill tone={tone}>{label}</Pill>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Orgs({ orgs }: { orgs: AdminOverview["orgs"] }) {
  if (!orgs.length) return <p className="m-0 text-[14px] text-muted">No organizations have properties yet.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table aria-labelledby="ov-orgs" className="w-full min-w-[440px] border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-muted">
            <th className="border-b border-line px-1.5 py-2 font-semibold">Organization</th>
            <th className="border-b border-line px-1.5 py-2 text-right font-semibold">Properties</th>
            <th className="border-b border-line px-1.5 py-2 text-right font-semibold">Open reports</th>
            <th className="border-b border-line px-1.5 py-2 text-right font-semibold">Violations 30d</th>
            <th className="border-b border-line px-1.5 py-2 text-right font-semibold">Avg reply</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td className="border-b border-row-line px-1.5 py-2.5">
                <Link to={`/admin/organizations/${o.id}`} className="flex items-center gap-2.5 font-bold text-ink no-underline hover:underline">
                  <OrgLogo org={o} size={30} />
                  <span className="min-w-0">{o.name}</span>
                </Link>
              </td>
              <td className="border-b border-row-line px-1.5 py-2.5 text-right tabular-nums">{o.properties}</td>
              <td className="border-b border-row-line px-1.5 py-2.5 text-right tabular-nums">{o.openReports}</td>
              <td className="border-b border-row-line px-1.5 py-2.5 text-right tabular-nums">{o.violations30d}</td>
              <td className="border-b border-row-line px-1.5 py-2.5 text-right tabular-nums">{replyHours(o.avgReplyHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowSkeletons() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2.5">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
