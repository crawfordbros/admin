import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ROLE_LABELS, isSuperAdmin, roleFrom } from "../../access";
import { errorMessage, useApi, type AdminUserList, type AdminUserRow } from "../../lib/api";
import { useStepUp } from "../../lib/stepUp";
import { Alert, Button, TextField } from "../../components/ui";
import { Avatar } from "../../components/display";
import { Modal } from "../../components/overlay";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { cx } from "../../components/styles";
import { StepUpField } from "./StepUp";
import { RoleBadge } from "./UsersPage";

const CAN: [boolean, string][] = [
  [true, "See and manage every organization and property"],
  [true, "Create organizations"],
  [true, "Review violations and resident reports"],
  [true, "Send weekly reports and respond to quotes"],
  [true, "Invite and remove users"],
  [false, "Add or upgrade admins (Super Admin only)"],
];

/** /admin/users/add-admin — the Super Admin invites a new admin or upgrades someone (ADMIN_PORTAL_SPEC 7.12). */
export function AddAdminModal() {
  const { user } = useUser();
  if (!isSuperAdmin(roleFrom(user?.publicMetadata))) return <Navigate to="/admin/users" replace />;
  return <AddAdmin />;
}

function AddAdmin() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stepUp = useStepUp();
  const [params] = useSearchParams();
  const preselected = params.get("user");
  const [mode, setMode] = useState<"invite" | "upgrade">(preselected ? "upgrade" : "invite");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(preselected);
  const [understood, setUnderstood] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => navigate("/admin/users");

  const people = useQuery({
    queryKey: ["admin", "users", "upgradable", search.trim()],
    queryFn: () => api<AdminUserList>(`/admin/users?group=all&pageSize=50${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`),
    enabled: mode === "upgrade",
    placeholderData: (p) => p,
  });
  const candidates = (people.data?.items ?? []).filter((u): u is AdminUserRow & { id: string } => Boolean(u.id) && u.status === "active" && u.role !== "admin" && u.role !== "super_admin");
  const chosen = candidates.find((u) => u.id === chosenId) ?? null;
  const who = mode === "invite" ? name.trim() || email.trim() || "This person" : chosen?.name ?? chosen?.email ?? "This person";
  const first = who.split(/[\s@]/)[0];
  const ready = understood && Boolean(stepUp.method) && (mode === "invite" ? /^\S+@\S+\.\S+$/.test(email.trim()) : Boolean(chosen));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const stepUpToken = await stepUp.confirm(code);
      if (mode === "invite") {
        await api("/admin/admins/invite", { method: "POST", body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, stepUpToken }) });
        toast.success(`Admin invitation sent to ${email.trim()}.`);
      } else {
        await api("/admin/admins/upgrade", { method: "POST", body: JSON.stringify({ userId: chosen!.id, stepUpToken }) });
        toast.success(`${who} is now an admin.`);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      close();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      tone="navy"
      title="Add an admin"
      context="Only the Super Admin can do this"
      icon={
        <span className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-gold text-white">
          <Icon name="shield" size={24} strokeWidth={2} />
        </span>
      }
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!ready || busy} onClick={submit} className="bg-navy-ink">
            <Icon name="shield" size={18} strokeWidth={2} className="text-gold-light" />
            {busy ? "Confirming…" : `${stepUp.method === "authenticator" ? "Confirm with code" : "Confirm with passkey"} and ${mode === "invite" ? "send invite" : "upgrade"}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[18px]">
        <div role="tablist" aria-label="How to add" className="flex rounded-xl bg-canvas p-1">
          {(["invite", "upgrade"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cx("h-10 flex-1 rounded-[9px] text-[14px]", mode === m ? "bg-white font-bold text-navy-ink shadow-[0_1px_3px_rgba(26,28,94,0.15)]" : "font-semibold text-muted")}
            >
              {m === "invite" ? "Invite someone new" : "Upgrade an existing user"}
            </button>
          ))}
        </div>

        {mode === "invite" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="Name" optional autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold">
              Find a user
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="h-[46px] rounded-[10px] border border-field px-3 text-[15px] font-normal" />
            </label>
            {chosen ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-navy bg-[#f8f8fd] p-3.5">
                <Avatar name={chosen.name ?? chosen.email} seed={chosen.id} size={44} />
                <span className="min-w-0 flex-1">
                  <strong className="block text-[15px]">{chosen.name ?? chosen.email}</strong>
                  <span className="text-[12.5px] text-muted">
                    {chosen.email} · {chosen.mfa === "passkey" ? "Passkey on" : chosen.mfa === "authenticator" ? "Authenticator on" : "Two-step not set up"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <RoleBadge role={chosen.role} />
                  <Icon name="chevron-right" size={18} />
                  <RoleBadge role="admin" />
                </span>
                <button type="button" onClick={() => setChosenId(null)} className="text-[13px] font-bold text-navy hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <ul aria-label="People" className="m-0 flex max-h-56 list-none flex-col gap-0.5 overflow-y-auto rounded-lg border border-line p-1">
                {candidates.map((u) => (
                  <li key={u.id}>
                    <button type="button" onClick={() => setChosenId(u.id)} className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-tint">
                      <Avatar name={u.name ?? u.email} seed={u.id} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{u.name ?? u.email}</span>
                        <span className="block text-[12px] text-muted">{u.email}</span>
                      </span>
                      <span className="text-[12px] text-muted">{ROLE_LABELS[u.role]}</span>
                    </button>
                  </li>
                ))}
                {people.data && candidates.length === 0 && <li className="p-2 text-[14px] text-muted">Nobody matches.</li>}
              </ul>
            )}
          </div>
        )}

        <section aria-labelledby="admin-can" className="rounded-xl bg-subtle px-4 py-3.5">
          <h2 id="admin-can" className="m-0 mb-2.5 font-sans text-[14px] font-bold text-ink">
            What an admin can do
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 text-[13px] sm:grid-cols-2">
            {CAN.map(([yes, text]) => (
              <li key={text} className="flex items-start gap-2">
                <Icon name={yes ? "check" : "x"} size={16} strokeWidth={2.6} className={cx("mt-0.5", yes ? "text-success" : "text-danger")} />
                <span>
                  <span className="sr-only">{yes ? "Can: " : "Can't: "}</span>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <label className="flex items-start gap-2.5 text-[13.5px] leading-normal">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-[18px] flex-none accent-navy" />
          <span>
            I understand {first} will see every organization, property, report and quote.
            {mode === "upgrade" && chosen?.role === "lead" && ` ${first} keeps Steward duties in the field.`}
          </span>
        </label>

        <StepUpField stepUp={stepUp} code={code} onCode={setCode} notice={`${first} and the other admins get an email, and the change is logged.`} />
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
