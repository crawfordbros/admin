import type { PropertyAddressFields, PropertyLocationFields, PropertyReference } from "./propertyAddress";
import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { authenticatedRequest, responseJson } from "./authenticatedRequest";
export { ApiError } from "./authenticatedRequest";

// Calls cbes-api on the same origin (/api, proxied to :8787 in development) with the Clerk
// session token. The API decides what each person can see; these types mirror its responses.

/**
 * Double-click protection for every change (ADMIN_PORTAL_SPEC 4.7): a write identical to one still
 * in flight, or finished within the last second, shares that request instead of sending another.
 * So a second click, a repeated Enter or a twice-fired menu item can never send, save or delete
 * twice, whatever the control.
 */
const inFlight = new Map<string, Promise<unknown>>();
const SETTLE_MS = 1000;

function writeKey(path: string, init: RequestInit): string | null {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  const body = init.body;
  let part = "";
  if (typeof body === "string") part = body;
  else if (body instanceof FormData)
    part = JSON.stringify([...body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `${v.name}:${v.size}:${v.type}`]));
  else if (body instanceof Blob) part = `blob:${body.size}:${body.type}`;
  else if (body != null) return null; // other body types can't be compared; send as is
  return `${method} ${path} ${part}`;
}

/** Tests start each case with no shared requests. */
export const clearPendingWrites = () => inFlight.clear();

export function useApi() {
  const { getToken, sessionId, userId } = useAuth();
  const send = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      return responseJson<T>(await authenticatedRequest({ getToken, sessionId }, path, init));
    },
    [getToken, sessionId],
  );
  return useCallback(
    <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const write = writeKey(path, init);
      if (!write) return send<T>(path, init);
      const key = `${userId}:${sessionId}:${write}`;
      const pending = inFlight.get(key);
      if (pending) return pending as Promise<T>;
      const request = send<T>(path, init);
      inFlight.set(key, request);
      const release = () => setTimeout(() => inFlight.get(key) === request && inFlight.delete(key), SETTLE_MS);
      request.then(release, release);
      return request;
    },
    [send, sessionId, userId],
  );
}

/** Fetches an image (or other file) the API only serves to signed-in users. */
export function useApiBlob() {
  const { getToken, sessionId } = useAuth();
  return useCallback(
    async (path: string): Promise<Blob | null> => {
      const res = await authenticatedRequest({ getToken, sessionId }, path);
      if (res.status === 404) return null;
      return res.blob();
    },
    [getToken, sessionId],
  );
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

export type PropertyRole = "manager";
export type InviteRole = "representative" | PropertyRole;

export type MeOrganization = { id: string; name: string; propertyCount: number; propertyLimit: number; logoVersion: string | null };
export type MeProperty = PropertyAddressFields & {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  memberRole?: PropertyRole | null;
  organizationId: string | null;
  organizationName: string | null;
  photoVersion: string | null;
};
export type Me = {
  user: { id: string; email: string; name: string | null; role: string };
  /** The organizations a representative manages (empty for everyone else). */
  organizations: MeOrganization[];
  properties: MeProperty[];
};

export type ContractType = "12_month" | "36_month" | "month_to_month";

export type Property = PropertyAddressFields & {
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
  /** Who services the property and who manages it (read only here). */
  team?: { steward: PersonRef | null; valets: PersonRef[]; staff: (PersonRef & { role: PropertyRole })[] };
  stats?: { violations30d: number; violationsPer100Units: number | null; overwatchUnits: number; overwatchThreshold: { count: number; days: number } };
};

/** A resident issue as the property sees it (REP_PORTAL_SPEC 6.5). */
export type PortalIssueRow = PropertyLocationFields & {
  id: string;
  refNo: number;
  issueLabel: string;
  createdAt: string;
  propertyId: string;
  propertyName: string;
  building: string | null;
  unit: string | null;
  statusLabel: "New" | "CBES is on it" | "CBES replied" | "Resolved" | "Compliment";
  replyClock: ReplyClock;
  /** The resident's words, shortened. */
  quote?: string | null;
};

export type PortalIssueEvent =
  | { kind: "created"; at: string; body: string | null; photo: boolean }
  | { kind: "reply"; at: string; actor: { name: string; title: string }; body: string }
  | { kind: "call"; at: string; actor: { name: string; title: string } }
  | { kind: "status"; at: string; label: string };

/** GET /portal/issues/:id (REP_PORTAL_SPEC 6.5): view-only. CBES-only comments and call notes never appear. */
export type PortalIssueDetail = PortalIssueRow & {
  resident: { name: string; email: string | null; phone: string | null; okToCall: boolean };
  description: string | null;
  photos: { id: string; url: string }[];
  assignee: { id: string; name: string; title: string } | null;
  firstReplyHours: number | null;
  following: boolean;
  events: PortalIssueEvent[];
};

export type PortalIssueList = { items: PortalIssueRow[]; total: number; page: number; pageSize: number; tabCounts: { open: number; resolved: number; all: number } };

/** GET /portal/reports/summary (REP_PORTAL_SPEC 6.6): the admin's weekly numbers, trimmed to what the property may see. */
export type PortalReportSummary = {
  scope: PropertyAddressFields & { kind: "organization" | "property"; id: string; name: string };
  week: { start: string; end: string; label: string };
  kpis: {
    serviceNights: { serviced: number; scheduled: number; activeProperties: number };
    violationsSent: { value: number; previous: number };
    resolvedByProperty: { value: number; pct: number | null };
    residentIssues: { value: number; previous: number };
    avgFirstReplyHours: { value: number | null; allUnder24h: boolean };
    compliments: number;
  };
  trend: { weekStart: string; sent: number; resolvedByProperty: number }[];
  byType: { label: string; count: number }[];
  issuesSummary: string;
  byProperty: (PropertyAddressFields & { propertyId: string; name: string; managerName: string | null; nights: string; violations: number; resolved: number; issues: number; avgReplyHours: number | null; repeatUnits: number })[];
  /** For the organization PDF: the weekly rows, violations counted once CBES sent them. */
  rows: (Pick<WeeklyRow, "propertyId" | "name" | "nights" | "avgClockIn" | "residentReports" | "resolved" | "avgReplyHours" | "violations" | "overwatchUnits" | "manager"> & { startsOn: string | null })[];
  recipients: { name: string; scope: string; properties?: PropertyReference[] }[];
  nextRunAt: string;
};

export type PortalReportHistory = { items: { weekStart: string; sentAt: string; recipients: number; status: "scheduled" | "sent" | "bounced" | "failed" }[] };

/** GET /portal/properties/:id with the Property Portal's property home fields (REP_PORTAL_SPEC 6.3). */
export type PropertyHome = Omit<PropertyOverview, "property" | "team"> & {
  property: Property & { photoVersion: string | null; buildingCount: number | null; zip: string | null; trashOutWindow: TrashOutWindow | null; pressureWashing: number | boolean };
  organization: { id: string; name: string } | null;
  header: {
    address: string | null;
    buildings: number | null;
    units: number | null;
    serviceNightsLabel: string;
    trashOutWindow: string;
    pressureWashingNext: string | null;
    pressureWashing: boolean;
    /** "Nov 9" while service hasn't started yet. */
    startingOn: string | null;
  };
  kpis: {
    violationsToReview: number;
    resolved30d: { value: number; avgDaysToResolve: number | null };
    openIssues: { value: number; lastReplyHours: number | null };
    serviceNights: { serviced: number; scheduled: number };
    repeatUnits: number;
  };
  violationsToReview: ViolationRow[];
  issues: PortalIssueRow[];
  repeatUnits: { unit: string; building: string | null; count: number; types: string }[];
  tonight: {
    isServiceNight: boolean;
    startsAt: string;
    steward: PersonRef | null;
    valets: (PersonRef & { area: string | null })[];
    lastNight: { date: string; buildingsDone: number | null; buildings: number | null; firstClockIn: string | null; lastClockOut: string | null; violations: number } | null;
  };
  team: NonNullable<PropertyOverview["team"]> & {
    members: { id: string; name: string; role: PropertyRole; receivesWeeklyReport: boolean; you: boolean }[];
    representatives: PersonRef[];
  };
  reportLink: { url: string };
};

export type AdminPropertyRow = PropertyAddressFields & {
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
  /** Main office phone, printed on courtesy notices. */
  phone?: string | null;
  billingEmail?: string | null;
  accountLeadUserId?: string | null;
  createdAt: string;
};

export type OrganizationProperty = PropertyAddressFields & {
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
  violations30d?: number;
  manager: PersonRef | null;
  steward: PersonRef | null;
};

export type OrganizationDetail = {
  organization: OrganizationProfile;
  kpis: {
    properties: number;
    units: number;
    openReports: number;
    oldestOpenHours: number | null;
    avgReplyHours: number | null;
    violations30d?: number;
    violationsPer100Units?: number | null;
  };
  properties: OrganizationProperty[];
  representatives: { id: string; email: string; name: string | null; addedAt: string }[];
  staff: { id: string; email: string; name: string | null; role: PropertyRole; propertyId: string; propertyName: string; propertyAddress?: string | null; propertyCity?: string | null; propertyZip?: string | null }[];
  invitations: {
    id: string;
    email: string;
    name: string | null;
    role: InviteRole;
    propertyId: string | null;
    propertyName: string | null;
    propertyAddress?: string | null;
    propertyCity?: string | null;
    propertyZip?: string | null;
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
  /** "18:00-20:00" or "19:00-21:00"; null keeps the Settings default. */
  trashOutWindow?: TrashOutWindow | null;
  pressureWashing?: boolean;
  createdBy?: string | null;
};

export type TrashOutWindow = "18:00-20:00" | "19:00-21:00";

// Property Portal, Representative dashboard (REP_PORTAL_SPEC 6.2).

export type RepAttentionItem = PropertyLocationFields & {
  kind: "violation" | "issue";
  id: string;
  /** "V-2041" or "#1042" */
  ref: string;
  title: string;
  statusLabel: string;
  propertyId: string;
  propertyName: string;
  where: string;
  ageHours: number;
  link: string;
};

export type PortalPropertyCard = PropertyAddressFields & {
  id: string;
  name: string;
  city: string | null;
  units: number | null;
  photoVersion: string | null;
  status: "active" | "starting" | "inactive";
  serviceStartDate: string | null;
  violationsToReview: number;
  openIssues: number;
  managers: { id: string; name: string; role: PropertyRole }[];
};

export type RepDashboard = {
  organization: { id: string; name: string; logoVersion: string | null; propertyCount: number; propertyLimit: number };
  week: { start: string; label: string };
  kpis: {
    properties: { value: number; limit: number; units: number };
    violationsToReview: number;
    openIssues: { value: number; oldestHours: number | null };
    serviceNights: { serviced: number; scheduled: number; label: string };
    avgFirstReplyHours30d: number | null;
  };
  /** Up to 10 violations and 10 issues, oldest first. */
  attention: RepAttentionItem[];
  properties: PortalPropertyCard[];
  violationsByNight: { date: string; day: string; count: number | null }[];
  topViolationTypes: { label: string; count: number }[];
  lastWeek: { activeProperties: number; serviced: number; scheduled: number; violationsSent: number; issues: number; allRepliedWithin24h: boolean };
  nextWeeklyReportAt: string;
  pendingInvitations: { id: string; email: string; role: PropertyRole; propertyNames: string[]; properties?: PropertyReference[]; createdAt: string; expired: boolean }[];
  contacts: { id: string; name: string; title: string; properties?: PropertyReference[] }[];
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
  property: PropertyReference;
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

/** Property Portal sidebar badges (REP_PORTAL_SPEC 6.1), scoped by ?org= or ?property=. */
export type PortalNavCounts = { violationsToReview: number; openIssues: number; pendingInvitations: number };

export type SearchResult = {
  /** "issue" is a resident report found from the Property Portal. */
  kind: "org" | "property" | "unit" | "report" | "violation" | "user" | "quote" | "issue";
  id: string;
  title: string;
  subtitle: string;
  property?: PropertyReference;
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

export type ViolationRow = PropertyLocationFields & {
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
  /** At or over the Overwatch threshold for its unit. */
  repeat: boolean;
  sentAt: string | null;
  resolvedAt: string | null;
  /** How the property handled it; null when CBES resolved it or it's open. */
  resolution: Resolution | null;
};

export type Resolution = "courtesy_notice" | "spoke_with_resident" | "lease_violation" | "other";

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
  /** The property-side person who resolved it (null when CBES did, or it's open). */
  resolvedBy: Person | null;
  /** The CBES reviewer who sent it to the property. */
  sentBy: Person | null;
  /** What the property's courtesy notice prints. */
  courtesy: { propertyAddress: string | null; propertyCity: string | null; officePhone: string | null; logoVersion: string | null };
};

export type ViolationList = { items: ViolationRow[]; total: number; page: number; pageSize: number };

/** GET /portal/violations (REP_PORTAL_SPEC 6.4): only what CBES sent the property. */
export type PortalViolationList = ViolationList & {
  statusCounts: { toReview: number; resolved: number; all: number };
  types: { key: string; label: string }[];
};
export type AdminViolationList = ViolationList & { stageCounts: Record<ViolationStatus, number> };

// Resident reports in the Admin Portal (ADMIN_PORTAL_SPEC sections 6.3 and 7.2).

export type ReportTab = "open" | "new" | "in_progress" | "resolved" | "closed" | "all";
export type ReplyClock = { state: "replied"; hours: number } | { state: "open"; hoursLeft: number; targetHours: number } | { state: "none" };

export type ReportRow = PropertyLocationFields & {
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
  byProperty: (PropertyAddressFields & { propertyId: string; name: string; orgName: string | null; count: number; per100Units: number | null; avgReplyHours: number | null; spark: number[] })[];
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
  /** A number the resident said CBES may call, given alongside their email on the website form. */
  reporterPhone: string | null;
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
  role: "super_admin" | "admin" | "representative" | "lead" | "valet" | "manager";
  access: string;
  properties?: PropertyReference[];
  orgId: string | null;
  mfa: "passkey" | "authenticator" | "none";
  lastActiveAt: string | null;
  status: "active" | "invited" | "removed";
  invitedAt: string | null;
  /** True only when the account role is Steward. */
  steward?: boolean;
};

export type AdminUserList = { items: AdminUserRow[]; total: number; page: number; pageSize: number; groupCounts: Record<UserGroup, number> };

export type AuditEntry = { id: string; actor: { id: string; name: string } | null; action: string; targetType: string | null; targetId: string | null; detail: unknown; createdAt: string };

// Weekly reports in the Admin Portal (ADMIN_PORTAL_SPEC sections 6.8 and 7.3).

export type Delivery = "sent" | "scheduled" | "bounced" | "failed" | "not_sent";

export type WeeklyRow = PropertyAddressFields & {
  propertyId: string;
  name: string;
  units: number | null;
  city: string | null;
  photoVersion: string | null;
  nights: { scheduled: number; serviced: number; byNight: boolean[]; dates?: string[] };
  valetStatus: "ok" | "not_configured" | "no_job" | "error";
  avgClockIn: string | null;
  residentReports: number;
  resolved: number;
  avgReplyHours: number | null;
  violations: number;
  overwatchUnits: number;
  manager: { name: string; email: string } | null;
  recipients: number;
  delivery: Delivery;
  lastRunAt: string | null;
  lastError: string | null;
};

export type WeeklyAdminView = {
  week: { start: string; end: string; label: string };
  summary: { properties: number; sent: number; failed: number; residentReports: number; violations: number; noManager: number };
  groups: { org: { id: string | null; name: string; logoVersion: string | null; representative: string | null; rollupSentAt: string | null }; rows: WeeklyRow[] }[];
};

export type WeeklyScope = "property" | "organization" | "all";
export type WeeklyRecipients = {
  recipients: { email: string; name: string | null; kind: "manager" | "member" | "representative" | "admin"; propertyName: string | null; propertyId?: string; propertyAddress?: string | null; propertyCity?: string | null; propertyZip?: string | null }[];
  skippedNoManager: string[];
};
export type WeeklySendResult = { sent: number; failed: number; recipients: number; skippedNoManager: string[] };

// Quotes (ADMIN_PORTAL_SPEC sections 6.9, 7.13 and 7.14).

export type QuoteStage = "new" | "conversation" | "quote_sent" | "contract_sent" | "won" | "lost";
export type QuoteTerm = "12_month" | "36_month" | "month_to_month";

export type QuoteCard = {
  id: string;
  refNo: number;
  kind: "quote" | "contact";
  stage: QuoteStage;
  community: string | null;
  company: string | null;
  contactName: string;
  propertyCount: number | null;
  units: number | null;
  services: string[];
  createdAt: string;
  firstResponseAt: string | null;
  lastActivity: { kind: "form" | "email_in" | "email_out" | "document" | "note" | "stage"; text: string; at: string };
  messagesCount: number;
  owner: { id: string; name: string } | null;
  /** "email": started by an email to quotes@ that matched no quote. */
  source: "web" | "contact" | "manual" | "email";
};

export type QuotesKpis = {
  newCount: number;
  newOver24h: number;
  avgFirstResponseHours: number | null;
  quotesOut: number;
  quotesOutUnits: number;
  contractsOut: number;
  oldestContractSentAt: string | null;
  wonThisQuarter: number;
  winRatePct: number | null;
};

export type QuoteMessage = {
  id: string;
  direction: "in" | "out";
  from: string;
  to: string;
  cc: string[];
  subject: string | null;
  body: string;
  createdAt: string;
  sentBy: { id: string; name: string } | null;
  attachments: { id: string; fileName: string }[];
};

export type QuoteDocument = {
  id: string;
  kind: "quote_pdf" | "contract" | "signed_contract" | "coi" | "other";
  fileName: string;
  contentType: string;
  bytes: number;
  status: "draft" | "ready" | "sent" | "signed";
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
};

export type QuoteDetail = QuoteCard & {
  contact: { name: string; title: string | null; email: string; phone: string | null };
  request: { address: string | null; propertyType: string | null; desiredStart: string | null; currentProvider: string | null; message: string | null };
  rateCentsPerUnit: number | null;
  term: QuoteTerm | null;
  lostReason: string | null;
  organizationId: string | null;
  notes: { id: string; author: { id: string; name: string } | null; body: string; createdAt: string }[];
  messages: QuoteMessage[];
  documents: QuoteDocument[];
};

export type ContractTemplate = { key: "12_month" | "36_month" | "month_to_month" | "coi"; label: string; fileName: string | null; uploadedAt: string | null };

// Settings, Overview and Overwatch (ADMIN_PORTAL_SPEC 6.2, 6.5, 6.10)

export type Day = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export type ReplyTarget = 4 | 12 | 24 | 48;
export type OverwatchRule = { count: number; days: 14 | 30 | 60 | 90; countDismissed: boolean };
export type IssueTypeSetting = { key: string; label: string; labelEs: string | null; replyTargetHours: ReplyTarget; onForm: boolean; used: boolean };
export type ViolationTypeSetting = { key: string; label: string; labelEs: string | null; active: boolean; countsForOverwatch: boolean; thisMonth: number; used: boolean };
export type Holiday = { date: string; name: string };

export type AdminSettings = {
  overwatch: OverwatchRule;
  calendar: { serviceNights: Day[]; startTime: string; makeupPolicy: "next_night" | "skip" };
  weeklyReport: { day: Day; time: string; tz: "America/New_York" };
  email: { reportsFrom: string; quotesFrom: string; allowedSenders: string[] };
  issueTypes: IssueTypeSetting[];
  violationTypes: ViolationTypeSetting[];
  holidays: Holiday[];
};

export type OverwatchPreview = {
  threshold: OverwatchRule;
  units: (PropertyLocationFields & { propertyId: string; propertyName: string; orgId: string | null; orgName: string | null; unit: string; count: number; mostCommon: string; lastAt: string })[];
};

export type OverviewRange = "today" | "7d" | "30d";
export type OverviewKpi = { value: number | null; previous: number | null; spark: number[]; note?: string };
export type AttentionItem = {
  kind: "report_due" | "violations_to_review" | "no_clock_in" | "quote_waiting" | "invites_stale" | "property_needs_setup";
  title: string;
  subtitle: string;
  property?: PropertyReference;
  tag: string;
  severity: "high" | "medium" | "low";
  link: string;
  at: string;
};
export type TonightStatus = "not_service_night" | "no_clock_in" | "in_progress" | "done" | "not_linked";
export type AdminOverview = {
  range: { from: string; to: string; label: string };
  kpis: { openReports: OverviewKpi; avgFirstReplyHours: OverviewKpi; violations: OverviewKpi; overwatchUnits: OverviewKpi; newQuotes: OverviewKpi };
  activity: { weekStart: string; violations: number; residentReports: number }[];
  attention: AttentionItem[];
  service: {
    tonight: boolean;
    date: string;
    holidayName: string | null;
    startTime: string;
    nextServiceNight: string | null;
    valetStatus: "ok" | "not_configured" | "error";
    clockedIn: number;
    total: number;
  };
  tonight: (PropertyAddressFields & { propertyId: string; orgId: string | null; name: string; orgName: string | null; stewardName: string | null; progressPct: number | null; status: TonightStatus })[];
  orgs: { id: string; name: string; logoVersion: string | null; properties: number; openReports: number; violations30d: number; avgReplyHours: number | null }[];
};

export type ActivityEntry = AuditEntry & { summary: string };
export type ActivityPage = { items: ActivityEntry[]; nextBefore: string | null };

// ---- Team and settings, My account (REP_PORTAL_SPEC 6.7, 7.4, 7.9)

export type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: "representative" | PropertyRole;
  you: boolean;
  properties: PropertyReference[] | "all";
  receivesWeeklyReport: boolean;
  lastSeenAt: string | null;
  mfa: "passkey" | "authenticator" | "none";
};

export type TeamInvitation = {
  id: string;
  email: string;
  name: string | null;
  role: "representative" | PropertyRole;
  properties: PropertyReference[];
  receivesWeeklyReport: boolean;
  createdAt: string;
};

export type TeamResponse = { team: TeamMember[]; invitations: TeamInvitation[] };

export type NotificationPrefs = { violationsSent: boolean; newIssues: boolean; issueUpdates: boolean; inviteAccepted: boolean; weeklyRollup: boolean };

export type MyNotifications = {
  prefs: NotificationPrefs;
  /** Managers: the Monday report for their properties. `applies` is false with no properties. */
  weeklyReport: { on: boolean; locked: boolean; applies: boolean };
};
