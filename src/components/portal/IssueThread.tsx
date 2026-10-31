import type { PortalIssueEvent } from "../../lib/api";
import { useAuthedImage } from "../../lib/images";
import { serviceTime } from "../../lib/format";
import { Avatar } from "../display";
import { Icon } from "../icons";
import { cx } from "../styles";

function Photo({ path, label }: { path: string; label: string }) {
  const src = useAuthedImage(path, path);
  return src ? (
    <a href={src} target="_blank" rel="noreferrer" className="mt-2.5 block w-40">
      <img src={src} alt={label} className="h-[100px] w-40 rounded-[10px] object-cover" />
    </a>
  ) : (
    <span aria-hidden="true" className="mt-2.5 block h-[100px] w-40 animate-pulse rounded-[10px] bg-neutral-bg motion-reduce:animate-none" />
  );
}

/**
 * A resident issue's conversation (REP_PORTAL_SPEC 4.4): the resident on the left, CBES on the
 * right. Calls show that CBES called, never what was said.
 */
export function IssueThread({ events, resident, photos = [] }: { events: PortalIssueEvent[]; resident: string; photos?: { id: string; url: string }[] }) {
  return (
    <ol aria-label="Conversation" className="m-0 flex list-none flex-col gap-4 p-0">
      {events.map((e, i) => {
        if (e.kind === "status") {
          return (
            <li key={i} className="flex items-center justify-center gap-2 text-[12.5px] font-bold text-success">
              <Icon name="check" size={15} strokeWidth={2.6} />
              {e.label} by CBES · {serviceTime(e.at)}
            </li>
          );
        }
        const fromResident = e.kind === "created";
        const name = fromResident ? `${resident} · Resident` : `${e.actor.name} · ${e.actor.title}`;
        return (
          <li key={i} className={cx("flex items-start gap-2.5", !fromResident && "flex-row-reverse")}>
            <Avatar name={fromResident ? resident : e.actor.name} seed={fromResident ? "resident" : e.actor.name} size={34} />
            <div className={cx("max-w-[78%] rounded-[14px] px-3.5 py-3", fromResident ? "bg-canvas" : "bg-tint-2")}>
              <p className="m-0 flex flex-wrap items-baseline gap-2">
                <strong className="text-[13.5px]">{name}</strong>
                <span className="text-[12px] text-muted">{serviceTime(e.at)}</span>
              </p>
              {e.kind === "call" ? (
                <p className="m-0 mt-1 flex items-center gap-1.5 text-[14px] text-muted">
                  <Icon name="phone" size={15} />
                  Called the resident.
                </p>
              ) : (
                (e.body || fromResident) && <p className="m-0 mt-1 text-[14px] leading-normal whitespace-pre-wrap">{e.body || "No details given."}</p>
              )}
              {e.kind === "created" && e.photo && photos.map((p, n) => <Photo key={p.id} path={p.url} label={`Resident's photo ${n + 1}`} />)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
