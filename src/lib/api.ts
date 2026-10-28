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
  /** Who services the property and who manages it (read only here). */
  team?: { steward: PersonRef | null; valets: PersonRef[]; staff: (PersonRef & { role: PropertyRole })[] };
  stats?: { violations30d: number; violationsPer100Units: number | null; overwatchUnits: number; overwatchThreshold: { count: number; days: number } };
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
  /** All held roles, including organization and property memberships. */
  roles?: AdminUserRow["role"][];
  access: string;
  orgId: string | null;
  mfa: "passkey" | "authenticator" | "none";
  lastActiveAt: string | null;
  status: "active" | "invited" | "removed";
  invitedAt: string | null;
  /** Steward is its own role, kept alongside Admin (an admin can also be a property's Steward). */
  steward?: boolean;
};

export type AdminUserList = { items: AdminUserRow[]; total: number; page: number; pageSize: number; groupCounts: Record<UserGroup, number> };

export type AuditEntry = { id: string; actor: { id: string; name: string } | null; action: string; targetType: string | null; targetId: string | null; detail: unknown; createdAt: string };

// Weekly reports in the Admin Portal (ADMIN_PORTAL_SPEC sections 6.8 and 7.3).

export type Delivery = "sent" | "scheduled" | "bounced" | "failed" | "not_sent";

export type WeeklyRow = {
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
  recipients: { email: string; name: string | null; kind: "manager" | "member" | "representative" | "admin"; propertyName: string | null }[];
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
  units: { propertyId: string; propertyName: string; orgId: string | null; orgName: string | null; unit: string; count: number; mostCommon: string; lastAt: string }[];
};

export type OverviewRange = "today" | "7d" | "30d";
export type OverviewKpi = { value: number | null; previous: number | null; spark: number[]; note?: string };
export type AttentionItem = {
  kind: "report_due" | "violations_to_review" | "no_clock_in" | "quote_waiting" | "invites_stale";
  title: string;
  subtitle: string;
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
  tonight: { propertyId: string; orgId: string | null; name: string; orgName: string | null; stewardName: string | null; progressPct: number | null; status: TonightStatus }[];
  orgs: { id: string; name: string; logoVersion: string | null; properties: number; openReports: number; violations30d: number; avgReplyHours: number | null }[];
};

export type ActivityEntry = AuditEntry & { summary: string };
export type ActivityPage = { items: ActivityEntry[]; nextBefore: string | null };
