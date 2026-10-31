import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ROLE_KEY, useCrewProfile, type CrewProfile, type TrainingItem } from "../../lib/steward/crew";
import { useT } from "../../lib/steward/preferences";
import type { StringKey } from "../../lib/steward/strings";
import { CheckLine, Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { SetupFrame } from "../../components/steward/SetupFrame";
import { Avatar, OutlineButton } from "../../components/steward/ui";
import { cx } from "../../components/styles";
import { useScreenTitle } from "./useScreenTitle";

const TRAINING: { item: TrainingItem; title: StringKey; sub: StringKey; to?: string }[] = [
  { item: "crew_guide", title: "waiting.guide", sub: "waiting.guideSub", to: "/steward/training/guide" },
  { item: "violation_types", title: "waiting.types", sub: "waiting.typesSub", to: "/steward/training/types" },
  { item: "practice_log", title: "waiting.practice", sub: "waiting.practiceSub", to: "/steward/violations/new?practice=1" },
];

/**
 * Screen 4, Waiting for your property (docs/design/steward/Steward-Waiting): step 3 for someone with no
 * property yet. Anyone already assigned goes straight to Tonight.
 */
export function SetupDonePage() {
  const t = useT();
  const profile = useCrewProfile().data!;
  useScreenTitle(t("waiting.title"));
  if (profile.properties.length > 0 || !(profile.role === "valet" || profile.role === "lead")) return <Navigate to="/steward" replace />;
  return (
    <SetupFrame step={3}>
      <ProfileCard profile={profile} />
      <WaitingPanel />
    </SetupFrame>
  );
}

function ProfileCard({ profile }: { profile: CrewProfile }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3.5 rounded-[18px] bg-st-surface p-5">
      <Avatar name={profile.name ?? ""} photoUrl={profile.photoUrl} size={72} />
      <span className="min-w-0">
        <span className="block font-heading text-[21px] font-bold">{profile.name}</span>
        <span className="block text-[13.5px] font-bold text-st-accent">{t("waiting.company", { role: t(ROLE_KEY[profile.role]) })}</span>
        <span className="mt-1 block text-[12.5px] font-bold text-st-ok">
          <CheckLine>{t("waiting.complete")}</CheckLine>
        </span>
      </span>
    </div>
  );
}

/**
 * "Waiting for your property", the training list and Check again. Also shown on Tonight while a crew
 * member has no property.
 */
export function WaitingPanel({ heading = true }: { heading?: boolean }) {
  const t = useT();
  const profile = useCrewProfile();
  const [checked, setChecked] = useState(false);
  const done = profile.data?.training ?? {};
  const Title = heading ? "h1" : "h2";
  return (
    <>
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-st-warn-bg text-st-warn">
          <Icon name="property" size={24} strokeWidth={2} />
        </span>
        <div>
          <Title className="m-0 text-[23px] leading-tight font-bold">{t("waiting.title")}</Title>
          <p className="mt-1.5 mb-0 text-[14.5px] leading-normal text-st-text-2">{t("waiting.body")}</p>
        </div>
      </div>

      <section>
        <h2 className="mt-1 mb-2.5 text-[15px] font-bold">{t("waiting.getReady")}</h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {TRAINING.map(({ item, title, sub, to }) => {
            const isDone = Boolean(done[item]);
            const body = (
              <>
                <span
                  className={cx(
                    "flex size-[26px] flex-none items-center justify-center rounded-full",
                    isDone ? "bg-st-ok text-st-bg" : "border-2 border-st-avatar-ink",
                  )}
                >
                  {isDone && <Icon name="check" size={14} strokeWidth={3} />}
                  {isDone && <span className="sr-only">{t("waiting.done")}: </span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{t(title)}</span>
                  <span className="block text-[12.5px] text-st-text-3">{t(sub)}</span>
                </span>
                {to && <Icon name="chevron" size={18} strokeWidth={2.2} className="text-st-text-3" />}
              </>
            );
            const row = "flex min-h-[60px] items-center gap-3 rounded-[14px] bg-st-surface px-3.5 py-2.5 text-st-text no-underline hover:text-st-text";
            return (
              <li key={item}>
                {to ? (
                  <Link to={to} className={row}>
                    {body}
                  </Link>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-2 pt-2">
        {checked && !profile.isFetching && profile.data?.properties.length === 0 && <Notice tone="warn">{t("waiting.stillWaiting")}</Notice>}
        <OutlineButton
          onClick={() => {
            setChecked(true);
            void profile.refetch();
          }}
          disabled={profile.isFetching}
        >
          {t("waiting.checkAgain")}
        </OutlineButton>
        <p className="m-0 text-center text-[13px] text-st-text-3">
          {t("waiting.help")} <a href="mailto:office@cbenvironments.com">office@cbenvironments.com</a>
        </p>
      </div>
    </>
  );
}
