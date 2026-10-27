import type { ReactNode } from "react";
import { config } from "../../config";

/**
 * Sign-in and invitation screens. The archer stands on the navy field with the arrow aimed at the
 * white sheet that holds the form; on phones it stands beside the logo instead.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-navy text-on-navy">
      <img
        src={`${base}archer-gold.webp`}
        alt=""
        width={707}
        height={762}
        className="auth-archer pointer-events-none absolute top-5 right-5 -z-10 h-[5.5rem] w-auto select-none lg:top-[40vh] lg:right-auto lg:-left-[6vh] lg:h-[100vh] lg:opacity-100"
      />

      <header className="px-5 pt-6 pb-8 lg:px-12 lg:pt-10 lg:pb-0">
        <a href={config.siteUrl || "/"} className="inline-block rounded-md" aria-label="CB Environment Solutions website">
          <img src={`${base}logo-gold-on-navy.webp`} alt="" width={240} height={183} className="h-14 w-auto lg:h-16" />
        </a>
        <p className="mt-4 mb-0 hidden font-heading text-xl font-semibold text-gold-light lg:block">Aiming for excellence.</p>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-10 lg:items-end lg:px-[8vw] lg:pt-[2vh] lg:pb-16">
        <div className="w-full max-w-[26rem] max-lg:mx-auto">
          <div className="rounded-2xl bg-white p-6 text-ink sm:p-8">{children}</div>
          <a href={config.siteUrl || "/"} className="mt-5 inline-block text-sm font-semibold text-gold-light hover:text-white">
            Back to website
          </a>
        </div>
      </main>
    </div>
  );
}
