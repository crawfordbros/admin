import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, errorMessage, useApi, type OrganizationRow } from "../../lib/api";
import { Alert, Button, Card, Loading, TextField } from "../../components/ui";
import { OrganizationView } from "../org/OrganizationView";

export function OrganizationsPage() {
  const api = useApi();
  const { data, error, isPending } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations"),
  });
  useEffect(() => {
    document.title = "Organizations | CBES Admin";
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="mt-0 mb-2 text-3xl font-bold text-navy">Organizations</h1>
        <p className="m-0 max-w-2xl leading-relaxed text-muted">
          The management companies CBES works with. Invite each one's representatives, property managers and Directors from its page.
        </p>
      </div>

      <Card title="Add an organization">
        <NewOrganizationForm />
      </Card>

      {isPending && <Loading />}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {data && data.organizations.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-6 text-muted">No organizations yet. Add the first one above.</p>
      )}
      {data && data.organizations.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {data.organizations.map((o) => (
            <li key={o.id} className="rounded-xl border border-line bg-white p-5">
              <h2 className="m-0 text-lg">
                <Link to={`/admin/organizations/${o.id}`}>{o.name}</Link>
              </h2>
              <dl className="mt-3 mb-0 grid grid-cols-3 gap-2 text-center">
                <Count label="Properties" value={o.properties} />
                <Count label="Representatives" value={o.representatives} />
                <Count label="Invited" value={o.pendingInvitations} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface p-2">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="m-0 font-heading text-xl font-bold text-navy">{value}</dd>
    </div>
  );
}

function NewOrganizationForm() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    setSaving(true);
    setError(undefined);
    try {
      const { organization } = await api<{ organization: { id: string } }>("/organizations", { method: "POST", body: JSON.stringify({ name }) });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      navigate(`/admin/organizations/${organization.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors.name ?? err.message) : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextField label="Organization name" name="name" required autoComplete="organization" error={error} className="flex-1" />
      <Button type="submit" disabled={saving}>
        {saving ? "Adding…" : "Add organization"}
      </Button>
    </form>
  );
}

export function OrganizationAdminPage() {
  const { id = "" } = useParams();
  return <OrganizationView id={id} area="admin" isAdmin />;
}
