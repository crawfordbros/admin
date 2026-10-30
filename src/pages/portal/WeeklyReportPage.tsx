import { propertyAddressText } from "../../lib/propertyAddress";
import { PropertyAddress } from "../../components/PropertyAddress";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { errorMessage, useApi, type WeeklyReport } from "../../lib/api";
import { VALET_STATUS_TEXT, addDays, autoClockOutNote, formatDay, hours, lastOut } from "../../lib/format";
import { Alert, Button, Card, Loading, Stat } from "../../components/ui";
import { usePortalPage } from "../../components/admin/adminPage";
import { useOptionalRepContext } from "../../components/portal/RepContext";

const todayInNewYork = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="border-b border-line px-3 py-2 text-[13px] font-bold whitespace-nowrap text-muted first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                // Short values (dates, times, refs) stay on one line; issue and unit text can wrap.
                <td key={j} className={`border-b border-line px-3 py-2 align-top first:pl-0 ${String(v).length <= 12 ? "whitespace-nowrap" : ""}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WeeklyReportPage() {
  const { propertyId: id = "" } = useParams();
  const shell = useOptionalRepContext();
  const [params, setParams] = useSearchParams();
  const week = params.get("week") ?? "";
  const api = useApi();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data, error, isPending } = useQuery({
    queryKey: ["portal", "report", id, week],
    queryFn: () => api<WeeklyReport>(`/portal/properties/${id}/report${week ? `?week=${week}` : ""}`),
  });

  const email = useMutation({
    mutationFn: (start: string) =>
      api<{ sentTo: string }>(`/portal/properties/${id}/report/email`, { method: "POST", body: JSON.stringify({ week: start }) }),
  });

  usePortalPage(
    data ? `Weekly report: ${data.property.name}, ${data.week.label}` : null,
    data ? [{ label: shell?.kind === "organization" ? data.property.name : "My property", to: `/portal/properties/${id}`, description: propertyAddressText(data.property) }, { label: "Weekly report" }] : undefined,
  );

  if (isPending) return <Loading label="Building the report…" />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const rr = data.residentReports;
  const v = data.valetTimes;
  const goTo = (start: string) => {
    email.reset();
    setParams({ week: start });
  };
  const nextStart = addDays(data.week.start, 7);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { downloadReportPdf } = await import("../../lib/report-pdf");
      downloadReportPdf(data!);
    } catch (err) {
      console.error(err);
      setDownloadError("The PDF couldn't be created. Try Print and choose Save as PDF instead.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 print:max-w-none print:gap-4">
      <div className="print:hidden">
        <Link to={`/portal/properties/${id}`} className="text-[15px]">
          <span>{data.property.name}<PropertyAddress property={data.property} /></span>
        </Link>
      </div>
      <p className="m-0 hidden text-[13px] font-bold tracking-wide text-gold-text uppercase print:block">
        CB Environment Solutions · office@cbenvironments.com
      </p>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mt-0 mb-1 text-sm font-semibold text-gold-text">Weekly report</p>
          <h1 className="m-0 text-3xl font-bold text-navy">{data.property.name}</h1>
          <PropertyAddress property={data.property} className="text-[14px]" />
          <p className="mt-1 mb-0 text-lg text-muted">{data.week.label}</p>
        </div>
        <nav aria-label="Choose a week" className="flex w-full gap-2 sm:w-auto print:hidden">
          <Button variant="outline" className="flex-1 px-4 sm:flex-none" onClick={() => goTo(addDays(data.week.start, -7))}>
            ‹ Previous week
          </Button>
          <Button
            variant="outline"
            className="flex-1 px-4 sm:flex-none"
            disabled={nextStart > todayInNewYork()}
            onClick={() => goTo(nextStart)}
          >
            Next week ›
          </Button>
        </nav>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
        <Button variant="outline" disabled={downloading} onClick={download}>
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </Button>
        <Button variant="outline" disabled={email.isPending} onClick={() => email.mutate(data.week.start)}>
          {email.isPending ? "Sending…" : "Email me this report"}
        </Button>
      </div>
      {email.isSuccess && <Alert tone="success">Sent to {email.data.sentTo}.</Alert>}
      {email.error && <Alert>{errorMessage(email.error)}</Alert>}
      {downloadError && <Alert>{downloadError}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={rr.total} label="Resident issues this week" />
        <Stat value={rr.open} label="Still open from this week" />
        <Stat value={hours(rr.avgFirstResponseHours)} label="Average first reply" />
        <Stat value={data.stillOpen} label="Open issues overall" />
      </div>

      <Card title="Resident issues">
        {rr.items.length === 0 ? (
          <p className="m-0 text-muted">No resident issues this week.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {rr.byType.length > 0 && <Table head={["Issue type", "Issues"]} rows={rr.byType.map((t) => [t.label, t.count])} />}
            <Table
              head={["Ref", "Date", "Issue", "Unit", "Status"]}
              rows={rr.items.map((i) => [`#${i.refNo}`, formatDay(i.date), i.issueLabel, i.unit ?? "—", i.statusLabel])}
            />
          </div>
        )}
      </Card>

      <Card title="Valet service times">
        {v.status !== "ok" ? (
          <p className="m-0 text-muted">{VALET_STATUS_TEXT[v.status]}</p>
        ) : v.shifts === 0 ? (
          <p className="m-0 text-muted">No valet shifts recorded this week.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat value={v.avgClockIn ?? "—"} label="Average clock-in" />
              <Stat value={v.avgClockOut ?? "—"} label="Average clock-out" />
              <Stat value={v.nights.length} label="Nights serviced" />
            </div>
            <Table
              head={["Night", "Valets", "First in", "Last out"]}
              rows={v.nights.map((n) => [formatDay(n.date), n.valets, n.firstClockIn, lastOut(n)])}
            />
            {v.autoClockOuts > 0 && <p className="m-0 text-[14px] text-muted">{autoClockOutNote(v.autoClockOuts)}</p>}
          </div>
        )}
      </Card>

      <p className="m-0 text-[13px] text-muted">
        Times are New York time. Clock-in and clock-out times come from the CBES valet time clock.
      </p>
    </div>
  );
}
