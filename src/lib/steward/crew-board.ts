import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api";
import type { StringKey } from "./strings";

// The Steward's crew from cbes-api (GET /valet/crew and the building and valet assignments,
// STEWARD_APP_SPEC sections 4 and 6), and the profile's check-in history (GET /valet/me/check-ins).

/** in: checked in here. out: checked in and out. elsewhere: on a shift at another property. later: before the start. due: under ten minutes past it. late: ten or more. off: no service tonight. */
export type CrewState = "in" | "out" | "elsewhere" | "later" | "due" | "late" | "off";

export type CrewMember = {
  id: string;
  name: string;
  role: "lead" | "valet";
  isSteward: boolean;
  photoUrl: string | null;
  phone: string | null;
  /** Empty: they cover every building. */
  buildings: string[];
  doors: { done: number; total: number };
  state: CrewState;
  minutesLate: number | null;
  checkIn: {
    checkedInAt: string;
    checkedOutAt: string | null;
    insideGeofence: boolean;
    distanceM: number | null;
    reason: string | null;
    autoCheckedOut: boolean;
    lateSync: boolean;
  } | null;
  elsewhere: { propertyId: string; propertyName: string } | null;
};

export type CrewBuilding = { name: string; units: number; doorsDone: number; completedAt: string | null; assignees: string[] };

export type CrewProperty = {
  id: string;
  name: string;
  stewardId: string | null;
  startTime: string;
  startsAt: string;
  doors: { done: number; total: number };
  buildings: CrewBuilding[];
  crew: CrewMember[];
};

export type CrewBoard = { serviceDate: string; serviceTonight: boolean; nextServiceNight: string | null; properties: CrewProperty[] };

const BOARD = ["crew", "board"] as const;

export function useCrewBoard(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: BOARD, queryFn: () => api<CrewBoard>("/valet/crew"), refetchInterval: 60_000, enabled });
}

const crewPath = (propertyId: string, rest: string) => `/valet/crew/${encodeURIComponent(propertyId)}${rest}`;

/** Who covers which buildings at a property; everyone left out covers all of them. */
export function useSaveBuildings(propertyId: string) {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (assignments: { userId: string; buildings: string[] }[]) => api(crewPath(propertyId, "/buildings"), { method: "PUT", body: JSON.stringify({ assignments }) }),
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: BOARD });
      void queries.invalidateQueries({ queryKey: ["crew", "tonight"] });
    },
  });
}

/** Valets who could join a property's crew. */
export function useValetChoices(propertyId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["crew", "valet-choices", propertyId],
    queryFn: async () => (await api<{ items: { id: string; name: string }[] }>(crewPath(propertyId, "/valets"))).items,
  });
}

export function useCrewValet(propertyId: string) {
  const api = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) => api(crewPath(propertyId, `/valets/${encodeURIComponent(userId)}`), { method: add ? "PUT" : "DELETE" }),
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: BOARD });
      void queries.invalidateQueries({ queryKey: ["crew", "valet-choices", propertyId] });
    },
  });
}

/** What a person's status pill says, and its tone. */
export const STATE_PILL: Record<CrewState, { key: StringKey; tone: "ok" | "bad" | "warn" | "quiet" }> = {
  in: { key: "crew.state.in", tone: "ok" },
  out: { key: "crew.state.out", tone: "quiet" },
  elsewhere: { key: "crew.state.elsewhere", tone: "quiet" },
  later: { key: "crew.state.later", tone: "quiet" },
  due: { key: "crew.state.due", tone: "warn" },
  late: { key: "crew.state.late", tone: "bad" },
  off: { key: "crew.state.off", tone: "quiet" },
};

/** A property's worst state, for the dot on its tab: someone late, someone due, everyone fine, or not started. */
export function propertyTone(p: CrewProperty): "bad" | "warn" | "ok" | "quiet" {
  if (p.crew.some((m) => m.state === "late")) return "bad";
  if (p.crew.some((m) => m.state === "due")) return "warn";
  if (p.crew.some((m) => m.state === "in" || m.state === "out")) return "ok";
  return "quiet";
}

/** Late people first, then whoever's due, then the rest by name (the API's order). */
export function crewOrder(crew: CrewMember[]) {
  const rank: Record<CrewState, number> = { late: 0, due: 1, in: 2, later: 3, elsewhere: 4, out: 5, off: 6 };
  return [...crew].sort((a, b) => rank[a.state] - rank[b.state]);
}

export const percent = (d: { done: number; total: number }) => (d.total > 0 ? Math.round((d.done / d.total) * 100) : 0);

// ---- Check-in history (Profile)

export type CheckInHistoryItem = {
  id: string;
  propertyId: string;
  propertyName: string;
  serviceDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  hours: number | null;
  insideGeofence: boolean;
  autoCheckedOut: boolean;
  lateSync: boolean;
};

export function useCheckInHistory() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: ["crew", "check-ins"],
    queryFn: ({ pageParam }) => api<{ items: CheckInHistoryItem[]; next: string | null }>(`/valet/me/check-ins${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  });
}

/** The Sunday a service date's week starts on. */
export function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** Check-ins grouped by week (newest first), with each week's shifts and hours. */
export function byWeek(items: CheckInHistoryItem[]) {
  const weeks: { start: string; items: CheckInHistoryItem[]; hours: number }[] = [];
  for (const item of items) {
    const start = weekOf(item.serviceDate);
    let week = weeks.find((w) => w.start === start);
    if (!week) weeks.push((week = { start, items: [], hours: 0 }));
    week.items.push(item);
    week.hours = Math.round((week.hours + (item.hours ?? 0)) * 10) / 10;
  }
  return weeks;
}
