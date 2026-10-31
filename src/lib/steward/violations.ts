import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api";
import type { Locale, StringKey } from "./strings";

// Logging, my violations and Review in the Steward app (STEWARD_APP_SPEC sections 4 and 6).

export type ViolationType = { key: string; label: string; labelEs: string | null; countsForOverwatch: boolean };
export type CrewViolationStatus = "new" | "in_review" | "sent" | "resolved" | "dismissed";

export type CrewViolation = {
  id: string;
  refNo: number;
  status: CrewViolationStatus;
  typeKey: string;
  typeLabel: string;
  typeLabelEs: string | null;
  propertyId: string;
  propertyName: string;
  building: string | null;
  unit: string;
  note: string | null;
  loggedAt: string;
  gpsAccuracyM: number | null;
  hasGps: boolean;
  valetId: string;
  valetName: string;
  valetPhotoUrl: string | null;
  photos: string[];
  unitCount: number;
  latestNote?: { body: string; authorName: string; createdAt: string } | null;
};

export const STATUS_KEY: Record<CrewViolationStatus, StringKey> = {
  new: "status.new",
  in_review: "status.in_review",
  sent: "status.sent",
  resolved: "status.resolved",
  dismissed: "status.dismissed",
};

/** A violation type in the app's language (violation_types.label_es, STEWARD_APP_SPEC 8). */
export const typeName = (t: { label?: string; typeLabel?: string; labelEs?: string | null; typeLabelEs?: string | null }, locale: Locale) =>
  (locale === "es" ? (t.labelEs ?? t.typeLabelEs) : null) || t.label || t.typeLabel || "";

export function useViolationTypes() {
  const api = useApi();
  return useQuery({
    queryKey: ["crew", "violation-types"],
    queryFn: async () => (await api<{ items: ViolationType[] }>("/valet/violation-types")).items,
    staleTime: 10 * 60_000,
  });
}

export type Range = "tonight" | "week" | "all";

export function useMyViolations(range: Range) {
  const api = useApi();
  return useQuery({ queryKey: ["crew", "violations", range], queryFn: async () => (await api<{ items: CrewViolation[] }>(`/valet/violations?range=${range}`)).items });
}

export function useUnitHistory(propertyId: string | null, unit: string) {
  const api = useApi();
  const trimmed = unit.trim();
  return useQuery({
    queryKey: ["crew", "unit", propertyId, trimmed.toUpperCase()],
    queryFn: () =>
      api<{ unit: string; count: number; threshold: { count: number; days: number } }>(`/valet/units/history?${new URLSearchParams({ propertyId: propertyId!, unit: trimmed })}`),
    enabled: Boolean(propertyId && trimmed),
    staleTime: 60_000,
    retry: false,
  });
}

const REVIEW = ["crew", "review"] as const;

export function useReview(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: REVIEW,
    queryFn: () => api<{ items: CrewViolation[]; threshold: { count: number; days: number } }>("/valet/review"),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useReviewAction() {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "send" | "hold" }) => api<{ id: string; status: string }>(`/valet/review/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
    onSettled: () => queries.invalidateQueries({ queryKey: REVIEW }),
  });
}

export function useReviewNote() {
  const api = useApi();
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => api(`/valet/review/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) }) });
}

export function useSendAll() {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api<{ sent: number; properties: number }>("/valet/review/send-all", { method: "POST", body: JSON.stringify({ ids }) }),
    onSettled: () => queries.invalidateQueries({ queryKey: REVIEW }),
  });
}

const MAX_UPLOAD = 1_900_000;

/**
 * A violation photo as the API takes it (STEWARD_APP_SPEC 4): at most 1600 px on the long side, JPEG
 * under 2 MB. Re-encoding also drops the photo's location and camera data.
 */
export async function compressPhoto(file: Blob, longest = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_UPLOAD) return blob;
  }
  throw new Error("The photo is too large.");
}

/** The last few units logged at a property on this phone, for the "Recent" chips. */
export function recentUnits(propertyId: string | null): string[] {
  if (!propertyId) return [];
  try {
    return JSON.parse(localStorage.getItem(`steward.recentUnits.${propertyId}`) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function rememberUnit(propertyId: string, unit: string) {
  const next = [unit, ...recentUnits(propertyId).filter((u) => u.toUpperCase() !== unit.toUpperCase())].slice(0, 3);
  try {
    localStorage.setItem(`steward.recentUnits.${propertyId}`, JSON.stringify(next));
  } catch {
    // Not saved; the chips are a shortcut only.
  }
}

/** "3rd" / "3.ª" for the review card's repeat count. */
export function ordinal(n: number, locale: Locale) {
  if (locale === "es") return `${n}.ª`;
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}
