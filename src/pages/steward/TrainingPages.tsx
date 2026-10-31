import { useNavigate } from "react-router-dom";
import { useCompleteTraining } from "../../lib/steward/crew";
import { useViolationTypes } from "../../lib/steward/violations";
import { useStewardPreferences, useT } from "../../lib/steward/preferences";
import type { StringKey } from "../../lib/steward/strings";
import { Icon, type IconName } from "../../components/steward/icons";
import { BottomAction, CtaButton, Panel, ScreenHeader } from "../../components/steward/ui";
import { useScreenTitle } from "./useScreenTitle";

// Training while waiting for a property (STEWARD_APP_SPEC section 4, Onboarding). Finishing an item marks
// it done on the Waiting screen.

const GUIDE: { icon: IconName; title: StringKey; body: StringKey }[] = [
  { icon: "tonight", title: "guide.checkInTitle", body: "guide.checkInBody" },
  { icon: "property", title: "guide.routeTitle", body: "guide.routeBody" },
  { icon: "camera", title: "guide.violationsTitle", body: "guide.violationsBody" },
  { icon: "issues", title: "guide.issuesTitle", body: "guide.issuesBody" },
  { icon: "check", title: "guide.checkOutTitle", body: "guide.checkOutBody" },
];

/** Where training screens go back to: Tonight once someone has a property, otherwise the Waiting screen. */
const BACK = "/steward/setup/done";

export function CrewGuidePage() {
  const t = useT();
  const navigate = useNavigate();
  const complete = useCompleteTraining();
  useScreenTitle(t("guide.title"));
  return (
    <>
      <ScreenHeader back={{ to: BACK, label: t("guide.back") }} title={t("guide.title")} intro={t("guide.intro")} />
      {/* The steps of a shift, in the order they happen. */}
      <ol className="m-0 flex list-none flex-col gap-3 p-0 pt-3">
        {GUIDE.map((g) => (
          <li key={g.title}>
            <Panel className="flex gap-3.5">
              <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-st-raised text-st-accent">
                <Icon name={g.icon} size={22} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h2 className="m-0 text-[16px] font-bold">{t(g.title)}</h2>
                <p className="mt-1 mb-0 max-w-[60ch] text-[14.5px] leading-relaxed text-st-text-2">{t(g.body)}</p>
              </div>
            </Panel>
          </li>
        ))}
      </ol>
      <p className="mt-3 mb-0 rounded-xl bg-st-info-bg px-3.5 py-3 text-[13.5px] leading-normal text-st-info">{t("guide.location")}</p>
      <BottomAction>
        <CtaButton onClick={() => complete.mutate("crew_guide", { onSuccess: () => navigate(BACK) })} disabled={complete.isPending}>
          {t("guide.done")}
        </CtaButton>
      </BottomAction>
    </>
  );
}

export function ViolationTypesPage() {
  const { t, locale } = useStewardPreferences();
  const navigate = useNavigate();
  const complete = useCompleteTraining();
  const types = useViolationTypes();
  useScreenTitle(t("types.title"));
  return (
    <>
      <ScreenHeader back={{ to: BACK, label: t("guide.back") }} title={t("types.title")} intro={t("types.intro")} />
      <div className="pt-3">
        {types.isPending ? (
          <p role="status" className="text-st-text-2">
            {t("app.loading")}
          </p>
        ) : types.error ? (
          <p role="alert" className="text-st-bad">
            {t("error.load")}
          </p>
        ) : types.data.length === 0 ? (
          <p className="text-st-text-2">{t("types.empty")}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
            {types.data.map((type) => (
              <li key={type.key} lang={locale === "es" && type.labelEs ? "es" : "en"} className="flex min-h-[52px] items-center rounded-xl border-2 border-st-border px-3 text-[14.5px] font-semibold">
                {locale === "es" && type.labelEs ? type.labelEs : type.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomAction>
        <CtaButton onClick={() => complete.mutate("violation_types", { onSuccess: () => navigate(BACK) })} disabled={complete.isPending || types.isPending}>
          {t("types.done")}
        </CtaButton>
      </BottomAction>
    </>
  );
}
