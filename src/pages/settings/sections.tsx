import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi, type Day, type OverwatchRule, type ReplyTarget } from "../../lib/api";
import { clockLabel, nyToday } from "../../lib/format";
import { Pill } from "../../components/display";
import { Switch } from "../../components/controls";
import { Icon } from "../../components/icons";
import { Button, SelectField, TextField } from "../../components/ui";
import { cx } from "../../components/styles";
import { DAYS, holidayNote, move, type Draft, type IssueRow, type ViolationRow } from "./model";

const field = "h-[38px] w-full rounded-[9px] border border-line bg-white px-2.5 text-[14px] text-ink focus:border-navy focus:ring-2 focus:ring-navy/25 focus:outline-none aria-[invalid=true]:border-danger";
const addButton = "inline-flex h-[38px] items-center gap-1.5 self-start rounded-[10px] border border-dashed border-placeholder bg-white px-3 text-[13px] font-bold text-navy hover:bg-tint-2";

export function SettingsSection({
  id,
  title,
  description,
  changed,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  changed?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-36 rounded-[14px] border border-line bg-white p-5 sm:p-[22px]">
      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="m-0 text-[19px] text-navy-ink">
            {title}
          </h2>
          {description && <p className="mt-1 mb-0 text-[13.5px] text-muted">{description}</p>}
        </div>
        <div className="flex items-start gap-2">
          {changed && <Pill tone="warning">Changed</Pill>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function ListError({ children }: { children: ReactNode }) {
  return <p className="m-0 mb-3 rounded-lg bg-danger-bg px-3.5 py-2.5 text-[13.5px] font-semibold text-danger">{children}</p>;
}

/** Waits until `value` stops changing for `ms` before passing it on. */
function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

// ---- Overwatch threshold

const WINDOWS = [14, 30, 60, 90] as const;

export function OverwatchSection({ value, onChange, changed }: { value: OverwatchRule; onChange: (v: OverwatchRule) => void; changed: boolean }) {
  const api = useApi();
  const rule = useDebounced(value);
  const preview = useQuery({
    queryKey: ["admin", "settings", "overwatch-preview", rule],
    queryFn: () => api<{ units: number; properties: number }>(`/admin/settings/overwatch-preview?count=${rule.count}&days=${rule.days}&countDismissed=${rule.countDismissed ? 1 : 0}`),
    placeholderData: (p) => p,
  });
  const windowId = useId();
  const set = (patch: Partial<OverwatchRule>) => onChange({ ...value, ...patch });
  const stepper = "flex h-[46px] w-11 items-center justify-center bg-tint-2 text-[20px] font-bold text-navy hover:bg-tint disabled:cursor-not-allowed disabled:text-placeholder";
  const p = preview.data;

  return (
    <SettingsSection id="overwatch" title="Overwatch threshold" description="When a unit is flagged. Used on violations and weekly reports now, and by Overwatch in Phase 2." changed={changed}>
      <div className="flex flex-wrap items-center gap-3 text-[16px] font-semibold">
        <span>Flag a unit after</span>
        <span role="group" aria-label="Number of violations" data-repeatable className="inline-flex items-center overflow-hidden rounded-xl border-[1.5px] border-navy">
          <button type="button" aria-label="Fewer violations" className={stepper} disabled={value.count <= 2} onClick={() => set({ count: value.count - 1 })}>
            −
          </button>
          <output aria-live="polite" className="w-[52px] text-center font-heading text-[22px] font-bold text-navy-ink">
            {value.count}
          </output>
          <button type="button" aria-label="More violations" className={stepper} disabled={value.count >= 10} onClick={() => set({ count: value.count + 1 })}>
            +
          </button>
        </span>
        <span>violations within</span>
        <label htmlFor={windowId} className="sr-only">
          Time window
        </label>
        <select
          id={windowId}
          value={value.days}
          onChange={(e) => set({ days: Number(e.target.value) as OverwatchRule["days"] })}
          className="h-[46px] rounded-xl border-[1.5px] border-navy bg-white px-3 text-[16px] font-bold text-navy-ink focus:ring-2 focus:ring-navy/25 focus:outline-none"
        >
          {WINDOWS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-subtle px-3.5 py-3 text-[13.5px]">
        <Icon name="eye" size={18} className="flex-none text-navy" />
        <span aria-live="polite" className="min-w-0 flex-[1_1_260px]">
          {p ? (
            <>
              With these settings, <strong>{p.units === 1 ? "1 unit" : `${p.units} units`}</strong> across {p.properties === 1 ? "1 property" : `${p.properties} properties`}{" "}
              {p.units === 1 ? "is" : "are"} flagged today.
            </>
          ) : preview.isError ? (
            "The preview couldn't be loaded. Saving still works."
          ) : (
            "Counting flagged units…"
          )}
        </span>
        <label className="ml-auto flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={value.countDismissed} onChange={(e) => set({ countDismissed: e.target.checked })} className="size-[18px] accent-navy" />
          Count dismissed violations
        </label>
      </div>
    </SettingsSection>
  );
}

// ---- Reorderable rows (issue types)

/**
 * A drag handle that also reorders from the keyboard: focus it and press the up or down arrow.
 * The parent moves focus back to the handle after the row moves (see `useFocusAfterRender`).
 */
function ReorderHandle({ label, index, count, onMove, onArm, helpId }: { label: string; index: number; count: number; onMove: (by: number) => void; onArm: (armed: boolean) => void; helpId: string }) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${label || "new issue type"}, position ${index + 1} of ${count}`}
      aria-describedby={helpId}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onMove(e.key === "ArrowUp" ? -1 : 1);
        }
      }}
      onPointerDown={() => onArm(true)}
      onPointerUp={() => onArm(false)}
      className="flex size-8 cursor-grab items-center justify-center rounded-md text-placeholder hover:bg-tint-2 hover:text-navy active:cursor-grabbing"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        {[6, 12, 18].map((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
      </svg>
    </button>
  );
}

/**
 * Focuses an element once the next render is on screen, for example the handle of a row that just
 * moved (React re-inserts the row, which drops focus) or the first field of a row just added.
 */
function useFocusAfterRender() {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!pending.current) return;
    document.querySelector<HTMLElement>(pending.current)?.focus();
    pending.current = null;
  });
  return (selector: string) => {
    pending.current = selector;
  };
}

const TARGETS: ReplyTarget[] = [4, 12, 24, 48];
let newRow = 0;

export function IssueTypesSection({ rows, onChange, errors, changed }: { rows: IssueRow[]; onChange: (rows: IssueRow[]) => void; errors: Record<string, string>; changed: boolean }) {
  const helpId = useId();
  const [announce, setAnnounce] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const focusLater = useFocusAfterRender();

  const update = (id: string, patch: Partial<IssueRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const moveRow = (index: number, by: number) => {
    const next = move(rows, index, by);
    if (next === rows) return;
    onChange(next);
    focusLater(`[data-handle="${CSS.escape(rows[index].id)}"] button`);
    setAnnounce(`${rows[index].label || "New issue type"} moved to position ${index + by + 1} of ${rows.length}`);
  };
  const add = () => {
    const id = `new-${++newRow}`;
    onChange([...rows, { id, key: "", label: "", labelEs: null, replyTargetHours: 24, onForm: true, used: false }]);
    focusLater(`[data-row="${id}"] input`);
  };

  return (
    <SettingsSection
      id="issues"
      title="Resident issue types"
      description="What residents choose on the Report an Issue form. Drag or use the arrow keys to reorder. Turn a type off to take it off the form; it stays on past issues."
      changed={changed}
      action={
        <button type="button" onClick={add} className={addButton}>
          <Icon name="plus" size={15} strokeWidth={2.4} />
          Add issue type
        </button>
      }
    >
      {errors.issueTypes && <ListError>{errors.issueTypes}</ListError>}
      <p id={helpId} className="sr-only">
        Press the up or down arrow key to move this issue type.
      </p>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-muted">
              <th className="w-9 px-1.5 py-2">
                <span className="sr-only">Order</span>
              </th>
              <th className="px-1.5 py-2 font-semibold">Label</th>
              <th className="px-1.5 py-2 font-semibold">Spanish</th>
              <th className="px-1.5 py-2 font-semibold">Reply target</th>
              <th className="px-1.5 py-2 font-semibold">On form</th>
              <th className="w-9 px-1.5 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const error = errors[`issue:${t.id}`];
              return (
                <tr
                  key={t.id}
                  data-row={t.id}
                  draggable={armed === t.id}
                  onDragStart={(e) => {
                    setDragging(t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setArmed(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragging || dragging === t.id) return;
                    e.preventDefault();
                    const from = rows.findIndex((r) => r.id === dragging);
                    onChange(move(rows, from, i - from));
                  }}
                  onDrop={(e) => e.preventDefault()}
                  className={cx("border-t border-row-line align-top", dragging === t.id && "bg-tint-2", !t.onForm && "text-muted")}
                >
                  <td className="px-1.5 py-2" data-handle={t.id}>
                    <ReorderHandle label={t.label} index={i} count={rows.length} onMove={(by) => moveRow(i, by)} onArm={(on) => setArmed(on ? t.id : null)} helpId={helpId} />
                  </td>
                  <td className="px-1.5 py-2">
                    <input
                      type="text"
                      aria-label="Label"
                      value={t.label}
                      maxLength={60}
                      onChange={(e) => update(t.id, { label: e.target.value })}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `issue-error-${t.id}` : undefined}
                      className={cx(field, "font-semibold")}
                    />
                    {error && (
                      <p id={`issue-error-${t.id}`} className="m-0 mt-1 text-[12.5px] font-semibold text-danger">
                        {error}
                      </p>
                    )}
                  </td>
                  <td className="px-1.5 py-2">
                    <input type="text" aria-label="Spanish label" value={t.labelEs ?? ""} maxLength={80} onChange={(e) => update(t.id, { labelEs: e.target.value || null })} className={cx(field, "text-muted")} />
                  </td>
                  <td className="px-1.5 py-2">
                    <select aria-label="Reply target" value={t.replyTargetHours} onChange={(e) => update(t.id, { replyTargetHours: Number(e.target.value) as ReplyTarget })} className={cx(field, "w-auto px-2")}>
                      {TARGETS.map((h) => (
                        <option key={h} value={h}>
                          {h} hours
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-2 pt-[15px]">
                    <Switch checked={t.onForm} onChange={(on) => update(t.id, { onForm: on })} label="Show on form" />
                  </td>
                  <td className="px-1.5 py-2">
                    {!t.key && (
                      <button type="button" aria-label="Remove new issue type" onClick={() => onChange(rows.filter((r) => r.id !== t.id))} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-danger-bg hover:text-danger">
                        <Icon name="x" size={15} strokeWidth={2.4} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}

// ---- Violation types

export function ViolationTypesSection({ rows, onChange, errors, changed }: { rows: ViolationRow[]; onChange: (rows: ViolationRow[]) => void; errors: Record<string, string>; changed: boolean }) {
  const focusLater = useFocusAfterRender();
  const update = (id: string, patch: Partial<ViolationRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    const id = `new-${++newRow}`;
    onChange([...rows, { id, key: "", label: "", labelEs: null, active: true, countsForOverwatch: true, thisMonth: 0, used: false }]);
    focusLater(`[data-card="${id}"] input`);
  };

  return (
    <SettingsSection
      id="violations"
      title="Violation types"
      description="The buttons valets see in the app, in this order. Each counts toward Overwatch unless it's set to log only."
      changed={changed}
      action={
        <button type="button" onClick={add} className={addButton}>
          <Icon name="plus" size={15} strokeWidth={2.4} />
          Add violation type
        </button>
      }
    >
      {errors.violationTypes && <ListError>{errors.violationTypes}</ListError>}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-0">
        {rows.map((v) => {
          const error = errors[`violation:${v.id}`];
          return (
            <li key={v.id} data-card={v.id} className={cx("flex flex-col gap-2 rounded-xl border p-3.5", v.active ? "border-line bg-white" : "border-dashed border-field bg-subtle")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    aria-label="Violation label"
                    value={v.label}
                    maxLength={60}
                    onChange={(e) => update(v.id, { label: e.target.value })}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `violation-error-${v.id}` : undefined}
                    className={cx(field, "h-9 font-bold")}
                  />
                  {error && (
                    <p id={`violation-error-${v.id}`} className="m-0 mt-1 text-[12.5px] font-semibold text-danger">
                      {error}
                    </p>
                  )}
                </div>
                <span className="pt-1.5">
                  <Switch checked={v.active} onChange={(on) => update(v.id, { active: on })} label={`${v.label || "New violation type"} active`} />
                </span>
              </div>
              <input type="text" aria-label="Spanish label" value={v.labelEs ?? ""} maxLength={80} onChange={(e) => update(v.id, { labelEs: e.target.value || null })} placeholder="Spanish label" className={cx(field, "h-8 text-[13px] text-muted")} />
              <div className="flex flex-wrap items-center gap-1.5">
                <label
                  className={cx(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-bold has-focus-visible:ring-2 has-focus-visible:ring-navy",
                    v.countsForOverwatch ? "bg-danger-bg text-danger" : "bg-neutral-bg text-muted",
                  )}
                >
                  <input type="checkbox" checked={v.countsForOverwatch} onChange={(e) => update(v.id, { countsForOverwatch: e.target.checked })} className="sr-only" />
                  <Icon name={v.countsForOverwatch ? "check" : "x"} size={12} strokeWidth={3} />
                  Counts for Overwatch
                </label>
                {!v.countsForOverwatch && <span className="text-[11.5px] font-bold text-muted">Log only</span>}
                {v.key && <Pill tone="neutral" className="px-2! py-[3px]! text-[11.5px]!">{v.thisMonth} this month</Pill>}
                {!v.key && (
                  <button type="button" onClick={() => onChange(rows.filter((r) => r.id !== v.id))} className="ml-auto text-[12.5px] font-bold text-danger hover:underline">
                    Remove
                  </button>
                )}
              </div>
              {!v.active && <p className="m-0 text-[12.5px] text-muted">Hidden from the valet app</p>}
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
}

// ---- Service nights and holidays

const START_TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function CalendarSection({
  calendar,
  holidays,
  onCalendar,
  onHolidays,
  errors,
  changed,
}: {
  calendar: Draft["calendar"];
  holidays: Draft["holidays"];
  onCalendar: (c: Draft["calendar"]) => void;
  onHolidays: (h: Draft["holidays"]) => void;
  errors: Record<string, string>;
  changed: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const today = nyToday();
  const upcoming = holidays.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const toggle = (d: Day, on: boolean) => onCalendar({ ...calendar, serviceNights: DAYS.map((x) => x.value).filter((x) => (x === d ? on : calendar.serviceNights.includes(x))) });
  const nightsError = errors["calendar.serviceNights"];

  const addHoliday = () => {
    if (!date || !name.trim()) return setAddError("Enter a date and a name");
    if (date < today) return setAddError("Choose today or a later date");
    if (holidays.some((h) => h.date === date)) return setAddError("That date is already a holiday");
    onHolidays([...holidays, { date, name: name.trim() }]);
    setDate("");
    setName("");
    setAddError(null);
    setAdding(false);
  };

  return (
    <SettingsSection id="calendar" title="Service nights and holidays" description="Shown on the Residents page and used to count nights serviced in weekly reports." changed={changed}>
      <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-4">
        <fieldset aria-describedby={nightsError ? "nights-error" : undefined} className="m-0 border-0 p-0">
          <legend className="mb-2 text-[13.5px] font-bold">Service nights</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const on = calendar.serviceNights.includes(d.value);
              return (
                <label
                  key={d.value}
                  className={cx(
                    "relative flex h-11 w-14 cursor-pointer items-center justify-center rounded-[10px] text-[14px] has-focus-visible:ring-2 has-focus-visible:ring-navy has-focus-visible:ring-offset-2",
                    on ? "bg-navy font-bold text-white" : "border border-field bg-white font-semibold text-muted hover:border-navy",
                  )}
                >
                  <input type="checkbox" checked={on} onChange={(e) => toggle(d.value, e.target.checked)} className="sr-only" />
                  <span aria-hidden="true">{d.short}</span>
                  <span className="sr-only">{d.long}</span>
                </label>
              );
            })}
          </div>
          {nightsError && (
            <p id="nights-error" className="m-0 mt-1.5 text-[13px] font-semibold text-danger">
              {nightsError}
            </p>
          )}
        </fieldset>
        <SelectField label="Service starts" value={calendar.startTime} onChange={(e) => onCalendar({ ...calendar, startTime: e.target.value })} className="w-40">
          {START_TIMES.map((t) => (
            <option key={t} value={t}>
              {clockLabel(t)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14px] font-bold">No-service holidays</h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={addButton}>
            <Icon name="plus" size={15} strokeWidth={2.4} />
            Add date
          </button>
        )}
      </div>
      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl bg-subtle p-3.5">
          <TextField label="Date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          <TextField label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Thanksgiving Day" className="min-w-[200px] flex-1" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => (setAdding(false), setAddError(null))}>
              Cancel
            </Button>
            <Button onClick={addHoliday}>Add holiday</Button>
          </div>
          {addError && (
            <p role="alert" className="m-0 w-full text-[13px] font-semibold text-danger">
              {addError}
            </p>
          )}
        </div>
      )}
      {upcoming.length ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5 p-0">
          {upcoming.map((h) => (
            <li key={h.date} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <span aria-hidden="true" className="flex h-[50px] w-[46px] flex-none flex-col items-center justify-center rounded-[10px] bg-tint-2 leading-[1.1] text-navy">
                <span className="text-[10.5px] font-bold">{MONTH[Number(h.date.slice(5, 7)) - 1]}</span>
                <span className="font-heading text-[19px] font-bold">{Number(h.date.slice(8, 10))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-[13.5px]">{h.name}</strong>
                <span className="text-[12px] text-muted">
                  <span className="sr-only">{longDate(h.date)}, </span>
                  {holidayNote(h.date, calendar)}
                </span>
              </span>
              <button type="button" aria-label={`Remove ${h.name}`} onClick={() => onHolidays(holidays.filter((x) => x.date !== h.date))} className="flex size-[30px] items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger">
                <Icon name="x" size={14} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">No upcoming holidays. Service runs every service night.</p>
      )}
      <SelectField
        label="When a holiday falls on a service night"
        value={calendar.makeupPolicy}
        onChange={(e) => onCalendar({ ...calendar, makeupPolicy: e.target.value as Draft["calendar"]["makeupPolicy"] })}
        className="mt-4 max-w-sm"
      >
        <option value="next_night">Make up the next night</option>
        <option value="skip">Skip, no make-up</option>
      </SelectField>
    </SettingsSection>
  );
}

const longDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });

// ---- Weekly reports and email

const SEND_HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 5).padStart(2, "0")}:00`); // 5 AM – 9 PM

export function ReportsSection({
  weeklyReport,
  email,
  onWeekly,
  onEmail,
  errors,
  changed,
}: {
  weeklyReport: Draft["weeklyReport"];
  email: Draft["email"];
  onWeekly: (w: Draft["weeklyReport"]) => void;
  onEmail: (e: Draft["email"]) => void;
  errors: Record<string, string>;
  changed: boolean;
}) {
  return (
    <SettingsSection id="reports" title="Weekly reports and email" description="When the weekly report goes to every Property Manager, and the addresses CBES email comes from." changed={changed}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <SelectField label="Send day" value={weeklyReport.day} onChange={(e) => onWeekly({ ...weeklyReport, day: e.target.value as Day })}>
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.long}
            </option>
          ))}
        </SelectField>
        <SelectField label="Send time (Eastern)" value={weeklyReport.time} onChange={(e) => onWeekly({ ...weeklyReport, time: e.target.value })}>
          {SEND_HOURS.map((t) => (
            <option key={t} value={t}>
              {clockLabel(t)}
            </option>
          ))}
        </SelectField>
        <TextField label="Weekly reports sent from" type="email" value={email.reportsFrom} onChange={(e) => onEmail({ ...email, reportsFrom: e.target.value })} error={errors["email.reportsFrom"]} />
        <TextField label="Quotes sent from" type="email" value={email.quotesFrom} onChange={(e) => onEmail({ ...email, quotesFrom: e.target.value })} error={errors["email.quotesFrom"]} />
      </div>
    </SettingsSection>
  );
}
