import { propertyAddressText, type PropertyAddressFields, type PropertyReference } from "../lib/propertyAddress";
import { cx } from "./styles";

/** Keep the location on its own line, including when the surrounding label is inline. */
export function PropertyAddress({ property, className }: { property: PropertyAddressFields; className?: string }) {
  return <span className={cx("mt-0.5 block whitespace-normal break-words text-[12.5px] font-normal leading-snug text-muted", className)}>{propertyAddressText(property)}</span>;
}

export function PropertyNames({ properties, addressClassName }: { properties: PropertyReference[]; addressClassName?: string }) {
  return <span className="flex min-w-0 flex-col gap-2">{properties.map((p) => <span key={p.id}><span className="block break-words">{p.name}</span><PropertyAddress property={p} className={addressClassName} /></span>)}</span>;
}
