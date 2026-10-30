import { propertyLocation } from "../../lib/propertyAddress";
import { PropertyAddress } from "../PropertyAddress";
import { Link } from "react-router-dom";
import type { RepAttentionItem } from "../../lib/api";
import { age } from "../../lib/format";
import { StatusBadge } from "../display";
import { Icon } from "../icons";
import { buttonClass, cx } from "../styles";

export type AttentionFilter = "all" | "violations" | "issues";

/** Violations wait on the property after 2 days; resident issues should have a reply within 24 hours. */
const overdue = (item: RepAttentionItem) => item.ageHours > (item.kind === "violation" ? 48 : 24);

/**
 * "Needs your attention" rows (REP_PORTAL_SPEC 4.4): what CBES sent the property to handle, and
 * resident issues CBES is working on, oldest first.
 */
export function AttentionList({ items, filter, max = 10 }: { items: RepAttentionItem[]; filter: AttentionFilter; max?: number }) {
  const shown = items.filter((i) => filter === "all" || (filter === "violations" ? i.kind === "violation" : i.kind === "issue")).slice(0, max);
  if (!shown.length) {
    return (
      <p className="m-0 flex items-center gap-2.5 px-5 py-8 text-[14.5px] text-muted">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-[10px] bg-success-bg text-success">
          <Icon name="check" size={18} strokeWidth={2.4} />
        </span>
        You're all caught up.
      </p>
    );
  }
  return (
    <ul className="m-0 list-none p-0">
      {shown.map((item) => {
        const violation = item.kind === "violation";
        return (
          <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-row-line px-5 py-3.5 last:border-b-0">
            <span aria-hidden="true" className={cx("flex size-[38px] flex-none items-center justify-center rounded-[10px]", violation ? "bg-danger-bg text-danger" : "bg-info-bg text-info")}>
              <Icon name={violation ? "alert-triangle" : "message"} size={18} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-[1_1_240px]">
              <span className="flex flex-wrap items-center gap-2">
                <strong className="text-[14.5px]">{item.title}</strong>
                {violation ? <StatusBadge kind="portalViolation" status="sent" /> : <StatusBadge kind="portalIssue" status={item.statusLabel as "New"} />}
              </span>
              <span className="mt-1 block text-[13px]">{item.propertyName}<PropertyAddress property={propertyLocation(item)} /></span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{[item.ref, item.where].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={cx("text-[12.5px] font-bold whitespace-nowrap", overdue(item) ? "text-danger" : "text-muted")}>{age(item.ageHours)}</span>
            <Link to={item.link} aria-label={`${violation ? "Review" : "View"} ${item.ref}`} className={buttonClass("secondary", "h-9! min-h-0! px-3.5! text-[13px]!")}>
              {violation ? "Review" : "View"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
