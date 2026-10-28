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

/** Fetches an image (or other file) the API only serves to signed-in users. */
export function useApiBlob() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string): Promise<Blob | null> => {
      const token = await getToken();
      const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 404) return null;
      if (!res.ok) throw new ApiError(res.status, "The image couldn't be loaded.");
      return res.blob();
    },
    [getToken],
  );
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

export type PropertyRole = "manager" | "director";
export type InviteRole = "representative" | PropertyRole;

export type Me = {
  user: { id: string; email: string; name: string | null; role: string };
  /** The organizations a representative manages (empty for everyone else). */
  organizations: { id: string; name: string }[];
  properties: { id: string; name: string; slug: string; city: string | null; memberRole?: PropertyRole | null }[];
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
  organizationId: string | null;
  organizationName: string | null;
  serviceStartDate: string | null;
  contractType: ContractType | null;
  status: "active" | "inactive";
  connecteamJobId?: string | null;
};

export type ReportStatus = "new" | "assigned" | "in_progress" | "resolved" | "closed";

export type PropertyOverview = {
  property: Property;
  /** True for the property's representatives and admins: they can edit the basics. */
  canManage: boolean;
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
  organizationId: string | null;
  organizationName: string | null;
  members: number;
  pendingInvitations: number;
  openReports: number;
};

export type AdminPropertyDetail = {
  property: Property;
  members: { id: string; email: string; name: string | null; role: PropertyRole }[];
  invitations: { id: string; email: string; name: string | null; role: PropertyRole; createdAt: string }[];
};

export type OrganizationStatus = "onboarding" | "active" | "inactive";
export type PropertyType = "garden" | "mid_rise" | "high_rise";
export type PersonRef = { id: string; name: string };

export type OrganizationRow = {
  id: string;
  name: string;
  status: OrganizationStatus;
  serviceArea: string | null;
  /** The logo's storage key, for cache busting; null when there's no logo. */
  logoVersion: string | null;
  properties: number;
  propertyLimit: number;
  units: number;
  representatives: PersonRef[];
  pendingInvitations: number;
  openReports: number;
  /** Null until violations are logged (milestone M2). */
  violations30d: number | null;
  avgReplyHours: number | null;
  createdAt: string;
};

export type OrganizationsSummary = { organizations: number; properties: number; units: number; representatives: number; pendingInvitations: number };

export type OrganizationProfile = {
  id: string;
  name: string;
  status: OrganizationStatus;
  serviceArea: string | null;
  customerSince: string | null;
  propertyLimit: number;
  logoVersion: string | null;
  createdAt: string;
};

export type OrganizationProperty = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  status: "active" | "inactive";
  /** Service starts after today. */
  starting: boolean;
  serviceStartDate: string | null;
  unitCount: number | null;
  contractType: ContractType | null;
  photoVersion: string | null;
  openReports: number;
  manager: PersonRef | null;
  steward: PersonRef | null;
};

export type OrganizationDetail = {
  organization: OrganizationProfile;
  kpis: { properties: number; units: number; openReports: number; oldestOpenHours: number | null; avgReplyHours: number | null };
  properties: OrganizationProperty[];
  representatives: { id: string; email: string; name: string | null; addedAt: string }[];
  staff: { id: string; email: string; name: string | null; role: PropertyRole; propertyId: string; propertyName: string }[];
  invitations: {
    id: string;
    email: string;
    name: string | null;
    role: InviteRole;
    propertyId: string | null;
    propertyName: string | null;
    createdAt: string;
  }[];
};

export type PropertyProfile = Property & {
  zip: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  buildingCount: number | null;
  propertyType: PropertyType | null;
  photoVersion: string | null;
  stewardUserId: string | null;
  starting: boolean;
  /** Always null for representatives. */
  connecteamJobId: string | null;
};

/** GET /organizations/:orgId/properties/:propertyId, for admins and the organization's representatives. */
export type PropertyDetail = {
  property: PropertyProfile;
  canManage: boolean;
  steward: { id: string; name: string; email: string; propertyCount: number } | null;
  valets: { id: string; name: string; email: string }[];
  members: AdminPropertyDetail["members"];
  invitations: AdminPropertyDetail["invitations"];
  stats: { openReports: number; oldestOpenHours: number | null; avgReplyHours: number | null };
  recentReports: PropertyOverview["recentReports"];
};

export type NewPropertyInvite = { email: string; name?: string; role: PropertyRole };
export type InviteResult = { email: string; status: "invited" | "added" | "failed"; error?: string };
export type StaffOption = { id: string; name: string; email: string; propertyCount?: number };

export type ValetTimes =
  | {
      status: "ok";
      shifts: number;
      avgClockIn: string | null;
      avgClockOut: string | null;
      autoClockOuts: number;
      /** lastClockOut leaves out automatic clock-outs; null when nobody clocked out themselves. */
      nights: { date: string; valets: number; firstClockIn: string; lastClockOut: string | null; stillClockedIn: boolean }[];
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

// Admin Portal shell (ADMIN_PORTAL_SPEC section 6.1).

export type NavCounts = { openReports: number; newViolations: number; newQuotes: number };

export type SearchResult = {
  kind: "org" | "property" | "unit" | "report" | "violation" | "user" | "quote";
  id: string;
  title: string;
  subtitle: string;
  /** An app path, such as /admin/violations/abc. */
  link: string;
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string;
  readAt: string | null;
  createdAt: string;
};

// Violations (ADMIN_PORTAL_SPEC sections 6.4 and 7.4–7.5).

export type ViolationStatus = "new" | "in_review" | "sent" | "resolved" | "dismissed";
export type Person = { id: string; name: string; role: string; email?: string };
export type ViolationType = { key: string; label: string; countsForOverwatch: boolean; active: boolean };

export type ViolationRow = {
  id: string;
  refNo: number;
  typeKey: string;
  typeLabel: string;
  loggedAt: string;
  orgId: string | null;
  orgName: string | null;
  propertyId: string;
  propertyName: string;
  building: string | null;
  unit: string;
  valet: Person;
  steward: Person | null;
  photoCount: number;
  thumbPhotoId: string | null;
  /** Violations at this unit inside the Overwatch window, this one included. */
  unitCount30d: number;
  overwatchThreshold: number;
  overwatchDays: number;
  notesCount: number;
  status: ViolationStatus;
};

export type ViolationEvent = {
  id: string;
  kind: "logged" | "status" | "note" | "reassigned" | "sent" | "system";
  actor: Person | null;
  body: string | null;
  visibility: "cbes" | "property";
  fromStatus: ViolationStatus | null;
  toStatus: ViolationStatus | null;
  mentions: Person[];
  createdAt: string;
};

export type ViolationDetail = ViolationRow & {
  note: string | null;
  syncedAt: string;
  gps: { lat: number; lng: number; accuracyM: number | null } | null;
  photos: { id: string; takenAt: string | null; width: number | null; height: number | null }[];
  people: { valet: Person; steward: Person | null; propertyManagers: Person[]; representatives: Person[]; admins: Person[] };
  /** Newest first. */
  events: ViolationEvent[];
  unitHistory: { id: string; refNo: number; typeLabel: string; loggedAt: string; status: ViolationStatus }[];
};

export type ViolationList = { items: ViolationRow[]; total: number; page: number; pageSize: number };
export type AdminViolationList = ViolationList & { stageCounts: Record<ViolationStatus, number> };

// Resident reports in the Admin Portal (ADMIN_PORTAL_SPEC sections 6.3 and 7.2).

export type ReportTab = "open" | "new" | "in_progress" | "resolved" | "closed" | "all";
export type ReplyClock = { state: "replied"; hours: number } | { state: "open"; hoursLeft: number; targetHours: number } | { state: "none" };

export type ReportRow = {
  id: string;
  refNo: number;
  issueKey: string;
  issueLabel: string;
  createdAt: string;
  orgId: string | null;
  orgName: string | null;
  propertyId: string | null;
  propertyName: string;
  building: string | null;
  unit: string | null;
  source: "web" | "qr" | "phone" | "import";
  replyClock: ReplyClock;
  assignee: { id: string; name: string } | null;
  status: ReportStatus;
};

export type AdminReportList = { items: ReportRow[]; total: number; page: number; pageSize: number; tabCounts: Record<Exclude<ReportTab, "all">, number> };

type Kpi = { value: number | null; previous: number | null };
export type ReportsSummary = {
  kpis: {
    total: Kpi;
    open: { value: number; nearingDue: number };
    avgFirstReplyHours: Kpi;
    avgResolveDays: Kpi;
    topIssue: { key: string; label: string; count: number; share: number } | null;
  };
  byWeek: { weekStart: string; resolved: number; inProgress: number; new: number }[];
  replyBuckets: { under4h: number; h4to12: number; h12to24: number; over24h: number; onTimePct: number | null };
  byType: { key: string; label: string; count: number }[];
  byProperty: { propertyId: string; name: string; orgName: string | null; count: number; per100Units: number | null; avgReplyHours: number | null; spark: number[] }[];
};

export type ReportEvent = {
  id: string;
  kind: "created" | "status" | "assigned" | "reply" | "call" | "comment";
  actor: { id: string; name: string } | null;
  body: string | null;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
};

export type ReportDetail = ReportRow & {
  reporterName: string;
  reporterContact: string;
  contactMethod: "email" | "phone";
  issueDate: string | null;
  description: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  photos: { id: string }[];
  /** Oldest first. */
  events: ReportEvent[];
};

export type SavedView = { id: string; name: string; query: string; createdAt: string };

// Users and admins (ADMIN_PORTAL_SPEC sections 6.7, 7.11 and 7.12).

export type UserGroup = "all" | "cbes" | "orgs" | "invited";

export type AdminUserRow = {
  /** Null for a pending invitation. */
  id: string | null;
  /** "org:…" or "staff:…" for pending invitations. */
  invitationId: string | null;
  name: string | null;
  email: string;
  role: "super_admin" | "admin" | "representative" | "lead" | "valet" | "director" | "manager";
  access: string;
  orgId: string | null;
  mfa: "passkey" | "authenticator" | "none";
  lastActiveAt: string | null;
  status: "active" | "invited" | "removed";
  invitedAt: string | null;
};

export type AdminUserList = { items: AdminUserRow[]; total: number; page: number; pageSize: number; groupCounts: Record<UserGroup, number> };

export type AuditEntry = { id: string; actor: { id: string; name: string } | null; action: string; targetType: string | null; targetId: string | null; detail: unknown; createdAt: string };
