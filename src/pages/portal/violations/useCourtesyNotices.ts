import { useState } from "react";
import { errorMessage, useApi, useApiBlob, type ViolationDetail } from "../../../lib/api";
import type { NoticeImage } from "../../../lib/courtesy-pdf";
import { nyToday } from "../../../lib/format";
import { useToast } from "../../../components/Toast";

/** Photos are WebP; jsPDF takes JPEG. Draws the image on a canvas and re-encodes it, or null. */
async function toJpeg(blob: Blob | null): Promise<NoticeImage | null> {
  if (!blob || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL("image/jpeg", 0.85), width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

/**
 * Downloads courtesy notices for one or more violations as one PDF. jsPDF downloads only when
 * someone asks for a notice.
 */
export function useCourtesyNotices() {
  const api = useApi();
  const blob = useApiBlob();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async (items: (ViolationDetail | string)[]) => {
    if (!items.length) return;
    setBusy(true);
    try {
      const details = await Promise.all(items.map((v) => (typeof v === "string" ? api<ViolationDetail>(`/portal/violations/${v}`) : Promise.resolve(v))));
      const notices = await Promise.all(
        details.map(async (v) => ({
          v,
          photo: v.photos[0] ? await toJpeg(await blob(`/portal/violations/${v.id}/photos/${v.photos[0].id}`)) : null,
          logo: v.courtesy.logoVersion ? await toJpeg(await blob(`/portal/violations/${v.id}/logo`)) : null,
        })),
      );
      const { buildCourtesyNotices } = await import("../../../lib/courtesy-pdf");
      const doc = buildCourtesyNotices(notices);
      doc.save(details.length === 1 ? `courtesy-notice-V-${details[0].refNo}.pdf` : `courtesy-notices-${nyToday()}.pdf`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return { download, busy };
}
