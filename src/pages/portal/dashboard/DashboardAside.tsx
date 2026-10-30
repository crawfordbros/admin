import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { errorMessage, useApi, type RepDashboard } from "../../../lib/api";
import { PROPERTY_ROLE_LABELS } from "../../../lib/format";
import { Avatar } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { cx } from "../../../components/styles";
import { useToast } from "../../../components/Toast";

const card = "rounded-[14px] border border-line bg-white p-[18px]";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Monday, Nov 2 at 7 AM ET" */
function nextRun(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).replace(":00", "");
  return `${day} at ${time} ET`;
}

function lastWeekSentence(w: RepDashboard["lastWeek"]) {
  if (!w.activeProperties) return "Your first weekly report goes out the Monday after service starts.";
  const parts = [
    ...(w.scheduled ? [`${w.serviced} of ${w.scheduled} service nights`] : []),
    `${plural(w.violationsSent, "violation")} sent`,
    plural(w.issues, "resident issue"),
  ];
  const replied = w.issues > 0 && w.allRepliedWithin24h ? ", all replied to within 24 hours" : "";
  return `Last week across ${plural(w.activeProperties, "active property", "active properties")}: ${parts.join(", ")}${replied}.`;
}

export function WeeklyReportCard({ dashboard }: { dashboard: RepDashboard }) {
  return (
    <section aria-labelledby="weekly-report-title" className="flex flex-col gap-3 rounded-2xl bg-navy-ink p-5 text-white">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-navy text-gold-light">
          <Icon name="calendar" size={20} strokeWidth={2} />
        </span>
        <div>
          <h2 id="weekly-report-title" className="m-0 text-[17px] text-white">
            Weekly report
          </h2>
          <p className="m-0 text-[12.5px] text-nav-pill">Next: {nextRun(dashboard.nextWeeklyReportAt)}</p>
        </div>
      </div>
      <p className="m-0 text-[13.5px] text-on-navy">{lastWeekSentence(dashboard.lastWeek)}</p>
      <div className="flex flex-wrap gap-2">
        <Link to={`/portal/reports?scope=organization&org=${dashboard.organization.id}`} className="inline-flex h-10 items-center rounded-[10px] bg-white px-3.5 text-[13.5px] font-bold text-navy-ink no-underline hover:bg-tint-2 hover:text-navy-ink">
          Open reports
        </Link>
      </div>
    </section>
  );
}

export function ViolationsThisWeek({ dashboard }: { dashboard: RepDashboard }) {
  const nights = dashboard.violationsByNight;
  const max = Math.max(1, ...nights.map((n) => n.count ?? 0));
  const happened = nights.filter((n) => n.count !== null);
  const current = happened[happened.length - 1]?.date;
  const summary = `Violations sent this week by night: ${happened.map((n) => `${n.day} ${n.count}`).join(", ")}${happened.length < 7 ? `. ${nights[happened.length]?.day ?? ""} to Sat not yet` : ""}.`;
  const [first, second] = dashboard.topViolationTypes;
  return (
    <section aria-labelledby="violations-week-title" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="violations-week-title" className="m-0 text-[17px]">
          Violations this week
        </h2>
        <span className="text-[12.5px] text-muted">Sent to property</span>
      </div>
      <div role="img" aria-label={summary} className="mt-3.5 flex h-[120px] items-end gap-2.5 border-b border-line">
        {nights.map((n) => (
          <span key={n.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11.5px] font-bold text-muted">{n.count ?? "–"}</span>
            <span
              className={cx("w-full max-w-7 rounded-t-md", n.count === null ? "bg-line" : n.date === current ? "bg-navy" : "bg-navy-light")}
              style={{ height: n.count === null ? 2 : Math.max(2, Math.round((n.count / max) * 86)) }}
            />
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-2.5">
        {nights.map((n) => (
          <span key={n.date} className="flex-1 text-center text-[11.5px] text-muted">
            {n.day}
          </span>
        ))}
      </div>
      {first && (
        <p className="m-0 mt-3 text-[12.5px] text-muted">
          Most common: <strong className="text-ink">{first.label}</strong> ({first.count})
          {second && (
            <>
              {" "}
              and <strong className="text-ink">{second.label}</strong> ({second.count})
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? "sent today" : `sent ${plural(days, "day")} ago`;
}

export function InvitationsWaiting({ dashboard, onResent }: { dashboard: RepDashboard; onResent: () => void }) {
  const api = useApi();
  const toast = useToast();
  const resend = useMutation({
    mutationFn: (inv: { id: string; email: string }) => api(`/organizations/${dashboard.organization.id}/invitations/${inv.id}/resend`, { method: "POST" }),
    onSuccess: (_res, inv) => {
      toast.success(`Invitation sent again to ${inv.email}.`);
      onResent();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (!dashboard.pendingInvitations.length) return null;
  return (
    <section aria-labelledby="invitations-title" className={card}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 id="invitations-title" className="m-0 text-[17px]">
          Invitations waiting
        </h2>
        <Link to={`/portal/organizations/${dashboard.organization.id}/settings?tab=invitations`} className="text-[13px] font-bold no-underline">
          Manage team
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px]">
        {dashboard.pendingInvitations.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <strong className="block truncate">{inv.email}</strong>
              <span className="text-[12px] text-muted">
                {[PROPERTY_ROLE_LABELS[inv.role], inv.propertyNames.join(", ") || null].filter(Boolean).join(" · ")} ·{" "}
                {inv.expired ? <span className="font-bold text-danger">Expired</span> : daysAgo(inv.createdAt)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => resend.mutate(inv)}
              disabled={resend.isPending}
              aria-label={`Resend the invitation to ${inv.email}`}
              className="h-8 flex-none rounded-lg border border-field bg-white px-2.5 text-[12.5px] font-bold text-navy hover:bg-canvas disabled:opacity-60"
            >
              Resend
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CbesContacts({ dashboard }: { dashboard: RepDashboard }) {
  return (
    <section aria-labelledby="contacts-title" className={card}>
      <h2 id="contacts-title" className="m-0 mb-3 text-[17px]">
        Your CBES contacts
      </h2>
      {dashboard.contacts.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {dashboard.contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <Avatar name={c.name} seed={c.id} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{c.name}</span>
                <span className="block text-[12px] text-muted">{c.title}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">Your Steward shows here once CBES assigns one to your properties.</p>
      )}
      <a href="mailto:office@cbenvironments.com" className="mt-3.5 inline-block text-[13.5px] font-bold no-underline">
        Email office@cbenvironments.com
      </a>
    </section>
  );
}
