import { useState } from "react";
import type { PropertyHome } from "../../../lib/api";
import { PROPERTY_ROLE_LABELS, formatDay } from "../../../lib/format";
import { Avatar, Pill } from "../../../components/display";
import { QrCode } from "../../../components/portal/QrCode";
import { useToast } from "../../../components/Toast";

const card = "rounded-[14px] border border-line bg-white p-[18px]";
const smallButton = "h-9 rounded-[9px] border border-field bg-white px-3 text-[13px] font-bold text-navy hover:bg-canvas disabled:opacity-60";

/** "all 6 buildings done, 8:02 PM to 11:48 PM. 2 violations logged." */
function lastNightSentence(n: NonNullable<PropertyHome["tonight"]["lastNight"]>) {
  const times = n.firstClockIn ? (n.lastClockOut ? `${n.firstClockIn} to ${n.lastClockOut}` : `from ${n.firstClockIn}`) : null;
  const done = n.buildingsDone != null && n.buildings ? `${n.buildingsDone} of ${n.buildings} buildings done` : null;
  return `Last service night (${formatDay(n.date)}): ${[done, times].filter(Boolean).join(", ") || "valets clocked in"}. ${n.violations} violation${n.violations === 1 ? "" : "s"} sent to you so far.`;
}

export function TonightCard({ home }: { home: PropertyHome }) {
  const t = home.tonight;
  return (
    <section aria-labelledby="tonight-title" className="flex flex-col gap-3.5 rounded-2xl bg-navy-ink p-5 text-white">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tonight-title" className="m-0 text-[17px] text-white">
          Tonight's service
        </h2>
        <span className="rounded-full bg-navy px-2.5 py-0.5 text-[12px] font-bold text-gold-light">{t.isServiceNight ? `Starts ${t.startsAt}` : "No service tonight"}</span>
      </div>
      <div className="flex items-center gap-3 border-b border-nav-line pb-3">
        {t.steward ? (
          <>
            <Avatar name={t.steward.name} seed={t.steward.id} size={42} />
            <span>
              <span className="block text-[12px] text-nav-pill">Your CBES Steward</span>
              <span className="block font-bold">{t.steward.name}</span>
            </span>
          </>
        ) : (
          <span className="text-[13px] text-nav-pill">CBES is assigning your Steward.</span>
        )}
      </div>
      {t.valets.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {t.valets.map((v) => (
            <li key={v.id} className="flex items-center gap-2.5">
              <Avatar name={v.name} seed={v.id} size={32} />
              <span className="flex-1">
                <span className="block text-[13.5px] font-bold">{v.name}</span>
                <span className="block text-[12px] text-nav-pill">{v.area ? `Valet · ${v.area}` : "Valet"}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-nav-pill">Valets show here once CBES assigns them.</p>
      )}
      {t.lastNight && <p className="m-0 border-t border-nav-line pt-3 text-[12.5px] text-nav-pill">{lastNightSentence(t.lastNight)}</p>}
    </section>
  );
}

export function TeamCard({ home, canManage, onManage }: { home: PropertyHome; canManage: boolean; onManage: () => void }) {
  const org = home.organization?.name;
  return (
    <section aria-labelledby="team-title" className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="team-title" className="m-0 text-[17px]">
          Property team
        </h2>
        {canManage ? (
          <button type="button" onClick={onManage} className="text-[13px] font-bold text-navy hover:underline">
            Manage
          </button>
        ) : (
          <span className="text-[12px] text-muted">Managed by your Representative</span>
        )}
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {home.team.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5">
            <Avatar name={m.name} seed={m.id} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">{m.name}</span>
              <span className="block text-[12px] text-muted">
                {PROPERTY_ROLE_LABELS[m.role]}
                {m.you ? " (you)" : ""}
              </span>
            </span>
            {m.receivesWeeklyReport && (
              <Pill tone="gold" className="py-0.5! text-[11px]">
                Weekly report
              </Pill>
            )}
          </li>
        ))}
        {home.team.members.length === 0 && <li className="text-[13px] text-muted">No property manager yet.</li>}
        {home.team.representatives.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5">
            <Avatar name={r.name} seed={r.id} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">{r.name}</span>
              <span className="block text-[12px] text-muted">Representative{org ? ` · ${org}` : ""}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReportLinkCard({ home }: { home: PropertyHome }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const url = home.reportLink.url;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Your browser didn't allow copying. Select the link and copy it instead.");
    }
  };
  const poster = async () => {
    setBusy(true);
    try {
      const [{ default: QRCode }, { buildQrPoster, posterFileName }] = await Promise.all([import("qrcode"), import("../../../lib/qr-poster-pdf")]);
      const qrPng = await QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: "#1a1c3d", light: "#ffffff" } });
      buildQrPoster({ propertyName: home.property.name, url, qrPng }).save(posterFileName(home.property.name));
    } catch {
      toast.error("We couldn't make the poster. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="report-link-title" className={`${card} flex flex-col gap-3`}>
      <h2 id="report-link-title" className="m-0 text-[17px]">
        Report an Issue link
      </h2>
      <div className="flex items-center gap-3.5">
        <QrCode value={url} size={84} label="QR code for the Report an Issue link" />
        <span className="min-w-0 text-[13px] text-muted">
          Printed on every container. Residents scan it to report a missed pickup or a problem.
          <span className="mt-1.5 block font-bold break-all text-ink">{url.replace(/^https?:\/\//, "")}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={smallButton}>
          Copy link
        </button>
        <button type="button" onClick={poster} disabled={busy} className={smallButton}>
          {busy ? "Preparing…" : "Download QR poster"}
        </button>
      </div>
    </section>
  );
}
