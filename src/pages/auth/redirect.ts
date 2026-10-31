/** The Steward crew app (/steward) has its own sign-in page; everything else signs in at /portal/login. */
export const isStewardPath = (pathname: string) => /^\/steward(\/|$)/.test(pathname);

export function loginPathFor(pathname: string = window.location.pathname): string {
  return isStewardPath(pathname) ? "/steward/login" : "/portal/login";
}

/** Where a sign-in page sends people when there's nowhere better to go back to. */
export const homeFor = (pathname: string) => (isStewardPath(pathname) ? "/steward" : "/portal");

/**
 * Where to go after signing in. RedirectToSignIn adds `redirect_url` (an absolute URL); only paths on
 * this origin are honored so the sign-in page can't be used to bounce people to another site.
 * `fallback` is the home of the sign-in page in use: /portal, or /steward for the crew app.
 */
export function afterSignInPath(search: string, origin = window.location.origin, fallback = "/portal"): string {
  const raw = new URLSearchParams(search).get("redirect_url");
  if (!raw) return fallback;
  try {
    const url = new URL(raw, origin);
    if (
      url.origin !== origin ||
      !/^\/(admin|portal|steward)(\/|$)/.test(url.pathname) ||
      /^\/(portal|steward)\/(login|accept-invite)(\/|$)/.test(url.pathname)
    ) {
      return fallback;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
