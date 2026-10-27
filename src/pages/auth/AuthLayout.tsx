import type { ReactNode } from "react";
import { config } from "../../config";

/**
 * Sign-in and invitation screens. On desktop a navy panel holds the motto and the archer, standing on
 * the panel's bottom edge with the arrow aimed across at the form; the form sits on the open white page.
 * On phones the panel shrinks to a band with the logo and a small archer.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const base = import.meta.env.BASE_URL;
  const siteUrl = config.siteUrl || "/";
  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(24rem,5fr)_7fr]">
      <aside className="relative isolate flex items-center justify-between overflow-hidden bg-navy px-5 py-4 text-on-navy lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-start lg:justify-start lg:px-12 lg:py-10 xl:px-16">
        <a href={siteUrl} className="inline-block rounded-md" aria-label="CB Environment Solutions website">
          <img src={`${base}logo-gold-on-navy.webp`} alt="" width={240} height={183} className="h-12 w-auto lg:h-16" />
        </a>

        <div className="hidden lg:mt-[9vh] lg:block">
          <p className="m-0 max-w-[11ch] font-heading text-[clamp(2.75rem,4.2vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.015em] text-gold-light">
            Aiming for excellence.
          </p>
          <p className="mt-5 mb-0 font-heading text-lg text-gold-light">Matt. 6:33</p>
        </div>

        <img
          src={`${base}archer-gold.webp`}
          alt=""
          width={707}
          height={762}
          className="auth-archer pointer-events-none h-16 w-auto select-none lg:absolute lg:bottom-0 lg:left-[6%] lg:-z-10 lg:h-[min(60vh,38vw,100dvh-23rem)] lg:translate-y-[2%]"
        />
      </aside>

      <div className="flex min-h-[calc(100dvh-5rem)] flex-col px-5 pt-5 pb-10 lg:min-h-dvh lg:px-12 lg:pt-10 xl:px-16">
        <nav aria-label="Site" className="flex justify-end">
          <a href={siteUrl} className="text-sm font-semibold">
            Back to website
          </a>
        </nav>
        <main className="flex flex-1 items-start pt-8 lg:items-center lg:pt-0">
          <div className="w-full max-w-[25rem] lg:ml-[8%] xl:ml-[14%]">{children}</div>
        </main>
      </div>
    </div>
  );
}
