import type { ReplyClock, ReportRow } from "../../lib/api";
import { clockView } from "../../lib/replyClock";
import { Pill } from "../../components/display";
import { Icon, type IconName } from "../../components/icons";

const ISSUE_ICONS: Record<string, IconName> = {
  missed_pickup: "trash",
  trash_in_hallway: "home",
  spill_mess: "droplet",
  container_damaged_missing: "box",
  bulk_pickup_request: "truck",
  valet_conduct_noise: "volume",
  item_taken: "alert-circle",
};

export function IssueIcon({ issueKey }: { issueKey: string }) {
  return (
    <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-tint-2 text-navy">
      <Icon name={ISSUE_ICONS[issueKey] ?? "message"} size={16} strokeWidth={2} />
    </span>
  );
}

export function ReplyClockChip({ clock }: { clock: ReplyClock }) {
  const { text, tone } = clockView(clock);
  return <Pill tone={tone}>{text}</Pill>;
}

const SOURCE_LABELS: Record<ReportRow["source"], string> = { web: "Web", qr: "QR", phone: "Phone", import: "Import" };

export function SourceChip({ source }: { source: ReportRow["source"] }) {
  return <span className="rounded-md bg-neutral-bg px-2 py-0.5 text-[12px] font-bold text-muted">{SOURCE_LABELS[source]}</span>;
}
