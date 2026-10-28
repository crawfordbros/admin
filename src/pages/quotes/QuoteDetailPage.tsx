import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import { errorMessage, useApi, useApiBlob, type ContractTemplate, type QuoteDetail, type QuoteDocument, type QuoteStage, type QuoteTerm } from "../../lib/api";
import { PROPERTY_TYPE_LABELS, dateTime, formatCount, timeAgo } from "../../lib/format";
import { Alert, Button, Loading } from "../../components/ui";
import { Avatar, Pill } from "../../components/display";
import { FileDrop } from "../../components/media";
import { Menu } from "../../components/Popover";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { SERVICE_LABELS, STAGES, TERM_LABELS, money, template, type TemplateKey } from "./copy";
import { ConvertModal, LostModal } from "./stageModals";

const card = "rounded-[14px] border border-line bg-white p-[18px]";
const DOC_TYPES = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOC = 20 * 1024 * 1024;
const TEMPLATE_LABELS: Record<TemplateKey, string> = { quote: "Send quote", visit: "Schedule site visit", contract: "Send contract", follow_up: "Follow up" };
const DOC_STATUS_TONE = { draft: "neutral", ready: "success", sent: "info", signed: "success" } as const;
const DOC_STATUS_LABEL = { draft: "Draft", ready: "Ready", sent: "Sent", signed: "Signed" } as const;

/** /admin/quotes/:id — the request, the email thread from quotes@, the quote and the contract (ADMIN_PORTAL_SPEC 7.14). */
export function QuoteDetailPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["admin", "quote", id];
  const { data: q, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<QuoteDetail>(`/admin/quotes/${id}`) });
  const [losing, setLosing] = useState(false);
  const [winning, setWinning] = useState(false);
  // "Send contract" restarts the composer with the contract template and files attached.
  const [compose, setCompose] = useState<{ template: TemplateKey; docs: string[]; n: number } | null>(null);
  useAdminPage(q ? (q.community ?? q.contactName) : null, q && [{ label: "Quotes", to: "/admin/quotes" }, { label: q.community ?? q.contactName }]);

  const saved = async (quote: QuoteDetail, message?: string) => {
    queryClient.setQueryData(key, quote);
    if (message) toast.success(message);
    await queryClient.invalidateQueries({ queryKey: ["admin", "quotes"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ quote: QuoteDetail }>(`/admin/quotes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: ({ quote }, body) => saved(quote, body.stage ? `Moved to ${STAGES.find((s) => s.value === body.stage)!.label}.` : "Saved."),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const setStage = (stage: QuoteStage) => {
    if (stage === q.stage) return;
    if (stage === "lost") return setLosing(true);
    if (stage === "won" && !q.organizationId) return setWinning(true);
    patch.mutate({ stage });
  };
  const at = STAGES.findIndex((s) => s.value === q.stage);

  return (
    <div className="flex flex-col gap-[18px]">
      <Link to="/admin/quotes" className="inline-flex items-center gap-1.5 self-start text-[14px] font-bold no-underline">
        <Icon name="chevron-left" size={16} strokeWidth={2.2} />
        Quotes pipeline
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="min-w-0">
          <h1 className="m-0 text-[24px] text-navy-ink sm:text-[28px]">{q.community ?? q.contactName}</h1>
          <p className="mt-1 mb-0 text-[14px] text-muted">
            {[q.company, q.units !== null && `${formatCount(q.units)} units`, `#${q.refNo}`, `requested ${dateTime(q.createdAt)}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div role="group" aria-label="Quote stage" className="flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
          {STAGES.map((s, i) => {
            const now = s.value === q.stage;
            const done = q.stage !== "lost" && i < at && s.value !== "lost";
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={now}
                disabled={patch.isPending}
                onClick={() => setStage(s.value)}
                className={cx("rounded-[9px] px-3 py-2 text-[12.5px] font-bold", now ? "bg-navy text-white" : done ? "bg-success-bg text-success" : "text-muted hover:bg-canvas")}
              >
                {done && <Icon name="check" size={12} strokeWidth={3} className="mr-1 inline" />}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      {q.stage === "lost" && q.lostReason && <p className="m-0 rounded-lg bg-neutral-bg px-4 py-2.5 text-[14px]">Lost: {q.lostReason}</p>}
      {q.organizationId && (
        <p className="m-0 rounded-lg bg-success-bg px-4 py-2.5 text-[14px] font-semibold text-success">
          Customer set up. <Link to={`/admin/organizations/${q.organizationId}`}>Open the organization</Link>
        </p>
      )}

      <div className="flex flex-wrap items-start gap-[18px]">
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <ContactCard q={q} />
          <RequestCard q={q} />
          <Notes q={q} onSaved={saved} />
        </aside>
        <Conversation key={compose?.n ?? 0} q={q} initial={compose} onSaved={saved} />
        <aside className="flex min-w-0 flex-[1_1_290px] flex-col gap-4">
          <OwnerCard q={q} onOwner={(ownerUserId) => patch.mutate({ ownerUserId })} />
          <QuoteCard q={q} onSaved={saved} />
          <ContractCard q={q} onSaved={saved} onSend={(docs) => setCompose((c) => ({ template: "contract", docs, n: (c?.n ?? 0) + 1 }))} />
        </aside>
      </div>

      {losing && (
        <LostModal
          name={q.community ?? q.contactName}
          onClose={() => setLosing(false)}
          onConfirm={async (lostReason) => {
            await patch.mutateAsync({ stage: "lost", lostReason });
            setLosing(false);
          }}
        />
      )}
      {winning && <ConvertModal quote={q} onClose={() => setWinning(false)} />}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="m-0 text-base text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ContactCard({ q }: { q: QuoteDetail }) {
  return (
    <Section title="Contact">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar name={q.contact.name} seed={q.contact.email} size={40} />
        <span>
          <strong className="block">{q.contact.name}</strong>
          {q.contact.title && <span className="text-[12.5px] text-muted">{q.contact.title}</span>}
        </span>
      </div>
      <p className="m-0 text-[13.5px] leading-[1.7] break-words">
        <a href={`mailto:${q.contact.email}`}>{q.contact.email}</a>
        {q.contact.phone && (
          <>
            <br />
            <a href={`tel:${q.contact.phone}`}>{q.contact.phone}</a>
          </>
        )}
      </p>
    </Section>
  );
}

function RequestCard({ q }: { q: QuoteDetail }) {
  const rows: [string, ReactNode][] = [
    ["Address", q.request.address],
    ["Type", q.request.propertyType ? (PROPERTY_TYPE_LABELS as Record<string, string>)[q.request.propertyType] ?? q.request.propertyType : null],
    ["Start", q.request.desiredStart ? new Date(`${q.request.desiredStart}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" }) : null],
    ["Current", q.request.currentProvider],
    [
      "Services",
      q.services.length ? (
        <span className="flex flex-wrap gap-1">
          {q.services.map((s) => (
            <span key={s} className="rounded-md bg-tint-2 px-1.5 py-0.5 text-[11.5px] font-bold text-navy">
              {SERVICE_LABELS[s] ?? s}
            </span>
          ))}
        </span>
      ) : null,
    ],
  ];
  const shown = rows.filter(([, v]) => v);
  return (
    <Section title={q.kind === "contact" ? "Message" : "Request"}>
      {shown.length > 0 && (
        <dl className="m-0 grid grid-cols-[90px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-[13.5px]">
          {shown.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {q.request.message && <blockquote className="m-0 mt-3 rounded-[10px] bg-subtle p-2.5 text-[13px] leading-normal whitespace-pre-wrap">{q.request.message}</blockquote>}
      <p className="mt-3 mb-0 text-[12px] text-muted">From the {q.source === "manual" ? "team (logged by hand)" : q.source === "email" ? "an email to quotes@" : q.source === "contact" ? "website contact form" : "website quote form"}</p>
    </Section>
  );
}

function Notes({ q, onSaved }: { q: QuoteDetail; onSaved: (q: QuoteDetail, message?: string) => Promise<void> }) {
  const api = useApi();
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () => api<{ quote: QuoteDetail }>(`/admin/quotes/${q.id}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim() }) }),
    onSuccess: async ({ quote }) => {
      setBody("");
      await onSaved(quote);
    },
  });
  return (
    <Section title="Internal notes">
      <ul className="m-0 mb-2.5 flex list-none flex-col gap-2 p-0">
        {q.notes.map((n) => (
          <li key={n.id} className="rounded-[10px] bg-[#fff9ec] p-2.5 text-[13px] leading-normal">
            <strong>{n.author?.name.split(" ")[0] ?? "CBES"}:</strong> {n.body}
            <span className="block text-[11.5px] text-muted">{timeAgo(n.createdAt)}</span>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <label htmlFor="quote-note" className="sr-only">
          Add internal note
        </label>
        <input id="quote-note" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note for the team, then press Enter" className="h-10 w-full rounded-[10px] border border-field px-2.5 text-[13.5px]" />
        <p className="mt-1.5 mb-0 text-[12px] text-muted">Notes are never emailed.</p>
        {add.error && <Alert>{errorMessage(add.error)}</Alert>}
      </form>
    </Section>
  );
}

function OwnerCard({ q, onOwner }: { q: QuoteDetail; onOwner: (id: string | null) => void }) {
  const api = useApi();
  const people = useQuery({ queryKey: ["admin", "assignees"], queryFn: () => api<{ items: { id: string; name: string; role: string }[] }>("/admin/assignees") });
  const listed = people.data?.items.filter((p) => p.role === "admin" || p.role === "super_admin") ?? [];
  // The current owner stays choosable even if they're no longer an admin.
  const admins = q.owner && !listed.some((p) => p.id === q.owner!.id) ? [q.owner, ...listed] : listed;
  return (
    <section className={cx(card, "py-3.5!")}>
      <label className="flex items-center justify-between gap-3 text-[13.5px] font-semibold">
        Owner
        <select value={q.owner?.id ?? ""} onChange={(e) => onOwner(e.target.value || null)} className="h-9 min-w-0 flex-1 rounded-[9px] border border-field bg-white px-2 text-[13.5px] font-normal">
          <option value="">Unassigned</option>
          {admins.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function Conversation({ q, initial, onSaved }: { q: QuoteDetail; initial: { template: TemplateKey; docs: string[] } | null; onSaved: (q: QuoteDetail, message?: string) => Promise<void> }) {
  const api = useApi();
  const { user } = useUser();
  const sender = user?.fullName ?? user?.firstName ?? "The CBES team";
  const start = initial ? template(initial.template, q, sender) : null;
  const [tpl, setTpl] = useState<TemplateKey | "">(initial?.template ?? "");
  const [subject, setSubject] = useState(() => start?.subject ?? `Re: ${q.community ?? q.company ?? "your request"}`);
  const [body, setBody] = useState(start?.body ?? "");
  const [cc, setCc] = useState("");
  const [attached, setAttached] = useState<Set<string>>(() => new Set(initial?.docs ?? []));
  const [error, setError] = useState<string | null>(null);

  const apply = (key: TemplateKey) => {
    const t = template(key, q, sender);
    setTpl(key);
    setSubject(t.subject);
    setBody(t.body);
  };

  const contract = tpl === "contract";
  const send = useMutation({
    mutationFn: () =>
      api<{ quote: QuoteDetail }>(`/admin/quotes/${q.id}/${contract ? "send-contract" : "messages"}`, {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          documentIds: [...attached],
          ...(contract ? {} : { cc: cc.split(/[,;\s]+/).filter(Boolean) }),
        }),
      }),
    onSuccess: async ({ quote }) => {
      setBody("");
      setAttached(new Set());
      setTpl("");
      setError(null);
      await onSaved(quote, `Sent to ${q.contact.email}.`);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const docs = q.documents.filter((d) => d.kind !== "signed_contract");

  return (
    <section aria-labelledby="thread-title" className="flex min-w-0 flex-[2_1_480px] flex-col rounded-[14px] border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-[18px] py-3.5">
        <h2 id="thread-title" className="m-0 text-base text-ink">
          Email conversation
        </h2>
        <span className="text-[12.5px] text-muted">Replies to quotes@ land here automatically</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3.5 p-[18px]">
        {q.messages.length === 0 && <li className="text-[14px] text-muted">No emails yet. The first reply starts the conversation.</li>}
        {q.messages.map((m) => {
          const us = m.direction === "out";
          return (
            <li key={m.id} className={cx("flex", us ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[82%] px-3.5 py-3", us ? "rounded-[14px_14px_4px_14px] border border-[#dadcf2] bg-tint-2" : "rounded-[14px_14px_14px_4px] bg-canvas")}>
                <p className={cx("m-0 mb-1.5 text-[12px] font-bold", us ? "text-navy" : "text-muted")}>
                  {us ? `${m.sentBy?.name ?? "CBES"} via quotes@` : m.from} · {dateTime(m.createdAt)}
                </p>
                {m.subject && <p className="m-0 mb-1 text-[13px] font-semibold">{m.subject}</p>}
                <p className="m-0 text-[14px] leading-[1.55] break-words whitespace-pre-line">{m.body}</p>
                {m.attachments.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <DocDownload key={a.id} quoteId={q.id} doc={{ id: a.id, fileName: a.fileName }} className="rounded-lg bg-white px-2.5 py-1 text-[12.5px] font-bold" />
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <form
        className="mx-[18px] mb-[18px] overflow-hidden rounded-xl border-[1.5px] border-navy"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return setError("Write the email first.");
          if (contract && attached.size === 0) return setError("Attach the contract to send.");
          send.mutate();
        }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-[#f8f8fd] px-3 py-2.5 text-[13px]">
          <span>
            <span className="text-muted">From</span> <strong>quotes@cbenvironments.com</strong>
          </span>
          <span>
            <span className="text-muted">To</span> <strong>{q.contact.name}</strong>
          </span>
          <label className="ml-auto flex items-center gap-1.5">
            <span className="text-muted">Template</span>
            <select value={tpl} onChange={(e) => e.target.value && apply(e.target.value as TemplateKey)} className="h-[30px] rounded-lg border border-field bg-white px-1.5 text-[12.5px]">
              <option value="">None</option>
              {(Object.keys(TEMPLATE_LABELS) as TemplateKey[]).map((k) => (
                <option key={k} value={k}>
                  {TEMPLATE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!contract && (
          <label className="flex items-center gap-2 border-b border-row-line px-3 py-1.5 text-[13px]">
            <span className="text-muted">Cc</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional, separate with commas" className="h-8 flex-1 border-0 text-[13px] outline-none" />
          </label>
        )}
        <label className="flex items-center gap-2 border-b border-row-line px-3 py-1.5 text-[13px]">
          <span className="text-muted">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 flex-1 border-0 text-[13.5px] font-semibold outline-none" />
        </label>
        <label htmlFor="reply" className="sr-only">
          Email to {q.contact.name}
        </label>
        <textarea id="reply" rows={6} value={body} onChange={(e) => setBody(e.target.value)} className="block w-full resize-y border-0 px-3 py-3 text-[14px] leading-[1.55] outline-none" />
        {docs.length > 0 && (
          <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 border-t border-row-line px-3 py-2">
            <legend className="float-left mr-1.5 p-0 text-[12.5px] font-bold text-muted">Attach:</legend>
            {docs.map((d) => (
              <label key={d.id} className={cx("inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-bold", attached.has(d.id) ? "bg-tint-2 text-navy ring-[1.5px] ring-navy" : "bg-canvas")}>
                <input
                  type="checkbox"
                  checked={attached.has(d.id)}
                  onChange={(e) =>
                    setAttached((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(d.id);
                      else n.delete(d.id);
                      return n;
                    })
                  }
                  className="accent-navy"
                />
                <Icon name="file" size={14} strokeWidth={2} />
                {d.fileName}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <div className="px-3 pb-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-row-line px-3 py-2.5">
          <span className="text-[12.5px] text-muted">{contract ? "Adds the certificate of insurance when it's uploaded." : `Replies come back to this quote.`}</span>
          <Button type="submit" disabled={send.isPending} className="min-h-10! px-4! text-[14px]">
            <Icon name="send" size={16} strokeWidth={2} />
            {send.isPending ? "Sending…" : tpl ? TEMPLATE_LABELS[tpl] : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function QuoteCard({ q, onSaved }: { q: QuoteDetail; onSaved: (q: QuoteDetail, message?: string) => Promise<void> }) {
  const api = useApi();
  const toast = useToast();
  const { user } = useUser();
  const [rate, setRate] = useState(q.rateCentsPerUnit === null ? "" : (q.rateCentsPerUnit / 100).toFixed(2));
  const [units, setUnits] = useState(q.units === null ? "" : String(q.units));
  const [term, setTerm] = useState<QuoteTerm>(q.term ?? "12_month");
  const [busy, setBusy] = useState(false);
  const cents = Math.round(Number(rate) * 100);
  const n = Number(units);
  const valid = rate !== "" && Number.isFinite(cents) && cents > 0 && Number.isInteger(n) && n > 0;

  const save = () => api<{ quote: QuoteDetail }>(`/admin/quotes/${q.id}`, { method: "PATCH", body: JSON.stringify({ rateCentsPerUnit: cents, unitCount: n, term }) });
  const generate = async () => {
    setBusy(true);
    try {
      const { quote } = await save();
      const { buildQuotePdf, quoteFileName } = await import("../../lib/quote-pdf");
      const pdf = await buildQuotePdf(quote, { rateCentsPerUnit: cents, units: n, term, senderName: user?.fullName ?? "The CBES team" });
      const form = new FormData();
      form.append("kind", "quote_pdf");
      form.append("file", new File([pdf], quoteFileName(quote), { type: "application/pdf" }));
      await api(`/admin/quotes/${q.id}/documents`, { method: "POST", body: form });
      const fresh = await api<QuoteDetail>(`/admin/quotes/${q.id}`);
      await onSaved(fresh, "Quote PDF added. Attach it to an email to send it.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Quote">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          <label htmlFor="quote-rate">Per unit / month</label>
          <span className="flex h-10 items-center rounded-[9px] border border-field px-2.5 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25">
            <span aria-hidden="true" className="text-muted">
              $
            </span>
            <input id="quote-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} className="w-full min-w-0 border-0 pl-1 text-[14px] font-normal outline-none" />
          </span>
        </div>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          Units
          <input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} className="h-10 rounded-[9px] border border-field px-2.5 text-[14px] font-normal" />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-[12.5px] font-semibold">
          Term
          <select value={term} onChange={(e) => setTerm(e.target.value as QuoteTerm)} className="h-10 rounded-[9px] border border-field bg-white px-2.5 text-[14px] font-normal">
            {(Object.keys(TERM_LABELS) as QuoteTerm[]).map((t) => (
              <option key={t} value={t}>
                {TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 mb-0 flex justify-between text-[14px]">
        <span className="text-muted">Monthly total</span>
        <strong aria-live="polite">{valid ? money(cents * n) : "—"}</strong>
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          className="min-h-10! flex-1 px-3! text-[13.5px]"
          disabled={!valid || busy}
          onClick={async () => {
            try {
              const { quote } = await save();
              await onSaved(quote, "Quote saved.");
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          Save
        </Button>
        <Button variant="outline" className="min-h-10! flex-[2] border-[1.5px]! px-3! text-[13.5px]" disabled={!valid || busy} onClick={generate}>
          {busy ? "Generating…" : "Generate quote PDF"}
        </Button>
      </div>
    </Section>
  );
}

function DocDownload({ quoteId, doc, className }: { quoteId: string; doc: { id: string; fileName: string }; className?: string }) {
  const blob = useApiBlob();
  const toast = useToast();
  return (
    <button type="button" className={cx("inline-flex items-center gap-1.5 text-navy hover:underline", className)} onClick={() => void downloadDoc(blob, quoteId, doc, toast.error)}>
      <Icon name="file" size={14} strokeWidth={2} />
      {doc.fileName}
    </button>
  );
}

function ContractCard({ q, onSaved, onSend }: { q: QuoteDetail; onSaved: (q: QuoteDetail, message?: string) => Promise<void>; onSend: (docIds: string[]) => void }) {
  const api = useApi();
  const blob = useApiBlob();
  const toast = useToast();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["admin", "contract-templates"], queryFn: () => api<{ items: ContractTemplate[] }>("/admin/contract-templates") });
  const [templateKey, setTemplateKey] = useState<ContractTemplate["key"]>(q.term ?? "12_month");
  const [busy, setBusy] = useState(false);
  const chosen = templates.data?.items.find((t) => t.key === templateKey);
  const agreements = templates.data?.items.filter((t) => t.key !== "coi") ?? [];
  const coi = templates.data?.items.find((t) => t.key === "coi");

  const refresh = async (message: string) => onSaved(await api<QuoteDetail>(`/admin/quotes/${q.id}`), message);
  const upload = async (file: File, kind: QuoteDocument["kind"], message: string) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      await api(`/admin/quotes/${q.id}/documents`, { method: "POST", body: form });
      await refresh(message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const uploadTemplate = async (key: ContractTemplate["key"], file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/admin/contract-templates/${key}`, { method: "PUT", body: form });
      await queryClient.invalidateQueries({ queryKey: ["admin", "contract-templates"] });
      toast.success("Template saved for every quote.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const docAction = async (doc: QuoteDocument, action: "ready" | "signed" | "delete") => {
    try {
      await api(`/admin/quotes/${q.id}/documents/${doc.id}`, action === "delete" ? { method: "DELETE" } : { method: "PATCH", body: JSON.stringify({ status: action }) });
      await refresh(action === "delete" ? `${doc.fileName} deleted.` : `${doc.fileName} marked ${action}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const contracts = q.documents.filter((d) => d.kind === "contract");
  const sendable = contracts.filter((d) => d.status === "draft" || d.status === "ready");
  const sent = contracts.some((d) => d.status === "sent");
  const others = q.documents.filter((d) => d.kind !== "contract");

  return (
    <Section title="Contract">
      <p className="mt-[-6px] mb-3 text-[12.5px] text-muted">Start from a template, upload the filled-in agreement, then send it for signature.</p>
      <label className="mb-2 flex flex-col gap-1.5 text-[12.5px] font-semibold">
        Contract template
        <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value as ContractTemplate["key"])} className="h-10 rounded-[9px] border border-field bg-white px-2.5 text-[13.5px] font-normal">
          {agreements.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {chosen &&
        (chosen.fileName ? (
          <button
            type="button"
            className="mb-3 text-[13px] font-bold text-navy hover:underline"
            onClick={async () => {
              const file = await blob(`/admin/contract-templates/${chosen.key}`).catch(() => null);
              if (!file) return toast.error("The template couldn't be downloaded.");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(file);
              a.download = chosen.fileName!;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download {chosen.fileName}
          </button>
        ) : (
          <div className="mb-3">
            <FileDrop accept={DOC_TYPES} maxBytes={MAX_DOC} label={`Upload the ${chosen.label} template`} hint="No template uploaded yet. Add it once and it's here for every quote." onFiles={([f]) => uploadTemplate(chosen.key, f)} />
          </div>
        ))}

      <FileDrop accept={DOC_TYPES} maxBytes={MAX_DOC} label="Upload contract" hint="The filled-in agreement. PDF or Word, up to 20 MB." onFiles={([f]) => upload(f, "contract", "Contract uploaded.")} />

      {(contracts.length > 0 || others.length > 0) && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {[...contracts, ...others].map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 rounded-[10px] bg-subtle p-2.5">
              <Icon name="file" size={18} strokeWidth={2} className="text-navy" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{d.fileName}</span>
                <span className="block text-[11.5px] text-muted">
                  {d.kind === "quote_pdf" ? "Quote PDF" : d.kind === "signed_contract" ? "Signed copy" : d.kind === "contract" ? "Contract" : "File"} · {d.uploadedBy?.name ?? "Email"} · {timeAgo(d.createdAt)}
                </span>
              </span>
              <Pill tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Pill>
              <Menu
                label={`Options for ${d.fileName}`}
                items={[
                  { label: "Download", onSelect: () => void downloadDoc(blob, q.id, d, toast.error) },
                  ...(d.kind === "contract" && d.status === "draft" ? [{ label: "Mark ready", onSelect: () => void docAction(d, "ready") }] : []),
                  ...(d.kind === "contract" && d.status !== "signed" ? [{ label: "Mark signed", onSelect: () => void docAction(d, "signed") }] : []),
                  { label: "Delete", tone: "danger" as const, disabled: d.status === "sent" || d.status === "signed", onSelect: () => void docAction(d, "delete") },
                ]}
                trigger={(p) => (
                  <button type="button" {...p} aria-label={`Options for ${d.fileName}`} className="flex size-8 flex-none items-center justify-center rounded-md text-muted hover:bg-white">
                    <Icon name="more" size={16} strokeWidth={2.6} />
                  </button>
                )}
              />
            </li>
          ))}
        </ul>
      )}

      <Button className="mt-3 w-full" disabled={sendable.length === 0 || busy} onClick={() => onSend(sendable.map((d) => d.id))}>
        <Icon name="mail" size={16} strokeWidth={2} />
        Prepare contract email
      </Button>
      {!coi?.fileName && (
        <p className="mt-2 mb-0 text-[12px] text-muted">
          The certificate of insurance isn't uploaded yet.{" "}
          <label className="cursor-pointer font-bold text-navy underline">
            Upload it
            <input type="file" accept={DOC_TYPES} className="sr-only" onChange={(e) => e.target.files?.[0] && uploadTemplate("coi", e.target.files[0])} />
          </label>
        </p>
      )}
      {sent && (
        <div className="mt-3">
          <FileDrop accept={DOC_TYPES} maxBytes={MAX_DOC} label="Upload signed copy" hint="Upload the signed agreement when it comes back. Then move the quote to Won." onFiles={([f]) => upload(f, "signed_contract", "Signed copy saved. Move the quote to Won to set up the customer.")} />
        </div>
      )}
    </Section>
  );
}

/** Downloads one of the quote's files through the API (they're never public). */
async function downloadDoc(blob: ReturnType<typeof useApiBlob>, quoteId: string, d: { id: string; fileName: string }, onError: (m: string) => void) {
  try {
    const file = await blob(`/admin/quotes/${quoteId}/documents/${d.id}`);
    if (!file) return onError("That file is no longer stored.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = d.fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    onError(errorMessage(err));
  }
}
