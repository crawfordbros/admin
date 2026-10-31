import { useCallback, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api";
import type { Locale } from "./strings";
import { SERVICE_TIME_ZONE } from "./time";
import { withOfflineCopy } from "./offline";

// Tonight, check-in and route progress from cbes-api (STEWARD_APP_SPEC sections 4 and 6).

export type CheckIn = {
  id: string;
  propertyId: string;
  serviceDate: string;
  checkedInAt: string;
  insideGeofence: boolean;
  distanceM: number | null;
  accuracyM: number | null;
  reason: string | null;
  checkedOutAt: string | null;
  autoCheckedOut: boolean;
  lateSync: boolean;
};

export type RouteBuilding = { name: string; units: number; completedAt: string | null; doorsDone: number };

export type Shift = {
  property: { id: string; name: string; address: string | null; city: string | null; lat: number | null; lng: number | null; geofenceRadiusM: number };
  role: "lead" | "valet";
  startsAt: string;
  startTime: string;
  steward: { id: string; name: string } | null;
  allBuildings: boolean;
  route: RouteBuilding[];
  doors: { done: number; total: number };
  checkIn: CheckIn | null;
};

export type Tonight = {
  serviceDate: string;
  serviceTonight: boolean;
  nextServiceNight: string | null;
  shifts: Shift[];
  onShift: (CheckIn & { propertyName: string }) | null;
  counts: { violationsTonight: number; openIssues: number };
};

const TONIGHT = ["crew", "tonight"] as const;

export function useTonight() {
  const api = useApi();
  const { userId } = useAuth();
  return useQuery({ queryKey: TONIGHT, queryFn: () => withOfflineCopy(userId, "tonight", () => api<Tonight>("/valet/tonight")), refetchInterval: 60_000 });
}

export type Fix = { lat: number | null; lng: number | null; accuracyM: number | null };

export function useCheckIn() {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: { propertyId: string; reason?: string; at?: string; clientId?: string } & Fix) =>
      api<{ checkIn: CheckIn }>("/valet/check-ins", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => queries.invalidateQueries({ queryKey: TONIGHT }),
  });
}

export function useCheckOut() {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fix }: { id: string; at?: string } & Fix) => api<{ checkIn: CheckIn }>(`/valet/check-ins/${id}/checkout`, { method: "POST", body: JSON.stringify(fix) }),
    onSettled: () => queries.invalidateQueries({ queryKey: TONIGHT }),
  });
}

export function useBuildingProgress() {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, building, done }: { propertyId: string; building: string; done: boolean }) =>
      api<Tonight>(`/valet/progress/${propertyId}/${encodeURIComponent(building)}`, { method: "PUT", body: JSON.stringify({ done }) }),
    onSuccess: (data) => queries.setQueryData(TONIGHT, data),
  });
}

export type CrewPropertyDetail = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  unitCount: number | null;
  buildingCount: number | null;
  compactorNote: string | null;
  geofenceRadiusM: number;
  hasAccessNotes: boolean;
  serviceNights: string;
  trashOut: string;
  startTime: string;
  steward: { id: string; name: string; phone: string | null } | null;
  buildings: { name: string; units: number; assignees: { id: string; name: string }[] }[];
  crewTonight: { id: string; name: string; role: "lead" | "valet"; photoUrl: string | null; checkedInAt: string | null }[];
};

export function useCrewProperty(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["crew", "property", id],
    queryFn: () => api<{ property: CrewPropertyDetail; assigned: { id: string; name: string }[] }>(`/valet/properties/${id}`),
    enabled: Boolean(id),
  });
}

export function useRevealAccessNotes() {
  const api = useApi();
  return useMutation({ mutationFn: (id: string) => api<{ accessNotes: string | null }>(`/valet/properties/${id}/access-notes/reveal`, { method: "POST" }) });
}

// ---- Location: read once, when someone checks in, checks out or logs a violation. Never watched.

export type Position =
  | { status: "idle" | "locating" }
  | { status: "ok"; lat: number; lng: number; accuracyM: number; at: number }
  | { status: "denied" | "unavailable" };

const NO_FIX: Fix = { lat: null, lng: null, accuracyM: null };

/** One reading of the phone's location; `locate` resolves with the fix, or empty when there's none. */
export function usePosition() {
  const [position, setPosition] = useState<Position>({ status: "idle" });
  const locate = useCallback(
    () =>
      new Promise<Fix>((resolve) => {
        if (!("geolocation" in navigator)) {
          setPosition({ status: "unavailable" });
          resolve(NO_FIX);
          return;
        }
        setPosition({ status: "locating" });
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) };
            setPosition({ status: "ok", ...fix, at: Date.now() });
            resolve(fix);
          },
          (err) => {
            setPosition({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" });
            resolve(NO_FIX);
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 20_000 },
        );
      }),
    [],
  );
  return { position, locate };
}

/** Meters between two points (haversine), the same sum the API uses. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Inside when within the radius plus the phone's accuracy (STEWARD_APP_SPEC 4); the API decides for real. */
export function insideArea(property: Shift["property"], fix: { lat: number; lng: number; accuracyM: number }) {
  if (property.lat == null || property.lng == null) return { distance: null, inside: true };
  const distance = distanceM({ lat: property.lat, lng: property.lng }, fix);
  return { distance, inside: distance <= property.geofenceRadiusM + fix.accuracyM };
}

// ---- Formatting

const tag = (locale: Locale) => (locale === "es" ? "es-US" : "en-US");

/** "7:58 PM", in Atlanta time. */
export const clockTime = (iso: string | number, locale: Locale) =>
  new Intl.DateTimeFormat(tag(locale), { hour: "numeric", minute: "2-digit", timeZone: SERVICE_TIME_ZONE }).format(new Date(iso));

/** "9:00 PM" for "21:00". */
export function wallTime(hhmm: string, locale: Locale) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(tag(locale), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m));
}

/** "Sunday, Nov 1" for a service date. */
export const dayLabel = (date: string, locale: Locale) =>
  new Intl.DateTimeFormat(tag(locale), { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** Minutes and hours between two moments. */
export function span(fromMs: number, toMs: number) {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

/** "1–2" for a run of numbered buildings, otherwise "1, 3". */
export function buildingList(names: string[]): string {
  const nums = names.map(Number);
  if (names.length > 1 && nums.every((n, i) => Number.isInteger(n) && (i === 0 || n === nums[i - 1] + 1))) return `${names[0]}–${names[names.length - 1]}`;
  return names.join(", ");
}

/** "120 m" or "1.4 km". */
export const metersLabel = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** The service night a moment belongs to (before 6 AM is still the night before), as YYYY-MM-DD. */
export function nightOf(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: SERVICE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) >= 6) return date;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "Tonight 9:14 PM" for tonight's service, otherwise "Mon 9:14 PM". */
export function whenLabel(iso: string, locale: Locale, tonight: string, nowMs = Date.now()) {
  const ms = Date.parse(iso);
  const day =
    nightOf(ms) === nightOf(nowMs)
      ? tonight
      : new Intl.DateTimeFormat(tag(locale), { weekday: "short", timeZone: "UTC" }).format(new Date(`${nightOf(ms)}T12:00:00Z`));
  return `${day} ${clockTime(iso, locale)}`;
}

/**
 * "Today 11:44 AM", "Yesterday 10:31 PM", "Tue 9:02 PM" or "Oct 3 9:02 PM", by calendar day in Atlanta.
 * For resident issues, which come in at any hour (shift times use whenLabel's service night instead).
 */
export function dayTime(iso: string, locale: Locale, words: { today: string; yesterday: string }, nowMs = Date.now()) {
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: SERVICE_TIME_ZONE }).format(new Date(ms));
  const ms = Date.parse(iso);
  const days = Math.round((Date.parse(`${day(nowMs)}T12:00:00Z`) - Date.parse(`${day(ms)}T12:00:00Z`)) / 86_400_000);
  const label =
    days === 0
      ? words.today
      : days === 1
        ? words.yesterday
        : new Intl.DateTimeFormat(tag(locale), days > 1 && days < 7 ? { weekday: "short", timeZone: SERVICE_TIME_ZONE } : { month: "short", day: "numeric", timeZone: SERVICE_TIME_ZONE }).format(new Date(ms));
  return `${label} ${clockTime(iso, locale)}`;
}
