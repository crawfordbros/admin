import { useEffect, useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { ApiError, errorMessage } from "../../lib/api";
import { useAuthedImage } from "../../lib/images";
import {
  clockLabel,
  unitLine,
  useAssignIssue,
  useFixIssue,
  useIssue,
  useIssueNote,
  useReplyIssue,
  useStartIssue,
  type CrewIssueDetail,
  type IssueEvent,
} from "../../lib/steward/issues";
import { useStewardPreferences } from "../../lib/steward/preferences";
import type { StringKey } from "../../lib/steward/strings";
import { dayTime } from "../../lib/steward/shifts";
import { compressPhoto, typeName } from "../../lib/steward/violations";
import { personalKey } from "../../lib/steward/offline";
import { Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { Avatar, BottomAction, OutlineButton, Panel, ScreenHeader } from "../../components/steward/ui";
import { useNearScreen } from "../../components/steward/useNearScreen";
import { cx } from "../../components/styles";
import { IssueStatusPill } from "./IssuesPage";
import { useScreenTitle } from "./useScreenTitle";

type Message = { tone: "ok" | "bad"; text: string };
type Done = (m: Message) => void;

const field =
  "w-full rounded-xl border border-st-border bg-st-raised px-3 py-2.5 text-base text-st-text placeholder:text-st-text-3 focus:border-2 focus:border-st-text focus:outline-none";
const goButton =
  "flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-st-go px-4 text-[15.5px] font-bold text-st-on-go disabled:cursor-not-allowed disabled:opacity-60";

function failure(err: unknown, t: (k: StringKey) => string) {
  return err instanceof ApiError && err.status === 409 ? t("issues.alreadyResolved") : errorMessage(err);
}

/**
 * Screen 13, Issue detail (docs/design/steward/Steward-IssueDetail): what the resident reported and
 * where, the activity so far, and the actions. Valets: On my way, Fixed with an after photo, a note.
 * Stewards also assign it and reply to the resident (the tablet design's reply column).
 */
export function IssueDetailPage() {
  const { id = "" } = useParams();
  const { t, locale } = useStewardPreferences();
  const { user } = useUser();
  const issue = useIssue(id);
  const [message, setMessage] = useState<Message | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const i = issue.data;
  useScreenTitle(i ? `${typeName(i, locale)} ${t("issues.ref", { ref: i.refNo })}` : t("issues.detailTitle"));
  const back = { to: "/steward/issues", label: t("issues.back") };

  const done: Done = (m) => {
    setMessage(m);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  if (!i) {
    return (
      <>
        <ScreenHeader back={back} title={t("issues.detailTitle")} />
        {issue.error ? <Notice>{errorMessage(issue.error)}</Notice> : <p role="status" className="text-st-text-2">{t("app.loading")}</p>}
      </>
    );
  }

  const clock = clockLabel(i);
  const when = (iso: string) => dayTime(iso, locale, { today: t("issues.today"), yesterday: t("issues.yesterday") });
  const mine = i.assignee?.id === user?.id;

  return (
    <>
      <div ref={top} className="scroll-mt-4" />
      <ScreenHeader
        back={back}
        eyebrow={t("issues.eyebrow", { ref: i.refNo })}
        title={typeName(i, locale)}
        aside={
          clock ? (
            <span className={cx("flex-none rounded-full px-2.5 py-1 text-xs font-bold", clock.hot ? (i.needsReply ? "bg-st-bad-bg text-st-bad" : "bg-st-warn-bg text-st-warn") : "bg-st-raised text-st-text-2")}>
              {t(clock.key, clock.vars)}
            </span>
          ) : (
            <IssueStatusPill status={i.status} />
          )
        }
      />
      <div className="flex flex-col gap-3 pt-1 pb-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {message && (
          <div className="md:col-span-2">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <WhatPanel issue={i} when={when} />
          {i.can.assign && <AssignPanel key={i.assignee?.id ?? "none"} issue={i} me={user?.id} onDone={done} />}
          {i.resident && !i.resident.canEmail && <Notice tone="warn">{t("issues.phoneOnly", { name: i.resident.name })}</Notice>}
          {i.can.reply && i.resident && <ReplyPanel issue={i} onDone={done} />}
        </div>
        <div className="flex flex-col gap-3">
          <Activity issue={i} me={user?.id} waiting={mine && i.can.fix} when={when} />
          <NoteForm issue={i} steward={Boolean(i.resident)} onDone={done} />
        </div>
      </div>
      {/* On my way and Fixed are for whoever has it; a Steward assigns it to themselves to work it. */}
      {i.can.fix && mine ? (
        <FixActions issue={i} steward={Boolean(i.resident)} onDone={done} />
      ) : (
        i.resolvedAt && (
          <p className="m-0 flex items-center justify-center gap-2 pb-4 text-sm font-bold text-st-ok">
            <Icon name="check" size={18} strokeWidth={2.4} />
            {t("issues.resolvedOn", { when: when(i.resolvedAt) })}
          </p>
        )
      )}
    </>
  );
}

/** Where it is, what the resident said, and their photos. */
function WhatPanel({ issue: i, when }: { issue: CrewIssueDetail; when: (iso: string) => string }) {
  const { t } = useStewardPreferences();
  return (
    <Panel className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-st-raised text-st-accent">
          <Icon name="property" size={22} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <strong className="block text-[17px]">{unitLine(i, t)}</strong>
          <span className="text-[13px] text-st-text-2">{i.propertyName}</span>
        </span>
      </div>
      <p className="m-0 rounded-xl bg-st-raised p-3 text-[14.5px] leading-normal">
        {i.description ? `“${i.description}”` : null}
        <span className={cx("block text-xs text-st-text-3", i.description && "mt-1.5")}>
          {i.resident ? t("issues.residentNamed", { name: i.resident.name, when: when(i.createdAt) }) : t("issues.resident", { when: when(i.createdAt) })}
        </span>
      </p>
      {i.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {i.photos.map((p, n) => (
            <Thumb key={p} path={p} alt={t("issues.photoAlt", { n: n + 1 })} size="size-24" />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** A photo that loads as it comes near the screen, and opens full size when tapped. */
function Thumb({ path, alt, size }: { path: string; alt: string; size: string }) {
  const { ref, near } = useNearScreen<HTMLSpanElement>();
  const src = useAuthedImage(near ? path : null, near ? path : null);
  return (
    <span ref={ref} className={cx("flex flex-none items-center justify-center overflow-hidden rounded-xl bg-st-track text-st-avatar-ink", size)}>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" className="block size-full">
          <img src={src} alt={alt} className="size-full object-cover" />
        </a>
      ) : (
        <Icon name="camera" size={22} strokeWidth={1.6} />
      )}
    </span>
  );
}

const DOT: Partial<Record<IssueEvent["kind"], string>> = { created: "bg-st-text-3", assigned: "bg-st-warn", reply: "bg-st-accent", call: "bg-st-accent", comment: "bg-st-border" };

function eventTitle(e: IssueEvent, me: string | undefined, t: (k: StringKey, v?: Record<string, string | number>) => string) {
  const actor = e.actor?.name ?? t("issues.someone");
  switch (e.kind) {
    case "created":
      return e.actor ? t("issues.ev.createdBy", { actor }) : t("issues.ev.created");
    case "assigned":
      if (!e.assignee) return t("issues.ev.unassigned", { actor });
      return e.assignee.id === me ? t("issues.ev.assignedYou", { actor }) : t("issues.ev.assigned", { actor, name: e.assignee.name });
    case "status":
      if (e.toStatus === "in_progress") return t("issues.ev.started", { actor });
      if (e.toStatus === "resolved") return t("issues.ev.fixed", { actor });
      if (e.toStatus === "closed") return t("issues.ev.closed", { actor });
      if (e.toStatus === "new") return t("issues.ev.reopened", { actor });
      return t("issues.ev.status", { actor });
    case "reply":
      return t("issues.ev.reply", { actor });
    case "call":
      return t("issues.ev.call", { actor });
    default:
      return t("issues.ev.comment", { actor });
  }
}

const SOURCE: Record<CrewIssueDetail["source"], StringKey> = { web: "issues.source.web", qr: "issues.source.qr", phone: "issues.source.phone", import: "issues.source.import" };

/** The timeline, oldest first. A move to Assigned is already said by the assignment above it. */
function Activity({ issue: i, me, waiting, when }: { issue: CrewIssueDetail; me: string | undefined; waiting: boolean; when: (iso: string) => string }) {
  const { t } = useStewardPreferences();
  const events = i.events.filter((e) => !(e.kind === "status" && e.toStatus === "assigned"));
  return (
    <Panel className="py-3">
      <h2 className="m-0 mb-2.5 text-[14.5px] font-bold">{t("issues.activity")}</h2>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13px]">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={cx(
                "mt-1 size-2.5 flex-none rounded-full",
                e.kind === "status" ? (e.toStatus === "resolved" || e.toStatus === "closed" ? "bg-st-ok" : "bg-st-info") : (DOT[e.kind] ?? "bg-st-border"),
              )}
            />
            <span className="min-w-0 flex-1">
              <strong>{eventTitle(e, me, t)}</strong>
              <span className="block text-xs text-st-text-3">{e.kind === "created" ? `${when(e.createdAt)} · ${t(SOURCE[i.source])}` : when(e.createdAt)}</span>
              {e.body && <span className="mt-1 block rounded-lg bg-st-raised px-2.5 py-1.5 text-[13px] whitespace-pre-wrap">{e.body}</span>}
              {e.afterPhotos.length > 0 && (
                <span className="mt-1.5 flex gap-2">
                  {e.afterPhotos.map((p) => (
                    <Thumb key={p} path={p} alt={t("issues.afterAlt")} size="size-20" />
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
        {waiting && (
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1 size-2.5 flex-none rounded-full border-2 border-st-info" />
            <span>
              <strong>{t("issues.ev.waiting")}</strong>
              <span className="block text-xs text-st-text-3">{t("issues.ev.waitingBody")}</span>
            </span>
          </li>
        )}
      </ol>
    </Panel>
  );
}

function NoteForm({ issue, steward, onDone }: { issue: CrewIssueDetail; steward: boolean; onDone: Done }) {
  const { t } = useStewardPreferences();
  const note = useIssueNote(issue.id);
  const [text, setText] = useState("");
  const id = useId();
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        note.mutate(text.trim(), {
          onSuccess: () => {
            setText("");
            onDone({ tone: "ok", text: t("issues.noteAdded") });
          },
          onError: (err) => onDone({ tone: "bad", text: errorMessage(err) }),
        });
      }}
    >
      <label htmlFor={id} className="text-[13.5px] font-semibold">
        {t(steward ? "issues.noteLabelSteward" : "issues.noteLabel")}
      </label>
      <div className="flex gap-2">
        <input id={id} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={t("issues.notePlaceholder")} className={cx(field, "min-h-[50px] flex-1")} />
        <button type="submit" disabled={note.isPending || !text.trim()} className="min-h-[50px] flex-none rounded-xl border border-st-border px-3.5 text-sm font-bold disabled:opacity-60">
          {t("issues.noteSend")}
        </button>
      </div>
    </form>
  );
}

/** On my way and Fixed. Fixed opens the camera; the photo and an optional note are checked before saving. */
function FixActions({ issue, steward, onDone }: { issue: CrewIssueDetail; steward: boolean; onDone: Done }) {
  const { t } = useStewardPreferences();
  const start = useStartIssue(issue.id);
  const fix = useFixIssue(issue.id);
  const camera = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);
  useEffect(() => {
    if (photo) panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [photo]);

  const input = (
    <input
      ref={camera}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      data-photo="after"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setProblem(null);
        try {
          const blob = await compressPhoto(file);
          setPhoto({ blob, url: URL.createObjectURL(blob) });
        } catch (err) {
          setProblem(err instanceof Error ? err.message : String(err));
        }
      }}
    />
  );

  if (photo) {
    return (
      <section ref={panel} aria-labelledby={`${noteId}-title`} className="mb-4 flex scroll-mb-4 flex-col gap-3 rounded-2xl bg-st-surface p-4">
        {input}
        <div>
          <h2 id={`${noteId}-title`} className="m-0 text-[17px] font-bold">
            {t("issues.fixTitle")}
          </h2>
          <p className="mt-1 mb-0 text-[13.5px] text-st-text-2">{t("issues.fixBody")}</p>
        </div>
        <img src={photo.url} alt={t("issues.afterAlt")} className="max-h-72 w-full rounded-xl object-cover" />
        <label htmlFor={noteId} className="-mb-1.5 text-[13.5px] font-semibold">
          {t("issues.fixNote")}
        </label>
        <textarea id={noteId} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("issues.notePlaceholder")} className={field} />
        {problem && <Notice>{problem}</Notice>}
        <button
          type="button"
          disabled={fix.isPending}
          className={goButton}
          onClick={() =>
            fix.mutate(
              { photo: photo.blob, note },
              {
                onSuccess: () => {
                  setPhoto(null);
                  setNote("");
                  onDone({ tone: "ok", text: t(steward ? "issues.fixedSteward" : "issues.fixedDone") });
                },
                onError: (err) => setProblem(failure(err, t)),
              },
            )
          }
        >
          <Icon name="check" size={20} strokeWidth={2.4} />
          {fix.isPending ? t("issues.saving") : t("issues.fixConfirm")}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <OutlineButton disabled={fix.isPending} onClick={() => camera.current?.click()}>
            {t("issues.retake")}
          </OutlineButton>
          <OutlineButton disabled={fix.isPending} onClick={() => setPhoto(null)}>
            {t("issues.cancel")}
          </OutlineButton>
        </div>
      </section>
    );
  }

  return (
    <BottomAction>
      {input}
      {problem && <Notice>{problem}</Notice>}
      <div className={cx("grid gap-2.5", issue.can.start ? "grid-cols-[1fr_1.3fr]" : "grid-cols-1")}>
        {issue.can.start && (
          <OutlineButton
            disabled={start.isPending}
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: () => onDone({ tone: "ok", text: t("issues.onTheWay") }),
                onError: (err) => onDone({ tone: "bad", text: failure(err, t) }),
              })
            }
          >
            {t("issues.onMyWay")}
          </OutlineButton>
        )}
        <button type="button" className={goButton} onClick={() => camera.current?.click()}>
          <Icon name="camera" size={20} strokeWidth={2} />
          {t("issues.fixed")}
        </button>
      </div>
      {!steward && <p className="m-0 text-center text-[12.5px] text-st-text-3">{t("issues.fixHint")}</p>}
    </BottomAction>
  );
}

/** A Steward hands the issue to someone on the property's crew (or takes it), with an optional note. */
function AssignPanel({ issue, me, onDone }: { issue: CrewIssueDetail; me: string | undefined; onDone: Done }) {
  const { t } = useStewardPreferences();
  const assign = useAssignIssue(issue.id);
  const [open, setOpen] = useState(!issue.assignee);
  const [userId, setUserId] = useState(issue.assignee?.id ?? "");
  const [note, setNote] = useState("");
  const id = useId();

  if (!open && issue.assignee) {
    return (
      <Panel className="flex items-center gap-3 py-3">
        <Avatar name={issue.assignee.name} photoUrl={issue.assignee.photoUrl} size={36} ring={false} />
        <span className="min-w-0 flex-1 text-[14.5px] font-semibold">
          {t("issues.assignedTo", { name: issue.assignee.id === me ? t("issues.youOption", { name: issue.assignee.name }) : issue.assignee.name })}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 flex-none rounded-xl border border-st-border px-3.5 text-sm font-bold">
          {t("issues.change")}
        </button>
      </Panel>
    );
  }

  return (
    <Panel>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const who = issue.crew.find((m) => m.id === userId);
          if (!who) return;
          assign.mutate(
            { userId, note },
            {
              onSuccess: () => onDone({ tone: "ok", text: t("issues.assignedDone", { name: who.name }) }),
              onError: (err) => onDone({ tone: "bad", text: failure(err, t) }),
            },
          );
        }}
      >
        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[14.5px] font-bold">{t("issues.assignTo")}</legend>
          {issue.crew.length === 0 && <p className="m-0 text-[13.5px] text-st-text-2">{t("issues.noCrew")}</p>}
          {issue.crew.map((m) => (
            <label
              key={m.id}
              className={cx(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 has-focus-visible:outline-2 has-focus-visible:outline-st-text",
                userId === m.id ? "border-st-text bg-st-raised" : "border-st-border",
              )}
            >
              <input type="radio" name={`${id}-who`} value={m.id} checked={userId === m.id} onChange={() => setUserId(m.id)} className="sr-only" />
              <Avatar name={m.name} photoUrl={m.photoUrl} size={34} ring={false} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{m.id === me ? t("issues.youOption", { name: m.name }) : m.name}</span>
                <span className="block text-xs text-st-text-3">{t(m.role === "lead" ? "issues.roleLead" : "issues.roleValet")}</span>
              </span>
              {userId === m.id && <Icon name="check" size={20} strokeWidth={2.6} className="text-st-ok" />}
            </label>
          ))}
        </fieldset>
        {issue.crew.length > 0 && (
          <>
            <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold">
              {t("issues.assignNote")}
              <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={t("issues.assignNotePlaceholder")} className={cx(field, "min-h-[50px] font-normal")} />
            </label>
            <div className={cx("grid gap-2", issue.assignee ? "grid-cols-2" : "grid-cols-1")}>
              {issue.assignee && (
                <OutlineButton disabled={assign.isPending} onClick={() => setOpen(false)}>
                  {t("issues.cancel")}
                </OutlineButton>
              )}
              <button type="submit" disabled={assign.isPending || !userId || userId === issue.assignee?.id} className="min-h-14 rounded-2xl bg-st-cta px-4 text-base font-bold text-st-on-cta disabled:cursor-not-allowed disabled:opacity-60">
                {assign.isPending ? t("issues.saving") : t("issues.assignSave")}
              </button>
            </div>
          </>
        )}
      </form>
    </Panel>
  );
}

/** Per person, so it's cleared at sign-out and never shown to someone else on a shared phone. */
const draftKey = (userId: string | null | undefined, id: string) => personalKey(userId ?? "anonymous", `replyDraft.${id}`);

/** The reply to the resident, from the CBES office. What's typed is kept on this device until it's sent. */
export function ReplyPanel({ issue, onDone }: { issue: CrewIssueDetail; onDone: Done }) {
  const { t } = useStewardPreferences();
  const { userId } = useAuth();
  const reply = useReplyIssue(issue.id);
  const [body, setBody] = useState(() => {
    try {
      return localStorage.getItem(draftKey(userId, issue.id)) ?? "";
    } catch {
      return "";
    }
  });
  const id = useId();
  const name = issue.resident!.name;
  const canResolve = issue.status !== "resolved" && issue.status !== "closed";

  const keep = (text: string) => {
    setBody(text);
    try {
      if (text) localStorage.setItem(draftKey(userId, issue.id), text);
      else localStorage.removeItem(draftKey(userId, issue.id));
    } catch {
      // Not kept; it's only a draft.
    }
  };
  const send = (resolve: boolean) =>
    reply.mutate(
      { body: body.trim(), resolve },
      {
        onSuccess: () => {
          keep("");
          onDone({ tone: "ok", text: resolve ? t("issues.repliedResolved") : t("issues.replied", { name }) });
        },
        onError: (err) => onDone({ tone: "bad", text: failure(err, t) }),
      },
    );

  return (
    <Panel className={cx("flex flex-col gap-2", issue.needsReply && "outline-2 outline-st-bad")}>
      <label htmlFor={id} className="text-[14.5px] font-bold">
        {t("issues.replyTitle", { name })}
      </label>
      <textarea id={id} rows={4} maxLength={4000} value={body} onChange={(e) => keep(e.target.value)} aria-describedby={`${id}-hint`} className={cx(field, "resize-y")} />
      <p id={`${id}-hint`} className="m-0 text-xs text-st-text-3">
        {t("issues.replyHint")}
      </p>
      <div className="flex flex-wrap gap-2 *:min-w-40 *:flex-1 *:whitespace-nowrap">
        <OutlineButton disabled={reply.isPending || !body.trim()} onClick={() => send(false)}>
          {t("issues.replySend")}
        </OutlineButton>
        {canResolve && (
          <button type="button" disabled={reply.isPending || !body.trim()} onClick={() => send(true)} className={goButton}>
            {t("issues.replyResolve")}
          </button>
        )}
      </div>
    </Panel>
  );
}

