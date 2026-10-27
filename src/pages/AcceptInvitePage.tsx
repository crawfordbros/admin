import { useEffect } from "react";
import { SignUp } from "@clerk/clerk-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

/**
 * Where Clerk's invitation email lands (redirect_url on the invitation). Sign-up is restricted to
 * invitations in Clerk, so this page can't create an account without the ticket from that email.
 * People who already have an account are sent to sign in.
 */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  useEffect(() => {
    document.title = "Accept your invitation | CBES Portal";
  }, []);

  if (params.get("__clerk_status") === "sign_in") return <Navigate to={`/portal/login?${params}`} replace />;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-navy px-4 py-10 sm:justify-center">
      <img
        src={`${import.meta.env.BASE_URL}logo-gold-on-navy.webp`}
        alt="CB Environment Solutions"
        width={240}
        height={183}
        className="mb-6 h-20 w-auto"
      />
      <h1 className="sr-only">Set up your CBES portal account</h1>
      <SignUp
        routing="path"
        path="/portal/accept-invite"
        signInUrl="/portal/login"
        fallbackRedirectUrl="/portal"
        appearance={{
          variables: { colorPrimary: "#272B84", fontFamily: "'Open Sans', sans-serif", borderRadius: "8px" },
          elements: { card: "shadow-xl" },
        }}
      />
      <p className="mt-6 max-w-sm text-center text-sm text-on-navy">
        Use the link in your invitation email from CBES. Already set up?{" "}
        <Link to="/portal/login" className="font-semibold text-gold-light hover:text-white">
          Sign in
        </Link>
      </p>
    </div>
  );
}
