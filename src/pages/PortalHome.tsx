import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ROLE_LABELS, canAccess, roleFrom } from "../access";

type Tile = { title: string; body: string; to?: string };

export function PortalHome() {
  const { user } = useUser();
  const role = roleFrom(user?.publicMetadata);
  useEffect(() => {
    document.title = "Portal | CBES";
  }, []);

  const tiles: Tile[] = [];
  if (canAccess(role, "valet")) {
    tiles.push(
      { title: "Tonight's route", body: "Start the night, see your property and buildings." },
      { title: "Log a violation", body: "Camera first, works offline. Photos show trash and doorways, never people." },
      { title: "Close out the night", body: "Confirm buildings serviced and leave notes for the Monday report." },
    );
  }
  if (canAccess(role, "manager")) {
    tiles.push(
      { title: "Your property", body: "Open resident reports, this week's violations and Overwatch units." },
      { title: "Reports", body: "Resident reports and violations with filters and CSV export." },
    );
  }
  if (canAccess(role, "admin")) tiles.unshift({ title: "Admin dashboard", body: "All properties, reports, quotes and settings.", to: "/admin" });

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mt-0 mb-1 text-sm font-semibold text-gold-text">{role ? ROLE_LABELS[role] : ""}</p>
      <h1 className="mt-0 mb-6 text-3xl font-bold text-navy">Welcome{user?.firstName ? `, ${user.firstName}` : ""}</h1>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
        {tiles.map((t) => (
          <li key={t.title} className="rounded-xl border border-line bg-white p-5">
            <h2 className="mt-0 mb-1.5 text-xl text-ink">
              {t.to ? <Link to={t.to}>{t.title}</Link> : t.title}
            </h2>
            <p className="m-0 leading-relaxed text-muted">{t.body}</p>
            {!t.to && <p className="mt-3 mb-0 text-[13px] font-semibold text-gold-text">Coming in Phase 2</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
