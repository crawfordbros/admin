import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { errorMessage } from "../../lib/api";
import { useCrewProfile } from "../../lib/steward/crew";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { clockTime, useCrewProperty, useRevealAccessNotes } from "../../lib/steward/shifts";
import { Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { Avatar, EmptyState, Panel, ScreenHeader } from "../../components/steward/ui";
import { cx } from "../../components/styles";
import { useScreenTitle } from "./useScreenTitle";

/** The Property tab: the first property you work, or a note that you don't have one yet. */
export function PropertyIndexPage() {
  const { t } = useStewardPreferences();
  const profile = useCrewProfile().data!;
  useScreenTitle(t("property.title"));
  if (profile.properties.length) return <Navigate to={`/steward/properties/${profile.properties[0].id}`} replace />;
  return (
    <>
      <ScreenHeader title={t("property.title")} />
      <div className="pt-2">
        <EmptyState icon="property" title={t("property.emptyTitle")} body={t("property.emptyBody")} />
      </div>
    </>
  );
}

/**
 * Screen 7, Property details (docs/design/steward/Steward-Property): directions and the Steward's phone,
 * service nights, trash-out, compactor and the gate code (shown on tap, logged), buildings with who covers
 * them, and tonight's crew.
 */
export function PropertyPage() {
  const { id } = useParams();
  const { t, locale } = useStewardPreferences();
  const me = useCrewProfile().data!;
  const query = useCrewProperty(id);
  const reveal = useRevealAccessNotes();
  const [gate, setGate] = useState<{ id: string; text: string | null } | null>(null);
  const p = query.data?.property;
  useScreenTitle(p?.name ?? t("property.title"));

  if (query.isPending) return <p role="status" className="pt-16 text-st-text-2">{t("app.loading")}</p>;
  if (query.error || !p) {
    return (
      <>
        <ScreenHeader title={t("property.title")} />
        <div className="pt-2">
          <Notice>{query.error && "status" in query.error && query.error.status === 404 ? t("property.notFound") : errorMessage(query.error)}</Notice>
        </div>
      </>
    );
  }

  const others = query.data.assigned;
  const destination = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : [p.address, p.city, p.zip].filter(Boolean).join(", ");
  const shownGate = gate?.id === p.id ? gate : null;
  const facts: [string, string][] = [
    [t("property.serviceNights"), p.serviceNights],
    [t("property.trashOut"), p.trashOut],
    ...(p.compactorNote ? ([[t("property.compactor"), p.compactorNote]] as [string, string][]) : []),
  ];

  return (
    <div className="flex flex-col gap-3 pt-[18px]">
      {others.length > 1 && (
        <nav aria-label={t("property.choose")} className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:px-0">
          {others.map((o) => (
            <Link
              key={o.id}
              to={`/steward/properties/${o.id}`}
              aria-current={o.id === p.id ? "page" : undefined}
              className={cx(
                "flex min-h-9 flex-none items-center rounded-full px-3 text-[13px] font-bold no-underline",
                o.id === p.id ? "bg-st-cta text-st-on-cta hover:text-st-on-cta" : "border border-st-border text-st-text-2 hover:text-st-text",
              )}
            >
              {o.name}
            </Link>
          ))}
        </nav>
      )}
      <div>
        <h1 className="m-0 text-2xl leading-tight font-bold">{p.name}</h1>
        <p className="mt-0.5 mb-0 text-[13.5px] text-st-text-2">
          {t("property.address", { address: [p.address, p.city].filter(Boolean).join(", "), units: p.unitCount ?? "—", buildings: p.buildings.length })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-st-cta text-[15px] font-bold text-st-on-cta no-underline hover:text-st-on-cta"
        >
          <Icon name="directions" size={18} strokeWidth={2.2} />
          {t("property.directions")}
        </a>
        {p.steward?.phone ? (
          <a href={`tel:${p.steward.phone}`} className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-st-border text-[15px] font-bold text-st-text no-underline hover:text-st-text">
            <Icon name="phone" size={18} strokeWidth={2} />
            {t("property.callSteward")}
          </a>
        ) : (
          <span />
        )}
      </div>

      <Panel className="px-4 py-1">
        <dl className="m-0">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-st-track py-[11px] text-sm">
              <dt className="text-st-text-2">{k}</dt>
              <dd className="m-0 text-right font-bold">{v}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-[11px] text-sm">
            <dt className="text-st-text-2">{t("property.gateCode")}</dt>
            <dd className="m-0 text-right">
              {!p.hasAccessNotes ? (
                <span className="text-st-text-3">{t("property.noGateCode")}</span>
              ) : shownGate ? (
                <strong className="text-[15px] break-words" aria-live="polite">
                  {shownGate.text}
                </strong>
              ) : (
                <button
                  type="button"
                  disabled={reveal.isPending}
                  onClick={() => reveal.mutate(p.id, { onSuccess: (r) => setGate({ id: p.id, text: r.accessNotes }) })}
                  className="flex min-h-9 items-center gap-1.5 rounded-[10px] border border-st-border px-3 text-[13px] font-bold"
                >
                  <Icon name="eye" size={15} strokeWidth={2} />
                  {reveal.isPending ? t("property.revealing") : t("property.reveal")}
                </button>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel className="px-4 py-3">
        <h2 className="mt-0 mb-2 text-[15px] font-bold">{t("property.buildings")}</h2>
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4">
          {p.buildings.map((b) => {
            const mine = b.assignees.some((a) => a.id === me.id);
            const who = mine ? t("property.you") : b.assignees.length ? b.assignees.map((a) => a.name.split(" ")[0]).join(", ") : t("property.unassigned");
            return (
              <li key={b.name} className={cx("rounded-[10px] px-2.5 py-2", mine ? "bg-st-cta text-st-on-cta" : "bg-st-raised text-st-text-2")}>
                <strong className={cx("block text-[15px]", mine ? "text-st-on-cta" : "text-st-text")}>{t("tonight.bldg", { name: b.name })}</strong>
                <span className="text-[11.5px]">
                  {b.units} · {who}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="px-4 py-3">
        <h2 className="mt-0 mb-2 text-[15px] font-bold">{t("property.crewTonight")}</h2>
        <ul className="m-0 flex list-none flex-wrap gap-3.5 p-0">
          {p.crewTonight.map((c) => {
            const tag = c.role === "lead" ? t("property.steward") : c.checkedInAt ? t("property.in") : t("property.notIn");
            const good = c.role === "lead" || Boolean(c.checkedInAt);
            return (
              <li key={c.id} className="flex w-16 flex-col items-center gap-1 text-center text-xs">
                <Avatar name={c.name} photoUrl={c.photoUrl} size={44} ring={false} />
                <span className="w-full truncate">{c.name.split(" ")[0]}</span>
                <span className={cx("rounded-full px-1.5 text-[10.5px] font-bold", good ? "bg-st-ok-bg text-st-ok" : "bg-st-bad-bg text-st-bad")}>{tag}</span>
                {c.checkedInAt && <span className="sr-only">{clockTime(c.checkedInAt, locale)}</span>}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
