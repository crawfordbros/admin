import { useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, useApi, type QuoteCard, type QuoteStage, type QuotesKpis } from "../../lib/api";
import { PROPERTY_TYPE_LABELS, formatCount, replyHours, timeAgo } from "../../lib/format";
import { useFormSubmit } from "../../lib/useFormSubmit";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button, Loading, SelectField, TextField } from "../../components/ui";
import { Avatar, EmptyState, PageHeader, Pill, StatTile } from "../../components/display";
import { SegmentedControl } from "../../components/controls";
import { SearchField } from "../../components/FilterBar";
import { DataTable } from "../../components/DataTable";
import { Menu } from "../../components/Popover";
import { Modal } from "../../components/overlay";
import { Icon, type IconName } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { SERVICE_LABELS, STAGES, stageLabel } from "./copy";
import { ConvertModal, LostModal } from "./stageModals";

const ACTIVITY_ICONS: Record<QuoteCard["lastActivity"]["kind"], IconName> = { form: "mail", email_in: "mail", email_out: "send", document: "file", note: "edit", stage: "check" };
const hoursSince = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;
const ageText = (iso: string) => {
  const h = hoursSince(iso);
  return h < 48 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}d`;
};
const overdue = (q: QuoteCard) => q.stage === "new" && !q.firstResponseAt && hoursSince(q.createdAt) > 24;

/** /admin/quotes: requests from the website, conversations from quotes@, contracts out (ADMIN_PORTAL_SPEC 7.13). */
export function QuotesPage() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { params, update } = useQueryState();
  const [creating, setCreating] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [losing, setLosing] = useState<QuoteCard | null>(null);
  const [winning, setWinning] = useState<QuoteCard | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  useAdminPage("Quotes");

  const view = params.get("view") === "list" ? "list" : "pipeline";
  const q = params.get("q") ?? "";
  const quotes = useQuery({ queryKey: ["admin", "quotes", q.trim()], queryFn: () => api<{ items: QuoteCard[]; kpis: QuotesKpis }>(`/admin/quotes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`), placeholderData: (p) => p, refetchInterval: 60_000 });

  const move = useMutation({
    mutationFn: ({ quote, stage, lostReason }: { quote: QuoteCard; stage: QuoteStage; lostReason?: string }) =>
      api(`/admin/quotes/${quote.id}`, { method: "PATCH", body: JSON.stringify({ stage, ...(lostReason ? { lostReason } : {}) }) }),
    onSuccess: async (_r, { quote, stage }) => {
      toast.success(`${quote.community ?? quote.contactName} moved to ${stageLabel(stage)}.`);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  /** Lost asks why; Won offers to set up the organization; the rest move straight away. */
  const moveTo = (quote: QuoteCard, stage: QuoteStage) => {
    if (stage === quote.stage) return;
    if (stage === "lost") return setLosing(quote);
    if (stage === "won") return setWinning(quote);
    move.mutate({ quote, stage });
  };

  const items = quotes.data?.items ?? [];
  const k = quotes.data?.kpis;
  // The longest-waiting new request gets the highlight.
  const urgent = items.filter(overdue).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id;

  const onDrop = (stage: QuoteStage) => (e: DragEvent) => {
    e.preventDefault();
    const quote = items.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    setDragging(null);
    if (quote) moveTo(quote, stage);
  };

  return (
    <>
      <PageHeader
        title="Quotes"
        description={
          <>
            Requests from the website, replies from <strong className="text-ink">quotes@cbenvironments.com</strong>, and contracts out for signature.
          </>
        }
        actions={
          <>
            <SegmentedControl
              label="Layout"
              value={view}
              onChange={(v) => update({ view: v === "pipeline" ? null : v })}
              options={[
                { value: "pipeline", label: "Pipeline" },
                { value: "list", label: "List" },
              ]}
            />
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              New quote
            </Button>
          </>
        }
      />

      {k && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
          <StatTile label="New requests" value={k.newCount} sub={k.newOver24h ? `${k.newOver24h} waiting over 24h` : "None waiting long"} tone={k.newOver24h ? "bad" : "good"} />
          <StatTile label="Avg first response" value={replyHours(k.avgFirstResponseHours)} sub="Goal: same day" />
          <StatTile label="Quotes out" value={k.quotesOut} sub={`${formatCount(k.quotesOutUnits)} units`} />
          <StatTile label="Contracts out" value={k.contractsOut} sub={k.oldestContractSentAt ? `Oldest sent ${timeAgo(k.oldestContractSentAt)}` : "None out"} />
          <StatTile label="Won this quarter" value={k.wonThisQuarter} sub={k.winRatePct === null ? "No decisions yet" : `${k.winRatePct}% win rate`} tone={k.winRatePct === null ? "neutral" : "good"} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField label="Search quotes" placeholder="Community, company, contact or #501" value={q} onChange={(v) => update({ q: v })} />
        {view === "pipeline" && (
          <button type="button" aria-pressed={showLost} onClick={() => setShowLost((s) => !s)} className="text-[13px] font-bold text-navy hover:underline">
            {showLost ? "Hide Lost" : `Show Lost (${items.filter((x) => x.stage === "lost").length})`}
          </button>
        )}
      </div>

      {quotes.error && <Alert>{errorMessage(quotes.error)}</Alert>}
      {quotes.isPending && <Loading />}

      {quotes.data && view === "pipeline" && (
        <div className="-mx-4 flex items-start gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" aria-label="Pipeline" role="region">
          {STAGES.filter((s) => s.value !== "lost" || showLost).map((s) => {
            const cards = items.filter((x) => x.stage === s.value);
            return (
              <section
                key={s.value}
                aria-labelledby={`col-${s.value}`}
                onDragOver={(e) => dragging && e.preventDefault()}
                onDrop={onDrop(s.value)}
                className={cx("flex w-[268px] flex-none flex-col gap-2.5 rounded-[14px] bg-[#ecedf5] p-3", dragging && "outline-2 outline-dashed outline-navy/30")}
              >
                <div className="flex items-center justify-between px-1 pt-0.5">
                  <h2 id={`col-${s.value}`} className="m-0 flex items-center gap-2 font-sans text-[14px] font-bold text-ink">
                    <span aria-hidden="true" className={cx("size-[9px] rounded-full", s.dot)} />
                    {s.label}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-bold text-muted">{cards.length}</span>
                </div>
                <p className="m-0 -mt-1 px-1 text-[12px] text-muted">{s.sub}</p>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {cards.map((card) => (
                    <li key={card.id}>
                      <PipelineCard quote={card} hot={card.id === urgent} onMove={(stage) => moveTo(card, stage)} onDrag={setDragging} />
                    </li>
                  ))}
                </ul>
                {cards.length === 0 && <p className="m-0 rounded-xl border border-dashed border-placeholder px-3 py-5 text-center text-[12.5px] text-muted">Nothing here</p>}
              </section>
            );
          })}
        </div>
      )}

      {quotes.data && view === "list" && <QuoteList items={items} />}

      {creating && <NewQuoteModal onClose={() => setCreating(false)} />}
      {losing && (
        <LostModal
          name={losing.community ?? losing.contactName}
          onClose={() => setLosing(null)}
          onConfirm={async (reason) => {
            await move.mutateAsync({ quote: losing, stage: "lost", lostReason: reason });
            setLosing(null);
          }}
        />
      )}
      {winning && <ConvertModal quote={winning} onClose={() => setWinning(null)} />}
    </>
  );
}

function PipelineCard({ quote, hot, onMove, onDrag }: { quote: QuoteCard; hot: boolean; onMove: (stage: QuoteStage) => void; onDrag: (id: string | null) => void }) {
  const late = overdue(quote);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", quote.id);
        e.dataTransfer.effectAllowed = "move";
        onDrag(quote.id);
      }}
      onDragEnd={() => onDrag(null)}
      className={cx("relative flex flex-col gap-2.5 rounded-xl bg-white p-3.5 text-ink", hot ? "border-2 border-navy shadow-[0_6px_16px_rgba(39,43,132,0.14)]" : "border border-line")}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <Link to={`/admin/quotes/${quote.id}`} className="block text-[14.5px] font-bold text-ink no-underline after:absolute after:inset-0 hover:underline">
            {quote.community ?? quote.company ?? quote.contactName}
          </Link>
          <span className="text-[12px] text-muted">{quote.company ?? quote.contactName}</span>
        </span>
        <Pill tone={late ? "danger" : "neutral"} className="flex-none text-[11px]">
          {ageText(quote.createdAt)}
          {late && <span className="sr-only"> waiting, over 24 hours</span>}
        </Pill>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {quote.propertyCount != null && <span className="rounded-md bg-tint-2 px-2 py-0.5 text-[11.5px] font-bold text-navy">{formatCount(quote.propertyCount)} {quote.propertyCount === 1 ? "property" : "properties"}</span>}
        {quote.units !== null && <span className="rounded-md bg-tint-2 px-2 py-0.5 text-[11.5px] font-bold text-navy">{formatCount(quote.units)} total units</span>}
        {quote.kind === "contact" && <span className="rounded-md bg-gold-tint px-2 py-0.5 text-[11.5px] font-semibold text-gold-text">Contact message</span>}
        {quote.services.map((s) => (
          <span key={s} className="rounded-md bg-canvas px-2 py-0.5 text-[11.5px] font-semibold text-muted">
            {SERVICE_LABELS[s] ?? s}
          </span>
        ))}
      </span>
      <span className="flex items-center justify-between gap-2 text-[12px] text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name={ACTIVITY_ICONS[quote.lastActivity.kind]} size={14} strokeWidth={2} />
          <span className="truncate">{quote.lastActivity.text}</span>
        </span>
        <span className="relative z-10 flex flex-none items-center gap-1">
          {quote.owner ? <Avatar name={quote.owner.name} seed={quote.owner.id} size={24} /> : <span className="text-muted">—</span>}
          <Menu
            label={`Move ${quote.community ?? quote.contactName}`}
            items={STAGES.filter((s) => s.value !== quote.stage).map((s) => ({ label: `Move to ${s.label}`, onSelect: () => onMove(s.value) }))}
            trigger={(p) => (
              <button type="button" {...p} aria-label={`Move ${quote.community ?? quote.contactName} to another stage`} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-canvas">
                <Icon name="more" size={16} strokeWidth={2.6} />
              </button>
            )}
          />
        </span>
      </span>
    </div>
  );
}

function QuoteList({ items }: { items: QuoteCard[] }) {
  const navigate = useNavigate();
  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-white">
      <DataTable
        label="Quotes"
        rows={items}
        rowKey={(q) => q.id}
        onRowClick={(q) => navigate(`/admin/quotes/${q.id}`)}
        minWidth={1000}
        empty={<EmptyState icon="mail" title="No quotes match" body="Clear the search to see every request." />}
        columns={[
          { key: "ref", header: "Ref", cell: (q) => <span className="text-muted">#{q.refNo}</span> },
          {
            key: "community",
            header: "Community",
            cell: (q) => (
              <Link to={`/admin/quotes/${q.id}`} className="font-bold text-ink no-underline hover:underline">
                {q.community ?? q.contactName}
              </Link>
            ),
          },
          { key: "company", header: "Company", cell: (q) => q.company ?? "—" },
          { key: "propertyCount", header: "Properties", cell: (q) => (q.propertyCount == null ? "—" : formatCount(q.propertyCount)) },
          { key: "units", header: "Total units", cell: (q) => (q.units === null ? "—" : formatCount(q.units)) },
          { key: "services", header: "Services", cell: (q) => <span className="text-[13px]">{q.services.map((s) => SERVICE_LABELS[s] ?? s).join(", ") || "—"}</span> },
          { key: "stage", header: "Stage", cell: (q) => <StageBadge stage={q.stage} /> },
          { key: "owner", header: "Owner", cell: (q) => q.owner?.name ?? <span className="text-muted">Unassigned</span> },
          { key: "activity", header: "Last activity", cell: (q) => <span className="text-[13px]">{q.lastActivity.text} · {timeAgo(q.lastActivity.at)}</span> },
          { key: "age", header: "Age", cell: (q) => <Pill tone={overdue(q) ? "danger" : "neutral"}>{ageText(q.createdAt)}</Pill> },
        ]}
      />
    </section>
  );
}

const STAGE_TONE: Record<QuoteStage, "danger" | "warning" | "navy" | "gold" | "success" | "muted"> = {
  new: "danger",
  conversation: "warning",
  quote_sent: "navy",
  contract_sent: "gold",
  won: "success",
  lost: "muted",
};

export function StageBadge({ stage }: { stage: QuoteStage }) {
  return <Pill tone={STAGE_TONE[stage]}>{stageLabel(stage)}</Pill>;
}

function NewQuoteModal({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) => {
      const text = (k: string) => String(v.get(k) ?? "").trim() || undefined;
      return api<{ quote: { id: string; refNo: number } }>("/admin/quotes", {
        method: "POST",
        body: JSON.stringify({
          contactName: text("contactName"),
          contactTitle: text("contactTitle"),
          contactEmail: text("contactEmail"),
          contactPhone: text("contactPhone"),
          company: text("company"),
          communityName: text("communityName"),
          address: text("address"),
          propertyCount: text("propertyCount") ? Number(text("propertyCount")) : undefined,
          unitCount: text("unitCount") ? Number(text("unitCount")) : undefined,
          propertyType: text("propertyType"),
          desiredStart: text("desiredStart"),
          currentProvider: text("currentProvider"),
          services: v.getAll("services"),
          message: text("message"),
        }),
      });
    },
    async ({ quote }) => {
      toast.success(`Quote #${quote.refNo} added.`);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      navigate(`/admin/quotes/${quote.id}`);
    },
  );
  return (
    <Modal
      size="lg"
      title="New quote"
      context="For requests that came in by phone or in person"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-quote" disabled={saving}>
            {saving ? "Adding…" : "Add quote"}
          </Button>
        </>
      }
    >
      <form id="new-quote" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Contact name" name="contactName" required autoComplete="off" error={errors.contactName} />
        <TextField label="Title" name="contactTitle" optional autoComplete="off" error={errors.contactTitle} />
        <TextField label="Email" name="contactEmail" type="email" required autoComplete="off" error={errors.contactEmail} />
        <TextField label="Phone" name="contactPhone" type="tel" optional autoComplete="off" error={errors.contactPhone} />
        <TextField label="Community or portfolio name" name="communityName" required error={errors.communityName} />
        <TextField label="Company" name="company" optional error={errors.company} />
        <TextField label="Address" name="address" optional error={errors.address} className="sm:col-span-2" />
        <TextField label="How many properties need service?" name="propertyCount" type="number" inputMode="numeric" min={1} max={100000} step={1} optional error={errors.propertyCount} />
        <TextField label="How many units TOTAL?" name="unitCount" type="number" inputMode="numeric" min={1} max={100000} step={1} optional hint="Across all properties needing service." error={errors.unitCount} />
        <SelectField label="Property type" name="propertyType" optional defaultValue="" error={errors.propertyType}>
          <option value="">Not sure</option>
          {Object.entries(PROPERTY_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Desired start" name="desiredStart" type="date" optional error={errors.desiredStart} />
        <TextField label="Current provider" name="currentProvider" optional error={errors.currentProvider} />
        <fieldset className="m-0 border-0 p-0 sm:col-span-2">
          <legend className="mb-1.5 p-0 text-sm font-semibold">Services</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SERVICE_LABELS).map(([k, label]) => (
              <label key={k} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-field px-3 text-[13.5px] font-semibold hover:bg-canvas has-checked:border-navy has-checked:bg-tint-2">
                <input type="checkbox" name="services" value={k} defaultChecked={k === "valet_trash"} className="accent-navy" />
                {label}
              </label>
            ))}
          </div>
          {errors.services && <p className="mt-1 mb-0 text-[13px] font-semibold text-danger">{errors.services}</p>}
        </fieldset>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="quote-message" className="text-sm font-semibold">
            What they asked for <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea id="quote-message" name="message" rows={3} className="rounded-lg border border-field px-3 py-2 text-base focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25" />
        </div>
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

