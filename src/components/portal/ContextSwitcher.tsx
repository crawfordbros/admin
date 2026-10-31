import { propertyAddressText } from "../../lib/propertyAddress";
import type { ReactNode } from "react";
import { OrgLogo, PropertyPhoto } from "../brand";
import { Icon } from "../icons";
import { Menu } from "../Popover";
import { useRepContext } from "./RepContext";

// The sidebar's organization (Representatives) or property (managers) switcher, REP_PORTAL_SPEC 3.2.
// With one option it's a plain label.

const box = "mb-3.5 flex w-full items-center gap-2.5 rounded-xl border border-nav-line bg-nav-card p-2.5 text-left text-white";

// Menu triggers take their name from the visible name and line below it, plus "Switch …" for screen
// readers, so the spoken name contains what's on screen (WCAG 2.5.3).
function Face({ tile, name, sub, chevron, action }: { tile: ReactNode; name: string; sub: string; chevron?: boolean; action?: string }) {
  return (
    <>
      {tile}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14px] font-bold">{name}</span>
        <span className="block whitespace-normal break-words text-[12px] text-nav-pill">{sub}</span>
        {action && <span className="sr-only">. {action}</span>}
      </span>
      {chevron && <Icon name="chevron-down" size={16} strokeWidth={2} className="flex-none text-nav-pill" />}
    </>
  );
}

const count = (n: number) => `${n} ${n === 1 ? "property" : "properties"}`;

export function ContextSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { kind, org, property, organizations, properties, choose } = useRepContext();

  if (kind === "organization" && org) {
    const face = <Face tile={<OrgLogo org={org} size={38} />} name={org.name} sub={`${count(org.propertyCount)} · Representative`} chevron={organizations.length > 1} action="Switch organization" />;
    if (organizations.length < 2) return <div className={box}>{face}</div>;
    return (
      <Menu
        label="Switch organization"
        items={organizations.map((o) => ({ label: o.id === org.id ? `${o.name} (current)` : o.name, onSelect: () => (choose(o.id), onNavigate?.()) }))}
        trigger={(props) => (
          <button type="button" {...props} className={`${box} hover:border-navy-soft`}>
            {face}
          </button>
        )}
      />
    );
  }

  if (kind === "property" && property) {
    const tile = (
      <span className="size-[38px] flex-none overflow-hidden rounded-[10px]">
        {property.organizationId ? (
          <PropertyPhoto orgId={property.organizationId} property={property} size={38} />
        ) : (
          <span aria-hidden="true" className="flex size-full items-center justify-center bg-navy-soft">
            <Icon name="home" size={18} />
          </span>
        )}
      </span>
    );
    const face = <Face tile={tile} name={property.name} sub={propertyAddressText(property)} chevron={properties.length > 1} action="Switch property" />;
    if (properties.length < 2) return <div className={box}>{face}</div>;
    return (
      <Menu
        label="Switch property"
        items={properties.map((p) => ({ id: p.id, label: p.id === property.id ? `${p.name} (current)` : p.name, description: propertyAddressText(p), onSelect: () => (choose(p.id), onNavigate?.()) }))}
        trigger={(props) => (
          <button type="button" {...props} className={`${box} hover:border-navy-soft`}>
            {face}
          </button>
        )}
      />
    );
  }

  return null;
}
