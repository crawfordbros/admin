import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { config } from "./config";
import { RequireArea } from "./components/RequireArea";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { PortalHome } from "./pages/PortalHome";
import { AdminHome } from "./pages/AdminHome";
import { ComingSoon } from "./pages/ComingSoon";
import { ADMIN_SECTIONS } from "./pages/adminSections";

function ClerkWithRouter({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={config.clerkPublishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/portal/login"
      signInFallbackRedirectUrl="/portal"
      afterSignOutUrl="/portal/login"
    >
      {children}
    </ClerkProvider>
  );
}

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
        <Routes>
          <Route path="/portal/login/*" element={<LoginPage />} />
          <Route element={<Shell />}>
            <Route path="/portal" element={<RequireArea area="portal"><PortalHome /></RequireArea>} />
            <Route path="/admin" element={<RequireArea area="admin"><AdminHome /></RequireArea>} />
            {ADMIN_SECTIONS.filter((s) => s.path !== "/admin").map((s) => (
              <Route
                key={s.path}
                path={s.path}
                element={<RequireArea area="admin"><ComingSoon title={s.label} detail={s.detail} /></RequireArea>}
              />
            ))}
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Route>
        </Routes>
      </ClerkWithRouter>
    </BrowserRouter>
  );
}
