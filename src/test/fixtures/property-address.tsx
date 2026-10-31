/* eslint-disable react-refresh/only-export-components -- Standalone browser test entry. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PropertyAddress } from "../../components/PropertyAddress";
import { PropertyChips } from "../../components/portal/PropertyChips";
import { Breadcrumb } from "../../components/layout/SidebarLayout";
import { Menu } from "../../components/Popover";
import { DataTable } from "../../components/DataTable";
import { FilterBar, type FilterValue } from "../../components/FilterBar";
import { propertyAddressText, propertyOptionLabel } from "../../lib/propertyAddress";
import "../../index.css";

const properties = [
  { id: "north", name: "The Oaks", address: "12345 North Peachtree Industrial Boulevard Extension, Building North", city: "Peachtree Corners", zip: "30092-1234" },
  { id: "south", name: "The Oaks", address: "2 South Main St", city: "Decatur", zip: "30030" },
  { id: "legacy", name: "Legacy property", address: null, city: "Atlanta", zip: null },
];

function Fixture() {
  const [selected, setSelected] = useState<string[]>([]);
  const [current, setCurrent] = useState("north");
  const [filters, setFilters] = useState<FilterValue>({});
  const property = properties.find((p) => p.id === current)!;
  return <MemoryRouter><main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
    <Breadcrumb root={{ label: "Properties", to: "/portal" }} crumbs={[{ label: property.name, description: propertyAddressText(property) }]} />
    <section aria-label="Property header" className="rounded-xl border border-line p-4">
      <h1 className="m-0">{property.name}</h1><PropertyAddress property={property} />
    </section>
    <PropertyChips properties={properties} value={selected} onChange={setSelected} />
    <output aria-label="Selected IDs">{selected.join(",") || "None"}</output>
    <Menu label="Choose property" items={properties.map((p) => ({ id: p.id, label: p.name, description: propertyAddressText(p), onSelect: () => setCurrent(p.id) }))}
      trigger={(props) => <button {...props} className="rounded-lg border border-field p-3">Choose property</button>} />
    <label>Property<select aria-label="Property" className="block w-full min-w-0" value={current} onChange={(e) => setCurrent(e.target.value)}>{properties.map((p) => <option key={p.id} value={p.id}>{propertyOptionLabel(p)}</option>)}</select></label>
    <output aria-label="Current ID">{current}</output>
    <FilterBar filters={[{ key: "property", label: "Property", type: "multi", options: properties.map((p) => ({ value: p.id, label: p.name, description: propertyAddressText(p) })) }]} value={filters} onChange={setFilters} />
    <DataTable label="Properties" rows={properties} rowKey={(p) => p.id} minWidth={0} empty={null} columns={[{ key: "property", header: "Property", cell: (p) => <span>{p.name}<PropertyAddress property={p} /></span> }]} />
  </main></MemoryRouter>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
