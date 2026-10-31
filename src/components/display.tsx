import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkline } from "./charts/charts";
import { Icon, type IconName } from "./icons";
import { cx } from "./styles";
import { PILL, STATUS, avatarColor, initials, type PillTone, type StatusKind, type StatusOf } from "./displayUtils";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-[1_1_420px]">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-[14px] font-semibold no-underline">
            <Icon name="chevron-left" size={16} strokeWidth={2.2} />
            {back.label}
          </Link>
        )}
        <h1 className="m-0 text-[26px] font-bold text-navy-ink sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 mb-0 max-w-3xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export type Tone = "good" | "bad" | "neutral";

const TILE_ICON: Record<"navy" | "success" | "warning" | "neutral" | "gold", string> = {
  navy: "bg-tint-2 text-navy",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  neutral: "bg-neutral-bg text-muted",
  gold: "bg-gold-tint text-gold-text",
};

/** A headline number with its trend, linking to the page that explains it. */
export function KpiTile({
  label,
  value,
  delta,
  icon,
  iconTone = "navy",
  spark,
  to,
}: {
  label: string;
  value: ReactNode;
  delta?: { text: string; tone: Tone };
  icon?: IconName;
  iconTone?: keyof typeof TILE_ICON;
  spark?: number[];
  to?: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted">{label}</span>
        {icon && (
          <span className={cx("flex size-8 flex-none items-center justify-center rounded-[9px]", TILE_ICON[iconTone])}>
            <Icon name={icon} size={18} strokeWidth={2} />
          </span>
        )}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="font-heading text-[32px] leading-none font-bold text-navy-ink">{value}</span>
        {spark && <Sparkline values={spark} tone={delta?.tone === "bad" ? "danger" : delta?.tone === "good" ? "success" : "navy"} />}
      </span>
      {delta && (
        <span className={cx("text-[12.5px] font-bold", delta.tone === "good" ? "text-success" : delta.tone === "bad" ? "text-danger" : "text-muted")}>
          {delta.text}
        </span>
      )}
    </>
  );
  const cls = "flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px] text-ink no-underline";
  return to ? (
    <Link to={to} className={cx(cls, "hover:border-navy/40 hover:text-ink")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A smaller number for detail pages. */
export function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-white px-4 py-3.5">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className="font-heading text-2xl leading-tight font-bold text-navy-ink">{value}</span>
      {sub && <span className={cx("text-[12px] font-bold", tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-muted")}>{sub}</span>}
    </div>
  );
}

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] leading-none font-bold whitespace-nowrap", PILL[tone], className)}>{children}</span>;
}

export function StatusBadge<K extends StatusKind>({ kind, status }: { kind: K; status: StatusOf<K> }) {
  const [label, tone] = (STATUS[kind] as Record<string, readonly [string, PillTone]>)[status as string] ?? [String(status), "neutral"];
  return <Pill tone={tone}>{label}</Pill>;
}

export function Avatar({ name, seed, size = 28, square }: { name: string; seed?: string; size?: number; square?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx("flex flex-none items-center justify-center font-bold text-white", square ? "rounded-lg" : "rounded-full")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: avatarColor(seed ?? name) }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 28 }: { people: { id: string; name: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center" aria-label={people.map((p) => p.name).join(", ")} role="img">
      {shown.map((p, i) => (
        <span key={p.id} className={cx("rounded-full ring-2 ring-white", i > 0 && "-ml-2")}>
          <Avatar name={p.name} seed={p.id} size={size} />
        </span>
      ))}
      {more > 0 && (
        <span className="-ml-2 flex items-center justify-center rounded-full bg-neutral-bg text-[11px] font-bold text-muted ring-2 ring-white" style={{ width: size, height: size }}>
          +{more}
        </span>
      )}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-tint-2 text-navy">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="m-0 text-lg text-navy-ink">{title}</h2>
      <p className="m-0 max-w-md text-[14.5px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Renders its children only after `ms`, so fast loads don't flash a skeleton. */
export function Delayed({ ms = 300, children }: { ms?: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : null;
}

/** A gray placeholder block shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("block animate-pulse rounded-md bg-neutral-bg motion-reduce:animate-none", className)} />;
}

/** Placeholder tiles for a KPI row. */
export function TileSkeletons({ count = 5 }: { count?: number }) {
  return (
    <Delayed>
    <div role="status" aria-label="Loading" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
    </Delayed>
  );
}
