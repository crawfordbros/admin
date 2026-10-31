/* eslint-disable react-refresh/only-export-components -- the pickers and their helpers belong together */
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi, type OrganizationDetail, type PropertyRole } from "../../lib/api";
import { PROPERTY_ROLE_LABELS } from "../../lib/format";
import { Avatar } from "../display";
import { Icon } from "../icons";
import { cx } from "../styles";

// Choosing a property's managers (REP_PORTAL_SPEC 4.4): people already on the organization's team,
// and new people to invite.

export type TeamPerson = { id: string; name: string; email: string; role: PropertyRole; propertyIds: string[] };

/** The organization's property managers, one row per person, from the organization page's data. */
export function useOrgTeam(orgId: string) {
  const api = useApi();
  const query = useQuery({ queryKey: ["organization", orgId], queryFn: () => api<OrganizationDetail>(`/organizations/${orgId}`) });
  const people = new Map<string, TeamPerson>();
  for (const s of query.data?.staff ?? []) {
    const p = people.get(s.id) ?? { id: s.id, name: s.name || s.email, email: s.email, role: s.role, propertyIds: [] };
    p.propertyIds.push(s.propertyId);
    people.set(s.id, p);
  }
  return { ...query, people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

const count = (n: number) => `${n} ${n === 1 ? "property" : "properties"}`;

export function ManagerPicker({ orgId, value, onChange, label = "People on your team" }: { orgId: string; value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const { people, isPending, error } = useOrgTeam(orgId);
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0 text-[13.5px] font-semibold">{label}</legend>
      {isPending ? (
        <p className="m-0 text-[13px] text-muted">Loading your team…</p>
      ) : error ? (
        <p className="m-0 text-[13px] text-danger">We couldn't load your team. You can still invite people below.</p>
      ) : people.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Nobody on your team yet. Invite someone below.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {people.map((p) => {
            const on = value.includes(p.id);
            return (
              <label
                key={p.id}
                className={cx(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl p-3 focus-within:ring-2 focus-within:ring-gold",
                  on ? "border-2 border-navy bg-tint-2" : "border border-line bg-white hover:border-field",
                )}
              >
                <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((id) => id !== p.id) : [...value, p.id])} className="size-[18px] flex-none accent-navy" />
                <Avatar name={p.name} seed={p.id} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{p.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {PROPERTY_ROLE_LABELS[p.role]} · {count(p.propertyIds.length)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export type NewInviteRow = { key: number; email: string; name: string; role: PropertyRole };

export const blankInvite = (key: number): NewInviteRow => ({ key, email: "", name: "", role: "manager" });

/** Rows filled in, with emails trimmed. */
export const filledInvites = (rows: NewInviteRow[]) =>
  rows.filter((r) => r.email.trim()).map(({ email, name, role }) => ({ email: email.trim(), name: name.trim() || undefined, role }));

/** Email checks before sending: a valid address, and each person once. Keys are `invites.{i}.email`. */
export function inviteErrors(rows: NewInviteRow[]): Record<string, string> {
  const found: Record<string, string> = {};
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const email = r.email.trim().toLowerCase();
    if (!email) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) found[`invites.${i}.email`] = "Enter a valid email address";
    else if (seen.has(email)) found[`invites.${i}.email`] = "This email is already on the list";
    seen.add(email);
  });
  return found;
}

const field = "h-11 w-full rounded-[10px] border border-field bg-white px-3 text-[14px] text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25";

/**
 * Email, name and role for each new person, with "Add another". With one role on offer (Directors
 * are retired, so Representatives invite Property managers), the role isn't asked.
 */
export function InviteRows({ value, onChange, roles, errors = {} }: { value: NewInviteRow[]; onChange: (rows: NewInviteRow[]) => void; roles: PropertyRole[]; errors?: Record<string, string> }) {
  const nextKey = useRef(Math.max(0, ...value.map((r) => r.key)) + 1);
  const pickRole = roles.length > 1;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-subtle p-3.5">
      <p className="m-0 text-[13.5px] font-bold">Invite someone new</p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {value.map((row, i) => {
          const set = (patch: Partial<NewInviteRow>) => onChange(value.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
          const err = errors[`invites.${i}.email`] ?? errors[`invites.${i}`];
          return (
            <li key={row.key} className={cx("grid grid-cols-1 gap-2.5 sm:items-start", pickRole ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_40px]" : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_40px]")}>
              <div>
                <label className={cx("flex h-11 items-center gap-2 rounded-[10px] border bg-white px-3 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25", err ? "border-danger" : "border-field")}>
                  <span className="sr-only">Email for person {i + 1}</span>
                  <Icon name="mail" size={16} strokeWidth={2} className="text-muted" />
                  <input type="email" placeholder="Work email" autoComplete="off" aria-invalid={err ? true : undefined} value={row.email} onChange={(e) => set({ email: e.target.value })} className="min-w-0 flex-1 border-0 text-[14px] outline-none" />
                </label>
                {err && <p className="mt-1 mb-0 text-[13px] font-semibold text-danger">{err}</p>}
              </div>
              <label>
                <span className="sr-only">Name for person {i + 1}</span>
                <input placeholder="Name (optional)" autoComplete="off" value={row.name} onChange={(e) => set({ name: e.target.value })} className={field} />
              </label>
              {pickRole && (
                <label>
                  <span className="sr-only">Role for person {i + 1}</span>
                  <select value={row.role} onChange={(e) => set({ role: e.target.value as PropertyRole })} className={field}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {PROPERTY_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                aria-label={`Remove person ${i + 1}`}
                onClick={() => onChange(value.length > 1 ? value.filter((r) => r.key !== row.key) : [blankInvite(row.key)])}
                className="flex size-10 items-center justify-center rounded-[10px] border border-line bg-white text-muted hover:bg-canvas"
              >
                <Icon name="trash" size={16} strokeWidth={2} />
              </button>
            </li>
          );
        })}
      </ul>
      {value.length < 20 && (
        <button
          type="button"
          onClick={() => onChange([...value, blankInvite(nextKey.current++)])}
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-[10px] border border-dashed border-placeholder bg-white px-3 text-[13px] font-bold text-navy hover:bg-canvas"
        >
          <Icon name="plus" size={16} strokeWidth={2.2} />
          Add another
        </button>
      )}
      {!pickRole && <p className="m-0 text-[12px] text-muted">New people join as {PROPERTY_ROLE_LABELS[roles[0]]}s and see only the properties you give them.</p>}
    </div>
  );
}
