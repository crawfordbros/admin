import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { ApiError, errorMessage, useApi, type AdminSettings } from "../../lib/api";
import { useUnsavedWarning } from "../../lib/useUnsavedWarning";
import { useAdminPage } from "../../components/admin/adminPage";
import { PageHeader, Pill, Skeleton } from "../../components/display";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { Alert, Button } from "../../components/ui";
import { cx } from "../../components/styles";
import { changes, SECTION_NAV, toDraft, validate, type Draft } from "./model";
import { CalendarSection, IssueTypesSection, OverwatchSection, ReportsSection, ViolationTypesSection } from "./sections";

/** /admin/settings: rules that apply across every organization (ADMIN_PORTAL_SPEC 7.15). */
export function SettingsPage() {
  const api = useApi();
  useAdminPage("Settings");
  // The form edits a copy, so a background refetch must never replace it mid-edit.
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<AdminSettings>("/admin/settings"), staleTime: Infinity, refetchOnWindowFocus: false });

  if (settings.isError && !settings.data)
    return (
      <>
        <Header />
        <Alert>{errorMessage(settings.error)}</Alert>
      </>
    );
  if (!settings.data)
    return (
      <>
        <Header />
        <div role="status" aria-label="Loading" className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-[14px]" />
          ))}
        </div>
      </>
    );
  return <SettingsForm key={settings.dataUpdatedAt} saved={settings.data} />;
}

function Header({ actions }: { actions?: ReactNode }) {
  return <PageHeader title="Settings" description="Rules that apply across every organization. Changes are logged with who made them." actions={actions} />;
}

function SettingsForm({ saved }: { saved: AdminSettings }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [base, setBase] = useState<Draft>(() => toDraft(saved));
  const [draft, setDraft] = useState<Draft>(base);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const counts = changes(base, draft);
  const dirty = counts.total > 0;
  const problems = validate(draft);
  // Sender addresses warn as soon as they're typed; label problems wait for a save attempt.
  const shown = { ...(attempted ? problems : Object.fromEntries(Object.entries(problems).filter(([k]) => k.startsWith("email.")))), ...serverErrors };
  useUnsavedWarning(dirty);
  const active = useSectionInView();
  useScrollToHash();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors({});
    setSaveError(null);
  };

  const discard = () => {
    setDraft(base);
    setAttempted(false);
    setServerErrors({});
    setSaveError(null);
  };

  const save = async () => {
    setAttempted(true);
    if (Object.keys(problems).length) {
      setSaveError("Fix the highlighted fields, then save again.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    // Sections save one call at a time; after each, the saved part becomes the new baseline so a
    // failure part-way leaves only the unsaved sections dirty.
    let current = base;
    let step: "issues" | "violations" | null = null;
    const accept = (res: AdminSettings, take: (fresh: Draft) => Partial<Draft>) => {
      const fresh = toDraft(res);
      current = fresh;
      setBase(current);
      setDraft((d) => ({ ...d, ...take(fresh) }));
    };
    try {
      const patch: Record<string, unknown> = {};
      if (counts.overwatch) patch.overwatch = draft.overwatch;
      if (JSON.stringify(base.calendar) !== JSON.stringify(draft.calendar)) patch.calendar = draft.calendar;
      if (JSON.stringify(base.weeklyReport) !== JSON.stringify(draft.weeklyReport)) patch.weeklyReport = draft.weeklyReport;
      if (base.email.reportsFrom !== draft.email.reportsFrom || base.email.quotesFrom !== draft.email.quotesFrom)
        patch.email = { reportsFrom: draft.email.reportsFrom.trim(), quotesFrom: draft.email.quotesFrom.trim() };
      // The whole holiday list rides with the calendar, so the section saves (and is logged) once.
      const byDate = (list: Draft["holidays"]) => [...list].sort((x, y) => x.date.localeCompare(y.date));
      if (JSON.stringify(byDate(base.holidays)) !== JSON.stringify(byDate(draft.holidays))) patch.holidays = byDate(draft.holidays);
      if (Object.keys(patch).length) accept(await api<AdminSettings>("/admin/settings", { method: "PATCH", body: JSON.stringify(patch) }), () => ({}));

      const rows = <T extends { key: string; label: string; labelEs: string | null }>(list: T[], pick: (r: T) => object) =>
        list.map((r) => ({ ...(r.key ? { key: r.key } : {}), label: r.label.trim(), labelEs: r.labelEs?.trim() || null, ...pick(r) }));
      if (counts.issues) {
        step = "issues";
        const items = rows(draft.issueTypes, (r) => ({ replyTargetHours: r.replyTargetHours, onForm: r.onForm }));
        accept(await api<AdminSettings>("/admin/settings/issue-types", { method: "PUT", body: JSON.stringify({ items }) }), (f) => ({ issueTypes: f.issueTypes }));
      }
      if (counts.violations) {
        step = "violations";
        const items = rows(draft.violationTypes, (r) => ({ active: r.active, countsForOverwatch: r.countsForOverwatch }));
        accept(await api<AdminSettings>("/admin/settings/violation-types", { method: "PUT", body: JSON.stringify({ items }) }), (f) => ({ violationTypes: f.violationTypes }));
      }

      toast.success("Settings saved");
      // Everything else on the portal (Overview, Overwatch, reply clocks) reads these settings.
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setServerErrors(rowErrors(err.fieldErrors, step, draft));
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const nav = useMemo(() => SECTION_NAV.map((s) => ({ ...s, count: counts[s.id as keyof typeof counts] as number })), [counts]);

  return (
    <>
      <div className="z-20 sm:sticky sm:top-16 sm:-mx-6 sm:bg-canvas/95 sm:px-6 sm:py-3 sm:backdrop-blur-sm lg:-mx-8 lg:px-8">
        <Header
          actions={
            <div
              className={cx(
                "flex flex-wrap items-center gap-2.5",
                // On a phone the header scrolls away, so unsaved changes dock the buttons to the bottom.
                dirty && "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-30 max-sm:justify-end max-sm:border-t max-sm:border-line max-sm:bg-white max-sm:px-4 max-sm:py-3 max-sm:shadow-[0_-4px_16px_rgba(26,28,94,0.08)]",
              )}
            >
              {dirty && (
                <Pill tone="warning" className="py-1.5!">
                  {counts.total === 1 ? "1 unsaved change" : `${counts.total} unsaved changes`}
                </Pill>
              )}
              <Button variant="outline" onClick={discard} disabled={!dirty || saving}>
                Discard
              </Button>
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          }
        />
      </div>
      {saveError && <Alert>{saveError}</Alert>}

      <div className="flex flex-wrap items-start gap-6">
        <nav aria-label="Settings sections" className="max-w-full flex-[1_1_220px] rounded-[14px] border border-line bg-white p-2 lg:sticky lg:top-[156px]">
          <ul className="m-0 list-none p-0">
            {nav.map((n) => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  aria-current={active === n.id ? "location" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(n.id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                    window.history.replaceState(null, "", `#${n.id}`);
                  }}
                  className={cx(
                    "flex items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-[14px] no-underline",
                    active === n.id ? "bg-tint-2 font-bold text-navy-ink" : "font-semibold text-ink hover:bg-subtle hover:text-ink",
                  )}
                >
                  <Icon name={n.icon} size={18} strokeWidth={2} />
                  <span className="flex-1">{n.label}</span>
                  {n.count > 0 && (
                    <span className="size-2 rounded-full bg-warning" title="Unsaved changes">
                      <span className="sr-only">(unsaved changes)</span>
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <OverwatchSection value={draft.overwatch} onChange={(v) => set("overwatch", v)} changed={counts.overwatch > 0} />
          <IssueTypesSection rows={draft.issueTypes} onChange={(v) => set("issueTypes", v)} errors={shown} changed={counts.issues > 0} />
          <ViolationTypesSection rows={draft.violationTypes} onChange={(v) => set("violationTypes", v)} errors={shown} changed={counts.violations > 0} />
          <CalendarSection
            calendar={draft.calendar}
            holidays={draft.holidays}
            onCalendar={(v) => set("calendar", v)}
            onHolidays={(v) => set("holidays", v)}
            errors={shown}
            changed={counts.calendar > 0}
          />
          <ReportsSection weeklyReport={draft.weeklyReport} email={draft.email} onWeekly={(v) => set("weeklyReport", v)} onEmail={(v) => set("email", v)} errors={shown} changed={counts.reports > 0} />
        </div>
      </div>
      {dirty && <div aria-hidden="true" className="h-12 sm:hidden" />}
    </>
  );
}

/** The API names list rows by position ("items.2.label"); the form keys them by row id. */
function rowErrors(fieldErrors: Record<string, string>, step: "issues" | "violations" | null, draft: Draft): Record<string, string> {
  if (!step) return fieldErrors;
  const rows = step === "issues" ? draft.issueTypes : draft.violationTypes;
  const prefix = step === "issues" ? "issue" : "violation";
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    const row = /^items\.(\d+)\./.exec(key);
    if (row && rows[Number(row[1])]) out[`${prefix}:${rows[Number(row[1])].id}`] = message;
    else out[key === "items" ? `${step === "issues" ? "issueTypes" : "violationTypes"}` : key] = message;
  }
  return out;
}

/** The section nearest the top of the screen, for the section nav. */
function useSectionInView() {
  const [active, setActive] = useState(SECTION_NAV[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = SECTION_NAV.find((s) => visible.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-160px 0px -45% 0px" },
    );
    for (const s of SECTION_NAV) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

/** Links such as /admin/settings#overwatch open at that section once it renders. */
function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);
}
