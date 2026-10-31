import { useId, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "../../lib/api";
import { useCrewBoard, useCrewValet, useSaveBuildings, useValetChoices, type CrewMember, type CrewProperty } from "../../lib/steward/crew-board";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { Avatar, BottomAction, CtaButton, Panel, ScreenHeader } from "../../components/steward/ui";
import { StatePill } from "../../components/steward/crewParts";
import { cx } from "../../components/styles";
import { ROLE_KEY } from "../../lib/steward/crew";
import { useScreenTitle } from "./useScreenTitle";

type Message = { tone: "ok" | "bad"; text: string };

/**
 * Buildings and crew for one property (STEWARD_APP_SPEC sections 2 and 6): who covers each building, and
 * which valets work here. Reached from Crew, and from Reassign on someone who's late.
 */
export function CrewManagePage() {
  const { propertyId = "" } = useParams();
  const { t } = useStewardPreferences();
  const board = useCrewBoard();
  const [message, setMessage] = useState<Message | null>(null);
  const p = board.data?.properties.find((x) => x.id === propertyId);
  useScreenTitle(p ? `${t("manage.title")} · ${p.name}` : t("manage.title"));
  const back = { to: `/steward/crew?p=${encodeURIComponent(propertyId)}`, label: t("manage.back") };

  if (!p) {
    return (
      <>
        <ScreenHeader back={back} title={t("manage.title")} />
        {board.isPending ? <p role="status" className="text-st-text-2">{t("app.loading")}</p> : <Notice>{board.error ? errorMessage(board.error) : t("manage.notFound")}</Notice>}
      </>
    );
  }
  return (
    <>
      <ScreenHeader back={back} eyebrow={p.name} title={t("manage.title")} />
      <div className="flex flex-col gap-3 pt-1 pb-3">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {/* Keyed on the crew, so adding or removing someone starts the building choices over from what's saved. */}
        <Buildings key={p.crew.map((m) => m.id).join()} property={p} onDone={setMessage} />
        <Valets property={p} onDone={setMessage} />
      </div>
    </>
  );
}

/** Building → who covers it. Saved together; anyone with none covers every building. */
function Buildings({ property: p, onDone }: { property: CrewProperty; onDone: (m: Message) => void }) {
  const { t } = useStewardPreferences();
  const [params] = useSearchParams();
  const save = useSaveBuildings(p.id);
  const saved = useMemo(() => new Map(p.buildings.map((b) => [b.name, new Set(b.assignees.filter((id) => p.crew.some((m) => m.id === id)))])), [p]);
  const [picks, setPicks] = useState(saved);
  const reassigning = p.crew.find((m) => m.id === params.get("reassign"));
  const changed = p.buildings.some((b) => {
    const a = saved.get(b.name)!;
    const c = picks.get(b.name)!;
    return a.size !== c.size || [...a].some((id) => !c.has(id));
  });

  const toggle = (building: string, userId: string) =>
    setPicks((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(building));
      if (set.has(userId)) set.delete(userId);
      else set.add(userId);
      next.set(building, set);
      return next;
    });
  const submit = () =>
    save.mutate(
      p.crew.map((m) => ({ userId: m.id, buildings: p.buildings.filter((b) => picks.get(b.name)?.has(m.id)).map((b) => b.name) })),
      { onSuccess: () => onDone({ tone: "ok", text: t("manage.saved") }), onError: (err) => onDone({ tone: "bad", text: errorMessage(err) }) },
    );

  return (
    <>
      <Panel className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-bold">{t("manage.buildingsTitle")}</h2>
          <p className="mt-1 mb-0 text-[13px] leading-normal text-st-text-2">{t("manage.buildingsHint")}</p>
        </div>
        {reassigning && <Notice tone="warn">{t("manage.reassigning", { name: reassigning.name.split(" ")[0] })}</Notice>}
        {p.crew.length === 0 ? (
          <p className="m-0 text-[13.5px] text-st-text-2">{t("crew.noCrewBody")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:grid md:grid-cols-2">
            {p.buildings.map((b) => (
              <li key={b.name} className="rounded-xl bg-st-raised px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-[14.5px]">{t("tonight.bldg", { name: b.name })}</strong>
                  <span className="text-[12.5px] text-st-text-2">{t("manage.units", { n: b.units })}</span>
                </div>
                <div role="group" aria-label={t("manage.covers", { name: t("tonight.bldg", { name: b.name }) })} className="mt-2 flex flex-wrap gap-1.5">
                  {p.crew.map((m) => {
                    const on = picks.get(b.name)?.has(m.id) ?? false;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(b.name, m.id)}
                        className={cx(
                          "flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold",
                          on ? "bg-st-cta text-st-on-cta" : "border border-st-border text-st-text-2 hover:text-st-text",
                          m.id === reassigning?.id && !on && "line-through decoration-2",
                        )}
                      >
                        {on && <Icon name="check" size={14} strokeWidth={2.6} />}
                        {m.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {changed && (
        <BottomAction>
          <p className="m-0 text-center text-[13px] text-st-text-2">{t("manage.unsaved")}</p>
          <CtaButton disabled={save.isPending} onClick={submit}>
            {save.isPending ? t("manage.saving") : t("manage.save")}
          </CtaButton>
        </BottomAction>
      )}
    </>
  );
}

/** The valets on the property, to add or take off. Stewards are listed but changed by CBES admins. */
function Valets({ property: p, onDone }: { property: CrewProperty; onDone: (m: Message) => void }) {
  const { t } = useStewardPreferences();
  const choices = useValetChoices(p.id);
  const change = useCrewValet(p.id);
  const [pick, setPick] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const selectId = useId();
  const options = choices.data ?? [];

  const add = () => {
    const valet = options.find((v) => v.id === pick);
    if (!valet) return;
    change.mutate(
      { userId: valet.id, add: true },
      { onSuccess: () => { setPick(""); onDone({ tone: "ok", text: t("manage.added", { name: valet.name, property: p.name }) }); }, onError: (err) => onDone({ tone: "bad", text: errorMessage(err) }) },
    );
  };
  const remove = (m: CrewMember) =>
    change.mutate(
      { userId: m.id, add: false },
      { onSuccess: () => { setConfirming(null); onDone({ tone: "ok", text: t("manage.removed", { name: m.name, property: p.name }) }); }, onError: (err) => onDone({ tone: "bad", text: errorMessage(err) }) },
    );

  return (
    <Panel className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-[15px] font-bold">{t("manage.crewTitle")}</h2>
        <p className="mt-1 mb-0 text-[13px] text-st-text-2">{t("manage.crewHint")}</p>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {p.crew.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 border-t border-st-track py-2.5 first:border-t-0">
            <div className="flex items-center gap-3">
              <Avatar name={m.name} photoUrl={m.photoUrl} size={40} ring={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold">{m.name}</span>
                <span className="text-[12.5px] text-st-text-2">{t(ROLE_KEY[m.isSteward ? "lead" : "valet"])}</span>
              </span>
              <StatePill member={m} t={t} />
              {!m.isSteward && confirming !== m.id && (
                <button
                  type="button"
                  onClick={() => setConfirming(m.id)}
                  aria-label={t("manage.removeLabel", { name: m.name, property: p.name })}
                  className="min-h-10 rounded-[10px] border border-st-border px-3 text-[13px] font-bold"
                >
                  {t("manage.remove")}
                </button>
              )}
            </div>
            {confirming === m.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-st-bad-bg p-2.5">
                <span className="min-w-40 flex-1 text-[13.5px] font-semibold">{t("manage.removeConfirm", { name: m.name, property: p.name })}</span>
                <button type="button" disabled={change.isPending} onClick={() => remove(m)} className="min-h-10 rounded-[10px] bg-st-bad px-3 text-[13px] font-bold text-st-bg">
                  {t("manage.removeYes")}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="min-h-10 rounded-[10px] border border-st-border px-3 text-[13px] font-bold">
                  {t("manage.keep")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5 border-t border-st-track pt-3">
        <label htmlFor={selectId} className="text-[13.5px] font-bold">
          {t("manage.add")}
        </label>
        {choices.isSuccess && options.length === 0 ? (
          <p className="m-0 text-[13.5px] text-st-text-2">{t("manage.addNone")}</p>
        ) : (
          <div className="flex gap-2">
            <select
              id={selectId}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-st-border bg-st-raised px-3 text-base text-st-text focus:border-2 focus:border-st-text focus:outline-none"
            >
              <option value="">{choices.isPending ? t("app.loading") : "—"}</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!pick || change.isPending} onClick={add} className="min-h-12 rounded-xl bg-st-cta px-5 text-[15px] font-bold text-st-on-cta disabled:opacity-60">
              {t("manage.addButton")}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
