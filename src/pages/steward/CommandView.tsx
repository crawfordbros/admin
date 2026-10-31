import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, errorMessage } from "../../lib/api";
import { useAuthedImage } from "../../lib/images";
import { useCrewProfile } from "../../lib/steward/crew";
import { STATE_PILL, crewOrder, useCrewBoard, type CrewProperty } from "../../lib/steward/crew-board";
import { clockLabel, issueWhere, replyQueue, useIssue, useIssues, type CrewIssue } from "../../lib/steward/issues";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { clockTime, useTonight, wallTime } from "../../lib/steward/shifts";
import { serviceDateLabel } from "../../lib/steward/time";
import { typeName, useReview, useReviewAction, useSendAll, type CrewViolation } from "../../lib/steward/violations";
import { Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { DoorsBar } from "../../components/steward/crewParts";
import { dotClass, toneClass } from "../../lib/steward/crew-display";
import { useNearScreen } from "../../components/steward/useNearScreen";
import { cx } from "../../components/styles";
import { ReplyPanel } from "./IssueDetailPage";
import { useNow } from "./tonight/useNow";

type Message = { tone: "ok" | "bad"; text: string };

const column = "flex min-h-0 flex-col gap-2.5 overflow-y-auto rounded-[18px] bg-st-surface p-4";

/**
 * Screen 15, the tablet command view (docs/design/steward/Steward-Tablet): for a Steward on a screen
 * 1024 px or wider, Tonight shows the crew at each property, the review queue and the issue waiting on a
 * reply side by side. "My shift" opens the usual Tonight screen to check in or out.
 */
export function CommandView() {
  const { t, locale } = useStewardPreferences();
  const profile = useCrewProfile().data!;
  const tonight = useTonight();
  const now = useNow();
  const onShift = tonight.data?.onShift ?? null;

  return (
    <div className="flex h-[calc(100dvh-2rem)] min-h-[560px] flex-col gap-3.5 pt-[18px]">
      <header className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-bold tracking-[0.08em] text-st-accent uppercase">
            {serviceDateLabel(locale, new Date(now))} · {clockTime(now, locale)}
          </p>
          <h1 className="mt-0.5 mb-0 text-[26px] leading-tight font-bold">{profile.firstName ? t("command.title", { name: profile.firstName }) : t("command.titleNoName")}</h1>
        </div>
        <Link
          to="/steward?view=shift"
          className={cx(
            "flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold no-underline",
            onShift ? "bg-st-ok-bg text-st-ok hover:text-st-ok" : "border border-st-border text-st-text hover:text-st-text",
          )}
        >
          {onShift && <Icon name="check" size={18} strokeWidth={2.6} />}
          {onShift ? t("command.checkedIn", { property: onShift.propertyName, time: clockTime(onShift.checkedInAt, locale) }) : t("command.checkIn")}
        </Link>
        <Link to="/steward/violations/new" className="flex min-h-12 items-center gap-2 rounded-xl bg-st-cta px-[18px] text-[15px] font-bold text-st-on-cta no-underline hover:text-st-on-cta">
          <Icon name="camera" size={20} strokeWidth={2} />
          {t("tonight.logViolation")}
        </Link>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_1fr_1fr] gap-3.5 pb-4">
        <CrewColumn />
        <ReviewColumn />
        <IssueColumn />
      </div>
    </div>
  );
}

function CrewColumn() {
  const { t, locale } = useStewardPreferences();
  const board = useCrewBoard();
  return (
    <section aria-labelledby="command-crew" className={column}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="command-crew" className="m-0 text-base font-bold">
          {t("command.crew")}
        </h2>
        <Link to="/steward/crew" className="text-[13px] font-bold">
          {t("command.seeAll")}
        </Link>
      </div>
      {board.isPending && <p role="status" className="m-0 text-st-text-2">{t("app.loading")}</p>}
      {board.error && <Notice>{errorMessage(board.error)}</Notice>}
      {board.data?.properties.length === 0 && <p className="m-0 text-[13.5px] text-st-text-2">{t("crew.emptyBody")}</p>}
      {board.data?.properties.map((p) => <CrewCard key={p.id} property={p} locale={locale} />)}
    </section>
  );
}

function CrewCard({ property: p, locale }: { property: CrewProperty; locale: "en" | "es" }) {
  const { t } = useStewardPreferences();
  const started = useNow() >= Date.parse(p.startsAt);
  return (
    <Link to={`/steward/crew?p=${encodeURIComponent(p.id)}`} className="block rounded-[14px] bg-st-raised p-3 text-st-text no-underline hover:text-st-text">
      <span className="flex items-baseline justify-between gap-2">
        <strong className="truncate text-[14.5px]">{p.name}</strong>
        <span className="flex-none text-xs text-st-text-2">{started ? t("crew.doors", { done: p.doors.done, total: p.doors.total }) : t("crew.startsAt", { time: wallTime(p.startTime, locale) })}</span>
      </span>
      <DoorsBar doors={p.doors} className="my-2" />
      <span className="flex flex-wrap gap-2">
        {crewOrder(p.crew).map((m) => {
          const tone = STATE_PILL[m.state].tone;
          return (
            <span key={m.id} className={cx("flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold", toneClass(tone))}>
              <span aria-hidden="true" className={cx("size-2 rounded-full", dotClass(tone))} />
              {m.name.split(" ")[0]}
              {tone !== "ok" && ` · ${t(STATE_PILL[m.state].key)}`}
            </span>
          );
        })}
      </span>
    </Link>
  );
}

function ReviewColumn() {
  const { t } = useStewardPreferences();
  const review = useReview();
  const sendAll = useSendAll();
  // Sent rows stay where they were, marked Sent, so the list doesn't move under a finger (as on Review).
  const [sent, setSent] = useState<Map<string, CrewViolation>>(new Map());
  const [message, setMessage] = useState<Message | null>(null);
  const waiting = (review.data?.items ?? []).filter((v) => !sent.has(v.id));
  const items = [...waiting, ...sent.values()].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id));
  const markSent = (list: CrewViolation[]) => setSent((prev) => new Map([...prev, ...list.map((v) => [v.id, v] as const)]));

  return (
    <section aria-labelledby="command-review" className={column}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="command-review" className="m-0 text-base font-bold">
          {waiting.length ? t("command.reviewCount", { n: waiting.length }) : t("command.review")}
        </h2>
        {waiting.length > 1 && (
          <button
            type="button"
            disabled={sendAll.isPending}
            onClick={() =>
              sendAll.mutate(
                waiting.map((v) => v.id),
                {
                  onSuccess: (r) => { markSent(waiting); setMessage({ tone: "ok", text: t("review.sentAll", { n: r.sent }) }); },
                  onError: (err) => setMessage({ tone: "bad", text: errorMessage(err) }),
                },
              )
            }
            className="min-h-9 rounded-[10px] border border-st-accent px-3 text-[13px] font-bold"
          >
            {t("command.sendAll")}
          </button>
        )}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {review.isPending && <p role="status" className="m-0 text-st-text-2">{t("app.loading")}</p>}
      {review.error && <Notice>{errorMessage(review.error)}</Notice>}
      {review.isSuccess && items.length === 0 && <p className="m-0 text-[13.5px] text-st-text-2">{t("command.reviewEmpty")}</p>}
      {items.map((v) => (
        <ReviewRow key={v.id} v={v} sent={sent.has(v.id)} onSent={() => markSent([v])} onError={(text) => setMessage({ tone: "bad", text })} />
      ))}
      {items.length > 0 && (
        <Link to="/steward/review" className="mt-auto text-center text-[13px] font-bold">
          {t("command.seeAll")}
        </Link>
      )}
    </section>
  );
}

function ReviewRow({ v, sent, onSent, onError }: { v: CrewViolation; sent: boolean; onSent: () => void; onError: (text: string) => void }) {
  const { t, locale } = useStewardPreferences();
  const action = useReviewAction();
  const { ref, near } = useNearScreen<HTMLDivElement>();
  const path = near ? (v.photos[0] ?? null) : null;
  const photo = useAuthedImage(path, path);
  const type = typeName(v, locale);
  return (
    <div ref={ref} className="flex items-center gap-2.5 rounded-xl bg-st-raised p-2">
      <span className="flex size-14 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-st-track text-st-avatar-ink">
        {photo ? <img src={photo} alt={t("review.photoAlt", { unit: v.unit })} className="size-full object-cover" /> : <Icon name="camera" size={20} strokeWidth={1.6} />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{type}</strong>
        <span className="block truncate text-xs text-st-text-2">
          {v.propertyName} · {v.unit} · {v.valetName.split(" ")[0]}
        </span>
      </span>
      {sent ? (
        <span role="status" className="flex flex-none items-center gap-1 text-[13px] font-bold text-st-info">
          <Icon name="check" size={16} strokeWidth={2.4} />
          {t("status.sent")}
        </span>
      ) : (
        <button
          type="button"
          disabled={action.isPending}
          aria-label={t("command.sendLabel", { type, unit: v.unit })}
          onClick={() =>
            action.mutate(
              { id: v.id, action: "send" },
              { onSuccess: onSent, onError: (err) => onError(err instanceof ApiError && err.status === 409 ? t("review.alreadyDone") : errorMessage(err)) },
            )
          }
          className="min-h-10 flex-none rounded-[10px] bg-st-cta px-3 text-[13px] font-bold text-st-on-cta"
        >
          {t("command.send")}
        </button>
      )}
    </div>
  );
}

function IssueColumn() {
  const { t } = useStewardPreferences();
  const issues = useIssues("todo");
  const queue = replyQueue(issues.data?.items ?? []);
  const [index, setIndex] = useState(0);
  // Kept here: a reply that resolves the issue moves it out of To do, and the next one takes its place.
  const [message, setMessage] = useState<Message | null>(null);
  const at = Math.min(index, Math.max(0, queue.length - 1));
  const current = queue[at];

  return (
    <section aria-labelledby="command-issue" className={column}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="command-issue" className="m-0 text-base font-bold">
          {t("command.issue")}
        </h2>
        {queue.length > 1 && (
          <span className="flex items-center gap-1">
            <button type="button" aria-label={t("command.prevIssue")} disabled={at === 0} onClick={() => setIndex(at - 1)} className="flex size-9 items-center justify-center rounded-[10px] border border-st-border disabled:opacity-40">
              <Icon name="back" size={16} strokeWidth={2.4} />
            </button>
            <span className="text-xs whitespace-nowrap text-st-text-2">{t("command.issueOf", { n: at + 1, total: queue.length })}</span>
            <button type="button" aria-label={t("command.nextIssue")} disabled={at >= queue.length - 1} onClick={() => setIndex(at + 1)} className="flex size-9 items-center justify-center rounded-[10px] border border-st-border disabled:opacity-40">
              <Icon name="chevron" size={16} strokeWidth={2.4} />
            </button>
          </span>
        )}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {issues.isPending && <p role="status" className="m-0 text-st-text-2">{t("app.loading")}</p>}
      {issues.error && <Notice>{errorMessage(issues.error)}</Notice>}
      {issues.isSuccess && !current && (
        <div>
          <h3 className="m-0 text-[14.5px] font-bold">{t("command.issueEmptyTitle")}</h3>
          <p className="mt-0.5 mb-0 text-[13.5px] text-st-text-2">{t("command.issueEmptyBody")}</p>
        </div>
      )}
      {current && <IssueReply key={current.id} issue={current} onDone={setMessage} />}
    </section>
  );
}

function IssueReply({ issue: i, onDone }: { issue: CrewIssue; onDone: (m: Message) => void }) {
  const { t, locale } = useStewardPreferences();
  const detail = useIssue(i.id);
  const clock = clockLabel(i);
  const d = detail.data;
  return (
    <>
      <Link to={`/steward/issues/${i.id}`} className="flex flex-col gap-1.5 rounded-[14px] bg-st-raised p-3 text-st-text no-underline hover:text-st-text">
        <span className="flex items-baseline justify-between gap-2">
          <strong className="text-[14.5px]">
            #{i.refNo} {typeName(i, locale)}
          </strong>
          {clock && <span className={cx("flex-none text-xs font-bold", clock.hot ? (i.needsReply ? "text-st-bad" : "text-st-warn") : "text-st-text-2")}>{t(clock.key, clock.vars)}</span>}
        </span>
        <span className="text-[12.5px] text-st-text-2">
          {issueWhere(i, t)}
          {i.assignee && ` · ${t("command.assignedTo", { name: i.assignee.name.split(" ")[0] })}`}
        </span>
        {i.description && <span className="mt-1 text-[13.5px]">“{i.description}”</span>}
        {i.status === "resolved" && i.lastChange?.toStatus === "resolved" && i.lastChange.actorName && (
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-st-ok">
            <Icon name="check" size={14} strokeWidth={2.6} />
            {t("command.fixedBy", { name: i.lastChange.actorName.split(" ")[0] })}
          </span>
        )}
        <span className="sr-only">{t("command.openIssue")}</span>
      </Link>
      {d?.resident && !d.resident.canEmail && <Notice tone="warn">{t("issues.phoneOnly", { name: d.resident.name })}</Notice>}
      {d?.can.reply && d.resident?.canEmail && <ReplyPanel issue={d} onDone={onDone} />}
    </>
  );
}
