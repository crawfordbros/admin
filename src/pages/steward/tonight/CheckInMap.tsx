import { useT } from "../../../lib/steward/preferences";
import type { Position, Shift } from "../../../lib/steward/shifts";

const W = 350;
const H = 230;
const R = 78; // the check-in area's radius on screen

/**
 * Where you are against the check-in area (docs/design/steward/Steward-CheckIn): the dashed circle is
 * the area around the property's pin (the gold diamond), the white dot is you. North is up; when you're far away the dot
 * waits at the edge, pointing your way. A sketch, not a street map.
 */
export function CheckInMap({ property, position, inside }: { property: Shift["property"]; position: Position; inside: boolean | null }) {
  const t = useT();
  const cx = W / 2;
  const cy = H / 2;
  let you: { x: number; y: number; edge: boolean } | null = null;
  if (position.status === "ok" && property.lat != null && property.lng != null) {
    const mPerDegLat = 111_320;
    const dy = (position.lat - property.lat) * mPerDegLat;
    const dx = (position.lng - property.lng) * mPerDegLat * Math.cos((property.lat * Math.PI) / 180);
    const scale = R / property.geofenceRadiusM;
    let x = dx * scale;
    let y = -dy * scale;
    const max = Math.min(cx, cy) - 16;
    const len = Math.hypot(x, y);
    const edge = len > max;
    if (edge) {
      x = (x / len) * max;
      y = (y / len) * max;
    }
    you = { x: cx + x, y: cy + y, edge };
  }
  const where = inside === null ? t("checkin.mapUnknown") : inside ? t("checkin.mapInside") : t("checkin.mapOutside");
  const accuracy = position.status === "ok" ? Math.max(4, (position.accuracyM * R) / property.geofenceRadiusM) : 0;

  return (
    <div role="img" aria-label={t("checkin.mapLabel", { property: property.name, where })} className="relative overflow-hidden rounded-2xl border border-st-track bg-st-surface">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[230px] w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="st-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="var(--st-track)" strokeWidth="1" opacity="0.6" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#st-grid)" />
        <circle cx={cx} cy={cy} r={R} fill="var(--st-ok)" fillOpacity="0.08" stroke="var(--st-ok)" strokeWidth="2" strokeDasharray="6 5" />
        <rect x={cx - 6} y={cy - 6} width="12" height="12" transform={`rotate(45 ${cx} ${cy})`} fill="var(--st-accent)" stroke="var(--st-surface)" strokeWidth="2" />
        {you && (
          <g>
            {!you.edge && <circle cx={you.x} cy={you.y} r={accuracy} fill="var(--st-info)" fillOpacity="0.15" />}
            <circle cx={you.x} cy={you.y} r="9" fill="#ffffff" stroke="#1c4fa0" strokeWidth="5" />
          </g>
        )}
      </svg>
      {position.status === "ok" && (
        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-st-bg px-2.5 py-1 text-[11.5px] font-bold text-st-text-2">{t("checkin.gps", { m: position.accuracyM })}</span>
      )}
    </div>
  );
}
