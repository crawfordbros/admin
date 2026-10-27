export type PropertyFormValues = Record<string, string>;

/** Blank optional fields are left out so the API keeps them empty. */
export function propertyPayload(values: PropertyFormValues) {
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== "" || k === "name"));
}
