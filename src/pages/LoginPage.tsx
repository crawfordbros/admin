import { useEffect } from "react";
import { SignIn } from "@clerk/clerk-react";
import { config } from "../config";

/** Staff sign-in: email and password, email code or magic link. Accounts are invite-only. */
export function LoginPage() {
  useEffect(() => {
    document.title = "Sign in | CBES Portal";
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center bg-navy px-4 py-10 sm:justify-center">
      <img
        src={`${import.meta.env.BASE_URL}logo-gold-on-navy.webp`}
        alt="CB Environment Solutions"
        width={240}
        height={183}
        className="mb-6 h-20 w-auto"
      />
      <h1 className="sr-only">Sign in to the CBES portal</h1>
      <SignIn
        routing="path"
        path="/portal/login"
        withSignUp={false}
        appearance={{
          variables: { colorPrimary: "#272B84", fontFamily: "'Open Sans', sans-serif", borderRadius: "8px" },
          elements: { card: "shadow-xl", footerAction: "hidden" },
        }}
      />
      <p className="mt-6 max-w-sm text-center text-sm text-on-navy">
        Accounts are by invitation from CBES. Need access? Call (470) 585-2776.
      </p>
      <a href={config.siteUrl || "/"} className="mt-3 text-sm font-semibold text-gold-light hover:text-white">
        Back to website
      </a>
    </div>
  );
}
