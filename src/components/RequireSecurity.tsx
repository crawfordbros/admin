import type { ReactNode } from "react";
import { RedirectToSignIn, useAuth, useClerk } from "@clerk/clerk-react";
import { useLocation } from "react-router-dom";
import { Alert, Button, Loading } from "./ui";
import { AuthLayout } from "../pages/auth/AuthLayout";
import { SetupMfaStep } from "../pages/auth/SetupMfaStep";
import { useSecurityStatus } from "../pages/auth/security";
import { PortalSessionActivity } from "./PortalSession";

/** Every protected route, including an OAuth return or a direct URL, checks the server's MFA proof. */
export function RequireSecurity({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth();
  const clerk = useClerk();
  const location = useLocation();
  const security = useSecurityStatus();
  if (!isLoaded) return <Loading />;
  if (!clerk.session) return <RedirectToSignIn />;
  if (security.isPending) return <AuthLayout><Loading label="Checking two-step verification…" /></AuthLayout>;
  if (security.error) {
    return <AuthLayout><Alert>{security.error.message}</Alert><Button onClick={() => void security.refetch()}>Try again</Button></AuthLayout>;
  }
  if (!security.data.verified || security.data.pending) {
    return <AuthLayout><SetupMfaStep to={location.pathname + location.search} /></AuthLayout>;
  }
  return <PortalSessionActivity>{children}</PortalSessionActivity>;
}
