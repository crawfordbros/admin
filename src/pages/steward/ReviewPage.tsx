import { useId, useState } from "react";
import { ApiError, errorMessage } from "../../lib/api";
import { useAuthedImage } from "../../lib/images";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { clockTime } from "../../lib/steward/shifts";
import {
  ordinal,
  typeName,
  useReview,
  useReviewAction,
  useReviewNote,
  useSendAll,
  type CrewViolation,
} from "../../lib/steward/violations";
import { Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import {
  Avatar,
  BottomAction,
  EmptyState,
  ScreenHeader,
} from "../../components/steward/ui";
import { cx } from "../../components/styles";
import { useNearScreen } from "../../components/steward/useNearScreen";
import { useScreenTitle } from "./useScreenTitle";

const WEAK_GPS_M = 25;

/**
 * Screen 11, Review (docs/design/steward/Steward-Review): the Steward checks each new violation from their
 * crew and sends it to the property, or holds it for a CBES admin. Only admins dismiss.
 */
export function ReviewPage() {
  const { t } = useStewardPreferences();
  const review = useReview();
  const sendAll = useSendAll();
  const [message, setMessage] = useState<{
    tone: "ok" | "bad";
    text: string;
  } | null>(null);
  // Reviewed cards stay where they were, showing what happened, so the list never jumps under a finger
  // between taps. They're gone the next time Review opens.
  const [reviewed, setReviewed] = useState<
    Map<string, { item: CrewViolation; status: "sent" | "in_review" }>
  >(new Map());
  useScreenTitle(t("review.title"));
  const waiting = (review.data?.items ?? []).filter((i) => !reviewed.has(i.id));
  const items = [...waiting, ...[...reviewed.values()].map((r) => r.item)].sort(
    (a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id),
  );
  const properties = new Set(items.map((i) => i.propertyId)).size;
  const markReviewed = (list: CrewViolation[], status: "sent" | "in_review") =>
    setReviewed(
      (prev) =>
        new Map([
          ...prev,
          ...list.map((item) => [item.id, { item, status }] as const),
        ]),
    );

  return (
    <>
      <ScreenHeader
        eyebrow={
          properties > 1
            ? t("review.eyebrowCount", { n: properties })
            : t("review.eyebrow")
        }
        title={t("review.title")}
        intro={t("review.intro")}
      />
      <div className="flex flex-col gap-3 pt-2">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {review.isPending && (
          <p role="status" className="m-0 text-st-text-2">
            {t("app.loading")}
          </p>
        )}
        {review.error && <Notice>{errorMessage(review.error)}</Notice>}
        {review.isSuccess && items.length === 0 && (
          <EmptyState
            icon="review"
            title={t("review.emptyTitle")}
            body={t("review.emptyBody")}
          />
        )}
        {items.map((v) => (
          <ReviewCard
            key={v.id}
            v={v}
            threshold={review.data!.threshold}
            result={reviewed.get(v.id)?.status}
            onReviewed={(status) => markReviewed([v], status)}
            onDone={setMessage}
          />
        ))}
        {items.length > 0 && (
          <p className="m-0 text-center text-[13px] text-st-text-3">
            {t("review.adminsDismiss")}
          </p>
        )}
      </div>
      {waiting.length > 1 && (
        <BottomAction>
          <button
            type="button"
            disabled={sendAll.isPending}
            onClick={() =>
              sendAll.mutate(
                waiting.map((i) => i.id),
                {
                  onSuccess: (r) => {
                    markReviewed(waiting, "sent");
                    setMessage({
                      tone: "ok",
                      text: t("review.sentAll", { n: r.sent }),
                    });
                  },
                  onError: (err) =>
                    setMessage({ tone: "bad", text: errorMessage(err) }),
                },
              )
            }
            className="min-h-14 w-full rounded-[14px] border-2 border-st-accent bg-st-bg text-[15.5px] font-bold"
          >
            {sendAll.isPending
              ? t("review.sending")
              : t("review.sendAll", { n: waiting.length })}
          </button>
        </BottomAction>
      )}
    </>
  );
}

function ReviewCard({
  v,
  threshold,
  result,
  onReviewed,
  onDone,
}: {
  v: CrewViolation;
  threshold: { count: number; days: number };
  result?: "sent" | "in_review";
  onReviewed: (status: "sent" | "in_review") => void;
  onDone: (m: { tone: "ok" | "bad"; text: string }) => void;
}) {
  const { t, locale } = useStewardPreferences();
  const action = useReviewAction();
  const note = useReviewNote();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const noteId = useId();
  // Photos load as cards come near the screen, so a long queue doesn't download every photo at once.
  const { ref, near } = useNearScreen<HTMLElement>();
  const path = near ? (v.photos[0] ?? null) : null;
  const photo = useAuthedImage(path, path);
  const first = v.valetName.split(" ")[0];
  const weak = !v.hasGps || (v.gpsAccuracyM ?? 0) > WEAK_GPS_M;
  const repeat = v.unitCount >= threshold.count;

  const act = (kind: "send" | "hold") =>
    action.mutate(
      { id: v.id, action: kind },
      {
        onSuccess: () => {
          onReviewed(kind === "send" ? "sent" : "in_review");
          onDone({
            tone: "ok",
            text:
              kind === "send"
                ? t("review.sentOne", { property: v.propertyName })
                : t("review.heldOne"),
          });
        },
        onError: (err) =>
          onDone({
            tone: "bad",
            text:
              err instanceof ApiError && err.status === 409
                ? t("review.alreadyDone")
                : errorMessage(err),
          }),
      },
    );

  return (
    <article
      ref={ref}
      aria-label={`${typeName(v, locale)}, ${v.unit}`}
      className="flex flex-col gap-2.5 rounded-2xl bg-st-surface p-3"
    >
      <div className="flex gap-3">
        <span className="flex size-24 flex-none items-center justify-center overflow-hidden rounded-xl bg-st-track text-st-avatar-ink">
          {photo ? (
            <img
              src={photo}
              alt={t("review.photoAlt", { unit: v.unit })}
              className="size-full object-cover"
            />
          ) : (
            <Icon name="camera" size={26} strokeWidth={1.6} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <strong className="text-base">{typeName(v, locale)}</strong>
          <span className="text-[13px] text-st-text-2">
            {v.building
              ? t("review.where", {
                  property: v.propertyName,
                  building: v.building,
                  unit: v.unit,
                })
              : t("review.whereNoBuilding", {
                  property: v.propertyName,
                  unit: v.unit,
                })}
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px]">
            <Avatar
              name={v.valetName}
              photoUrl={v.valetPhotoUrl}
              size={22}
              ring={false}
            />
            {v.valetName} · {clockTime(v.loggedAt, locale)}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                weak ? "bg-st-warn-bg text-st-warn" : "bg-st-ok-bg text-st-ok",
              )}
            >
              {!v.hasGps
                ? t("log.gpsNone")
                : weak
                  ? t("log.gpsWeak", { m: v.gpsAccuracyM ?? 0 })
                  : t("log.gps", { m: v.gpsAccuracyM ?? 0 })}
            </span>
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                repeat
                  ? "bg-st-bad-bg text-st-bad"
                  : "bg-st-raised text-st-text-2",
              )}
            >
              {t("review.ordinal", {
                n: ordinal(v.unitCount, locale),
                days: threshold.days,
              })}
            </span>
          </span>
        </div>
      </div>
      {v.note && (
        <p className="m-0 rounded-[10px] bg-st-raised px-2.5 py-2 text-[13px]">
          “{v.note}”
        </p>
      )}
      {result ? (
        <p
          role="status"
          className={cx(
            "m-0 flex min-h-[50px] items-center justify-center gap-2 rounded-xl text-sm font-bold",
            result === "sent"
              ? "bg-st-info-bg text-st-info"
              : "bg-st-warn-bg text-st-warn",
          )}
        >
          <Icon name="check" size={18} strokeWidth={2.4} />
          {t(result === "sent" ? "status.sent" : "review.held")}
        </p>
      ) : (
        <div className="grid grid-cols-[1.4fr_1fr_48px] gap-2">
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => act("send")}
            className="min-h-[50px] rounded-xl bg-st-cta text-[14.5px] font-bold text-st-on-cta"
          >
            {t("review.send")}
          </button>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => act("hold")}
            className="min-h-[50px] rounded-xl border border-st-border text-sm font-bold"
          >
            {t("review.hold")}
          </button>
          <button
            type="button"
            aria-label={t("review.noteLabel", { name: first })}
            aria-expanded={writing}
            onClick={() => setWriting((w) => !w)}
            className="flex min-h-[50px] items-center justify-center rounded-xl border border-st-border"
          >
            <Icon name="issues" size={20} strokeWidth={2} />
          </button>
        </div>
      )}
      {writing && !result && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            note.mutate(
              { id: v.id, body: text.trim() },
              {
                onSuccess: () => {
                  setText("");
                  setWriting(false);
                  onDone({
                    tone: "ok",
                    text: t("review.noteSent", { name: first }),
                  });
                },
                onError: (err) =>
                  onDone({ tone: "bad", text: errorMessage(err) }),
              },
            );
          }}
          className="flex flex-col gap-1.5"
        >
          <label htmlFor={noteId} className="text-[13px] font-semibold">
            {t("review.noteField", { name: first })}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${noteId}-hint`}
            className="rounded-xl border border-st-border bg-st-raised px-3 py-2 text-base text-st-text focus:border-2 focus:border-st-text focus:outline-none"
          />
          <p id={`${noteId}-hint`} className="m-0 text-xs text-st-text-3">
            {t("review.noteHint")}
          </p>
          <button
            type="submit"
            disabled={note.isPending || !text.trim()}
            className="min-h-11 self-start rounded-xl bg-st-cta px-4 text-sm font-bold text-st-on-cta disabled:opacity-60"
          >
            {t("review.noteSend")}
          </button>
        </form>
      )}
    </article>
  );
}
