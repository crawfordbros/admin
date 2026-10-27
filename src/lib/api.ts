import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

// Calls cbes-api on the same origin (/api, proxied to :8787 in development) with the Clerk
// session token. The API decides what each person can see; these types mirror its responses.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      let res: Response;
      try {
        res = await fetch(`/api${path}`, { ...init, headers });
      } catch {
        throw new ApiError(0, "We couldn't reach the server. Check your connection and try again.");
      }
      if (res.status === 204) return undefined as T;
      const body = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string> };
      if (!res.ok) throw new ApiError(res.status, body.error ?? "Something went wrong. Please try again.", body.fieldErrors);
      return body as T;
    },
    [getToken],
  );
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

export type PropertyRole = "manager" | "director";

export type Me = {
  user: { id: string; email: string; name: string | null; role: string };
  properties: { id: string; name: string; slug: string; city: string | null; memberRole?: PropertyRole }[];
};

export type ContractType = "12_month" | "36_month" | "month_to_month";

export type Property = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  county: string | null;
  unitCount: number | null;
  managementCompany: string | null;
  serviceStartDate: string | null;
  contractType: ContractType | null;
  status: "active" | "inactive";
  connecteamJobId?: string | null;
};

export type ReportStatus = "new" | "assigned" | "in_progress" | "resolved" | "closed";

export type PropertyOverview = {
  property: Property;
  buildings: number;
  units: number;
  openReports: number;
  recentReports: { refNo: number; createdAt: string; issueLabel: string; unit: string | null; status: ReportStatus; statusLabel: string }[];
};

export type AdminPropertyRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  status: "active" | "inactive";
  unitCount: number | null;
  connecteamJobId: string | null;
  members: number;
  pendingInvitations: number;
  openReports: number;
};

export type AdminPropertyDetail = {
  property: Property;
  members: { id: string; email: string; name: string | null; role: PropertyRole }[];
  invitations: { id: string; email: string; name: string | null; role: PropertyRole; createdAt: string }[];
};

export type ValetTimes =
  | {
      status: "ok";
      shifts: number;
      avgClockIn: string | null;
      avgClockOut: string | null;
      autoClockOuts: number;
      nights: { date: string; valets: number; firstClockIn: string; lastClockOut: string | null }[];
    }
  | { status: "not_configured" | "no_job" | "error" };

export type WeeklyReport = {
  property: { id: string; name: string; address: string | null; city: string | null };
  week: { start: string; end: string; label: string };
  generatedAt: string;
  residentReports: {
    total: number;
    open: number;
    resolved: number;
    avgFirstResponseHours: number | null;
    byType: { type: string; label: string; count: number }[];
    items: {
      refNo: number;
      date: string;
      issueLabel: string;
      unit: string | null;
      status: ReportStatus;
      statusLabel: string;
      reporterName: string;
      description: string | null;
    }[];
  };
  stillOpen: number;
  valetTimes: ValetTimes;
};
