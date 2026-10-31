import type { ComponentType, ReactNode } from "react";
import { RedirectToSignIn, useAuth, useClerk } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { Alert, Button, Loading } from "./ui";
import { AuthLayout } from "../pages/auth/AuthLayout";
import { SetupMfaStep } from "../pages/auth/SetupMfaStep";
import { useSecurityStatus } from "../pages/auth/security";
import { isStewardPath, loginPathFor } from "../pages/auth/redirect";
import { PortalSessionActivity } from "./PortalSession";
import { ApiError } from "../lib/authenticatedRequest";
import { useAuthCopy } from "../pages/auth/authCopy";

// The layout decides the language, so these read the copy from inside it.
function CheckingTwoStep() {
  return <Loading label={useAuthCopy().checkingTwoStep} />;
}
function Copy({ text }: { text: "signOut" | "tryAgain" }) {
  return <>{useAuthCopy()[text]}</>;
}

/**
 * Every protected route, including an OAuth return or a direct URL, checks the server's MFA proof.
 * `layout` frames the two-step screens: the portal's sign-in layout, or the Steward app's.
 */
export function RequireSecurity({ children, layout: Layout = AuthLayout }: { children: ReactNode; layout?: ComponentType<{ children: ReactNode }> }) {
  const { isLoaded } = useAuth();
  const clerk = useClerk();
  const location = useLocation();
  const security = useSecurityStatus();
  if (!isLoaded) return <Loading />;
  if (!clerk.session) {
    // Clerk's sign-in URL is the portal's; the crew app sends people to its own sign-in page.
    if (isStewardPath(location.pathname)) {
      const back = encodeURIComponent(window.location.origin + location.pathname + location.search);
      return <Navigate to={`${loginPathFor(location.pathname)}?redirect_url=${back}`} replace />;
    }
    return <RedirectToSignIn />;
  }
  if (security.isPending) return <Layout><CheckingTwoStep /></Layout>;
  if (security.error) {
    const denied = security.error instanceof ApiError && security.error.details.code === "impersonation_forbidden";
    return <Layout><Alert>{security.error.message}</Alert>{denied
      ? <Button onClick={() => clerk.signOut({ redirectUrl: loginPathFor() })}><Copy text="signOut" /></Button>
      : <Button onClick={() => void security.refetch()}><Copy text="tryAgain" /></Button>}</Layout>;
  }
  if (!security.data.verified || security.data.pending) {
    return <Layout><SetupMfaStep to={location.pathname + location.search} /></Layout>;
  }
  return <PortalSessionActivity>{children}</PortalSessionActivity>;
}
