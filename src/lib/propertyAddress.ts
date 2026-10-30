/** Nullable legacy data; optional fields also allow the admin/API releases to overlap. */
export type PropertyAddressFields = { address?: string | null; city?: string | null; zip?: string | null };
export type PropertyReference = PropertyAddressFields & { id: string; name: string };
export type PropertyLocationFields = { propertyAddress?: string | null; propertyCity?: string | null; propertyZip?: string | null };

const clean = (value: string | null | undefined) => value?.trim() ?? "";

export function formatPropertyAddress(property: PropertyAddressFields): string {
  const address = clean(property.address);
  const city = clean(property.city);
  const zip = clean(property.zip);
  const locality = [city, city || zip ? `GA${zip ? ` ${zip}` : ""}` : ""].filter(Boolean).join(", ");
  return [address, locality].filter(Boolean).join(", ");
}

export function propertyAddressWarning(property: PropertyAddressFields): string | null {
  if (!clean(property.address)) return "Street address missing";
  return !clean(property.city) || !clean(property.zip) ? "Address incomplete" : null;
}

export function propertyAddressText(property: PropertyAddressFields): string {
  return [formatPropertyAddress(property), propertyAddressWarning(property)].filter(Boolean).join(" · ");
}

export const propertyOptionLabel = (property: PropertyAddressFields & { name: string }) => `${property.name} — ${propertyAddressText(property)}`;

export const propertyLocation = (row: PropertyLocationFields): PropertyAddressFields => ({ address: row.propertyAddress, city: row.propertyCity, zip: row.propertyZip });

export function validatePropertyAddress(property: PropertyAddressFields): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!clean(property.address)) errors.address = "Enter the street address";
  else if (clean(property.address).length > 200) errors.address = "Keep the street address to 200 characters";
  if (!clean(property.city)) errors.city = "Enter the city";
  else if (clean(property.city).length > 80) errors.city = "Keep the city to 80 characters";
  if (!/^\d{5}(-\d{4})?$/.test(clean(property.zip))) errors.zip = "Use a 5-digit ZIP code or ZIP+4";
  return errors;
}
