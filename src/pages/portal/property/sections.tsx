import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type PropertyHome, type Resolution, type ViolationRow } from "../../../lib/api";
import { serviceTime, unitLabel, whereLabel } from "../../../lib/format";
import { Pill, StatusBadge } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { Popover } from "../../../components/Popover";
import { ResolutionPicker } from "../../../components/portal/ResolutionPicker";
import { buttonClass } from "../../../components/styles";
import { useToast } from "../../../components/Toast";
import { ViolationThumb } from "../../violations/shared";

const panel = "overflow-hidden rounded-2xl border border-line bg-white";
const head = "flex flex-wrap items-center justify-between gap-2.5 border-b border-row-line px-5 py-4";
const small = buttonClass("secondary", "h-9! min-h-0! px-3.5! text-[13px]!");

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
/** "Marcus H." */
const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
const where = (building: string | null, unit: string | null) => whereLabel(building, unit);

/** The inline "Mark resolved" on the property home: how it was handled, then save (same API as the violation page). */
function MarkResolved({ v, onDone }: { v: ViolationRow; onDone: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api(`/portal/violations/${v.id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", resolution, note: note.trim() || undefined }) }),
    onSuccess: async () => {
      toast.success("Marked resolved.");
      await onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Popover
      label={`Mark V-${v.refNo} resolved`}
      align="end"
      width={300}
      portal
      trigger={(props) => (
        <button type="button" {...props} aria-label={`Mark resolved, V-${v.refNo}`} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-success px-3.5 text-[13px] font-bold text-white hover:opacity-90">
          <Icon name="check" size={15} strokeWidth={2.6} />
          Mark resolved
        </button>
      )}
    >
      {(close) => (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!resolution) return setError("Choose how you handled it.");
            if (resolution === "other" && !note.trim()) return setError("Tell CBES what you did.");
            save.mutate(undefined, { onSuccess: close });
          }}
        >
          <ResolutionPicker value={resolution} onChange={setResolution} name={`resolution-${v.id}`} />
          {resolution === "other" && (
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
              Note for CBES
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-y rounded-[10px] border border-field px-3 py-2 text-[14px] font-normal text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25" />
            </label>
          )}
          {error && (
            <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={save.isPending} className="h-10 rounded-[10px] bg-success text-[14px] font-bold text-white hover:opacity-90 disabled:opacity-60">
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </Popover>
  );
}

export function ViolationsToReview({ home, readOnly, onChanged, preview }: { home: PropertyHome; readOnly: boolean; onChanged: () => Promise<unknown>; preview: string }) {
  const list = home.violationsToReview;
  return (
    <section aria-labelledby="to-review-title" className={panel}>
      <div className={head}>
        <div>
          <h2 id="to-review-title" className="m-0 text-[19px]">
            Violations to review
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted">Sent by CBES. Send the resident a courtesy notice, then mark it resolved.</p>
        </div>
        <Link to={`/portal/violations?property=${home.property.id}`} className="text-[13.5px] font-bold no-underline hover:underline">
          All violations →
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="m-0 px-5 py-7 text-[14.5px] text-muted">No violations to review. Nice work.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {list.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-row-line px-5 py-3.5 last:border-b-0">
              <ViolationThumb area="portal" row={v} />
              <span className="min-w-0 flex-[1_1_240px]">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[14.5px]">{v.typeLabel}</strong>
                  {v.repeat && (
                    <Pill tone="navy" className="py-0.5! text-[11px]">
                      {ordinal(v.unitCount30d)} in {v.overwatchDays} days
                    </Pill>
                  )}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted">
                  {[`V-${v.refNo}`, where(v.building, v.unit), `logged ${serviceTime(v.loggedAt)} by ${shortName(v.valet.name)}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Link to={`/portal/violations/${v.id}${preview}`} aria-label={`Open V-${v.refNo}`} className={small}>
                Open
              </Link>
              {!readOnly && <MarkResolved v={v} onDone={onChanged} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ResidentIssues({ home }: { home: PropertyHome }) {
  return (
    <section aria-labelledby="issues-title" className={panel}>
      <div className={head}>
        <div>
          <h2 id="issues-title" className="m-0 text-[19px]">
            Resident issues
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted">Issues residents report from the QR code. CBES staff handle them within 24 hours; you can follow along.</p>
        </div>
        <Link to={`/portal/issues?property=${home.property.id}`} className="text-[13.5px] font-bold no-underline hover:underline">
          All issues →
        </Link>
      </div>
      {home.issues.length === 0 ? (
        <p className="m-0 px-5 py-7 text-[14.5px] text-muted">No resident issues yet. Residents report them from the QR code on their container.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {home.issues.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-row-line px-5 py-3.5 last:border-b-0">
              <span className="min-w-0 flex-[1_1_240px]">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[14.5px]">{i.issueLabel}</strong>
                  <StatusBadge kind="portalIssue" status={i.statusLabel} />
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{[`#${i.refNo}`, where(i.building, i.unit), serviceTime(i.createdAt)].filter(Boolean).join(" · ")}</span>
              </span>
              {i.quote && <span className="flex-[0_1_260px] text-[12.5px] text-muted">“{i.quote}”</span>}
              <Link to={`/portal/issues/${i.id}`} aria-label={`View #${i.refNo}`} className={small}>
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RepeatUnits({ home }: { home: PropertyHome }) {
  if (!home.repeatUnits.length) return null;
  const t = home.stats?.overwatchThreshold ?? { count: 3, days: 30 };
  return (
    <section aria-labelledby="repeat-title" className="rounded-2xl border border-line bg-white px-5 py-[18px]">
      <h2 id="repeat-title" className="m-0 flex flex-wrap items-center gap-2 text-[19px]">
        Repeat units
        <Pill tone="navy" className="py-0.5! text-[11px]">
          Overwatch · Phase 2
        </Pill>
      </h2>
      <p className="m-0 mt-0.5 text-[13px] text-muted">
        Units with {t.count} or more violations in {t.days} days. Soon you can put a unit on Overwatch and get an alert on every new violation.
      </p>
      <ul className="m-0 mt-3.5 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
        {home.repeatUnits.map((u) => (
          <li key={u.unit} className="flex flex-col gap-2 rounded-xl border border-line p-3.5">
            <span className="flex items-baseline justify-between gap-2">
              <strong className="font-heading text-[17px]">{unitLabel(u.unit)}</strong>
              <Pill tone="danger" className="py-0.5! text-[11.5px]">
                {u.count} in {t.days} days
              </Pill>
            </span>
            <span className="text-[12.5px] text-muted">{u.types}</span>
            <button type="button" disabled className="h-[34px] cursor-not-allowed rounded-[9px] border border-dashed border-placeholder bg-subtle text-[12.5px] font-bold text-navy-soft">
              Put on Overwatch · coming soon
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
