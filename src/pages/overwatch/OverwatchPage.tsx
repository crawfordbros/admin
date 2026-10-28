import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type OverwatchPreview } from "../../lib/api";
import { nyToday } from "../../lib/format";
import { useAdminPage } from "../../components/admin/adminPage";
import { EmptyState, Pill, Skeleton } from "../../components/display";
import { Icon, type IconName } from "../../components/icons";
import { Alert } from "../../components/ui";
import { cx } from "../../components/styles";
import { propertyPath } from "../admin/paths";

const PLANS: { title: string; body: string; icon: IconName }[] = [
  { title: "Automatic flags", body: "Units over the threshold in Settings are flagged the moment a valet logs the violation.", icon: "alert-triangle" },
  { title: "Cases for managers", body: "Property managers open an Overwatch case, add notes and track the unit until it clears.", icon: "file" },
  { title: "Courtesy notices via the property", body: "Templates the property sends to its resident. CBES never contacts residents directly.", icon: "mail" },
  { title: "Clears on its own", body: "Once a unit goes 30 days without a violation it leaves Overwatch and the case closes.", icon: "check" },
];

/** /admin/overwatch: the Phase 2 preview, with today's flagged units read-only (ADMIN_PORTAL_SPEC 7.6). */
export function OverwatchPage() {
  const api = useApi();
  useAdminPage("Overwatch");
  const preview = useQuery({ queryKey: ["admin", "overwatch"], queryFn: () => api<OverwatchPreview>("/admin/overwatch/preview") });
  const t = preview.data?.threshold;

  return (
    <>
      <section className="flex flex-wrap items-center gap-8 rounded-[18px] bg-navy-ink p-7 text-white sm:p-9">
        <div className="min-w-0 flex-[1_1_420px]">
          <span className="inline-block rounded-full bg-gold-light px-2.5 py-1 text-[12px] font-bold tracking-[0.08em] text-navy-ink uppercase">Coming in Phase 2</span>
          <h1 className="mt-3.5 mb-2.5 text-[30px] font-bold text-white sm:text-[34px]">Overwatch</h1>
          <p className="m-0 max-w-[560px] text-[16px] leading-relaxed text-on-navy">
            Units that keep breaking the trash rules get flagged automatically, so property managers can step in before it becomes a lease problem. Today the flag shows on violations and in weekly
            reports. The full workspace arrives in Phase 2.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to="/admin/settings#overwatch"
              className="inline-flex h-[42px] items-center gap-2 rounded-[10px] bg-white px-4 text-[14px] font-bold text-navy-ink no-underline hover:bg-tint-2 hover:text-navy-ink"
            >
              {t ? `Threshold: ${t.count} in ${t.days} days` : "Threshold"}
              <span aria-hidden="true">·</span> Edit
            </Link>
            <button
              type="button"
              disabled
              className="h-[42px] cursor-not-allowed rounded-[10px] border-[1.5px] border-[#6E72C4] bg-transparent px-4 text-[14px] font-bold text-nav-pill"
            >
              Create Overwatch case
            </button>
          </div>
        </div>
        <svg aria-hidden="true" viewBox="0 0 200 160" className="hidden w-[240px] flex-[0_1_240px] sm:block">
          <circle cx="100" cy="80" r="70" fill="none" stroke="#3A3E99" strokeWidth="2" />
          <circle cx="100" cy="80" r="46" fill="none" stroke="#3A3E99" strokeWidth="2" />
          <path d="M30 80s28-40 70-40 70 40 70 40-28 40-70 40-70-40-70-40z" fill="none" stroke="#C8BBA5" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="100" cy="80" r="16" fill="#928064" />
          <circle cx="100" cy="80" r="6" fill="#1A1C5E" />
        </svg>
      </section>

      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
        {PLANS.map((p) => (
          <li key={p.title} className="rounded-[14px] border border-line bg-white p-5">
            <span className="flex size-10 items-center justify-center rounded-[11px] bg-tint-2 text-navy">
              <Icon name={p.icon} size={20} strokeWidth={2} />
            </span>
            <h2 className="mt-3 mb-1.5 text-[17px] text-navy-ink">{p.title}</h2>
            <p className="m-0 text-[14px] leading-relaxed text-muted">{p.body}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="ow-units" className="min-w-0 rounded-[14px] border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap justify-between gap-2.5">
          <div>
            <h2 id="ow-units" className="m-0 text-lg text-navy-ink">
              Units at the threshold today
            </h2>
            <p className="mt-0.5 mb-0 text-[13px] text-muted">Read-only preview from current violations</p>
          </div>
          <Pill tone="muted" className="self-start">
            Preview
          </Pill>
        </div>
        {preview.isError ? (
          <Alert>{errorMessage(preview.error)}</Alert>
        ) : !preview.data ? (
          <div role="status" aria-label="Loading" className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !preview.data.units.length ? (
          <EmptyState icon="eye" title="No units at the threshold" body={`No unit has ${t!.count} or more violations in the last ${t!.days} days.`} />
        ) : (
          <Units data={preview.data} />
        )}
      </section>
    </>
  );
}

function Units({ data }: { data: OverwatchPreview }) {
  const { threshold, units } = data;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <caption className="sr-only">Units at the Overwatch threshold</caption>
        <thead>
          <tr className="text-left text-[12px] text-muted">
            <th className="border-b border-line px-1.5 py-2 font-semibold">Unit</th>
            <th className="border-b border-line px-1.5 py-2 font-semibold">Property · Organization</th>
            <th className="border-b border-line px-1.5 py-2 font-semibold">Violations in {threshold.days} days</th>
            <th className="border-b border-line px-1.5 py-2 font-semibold">Most common</th>
            <th className="border-b border-line px-1.5 py-2 font-semibold">Last</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const slots = Math.min(10, Math.max(u.count, threshold.count + 1));
            return (
              <tr key={`${u.propertyId}:${u.unit}`}>
                <td className="border-b border-row-line px-1.5 py-2.5 font-bold">
                  <Link to={`/admin/violations?stage=all&property=${u.propertyId}&q=${encodeURIComponent(u.unit)}`} className="text-ink no-underline hover:underline">
                    {u.unit}
                  </Link>
                </td>
                <td className="border-b border-row-line px-1.5 py-2.5">
                  <Link to={propertyPath(u.orgId, u.propertyId)} className="text-ink no-underline hover:underline">
                    {u.propertyName}
                  </Link>
                  {u.orgName && <span className="text-muted"> · {u.orgName}</span>}
                </td>
                <td className="border-b border-row-line px-1.5 py-2.5">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex gap-[3px]">
                      {Array.from({ length: slots }, (_, i) => (
                        <span key={i} className={cx("size-2.5 rounded-[3px]", i < u.count ? "bg-danger" : "bg-line")} />
                      ))}
                    </span>
                    <strong className="tabular-nums">{u.count}</strong>
                  </span>
                </td>
                <td className="border-b border-row-line px-1.5 py-2.5">{u.mostCommon}</td>
                <td className="border-b border-row-line px-1.5 py-2.5 text-muted">{lastSeen(u.lastAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Tonight", "Mon" within the week, otherwise "Oct 22" — New York time. */
function lastSeen(iso: string, now = new Date()): string {
  const tz = "America/New_York";
  const day = new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
  const days = Math.round((Date.parse(`${nyToday(now)}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return "Today";
  if (days > 0 && days < 7) return new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  return new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}
