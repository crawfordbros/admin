import type { ViolationDetail } from "../../lib/api";

export type ViolationArea = "admin" | "portal";

/** Violation photos come through the API after a permission check; never from the bucket directly. */
export const photoPath = (area: ViolationArea, violationId: string, photoId: string) =>
  area === "admin" ? `/admin/violations/${violationId}/photos/${photoId}` : `/portal/violations/${violationId}/photos/${photoId}`;

export const violationPath = (area: ViolationArea, id: string) => (area === "admin" ? `/admin/violations/${id}` : `/portal/violations/${id}`);

/** Mutations answer { violation }; the detail GET answers the violation itself. */
export const unwrap = (r: { violation: ViolationDetail } | ViolationDetail): ViolationDetail => ("violation" in r ? r.violation : r);
