// Status colors from ADMIN_PORTAL_SPEC section 4.5.
export const PILL = {
  neutral: "bg-neutral-bg text-neutral",
  muted: "bg-neutral-bg text-muted",
  info: "bg-info-bg text-info",
  navy: "bg-tint-2 text-navy",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  gold: "bg-gold-tint text-gold-text",
} as const;
export type PillTone = keyof typeof PILL;

export const STATUS = {
  report: {
    new: ["New", "neutral"],
    assigned: ["Assigned", "info"],
    in_progress: ["In progress", "navy"],
    resolved: ["Resolved", "success"],
    closed: ["Closed", "muted"],
  },
  // What the property side sees (REP_PORTAL_SPEC 4.3): their next step, not CBES's stage.
  portalViolation: {
    sent: ["To review", "warning"],
    resolved: ["Resolved", "success"],
  },
  portalIssue: {
    New: ["New", "info"],
    "CBES is on it": ["CBES is on it", "info"],
    "CBES replied": ["CBES replied", "success"],
    Resolved: ["Resolved", "neutral"],
    Compliment: ["Compliment", "gold"],
  },
  violation: {
    new: ["New", "neutral"],
    in_review: ["In review", "warning"],
    sent: ["Sent to property", "info"],
    resolved: ["Resolved", "success"],
    dismissed: ["Dismissed", "muted"],

  },
  delivery: {
    sent: ["Sent", "success"],
    scheduled: ["Scheduled", "navy"],
    bounced: ["Bounced", "danger"],
    failed: ["Failed", "danger"],
    not_sent: ["Not sent", "neutral"],
  },
  quote: {
    new: ["New", "danger"],
    conversation: ["In conversation", "warning"],
    quote_sent: ["Quote sent", "navy"],
    contract_sent: ["Contract sent", "gold"],
    won: ["Won", "success"],
    lost: ["Lost", "muted"],
  },
  account: {
    active: ["Active", "success"],
    onboarding: ["Onboarding", "warning"],
    starting: ["Starting", "warning"],
    invited: ["Invited", "warning"],
    inactive: ["Inactive", "neutral"],
    removed: ["Removed", "muted"],
  },
} as const satisfies Record<string, Record<string, readonly [string, PillTone]>>;

export type StatusKind = keyof typeof STATUS;
export type StatusOf<K extends StatusKind> = keyof (typeof STATUS)[K];

export const statusLabel = <K extends StatusKind>(kind: K, status: StatusOf<K>): string =>
  (STATUS[kind] as Record<string, readonly [string, PillTone]>)[status as string]?.[0] ?? String(status);

// Avatar backgrounds from the designs; all pass AA with white initials.
const AVATAR_COLORS = ["#272b84", "#7a6a50", "#3a3e99", "#1f6b3a", "#1c4fa0", "#6b3a7a", "#8a4b12"];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

/** The same person always gets the same color. */
export function avatarColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** An organization's color: chosen from its id, so it never changes and needs no setting. */
export const orgColor = (id: string) => avatarColor(id);
