import { PropertyAddress } from "../PropertyAddress";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { errorMessage, useApi, type SearchResult } from "../../lib/api";
import { ADMIN_SECTIONS } from "../../pages/adminSections";
import { Icon } from "../icons";
import { useFocusTrap } from "../useFocusTrap";
import { cx } from "../styles";

/** A search hit: an API result, or one of the Admin Portal's own pages. */
type Hit = Omit<SearchResult, "kind"> & { kind: SearchResult["kind"] | "page" };

type Group = { kind: Hit["kind"]; label: string };
export type PalettePage = { path: string; label: string; detail: string };

const ADMIN_PAGES: PalettePage[] = [
  ...ADMIN_SECTIONS.map((s) => ({ path: s.path, label: s.label, detail: s.detail })),
  { path: "/admin/settings/account", label: "Account settings", detail: "Your name, password, passkeys and two-step verification." },
];

/** What differs between the Admin Portal's palette and the Property Portal's. */
const MODES = {
  admin: {
    endpoint: "/admin/search",
    dialog: "Search the Admin Portal",
    placeholder: "Search orgs, properties, units, issues…",
    hint: "Type a name, unit, issue number (#1042) or violation (V-2041).",
    recentKey: "cbes-admin:recent-searches",
    groups: [
      { kind: "page", label: "Pages" },
      { kind: "org", label: "Organizations" },
      { kind: "property", label: "Properties" },
      { kind: "unit", label: "Units" },
      { kind: "report", label: "Issues" },
      { kind: "violation", label: "Violations" },
      { kind: "user", label: "Users" },
      { kind: "quote", label: "Quotes" },
    ] as Group[],
  },
  portal: {
    endpoint: "/portal/search",
    dialog: "Search the Property Portal",
    placeholder: "Search properties, units, violation IDs…",
    hint: "Type a property, unit, violation (V-2041) or resident issue (#1042).",
    recentKey: "cbes-portal:recent-searches",
    groups: [
      { kind: "page", label: "Pages" },
      { kind: "property", label: "Properties" },
      { kind: "unit", label: "Units" },
      { kind: "violation", label: "Violations" },
      { kind: "issue", label: "Resident issues" },
    ] as Group[],
  },
};

/** Pages whose name or description has every word typed, names that start with it first. */
function matchPages(pages: PalettePage[], term: string): Hit[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages.filter((p) => words.every((w) => `${p.label} ${p.detail}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(words[0])) - Number(a.label.toLowerCase().startsWith(words[0])))
    .slice(0, 4)
    .map((p) => ({ kind: "page", id: p.path, title: p.label, subtitle: p.detail, link: p.path }));
}

function readRecent(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(key: string, q: string) {
  try {
    localStorage.setItem(key, JSON.stringify([q, ...readRecent(key).filter((s) => s !== q)].slice(0, 5)));
  } catch {
    // Private windows can refuse storage; recent searches are only a convenience.
  }
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The ⌘K command palette. In the Admin Portal: organizations, properties, units, issues, people
 * and quotes. In the Property Portal (`mode="portal"`): properties, units, violations and resident
 * issues the person can see, plus the sidebar's pages (`pages`).
 */
export function SearchPalette({ onClose, mode = "admin", pages = ADMIN_PAGES }: { onClose: () => void; mode?: "admin" | "portal"; pages?: PalettePage[] }) {
  const cfg = MODES[mode];
  const api = useApi();
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent] = useState(() => readRecent(cfg.recentKey));
  useFocusTrap(panel, onClose);

  const term = useDebounced(q.trim(), 200);
  const search = useQuery({
    queryKey: [mode, "search", term],
    queryFn: () => api<{ results: SearchResult[] }>(`${cfg.endpoint}?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
    retry: false,
    staleTime: 30_000,
  });

  const results: Hit[] = term.length >= 2 ? [...matchPages(pages, term), ...(search.data?.results ?? [])] : [];
  // Results in display order, so arrow keys follow what's on screen.
  const ordered = cfg.groups.flatMap((g) => results.filter((r) => r.kind === g.kind));
  const at = Math.min(active, Math.max(0, ordered.length - 1));

  const open = (r: Hit) => {
    saveRecent(cfg.recentKey, term);
    onClose();
    navigate(r.link);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (ordered.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + ordered.length) % ordered.length);
    } else if (e.key === "Escape") {
      // The focus trap leaves Escape to an expanded combobox, and this one is expanded while it shows results.
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && ordered[at]) {
      e.preventDefault();
      open(ordered[at]);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;

  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-navy-night/60 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={cfg.dialog} className="w-full max-w-[640px] overflow-hidden rounded-2xl bg-white outline-none shadow-[0_24px_60px_rgba(10,12,40,0.45)]">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Icon name="search" size={20} strokeWidth={2} className="flex-none text-muted" />
          <input
            data-autofocus
            type="text"
            role="combobox"
            aria-label="Search"
            aria-expanded={ordered.length > 0}
            aria-controls={listId}
            aria-activedescendant={ordered.length ? optionId(at) : undefined}
            aria-autocomplete="list"
            placeholder={cfg.placeholder}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded-md border border-field bg-white px-1.5 py-px font-sans text-[11px] text-muted sm:block">Esc</kbd>
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="-mr-1 flex size-9 flex-none items-center justify-center rounded-[10px] text-muted hover:bg-canvas hover:text-ink"
          >
            <Icon name="x" size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {term.length < 2 && (
            <div className="px-2 py-2">
              {recent.length > 0 ? (
                <>
                  <h2 className="m-0 mb-1 px-2 font-sans text-[12px] font-bold text-muted">Recent searches</h2>
                  <ul className="m-0 list-none p-0">
                    {recent.map((r) => (
                      <li key={r}>
                        <button type="button" onClick={() => setQ(r)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[14px] hover:bg-canvas">
                          <Icon name="clock" size={16} className="text-muted" />
                          {r}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="m-0 px-2 py-4 text-center text-[14px] text-muted">{cfg.hint}</p>
              )}
            </div>
          )}

          {term.length >= 2 && search.isPending && ordered.length === 0 && <p role="status" className="m-0 px-4 py-6 text-center text-[14px] text-muted">Searching…</p>}
          {term.length >= 2 && !search.isPending && !search.error && ordered.length === 0 && (
            <p role="status" className="m-0 px-4 py-6 text-center text-[14px] text-muted">
              Nothing matches “{term}”. Try a unit number, an issue number or part of a name.
            </p>
          )}

          <div id={listId} role="listbox" aria-label="Results" hidden={ordered.length === 0}>
            {cfg.groups.map((g) => {
              const items = ordered.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === g.kind);
              if (!items.length) return null;
              return (
                <div key={g.kind} role="group" aria-labelledby={`${listId}-${g.kind}`} className="mb-1">
                  <div id={`${listId}-${g.kind}`} className="px-2 pt-2 pb-1 text-[12px] font-bold text-muted">
                    {g.label}
                  </div>
                  {items.map(({ r, i }) => (
                    <div
                      key={`${r.kind}-${r.id}`}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === at}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => open(r)}
                      className={cx("flex min-h-12 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5", i === at && "bg-tint-2")}
                    >
                      <span className="text-[14px] font-semibold">{r.title}</span>
                      {r.property && <span>{r.kind !== "property" && <span className="block text-[13px]">{r.property.name}</span>}<PropertyAddress property={r.property} /></span>}
                      <span className="text-[12.5px] text-muted">{r.property && r.subtitle.startsWith(`${r.property.name} · `) ? r.subtitle.slice(r.property.name.length + 3) : r.subtitle === r.property?.name ? "" : r.subtitle}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {term.length >= 2 && search.error && (
            <p role="alert" className="m-0 px-4 py-6 text-center text-[14px] text-muted">
              {errorMessage(search.error)}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
