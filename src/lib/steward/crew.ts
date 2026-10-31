import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api";
import { squareWebp, useAuthedImage } from "../images";
import type { StringKey } from "./strings";
import { withOfflineCopy } from "./offline";

// The crew app's profile from cbes-api (GET/PATCH /valet/me, STEWARD_APP_SPEC section 6).

export type CrewRole = "valet" | "lead" | "admin" | "super_admin";
export type TrainingItem = "crew_guide" | "violation_types" | "practice_log";

export type CrewProfile = {
  id: string;
  email: string;
  role: CrewRole;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  photoUrl: string | null;
  phone: string | null;
  smsOptIn: boolean;
  locale: "en" | "es";
  onboardedAt: string | null;
  needsOnboarding: boolean;
  startedAt: string;
  steward: { id: string; name: string } | null;
  properties: { id: string; name: string; role: "lead" | "valet"; buildings: string[] }[];
  training: Partial<Record<TrainingItem, string>>;
  /** This week so far (from Sunday): shifts and hours from check-ins, violations logged, issues fixed. Missing from an offline copy saved before it existed. */
  week?: { weekStart: string; shifts: number; hours: number; violations: number; issuesFixed: number };
};

export type CrewProfilePatch = Partial<{
  firstName: string;
  lastName: string;
  phone: string | null;
  smsOptIn: boolean;
  locale: "en" | "es";
  onboarded: true;
}>;

const KEY = ["crew", "me"] as const;

export function useCrewProfile() {
  const api = useApi();
  const { userId } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => withOfflineCopy(userId, "me", async () => (await api<{ profile: CrewProfile }>("/valet/me")).profile),
    staleTime: 30_000,
  });
}

/** Each change returns the whole profile, which replaces the cached one. */
function useProfileWrite<T>(send: (input: T) => Promise<{ profile: CrewProfile }>) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: ({ profile }) => queries.setQueryData(KEY, profile),
  });
}

export function useUpdateProfile() {
  const api = useApi();
  return useProfileWrite((patch: CrewProfilePatch) => api<{ profile: CrewProfile }>("/valet/me", { method: "PATCH", body: JSON.stringify(patch) }));
}

/** Crops the picture square, re-encodes it (which also drops the photo's location data) and uploads it. */
export function useUploadPhoto() {
  const api = useApi();
  return useProfileWrite(async (file: Blob) => {
    const image = await squareWebp(file);
    return api<{ profile: CrewProfile }>("/valet/me/avatar", { method: "POST", body: image, headers: { "Content-Type": image.type } });
  });
}

export function useCompleteTraining() {
  const api = useApi();
  return useProfileWrite((item: TrainingItem) => api<{ profile: CrewProfile }>(`/valet/training/${item}`, { method: "POST" }));
}

/** An object URL for a crew photo; the URL from the API carries its version. */
export function useCrewPhoto(photoUrl: string | null) {
  const [path, query] = photoUrl ? photoUrl.split("?") : [null, null];
  return useAuthedImage(path, query ? new URLSearchParams(query).get("v") : null);
}

export const isCrewMember = (role: CrewRole) => role === "valet" || role === "lead";

/** The role's name in the app's language. */
export const ROLE_KEY: Record<CrewRole, StringKey> = { valet: "role.valet", lead: "role.lead", admin: "role.admin", super_admin: "role.super_admin" };
