import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api";
import type { StringKey } from "./strings";

// Resident issues in the Steward app (STEWARD_APP_SPEC sections 4 and 6, milestone S4): the ones assigned
// to you and, for Stewards, every issue at their properties.

export type IssueStatus = "new" | "assigned" | "in_progress" | "resolved" | "closed";
export type IssueTab = "todo" | "done";

export type ReplyClock = { state: "replied"; hours: number } | { state: "open"; hoursLeft: number; targetHours: number } | { state: "none" };

export type CrewIssue = {
  id: string;
  refNo: number;
  typeKey: string;
  typeLabel: string;
  typeLabelEs: string | null;
  propertyId: string | null;
  propertyName: string;
  building: string | null;
  unit: string | null;
  description: string | null;
  status: IssueStatus;
  createdAt: string;
  resolvedAt: string | null;
  replyClock: ReplyClock;
  /** Resolved, but the resident hasn't heard back yet: the Steward replies. */
  needsReply: boolean;
  assignee: { id: string; name: string; photoUrl: string | null } | null;
  lastChange: { kind: "assigned" | "status"; toStatus: IssueStatus | null; actorId: string | null; actorName: string | null; at: string } | null;
};

export type IssueEvent = {
  id: string;
  kind: "created" | "status" | "assigned" | "reply" | "call" | "comment";
  actor: { id: string; name: string } | null;
  body: string | null;
  toStatus: IssueStatus | null;
  assignee: { id: string; name: string } | null;
  afterPhotos: string[];
  createdAt: string;
};

export type CrewMember = { id: string; name: string; role: "lead" | "valet"; photoUrl: string | null };

export type CrewIssueDetail = CrewIssue & {
  source: "web" | "qr" | "phone" | "import";
  photos: string[];
  afterPhotos: string[];
  events: IssueEvent[];
  resident: { name: string; canEmail: boolean } | null;
  crew: CrewMember[];
  can: { start: boolean; fix: boolean; assign: boolean; reply: boolean };
};

export const ISSUE_STATUS_KEY: Record<IssueStatus, StringKey> = {
  new: "issueStatus.new",
  assigned: "issueStatus.assigned",
  in_progress: "issueStatus.in_progress",
  resolved: "issueStatus.resolved",
  closed: "issueStatus.closed",
};

const ISSUES = ["crew", "issues"] as const;

export function useIssues(tab: IssueTab) {
  const api = useApi();
  return useQuery({
    queryKey: [...ISSUES, "list", tab],
    queryFn: () => api<{ items: CrewIssue[]; counts: Record<IssueTab, number> }>(`/valet/issues?tab=${tab}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useIssue(id: string) {
  const api = useApi();
  return useQuery({ queryKey: [...ISSUES, "one", id], queryFn: () => api<CrewIssueDetail>(`/valet/issues/${encodeURIComponent(id)}`), enabled: Boolean(id) });
}

/** Every issue change answers with the issue as it is now; the lists and Tonight's count refresh. */
function useIssueChange<V>(id: string, request: (vars: V) => Promise<CrewIssueDetail>) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (issue) => queries.setQueryData([...ISSUES, "one", id], issue),
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: [...ISSUES, "list"] });
      void queries.invalidateQueries({ queryKey: ["crew", "tonight"] });
    },
  });
}

const path = (id: string, rest = "") => `/valet/issues/${encodeURIComponent(id)}${rest}`;

/** On my way. */
export function useStartIssue(id: string) {
  const api = useApi();
  return useIssueChange<void>(id, () => api<CrewIssueDetail>(path(id), { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) }));
}

/** Fixed: the after photo (already compressed) and an optional note. */
export function useFixIssue(id: string) {
  const api = useApi();
  return useIssueChange<{ photo: Blob; note: string }>(id, ({ photo, note }) => {
    const form = new FormData();
    form.append("photo", new File([photo], "after.jpg", { type: photo.type || "image/jpeg" }));
    if (note.trim()) form.append("note", note.trim());
    return api<CrewIssueDetail>(path(id, "/fixed"), { method: "POST", body: form });
  });
}

export function useIssueNote(id: string) {
  const api = useApi();
  return useIssueChange<string>(id, (body) => api<CrewIssueDetail>(path(id, "/notes"), { method: "POST", body: JSON.stringify({ body }) }));
}

export function useAssignIssue(id: string) {
  const api = useApi();
  return useIssueChange<{ userId: string; note: string }>(id, ({ userId, note }) =>
    api<CrewIssueDetail>(path(id, "/assign"), { method: "POST", body: JSON.stringify({ userId, note: note.trim() || undefined }) }),
  );
}

export function useReplyIssue(id: string) {
  const api = useApi();
  return useIssueChange<{ body: string; resolve: boolean }>(id, ({ body, resolve }) =>
    api<CrewIssueDetail>(path(id, "/replies"), { method: "POST", body: JSON.stringify({ body, resolve }) }),
  );
}

/** The reply clock as a card shows it: hours left (or overdue), or that the resident still needs a reply. */
export function clockLabel(issue: Pick<CrewIssue, "replyClock" | "needsReply" | "status">): { key: StringKey; vars?: Record<string, number>; hot: boolean } | null {
  if (issue.needsReply) return { key: "issues.replyNeeded", hot: true };
  const c = issue.replyClock;
  if (c.state !== "open") return null;
  if (c.hoursLeft < 0) return { key: "issues.overdue", vars: { h: Math.max(1, Math.round(-c.hoursLeft)) }, hot: true };
  if (c.hoursLeft < 1) return { key: "issues.dueSoon", hot: true };
  return { key: "issues.dueIn", vars: { h: Math.round(c.hoursLeft) }, hot: c.hoursLeft <= 4 };
}

type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

/** "The Oaks · Bldg 3 · Unit 305", with whatever the resident gave. */
export function issueWhere(i: Pick<CrewIssue, "propertyName" | "building" | "unit">, t: Translate) {
  if (i.building && i.unit) return t("issues.where", { property: i.propertyName, building: i.building, unit: i.unit });
  if (i.unit) return t("issues.whereUnit", { property: i.propertyName, unit: i.unit });
  if (i.building) return t("issues.whereBuilding", { property: i.propertyName, building: i.building });
  return i.propertyName;
}

/** "Bldg 3 · Unit 305" for the detail screen's heading line. */
export function unitLine(i: Pick<CrewIssue, "building" | "unit">, t: Translate) {
  if (i.building && i.unit) return t("issues.unitLine", { building: i.building, unit: i.unit });
  if (i.unit) return t("issues.unitOnly", { unit: i.unit });
  if (i.building) return t("issues.buildingOnly", { building: i.building });
  return t("issues.noUnit");
}

/**
 * The small line under a card: who did the last thing and when. "You started 9:02 PM", "Assigned by Dana
 * Brooks · Tonight 8:10 PM", or for a Steward looking at someone else's, "Assigned to Marcus Hill".
 */
export function issueByline(i: CrewIssue, me: string | undefined, t: Translate, when: (iso: string) => string) {
  const c = i.lastChange;
  const actor = c?.actorName ?? t("issues.someone");
  if (c?.kind === "status" && (c.toStatus === "resolved" || c.toStatus === "closed") && i.status === c.toStatus) {
    return c.actorId === me ? t("issues.youFixed", { time: when(c.at) }) : t("issues.fixedBy", { name: actor, time: when(c.at) });
  }
  if (c?.kind === "status" && c.toStatus === "in_progress" && i.status === "in_progress") {
    return c.actorId === me ? t("issues.youStarted", { time: when(c.at) }) : t("issues.started", { name: actor, time: when(c.at) });
  }
  if (!i.assignee) return t("issues.notAssigned");
  if (i.assignee.id !== me) return t("issues.assignedTo", { name: i.assignee.name });
  if (c?.kind === "assigned" || c?.toStatus === "assigned") return c.actorId === me ? t("issues.youAssigned", { time: when(c.at) }) : t("issues.byAssigned", { name: actor, time: when(c.at) });
  return t("issues.assignedTo", { name: t("issues.you") });
}

/** Issues to reply to on the tablet: fixed ones waiting on a reply first, then the rest of To do in the API's order. */
export function replyQueue(items: CrewIssue[]) {
  return [...items.filter((i) => i.needsReply), ...items.filter((i) => !i.needsReply)];
}
