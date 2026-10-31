import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuthedImage } from "../../lib/images";
import { useOutbox } from "../../lib/steward/outbox";
import { useStewardPreferences } from "../../lib/steward/preferences";
import type { QueuedViolation } from "../../lib/steward/queue";
import { whenLabel } from "../../lib/steward/shifts";
import { STATUS_KEY, typeName, useMyViolations, type Range } from "../../lib/steward/violations";
import { Icon } from "../../components/steward/icons";
import { BottomAction, CtaLink, EmptyState, ScreenHeader, Segmented } from "../../components/steward/ui";
import { cx } from "../../components/styles";
import { useNearScreen } from "../../components/steward/useNearScreen";
import { useScreenTitle } from "./useScreenTitle";

const PILL: Record<string, string> = {
  waiting: "bg-st-warn-bg text-st-warn",
  failed: "bg-st-bad-bg text-st-bad",
  new: "bg-st-raised text-st-text-2",
  in_review: "bg-st-warn-bg text-st-warn",
  sent: "bg-st-info-bg text-st-info",
  resolved: "bg-st-ok-bg text-st-ok",
  dismissed: "bg-st-raised text-st-text-3",
};

/**
 * Screen 10, My violations (docs/design/steward/Steward-Violations): what you logged with its status and
 * notes from your Steward or CBES, newest first. Ones still on the phone show first as Waiting to sync.
 */
export function ViolationsPage() {
  const { t, locale } = useStewardPreferences();
  const { state } = useLocation() as { state: { saved?: { type: string; unit: string; offline: boolean } } | null };
  const [range, setRange] = useState<Range>("tonight");
  const list = useMyViolations(range);
  const outbox = useOutbox();
  const waiting = outbox.items.filter((i): i is QueuedViolation => i.kind === "violation");
  const pending = waiting.filter((i) => !i.failed);
  useScreenTitle(t("violations.title"));

  const when = (iso: string) => whenLabel(iso, locale, t("violations.tonight"));

  return (
    <>
      {state?.saved && (
        <p role="status" className="mt-3 mb-0 flex items-center gap-2.5 rounded-[14px] bg-st-ok-bg px-3.5 py-3 text-sm">
          <Icon name="check" size={20} strokeWidth={2.6} className="flex-none text-st-ok" />
          <span>{t(state.saved.offline ? "violations.savedOffline" : "violations.saved", { type: state.saved.type, unit: state.saved.unit })}</span>
        </p>
      )}
      <ScreenHeader title={t("violations.title")} />
      <div className="flex flex-col gap-3 pt-1">
        <Segmented<Range>
          label={t("violations.range")}
          value={range}
          onChange={setRange}
          options={[
            { value: "tonight", label: t("violations.tonight") },
            { value: "week", label: t("violations.week") },
            { value: "all", label: t("violations.all") },
          ]}
        />
        {pending.length > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl bg-st-warn-bg px-3 py-2.5 text-[13px] font-bold text-st-warn">
            <Icon name="sync" size={18} strokeWidth={2.2} className="flex-none" />
            <span className="flex-1">{t("violations.waiting", { n: pending.length })}</span>
            <button type="button" onClick={() => void outbox.flush()} className="min-h-9 rounded-lg border border-current px-2.5 text-[12.5px] font-bold">
              {t("violations.retry")}
            </button>
          </div>
        )}

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {waiting.map((item) => (
            <Row
              key={item.id}
              thumb={<LocalThumb blob={item.photos[0]?.blob} />}
              title={t("violations.row", { type: typeName({ label: item.summary.typeLabel, labelEs: item.summary.typeLabelEs }, locale), unit: item.summary.unit })}
              sub={item.summary.building ? t("violations.when", { when: when(item.data.loggedAt), building: item.summary.building }) : when(item.data.loggedAt)}
              note={item.failed ? `${t("violations.failedTitle")}: ${item.failed}` : null}
              status={item.failed ? "failed" : "waiting"}
              statusLabel={t(item.failed ? "status.failed" : "status.waiting")}
              action={
                item.failed ? (
                  <button type="button" onClick={() => void outbox.remove(item.id)} className="min-h-9 text-[12.5px] font-bold text-st-bad underline underline-offset-3">
                    {t("violations.remove")}
                  </button>
                ) : null
              }
            />
          ))}
          {(list.data ?? []).map((v) => (
            <Row
              key={v.id}
              thumb={<RemoteThumb path={v.photos[0] ?? null} />}
              title={t("violations.row", { type: typeName(v, locale), unit: v.unit })}
              sub={v.building ? t("violations.when", { when: when(v.loggedAt), building: v.building }) : when(v.loggedAt)}
              note={v.latestNote ? `${t("violations.noteFrom", { name: v.latestNote.authorName })}: ${v.latestNote.body}` : null}
              status={v.status}
              statusLabel={t(STATUS_KEY[v.status])}
            />
          ))}
        </ul>
        {list.isSuccess && list.data.length === 0 && waiting.length === 0 && (
          range === "all" ? <EmptyState icon="violations" title={t("violations.emptyTitle")} body={t("violations.emptyBody")} /> : <p className="m-0 text-sm text-st-text-2">{t("violations.emptyRange")}</p>
        )}
        {list.isPending && <p role="status" className="m-0 text-st-text-2">{t("app.loading")}</p>}
      </div>
      <BottomAction>
        <CtaLink to="/steward/violations/new" icon="camera">
          {t("violations.logAnother")}
        </CtaLink>
      </BottomAction>
    </>
  );
}

function Row({
  thumb,
  title,
  sub,
  note,
  status,
  statusLabel,
  action,
}: {
  thumb: ReactNode;
  title: string;
  sub: string;
  note: string | null;
  status: string;
  statusLabel: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[14px] bg-st-surface px-3 py-2.5">
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[12.5px] text-st-text-2">{sub}</span>
        {note && (
          <span className="mt-1 flex items-start gap-1.5 text-xs font-bold text-st-accent">
            <Icon name="issues" size={13} strokeWidth={2.2} className="mt-0.5 flex-none" />
            {note}
          </span>
        )}
        {action}
      </span>
      <span className={cx("flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold", PILL[status])}>{statusLabel}</span>
    </li>
  );
}

const thumbClass = "flex size-14 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-st-track text-st-avatar-ink";

function RemoteThumb({ path }: { path: string | null }) {
  const { ref, near } = useNearScreen<HTMLSpanElement>();
  const src = useAuthedImage(near ? path : null, near ? path : null);
  return <span ref={ref} className={thumbClass}>{src ? <img src={src} alt="" className="size-full object-cover" /> : <Icon name="camera" size={20} strokeWidth={1.6} />}</span>;
}

function LocalThumb({ blob }: { blob: Blob | undefined }) {
  const [src] = useState(() => (blob ? URL.createObjectURL(blob) : null));
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);
  return <span className={thumbClass}>{src ? <img src={src} alt="" className="size-full object-cover" /> : <Icon name="camera" size={20} strokeWidth={1.6} />}</span>;
}

