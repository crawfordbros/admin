import type { useStepUp } from "../../lib/stepUp";
import { Icon } from "../../components/icons";

/** Explains how the Super Admin will confirm, and takes the authenticator code when there's no passkey. */
export function StepUpField({ stepUp, code, onCode, notice }: { stepUp: ReturnType<typeof useStepUp>; code: string; onCode: (code: string) => void; notice?: string }) {
  if (stepUp.loading) return null;
  if (!stepUp.method) {
    return (
      <p role="alert" className="m-0 rounded-xl bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger">
        Set up a passkey or an authenticator app on your account first. This change needs one to confirm it's you.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-warning-bg px-3.5 py-3 text-[13px] font-semibold text-[#6b4a00]">
      <p className="m-0 flex items-center gap-2.5">
        <Icon name="lock" strokeWidth={2} />
        {stepUp.method === "passkey" ? "You'll confirm with your passkey." : "Confirm with a code from your authenticator app."} {notice}
      </p>
      {stepUp.method === "authenticator" && (
        <label className="flex flex-col gap-1.5 text-ink">
          Authenticator code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => onCode(e.target.value.replace(/\D/g, ""))}
            className="h-11 w-40 rounded-lg border border-field bg-white px-3 font-mono text-[18px] tracking-[0.3em]"
          />
        </label>
      )}
    </div>
  );
}
