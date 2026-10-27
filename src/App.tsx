import type { ReactNode } from "react";
import { AuthenticateWithRedirectCallback, ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { config } from "./config";
import { RequireArea } from "./components/RequireArea";
import { RequireSecurity } from "./components/RequireSecurity";
import { UserScopedQueries } from "./components/UserScopedQueries";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { PortalHome } from "./pages/PortalHome";
import { AdminHome } from "./pages/AdminHome";
import { ComingSoon } from "./pages/ComingSoon";
import { ADMIN_SECTIONS } from "./pages/adminSections";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { PropertiesPage } from "./pages/admin/PropertiesPage";
import { OrganizationAdminPage, OrganizationsPage } from "./pages/admin/OrganizationsPage";
import { OrganizationPage } from "./pages/portal/OrganizationPage";
import { NewPropertyPage, PropertyAdminPage } from "./pages/admin/PropertyAdminPage";
import { PropertyPage } from "./pages/portal/PropertyPage";
import { WeeklyReportPage } from "./pages/portal/WeeklyReportPage";


function ClerkWithRouter({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={config.clerkPublishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/portal/login"
      signUpUrl="/portal/accept-invite"
      signInFallbackRedirectUrl="/portal"
      taskUrls={{ "setup-mfa": "/portal/login" }}
      afterSignOutUrl="/portal/login"
    >
      {children}
    </ClerkProvider>
  );
}

const BUILT = new Set(["/admin", "/admin/organizations", "/admin/properties"]);

export function App() {
  if (!config.clerkPublishableKey.startsWith("pk_")) {
    return (
      <p role="alert" className="p-6 text-center text-danger">
        The portal isn't configured yet: set VITE_CLERK_PUBLISHABLE_KEY in .env.local (see .env.example).
      </p>
    );
  }
  return (
    <BrowserRouter>
      <ClerkWithRouter>
        <UserScopedQueries>
        <Routes>
          <Route
            path="/portal/login/sso-callback"
            element={<AuthenticateWithRedirectCallback signInUrl="/portal/login" secondFactorUrl="/portal/login" transferable={false} />}
          />
          <Route path="/portal/login/*" element={<LoginPage />} />
          <Route path="/portal/accept-invite/*" element={<AcceptInvitePage />} />
          <Route element={<RequireSecurity><Outlet /></RequireSecurity>}>
          <Route element={<Shell />}>
            <Route path="/portal" element={<RequireArea area="portal"><PortalHome /></RequireArea>} />
            <Route path="/portal/organizations/:id" element={<RequireArea area="organization"><OrganizationPage /></RequireArea>} />
            <Route path="/portal/properties/:id" element={<RequireArea area="manager"><PropertyPage /></RequireArea>} />
            <Route path="/portal/properties/:id/report" element={<RequireArea area="manager"><WeeklyReportPage /></RequireArea>} />
            <Route path="/admin" element={<RequireArea area="admin"><AdminHome /></RequireArea>} />
            <Route path="/admin/organizations" element={<RequireArea area="admin"><OrganizationsPage /></RequireArea>} />
            <Route path="/admin/organizations/:id" element={<RequireArea area="admin"><OrganizationAdminPage /></RequireArea>} />
            <Route path="/admin/properties" element={<RequireArea area="admin"><PropertiesPage /></RequireArea>} />
            <Route path="/admin/properties/new" element={<RequireArea area="admin"><NewPropertyPage /></RequireArea>} />
            <Route path="/admin/properties/:id" element={<RequireArea area="admin"><PropertyAdminPage /></RequireArea>} />
            {ADMIN_SECTIONS.filter((s) => !BUILT.has(s.path)).map((s) => (
              <Route
                key={s.path}
                path={s.path}
                element={<RequireArea area="admin"><ComingSoon title={s.label} detail={s.detail} /></RequireArea>}
              />
            ))}
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Route>
          </Route>
        </Routes>
        </UserScopedQueries>
      </ClerkWithRouter>
    </BrowserRouter>
  );
}
