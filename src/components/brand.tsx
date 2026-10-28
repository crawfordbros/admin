import type { CSSProperties } from "react";
import { useAuthedImage } from "../lib/images";
import { initials, orgColor } from "./displayUtils";
import { Icon } from "./icons";
import { cx } from "./styles";

/** The uploaded logo, or the organization's initials on its color. */
export function OrgLogo({
  org,
  size = 36,
  className,
  style,
}: {
  org: { id: string; name: string; logoVersion: string | null };
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const src = useAuthedImage(`/organizations/${org.id}/logo`, org.logoVersion);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.24), ...style };
  if (src) return <img src={src} alt="" width={size} height={size} className={cx("flex-none bg-white object-cover", className)} style={box} />;
  return (
    <span
      aria-hidden="true"
      className={cx("flex flex-none items-center justify-center font-heading font-bold text-white", className)}
      style={{ ...box, background: orgColor(org.id), fontSize: Math.round(size * 0.34) }}
    >
      {initials(org.name)}
    </span>
  );
}

/** A property's photo or logo, or a building icon on a light panel. `size` omitted fills the parent. */
export function PropertyPhoto({
  orgId,
  property,
  size,
  className,
}: {
  orgId: string;
  property: { id: string; photoVersion: string | null };
  size?: number;
  className?: string;
}) {
  const src = useAuthedImage(`/organizations/${orgId}/properties/${property.id}/photo`, property.photoVersion);
  const dims = size ? { width: size, height: size } : undefined;
  if (src) return <img src={src} alt="" className={cx("flex-none object-cover", !size && "size-full", className)} style={dims} />;
  return (
    <span aria-hidden="true" className={cx("flex flex-none items-center justify-center bg-tint-2 text-navy-soft", !size && "size-full", className)} style={dims}>
      <Icon name="home" size={size ? Math.round(size * 0.36) : 28} strokeWidth={1.6} />
    </span>
  );
}
