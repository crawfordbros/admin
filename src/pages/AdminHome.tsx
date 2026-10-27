import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ADMIN_SECTIONS } from "./adminSections";

const KPIS = ["Open reports", "Reports this week", "Avg. first reply", "Violations logged", "Overwatch units"];

export function AdminHome() {
  useEffect(() => {
    document.title = "Admin | CBES";
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mt-0 mb-1 text-3xl font-bold text-navy">Overview</h1>
      <p className="mt-0 mb-6 text-muted">The dashboard fills in during Phase 2, once reports and violations flow through the API.</p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KPIS.map((k) => (
          <div key={k} className="rounded-xl border border-line bg-white p-4">
            <p className="m-0 font-heading text-3xl font-bold text-navy">—</p>
            <p className="mt-1 mb-0 text-[13px] text-muted">{k}</p>
          </div>
        ))}
      </div>

      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.filter((s) => s.path !== "/admin").map((s) => (
          <li key={s.path} className="rounded-xl border border-line bg-white p-5">
            <h2 className="mt-0 mb-1.5 text-lg">
              <Link to={s.path}>{s.label}</Link>
            </h2>
            <p className="m-0 text-[15px] leading-relaxed text-muted">{s.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
