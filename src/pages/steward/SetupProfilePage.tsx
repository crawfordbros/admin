import { useState, type FormEvent } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../../lib/api";
import { ROLE_KEY, useCrewProfile, useUpdateProfile, useUploadPhoto } from "../../lib/steward/crew";
import { useT } from "../../lib/steward/preferences";
import { CheckLine, Field, Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { SetupFrame } from "../../components/steward/SetupFrame";
import { usePhotoPicker } from "../../components/steward/usePhotoPicker";
import { Avatar, CtaButton } from "../../components/steward/ui";
import { useScreenTitle } from "./useScreenTitle";

/**
 * Screen 2, Create your profile (docs/design/steward/Steward-ProfileSetup): the photo and both names,
 * required before anything else in the app works. From Me it edits them (`edit`).
 */
export function SetupProfilePage({ edit = false }: { edit?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useUser();
  const profile = useCrewProfile().data!;
  const upload = useUploadPhoto();
  const update = useUpdateProfile();
  const [first, setFirst] = useState(profile.firstName ?? user?.firstName ?? "");
  const [last, setLast] = useState(profile.lastName ?? user?.lastName ?? "");
  const [errors, setErrors] = useState<Partial<Record<"photo" | "firstName" | "lastName", string>>>({});
  const [failure, setFailure] = useState("");
  useScreenTitle(edit ? t("me.profileTitle") : t("setup.profileTitle"));

  const { inputs, takePhoto, choosePhoto } = usePhotoPicker((file) => {
    setFailure("");
    setErrors((e) => ({ ...e, photo: undefined }));
    upload.mutate(file, { onError: (err) => setFailure(errorMessage(err)) });
  });
  const hasPhoto = Boolean(profile.photoUrl);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = {
      photo: hasPhoto ? undefined : t("setup.needPhoto"),
      firstName: first.trim() ? undefined : t("setup.needFirst"),
      lastName: last.trim() ? undefined : t("setup.needLast"),
    };
    setErrors(missing);
    setFailure("");
    if (missing.photo || missing.firstName || missing.lastName) return;
    try {
      await update.mutateAsync({ firstName: first.trim(), lastName: last.trim(), ...(edit ? {} : { onboarded: true as const }) });
      navigate(edit ? "/steward/me" : "/steward/setup/security");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFailure(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <SetupFrame
        step={1}
        title={t("setup.profileTitle")}
        intro={t("setup.profileIntro")}
        editTitle={edit ? t("me.profileTitle") : undefined}
        action={
          <>
            <CtaButton type="submit" disabled={update.isPending || upload.isPending}>
              {update.isPending ? t("setup.saving") : edit ? t("setup.saveChanges") : t("setup.continue")}
            </CtaButton>
            {!edit && <p className="m-0 text-center text-[12.5px] text-st-text-3">{t("setup.required")}</p>}
          </>
        }
      >
        {inputs}
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative">
            <span role="img" aria-label={t("setup.photoLabel")}>
              <Avatar name="" photoUrl={profile.photoUrl} size={132} />
            </span>
            <button
              type="button"
              onClick={takePhoto}
              aria-label={hasPhoto ? t("setup.retake") : t("setup.takePhoto")}
              className="absolute right-[-2px] bottom-1 flex size-11 items-center justify-center rounded-full border-[3px] border-st-bg bg-st-cta text-st-on-cta"
            >
              <Icon name="camera" size={20} strokeWidth={2} />
            </button>
          </div>
          {upload.isPending ? (
            <p role="status" className="m-0 text-[13px] font-bold text-st-text-2">
              {t("setup.uploading")}
            </p>
          ) : hasPhoto ? (
            <p className="m-0 flex items-center gap-1.5 text-[13px] font-bold text-st-ok">
              <CheckLine>{t("setup.photoAdded")}</CheckLine>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={choosePhoto} className="font-bold text-st-accent underline underline-offset-3">
                {t("setup.choosePhoto")}
              </button>
            </p>
          ) : (
            <button type="button" onClick={choosePhoto} className="min-h-11 text-[13.5px] font-bold text-st-accent underline underline-offset-3">
              {t("setup.choosePhoto")}
            </button>
          )}
          {errors.photo && (
            <p role="alert" className="m-0 text-[13px] font-semibold text-st-bad">
              {errors.photo}
            </p>
          )}
        </div>

        <ul className="m-0 flex list-none flex-col gap-1.5 rounded-xl bg-st-surface px-3.5 py-3 text-[13px] text-st-text-2 [&_svg]:text-st-accent">
          {(["setup.photoRule1", "setup.photoRule2", "setup.photoRule3"] as const).map((k) => (
            <li key={k}>
              <CheckLine>{t(k)}</CheckLine>
            </li>
          ))}
        </ul>

        {failure && <Notice>{failure}</Notice>}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("setup.firstName")} autoComplete="given-name" value={first} onChange={(e) => { setFirst(e.target.value); setErrors((x) => ({ ...x, firstName: undefined })); }} error={errors.firstName} required maxLength={60} />
          <Field label={t("setup.lastName")} autoComplete="family-name" value={last} onChange={(e) => { setLast(e.target.value); setErrors((x) => ({ ...x, lastName: undefined })); }} error={errors.lastName} required maxLength={60} />
        </div>
        <p className="m-0 text-[13px] break-all text-st-text-3">
          {t("setup.invitedAs", { role: t(ROLE_KEY[profile.role]), email: profile.email })}
        </p>
      </SetupFrame>
    </form>
  );
}
