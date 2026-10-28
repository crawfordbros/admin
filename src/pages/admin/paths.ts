/** A property's admin page sits inside its organization; unassigned ones until they're moved. */
export const propertyPath = (organizationId: string | null, propertyId: string) =>
  `/admin/organizations/${organizationId ?? "unassigned"}/properties/${propertyId}`;
