import type { ReactNode } from "react";
import { RedirectToSignIn, useUser } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { canAccess, roleFrom, type Area } from "../access";

/** Signed-out visitors go to the sign-in page; signed-in users without the right role see why. */
export function RequireArea({ area, children }: { area: Area; children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <p role="status" className="py-16 text-center text-muted">
        Loading…
      </p>
    );
  }
  if (!isSignedIn) return <RedirectToSignIn />;

  const role = roleFrom(user.publicMetadata);
  if (canAccess(role, area)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-line bg-white p-6 sm:p-8">
      <h1 className="mt-0 mb-3 text-2xl font-bold text-navy">{role ? "Not available for your role" : "Your account isn't set up yet"}</h1>
      <p className="mb-5 leading-relaxed text-muted">
        {role
          ? "This area is for CBES admins."
          : "You're signed in, but CBES hasn't assigned your role or property yet. Ask Nick or Nigel to finish setting up your account."}
      </p>
      {role && (
        <Link to="/portal" className="font-bold">
          Go to your portal
        </Link>
      )}
    </div>
  );
}
