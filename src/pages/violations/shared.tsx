import { useState } from "react";
import { useAuthedImage } from "../../lib/images";
import type { ViolationRow } from "../../lib/api";
import { Button } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { Icon } from "../../components/icons";
import { cx } from "../../components/styles";
import { photoPath, type ViolationArea } from "./paths";


/** One square per violation in the Overwatch window, red once the unit is at the threshold. */
export function UnitHistory({ row }: { row: Pick<ViolationRow, "unitCount30d" | "overwatchThreshold" | "overwatchDays"> }) {
  const at = row.unitCount30d >= row.overwatchThreshold;
  const squares = Math.max(row.overwatchThreshold, Math.min(row.unitCount30d, 6));
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="flex gap-[3px]">
        {Array.from({ length: squares }, (_, i) => (
          <span key={i} className={cx("size-2.5 rounded-[3px]", i >= row.unitCount30d ? "bg-line" : at ? "bg-danger" : "bg-[#d99a1e]")} />
        ))}
      </span>
      <span className={cx("text-[12.5px] whitespace-nowrap", at ? "font-bold text-danger" : "font-semibold text-muted")}>
        {row.unitCount30d} in {row.overwatchDays} days
      </span>
    </span>
  );
}

/** The first photo, cropped, with how many there are. `fill` stretches it to a 4:3 card photo. */
export function ViolationThumb({ area, row, fill }: { area: ViolationArea; row: Pick<ViolationRow, "id" | "thumbPhotoId" | "photoCount">; fill?: boolean }) {
  const src = useAuthedImage(row.thumbPhotoId ? photoPath(area, row.id, row.thumbPhotoId) : null, row.thumbPhotoId);
  return (
    <span aria-hidden="true" className={cx("relative block flex-none", fill ? "aspect-[4/3] w-full" : "size-14")}>
      {src ? (
        <img src={src} alt="" className={cx("size-full object-cover", fill ? "" : "rounded-[10px]")} />
      ) : (
        <span className="flex size-full items-center justify-center rounded-[10px] border border-dashed border-placeholder bg-tint-2 text-navy-soft">
          <Icon name="camera" size={fill ? 32 : 22} strokeWidth={1.6} />
        </span>
      )}
      {row.photoCount > 0 && (
        <span className={cx("absolute rounded-full bg-navy-ink px-1.5 py-px text-[10px] font-bold text-white", fill ? "right-2 bottom-2" : "-right-1.5 -bottom-1.5")}>{row.photoCount}</span>
      )}
    </span>
  );
}

/** Dismissing a violation always records why. */
export function DismissModal({ count, onClose, onDismiss }: { count: number; onClose: () => void; onDismiss: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!reason.trim()) return setError("Say why, so the valet and Steward can learn from it.");
    setSaving(true);
    try {
      await onDismiss(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSaving(false);
    }
  };
  return (
    <Modal
      title={count === 1 ? "Dismiss violation" : `Dismiss ${count} violations`}
      context="Dismissed violations don't count toward Overwatch and never reach the property"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={saving} onClick={submit}>
            {saving ? "Dismissing…" : "Dismiss"}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Reason
        <textarea
          data-autofocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "dismiss-error" : "dismiss-hint"}
          placeholder="Bag was tied; the photo angle hid the knot."
          className="rounded-lg border border-field px-3 py-2 text-base font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25 aria-[invalid=true]:border-danger"
        />
      </label>
      {error ? (
        <p id="dismiss-error" className="mt-1.5 mb-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : (
        <p id="dismiss-hint" className="mt-1.5 mb-0 text-[13px] text-muted">
          Saved on the violation for CBES only.
        </p>
      )}
    </Modal>
  );
}
