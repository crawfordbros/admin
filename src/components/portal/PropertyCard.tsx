import { Link } from "react-router-dom";
import type { PortalPropertyCard } from "../../lib/api";
import { PROPERTY_ROLE_LABELS, formatCount } from "../../lib/format";
import { PropertyPhoto } from "../brand";
import { Avatar, Pill } from "../display";
import { Icon } from "../icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

function StatusPill({ property }: { property: PortalPropertyCard }) {
  if (property.status === "starting" && property.serviceStartDate) return <Pill tone="warning">Starting {monthDay(property.serviceStartDate)}</Pill>;
  if (property.status === "inactive") return <Pill tone="neutral">Inactive</Pill>;
  return <Pill tone="success">Active</Pill>;
}

/**
 * A property on the Representative dashboard (REP_PORTAL_SPEC 4.4): photo, status, size, what's
 * waiting, and who manages it. `onAssign` opens the Assign manager dialog.
 */
export function PropertyCard({ orgId, property, canAssign, onAssign }: { orgId: string; property: PortalPropertyCard; canAssign: boolean; onAssign: () => void }) {
  const href = `/portal/properties/${property.id}`;
  const [manager, ...more] = property.managers;
  return (
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-white">
      <Link to={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-[16/8] bg-tint-2">
        <PropertyPhoto orgId={orgId} property={property} />
        <span className="absolute top-2.5 left-2.5">
          <StatusPill property={property} />
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <div>
          <h3 className="m-0 text-[16.5px]">
            <Link to={href} className="text-ink no-underline hover:text-navy hover:underline">
              {property.name}
            </Link>
          </h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted">
            {[property.city, property.units ? `${formatCount(property.units)} units` : null].filter(Boolean).join(" · ") || "Details to come"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={property.violationsToReview ? "danger" : "neutral"}>{property.violationsToReview} to review</Pill>
          <Pill tone={property.openIssues ? "info" : "neutral"}>
            {property.openIssues} open issue{property.openIssues === 1 ? "" : "s"}
          </Pill>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-row-line pt-2.5 text-[12.5px]">
          {manager ? (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={manager.name} seed={manager.id} size={28} />
                <span className="min-w-0">
                  <span className="block truncate font-bold">
                    {manager.name}
                    {more.length > 0 && <span className="font-semibold text-muted"> +{more.length}</span>}
                  </span>
                  <span className="block text-[11.5px] text-muted">{PROPERTY_ROLE_LABELS[manager.role]}</span>
                </span>
              </span>
              {canAssign && (
                <button type="button" onClick={onAssign} aria-label={`Change managers for ${property.name}`} className="flex-none rounded-lg px-2 py-1.5 font-bold text-navy hover:bg-canvas">
                  Change
                </button>
              )}
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 font-bold text-warning">
                <Icon name="alert-triangle" size={16} strokeWidth={2} />
                No manager yet
              </span>
              {canAssign && (
                <button type="button" onClick={onAssign} aria-label={`Assign a manager to ${property.name}`} className="h-8 flex-none rounded-lg bg-navy px-3 font-bold text-white hover:bg-navy-dark">
                  Assign manager
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
