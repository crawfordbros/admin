import { lazy, type ReactNode } from "react";
import { AuthenticateWithRedirectCallback, ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { config } from "./config";
import { RequireArea } from "./components/RequireArea";
import { RequireSecurity } from "./components/RequireSecurity";
import { UserScopedQueries } from "./components/UserScopedQueries";
import { PortalSessionBoundary } from "./components/PortalSession";
import { Shell } from "./components/Shell";
import { AdminShell } from "./components/admin/AdminShell";
import { ToastProvider } from "./components/Toast";
import { LoginPage } from "./pages/LoginPage";
import { PortalHome } from "./pages/PortalHome";
import { ComingSoon } from "./pages/ComingSoon";
import { ADMIN_SECTIONS } from "./pages/adminSections";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { OrganizationPage } from "./pages/portal/OrganizationPage";
import { NewPropertyRedirect, PropertyRedirect } from "./pages/admin/redirects";
import { PropertyPage } from "./pages/portal/PropertyPage";
import { WeeklyReportPage } from "./pages/portal/WeeklyReportPage";

// Each Admin Portal section downloads when it's first opened (ADMIN_PORTAL_SPEC 10, performance).
const OrganizationAdminPage = lazy(() => import("./pages/admin/OrganizationsPage").then((m) => ({ default: m.OrganizationAdminPage })));
const OrganizationsPage = lazy(() => import("./pages/admin/OrganizationsPage").then((m) => ({ default: m.OrganizationsPage })));
const PropertyAdminPage = lazy(() => import("./pages/admin/PropertyAdminPage").then((m) => ({ default: m.PropertyAdminPage })));
const PropertyDetailPage = lazy(() => import("./pages/admin/PropertyDetailPage").then((m) => ({ default: m.PropertyDetailPage })));
const AddPropertyModal = lazy(() => import("./pages/org/AddPropertyModal").then((m) => ({ default: m.AddPropertyModal })));
const ViolationsPage = lazy(() => import("./pages/violations/ViolationsPage").then((m) => ({ default: m.ViolationsPage })));
const ViolationDetailPage = lazy(() => import("./pages/violations/ViolationDetailPage").then((m) => ({ default: m.ViolationDetailPage })));
const PortalViolationPage = lazy(() => import("./pages/violations/PortalViolations").then((m) => ({ default: m.PortalViolationPage })));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const ReportDrawer = lazy(() => import("./pages/reports/ReportDrawer").then((m) => ({ default: m.ReportDrawer })));
const UsersPage = lazy(() => import("./pages/users/UsersPage").then((m) => ({ default: m.UsersPage })));
const AddAdminModal = lazy(() => import("./pages/users/AddAdminModal").then((m) => ({ default: m.AddAdminModal })));
const QuotesPage = lazy(() => import("./pages/quotes/QuotesPage").then((m) => ({ default: m.QuotesPage })));
const QuoteDetailPage = lazy(() => import("./pages/quotes/QuoteDetailPage").then((m) => ({ default: m.QuoteDetailPage })));
const OverviewPage = lazy(() => import("./pages/overview/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const OverwatchPage = lazy(() => import("./pages/overwatch/OverwatchPage").then((m) => ({ default: m.OverwatchPage })));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AccountSettingsPage = lazy(() => import("./pages/settings/SettingsPage").then((m) => ({ default: m.AccountSettingsPage })));
const PortalAccountPage = lazy(() => import("./pages/account/PortalAccountPage").then((m) => ({ default: m.PortalAccountPage })));
const WeeklyReportsPage = lazy(() => import("./pages/weekly/WeeklyReportsPage").then((m) => ({ default: m.WeeklyReportsPage })));


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

const BUILT = new Set(["/admin", "/admin/organizations", "/admin/violations", "/admin/reports", "/admin/users", "/admin/weekly-reports", "/admin/quotes", "/admin/overwatch", "/admin/settings"]);

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
        <PortalSessionBoundary>
        <ToastProvider>
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
              <Route path="/portal/organizations/:id" element={<RequireArea area="organization"><OrganizationPage /></RequireArea>}>
                <Route path="properties/new" element={<AddPropertyModal />} />
              </Route>
              <Route path="/portal/properties/:id" element={<RequireArea area="manager"><PropertyPage /></RequireArea>} />
              <Route path="/portal/properties/:id/report" element={<RequireArea area="manager"><WeeklyReportPage /></RequireArea>} />
              <Route path="/portal/violations/:id" element={<RequireArea area="portal"><PortalViolationPage /></RequireArea>} />
              <Route path="/portal/settings" element={<RequireArea area="portal"><PortalAccountPage /></RequireArea>} />
            </Route>
            <Route path="/admin" element={<RequireArea area="admin" standalone><AdminShell /></RequireArea>}>
              <Route index element={<OverviewPage />} />
              <Route path="organizations" element={<OrganizationsPage />} />
              <Route path="organizations/:orgId" element={<OrganizationAdminPage />}>
                <Route path="properties/new" element={<AddPropertyModal />} />
              </Route>
              {/* Properties from before Organizations open on the old page until they're moved into one. */}
              <Route path="organizations/unassigned/properties/:propertyId" element={<PropertyAdminPage />} />
              <Route path="organizations/:orgId/properties/:propertyId" element={<PropertyDetailPage />} />
              <Route path="reports" element={<ReportsPage />}>
                <Route path=":id" element={<ReportDrawer />} />
              </Route>
              <Route path="users" element={<UsersPage />}>
                <Route path="add-admin" element={<AddAdminModal />} />
              </Route>
              <Route path="weekly-reports" element={<WeeklyReportsPage />} />
              <Route path="quotes" element={<QuotesPage />} />
              <Route path="quotes/:id" element={<QuoteDetailPage />} />
              <Route path="violations" element={<ViolationsPage />} />
              <Route path="violations/:id" element={<ViolationDetailPage />} />
              <Route path="overwatch" element={<OverwatchPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/account" element={<AccountSettingsPage />} />
              {/* Properties moved inside Organizations (ADMIN_PORTAL_SPEC section 3.2). */}
              <Route path="properties" element={<Navigate to="/admin/organizations" replace />} />
              <Route path="properties/new" element={<NewPropertyRedirect />} />
              <Route path="properties/:id" element={<PropertyRedirect />} />
              {ADMIN_SECTIONS.filter((s) => !BUILT.has(s.path)).map((s) => (
                <Route key={s.path} path={s.path} element={<ComingSoon title={s.label} detail={s.detail} icon={s.icon} />} />
              ))}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Route>
        </Routes>
        </ToastProvider>
        </PortalSessionBoundary>
        </UserScopedQueries>
      </ClerkWithRouter>
    </BrowserRouter>
  );
}
