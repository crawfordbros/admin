import { useClerk, useUser } from "@clerk/clerk-react";
import { ROLE_LABELS, roleFrom } from "../../access";
import { endSession } from "../../lib/sessionState";
import { loginPathFor } from "../../pages/auth/redirect";

/** The signed-in person as the portal shows them: Clerk keeps no names here, so usually the email. */
export function useAccountIdentity() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName?.trim() || email;
  const role = roleFrom(user?.publicMetadata);
  return { name, email, role, roleLabel: role ? ROLE_LABELS[role] : null, initial: (name.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase() };
}

/**
 * Signs out through the portal's own session end (PortalSessionBoundary): it clears cached data,
 * records the end with the API, signs out other open tabs and lands on the sign-in page.
 */
export function useSignOut() {
  const clerk = useClerk();
  return () => {
    const id = clerk.session?.id;
    if (id) endSession(id, "signout");
    else void clerk.signOut({ redirectUrl: `${loginPathFor()}?reason=signout` });
  };
}
