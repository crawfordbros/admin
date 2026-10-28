/* eslint-disable react-refresh/only-export-components -- Standalone browser test entry, not an application module. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { Menu } from "../../components/Popover";
import { Drawer, Modal } from "../../components/overlay";
import "../../index.css";

// This entry is served only by Vite's test fixture HTML, never by the application.
const params = new URLSearchParams(window.location.search);
const rows = Array.from({ length: params.has("many") ? 40 : 1 }, (_, i) => ({ id: String(i + 1), name: `Person ${i + 1}` }));

function Fixture() {
  const [dialog, setDialog] = useState<string | null>(null);
  const [activity, setActivity] = useState(false);
  const [rowClicks, setRowClicks] = useState(0);
  const [selected, setSelected] = useState("");
  return (
    <MemoryRouter>
      <main className="p-4 sm:p-12" style={{ paddingTop: params.has("bottom") ? "calc(100dvh - 160px)" : undefined }}>
        <button className="mb-2" type="button">Before table</button>
        <section className="overflow-hidden rounded-[14px] border border-line bg-white">
          <DataTable
            label="Users"
            rows={rows}
            rowKey={(row) => row.id}
            minWidth={1040}
            empty={null}
            onRowClick={() => setRowClicks((count) => count + 1)}
            columns={[
              { key: "person", header: "Person", className: "w-[900px]", cell: (row) => row.name },
              { key: "actions", header: "Actions", cell: (row) => (
                <Menu
                  label={`Actions for ${row.name}`}
                  items={[
                    { label: "Change role", onSelect: () => setDialog("Change role") },
                    { label: "View activity", onSelect: () => setActivity(true) },
                    { label: "Protected action", disabled: true },
                    ...(params.has("long") ? Array.from({ length: 25 }, (_, i) => ({ label: `Extra action ${i + 1}`, onSelect: () => setSelected(`Extra action ${i + 1}`) })) : []),
                    { label: "Remove access", onSelect: () => setDialog("Remove access"), tone: "danger" as const },
                  ]}
                  trigger={(props) => <button {...props} type="button" aria-label={`Actions for ${row.name}`} className="flex size-9 items-center justify-center rounded-[9px] border border-line">⋮</button>}
                />
              ) },
            ]}
          />
        </section>
        <button className="mt-2" type="button">After table</button>
        <output aria-label="Row clicks">{rowClicks}</output>
        <output aria-label="Selected action">{selected}</output>
        <div aria-hidden="true" style={{ height: 600 }} />
        {dialog && <Modal title={dialog} onClose={() => setDialog(null)}><input aria-label="Name" /><button onClick={() => setDialog(null)}>Confirm</button></Modal>}
        {activity && <Drawer title="Activity" onClose={() => setActivity(false)}><p>No changes recorded.</p></Drawer>}
      </main>
    </MemoryRouter>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
