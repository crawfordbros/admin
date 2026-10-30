import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { Navigate, useNavigate } from "react-router-dom";
import { isSuperAdmin, roleFrom } from "../../access";
import { errorMessage, useApi } from "../../lib/api";
import { useStepUp } from "../../lib/stepUp";
import { Alert, Button, TextField } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { useToast } from "../../components/Toast";
import { StepUpField } from "./StepUp";

/** New admins receive their one role when they accept the invitation. */
export function AddAdminModal() {
  const { user } = useUser();
  if (!isSuperAdmin(roleFrom(user?.publicMetadata))) return <Navigate to="/admin/users" replace />;
  return <InviteAdmin />;
}

function InviteAdmin() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stepUp = useStepUp();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [code, setCode] = useState("");
  const close = () => navigate("/admin/users");
  const ready = understood && Boolean(stepUp.method) && /^\S+@\S+\.\S+$/.test(email.trim());
  const save = useMutation({
    mutationFn: async () => api("/admin/admins/invite", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, stepUpToken: await stepUp.confirm(code) }),
    }),
    onSuccess: async () => {
      toast.success(`Admin invitation sent to ${email.trim()}.`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      close();
    },
  });
  return (
    <Modal title="Invite admin" context="Only Super Admins can invite admins" onClose={() => { if (!save.isPending) close(); }} footer={
      <>
        <Button variant="secondary" onClick={close} disabled={save.isPending}>Cancel</Button>
        <Button disabled={!ready || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Sending…" : "Confirm and send invitation"}
        </Button>
      </>
    }>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-muted">Invite a new user with the Admin role. For an existing user, choose Change Role from their record in Users.</p>
        <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={save.isPending} />
        <TextField label="Name" optional autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-navy" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={save.isPending} />
          <span>I understand this user will see and manage every organization, property, issue and quote.</span>
        </label>
        <StepUpField stepUp={stepUp} code={code} onCode={setCode} />
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      </div>
    </Modal>
  );
}
