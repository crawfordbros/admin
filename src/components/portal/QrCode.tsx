import { useEffect, useState } from "react";
import { cx } from "../styles";

/** An SVG data URL for `value`; the qrcode library loads the first time one is drawn. */
async function qrSvgDataUrl(value: string): Promise<string> {
  const { default: QRCode } = await import("qrcode");
  const svg = await QRCode.toString(value, { type: "svg", margin: 0, color: { dark: "#1a1c3d", light: "#ffffff" } });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A QR code for a link (REP_PORTAL_SPEC 4.4), with the link as its text alternative. */
export function QrCode({ value, size = 84, label, className }: { value: string; size?: number; label?: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    qrSvgDataUrl(value)
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [value]);
  const box = { width: size, height: size };
  return src ? (
    <img src={src} alt={label ?? `QR code for ${value}`} width={size} height={size} className={cx("flex-none rounded-md bg-white", className)} style={box} />
  ) : (
    <span role="img" aria-label={label ?? `QR code for ${value}`} className={cx("flex-none animate-pulse rounded-md bg-neutral-bg motion-reduce:animate-none", className)} style={box} />
  );
}
