import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../../lib/api";
import { useCrewProfile, useUpdateProfile } from "../../lib/steward/crew";
import { displayPhone, usMobile } from "../../lib/steward/phone";
import { useStewardPreferences } from "../../lib/steward/preferences";
import type { Locale } from "../../lib/steward/strings";
import { useSecurityStatus } from "../auth/security";
import { Field, Notice, SwitchRow } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { SetupFrame } from "../../components/steward/SetupFrame";
import { CtaButton, Segmented } from "../../components/steward/ui";
import { useScreenTitle } from "./useScreenTitle";

/**
 * Screen 3, Contact and sign-in (docs/design/steward/Steward-SetupSecurity): mobile phone, texts and the
 * app's language. Two-step sign-in is already on by this point (every CBES account sets it up before
 * entering), so the screen shows it and links to managing it. From Me it edits phone, texts and language.
 */
export function SetupContactPage({ edit = false }: { edit?: boolean }) {
  const { t, locale, setLocale } = useStewardPreferences();
  const navigate = useNavigate();
  const profile = useCrewProfile().data!;
  const update = useUpdateProfile();
  const security = useSecurityStatus().data;
  const [phone, setPhone] = useState(displayPhone(profile.phone));
  const [texts, setTexts] = useState(profile.phone ? profile.smsOptIn : true);
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState("");
  useScreenTitle(edit ? t("me.contactTitle") : t("setup.contactTitle"));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFailure("");
    const number = phone.trim() ? usMobile(phone) : null;
    const problem = phone.trim() && !number ? t("setup.phoneInvalid") : texts && !number ? t("setup.phoneForTexts") : undefined;
    setError(problem);
    if (problem) return;
    try {
      await update.mutateAsync({ phone: number, smsOptIn: texts, locale });
      navigate(edit ? "/steward/me" : "/steward/setup/done");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.phone) setError(t("setup.phoneInvalid"));
      else setFailure(errorMessage(err));
    }
  }

  const method = security?.passkey && security.authenticator ? "setup.signInBoth" : security?.passkey ? "setup.signInPasskey" : "setup.signInAuthenticator";
  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <SetupFrame
        step={2}
        back="/steward/setup/profile"
        title={t("setup.contactTitle")}
        intro={t(profile.role === "lead" ? "setup.contactIntroSteward" : "setup.contactIntro")}
        editTitle={edit ? t("me.contactTitle") : undefined}
        action={
          <CtaButton type="submit" disabled={update.isPending}>
            {update.isPending ? t("setup.saving") : edit ? t("setup.saveChanges") : t("setup.finish")}
          </CtaButton>
        }
      >
        <Field label={t("setup.phone")} type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => { setPhone(e.target.value); setError(undefined); }} hint={t("setup.phoneHint")} error={error} />
        <SwitchRow label={t("setup.texts")} detail={t("setup.textsFine")} checked={texts} onChange={setTexts} />
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-semibold">
            {t("setup.language")}
          </p>
          <Segmented<Locale>
            label={t("setup.language")}
            value={locale}
            onChange={setLocale}
            options={[
              { value: "en", label: t("lang.en") },
              { value: "es", label: t("lang.es") },
            ]}
          />
        </div>
        {failure && <Notice>{failure}</Notice>}
        {!edit && security?.verified && (
          <section className="flex items-center gap-3 rounded-[14px] border-2 border-st-accent p-4">
            <span className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-st-ok-bg text-st-ok">
              <Icon name="key" size={24} strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <strong className="block text-base">{t("setup.signInTitle")}</strong>
              <span className="block text-[13px] text-st-text-2">{t(method)}</span>
              <Link to="/portal/settings" className="text-[13.5px] font-semibold">
                {t("setup.manageSignIn")}
              </Link>
            </span>
          </section>
        )}
      </SetupFrame>
    </form>
  );
}
