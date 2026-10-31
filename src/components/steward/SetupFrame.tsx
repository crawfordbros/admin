import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../lib/steward/preferences";
import { StepBar } from "./forms";
import { Icon } from "./icons";
import { BottomAction, ScreenHeader } from "./ui";

/**
 * The onboarding screens (STEWARD_APP_SPEC section 3, screens 2 to 4): the step bar, a title and the
 * screen's action pinned at the bottom. The same screens edit the profile later from Me, with a back
 * button instead of the steps.
 */
export function SetupFrame({
  step,
  back,
  title,
  intro,
  editTitle,
  action,
  children,
}: {
  step: 1 | 2 | 3;
  back?: string;
  /** Left out when the screen puts its own h1 further down (step 3). */
  title?: string;
  intro?: string;
  /** Set when the screen is editing the profile from Me rather than onboarding. */
  editTitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <>
      {editTitle ? (
        <ScreenHeader back={{ to: "/steward/me", label: t("setup.back") }} title={editTitle} />
      ) : (
        <div className="pt-[18px]">
          <div className="flex min-h-11 items-center justify-between">
            {back ? (
              <Link to={back} aria-label={t("setup.back")} className="flex size-11 items-center justify-center rounded-xl bg-st-surface text-st-text hover:text-st-text">
                <Icon name="back" size={20} strokeWidth={2.2} />
              </Link>
            ) : (
              <span />
            )}
          </div>
          <StepBar step={step} label={t("setup.step", { n: step })} />
          {title && <h1 className="mt-[22px] mb-0 text-[27px] leading-tight font-bold">{title}</h1>}
          {intro && <p className="mt-1.5 mb-0 max-w-[52ch] text-[14.5px] leading-normal text-st-text-2">{intro}</p>}
        </div>
      )}
      <div className={title || editTitle ? "flex flex-col gap-4 pt-5" : "flex flex-col gap-4 pt-[26px]"}>{children}</div>
      {action && <BottomAction>{action}</BottomAction>}
    </>
  );
}
