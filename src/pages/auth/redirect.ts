/**
 * Where to go after signing in. RedirectToSignIn adds `redirect_url` (an absolute URL); only paths on
 * this origin are honored so the sign-in page can't be used to bounce people to another site.
 */
export function afterSignInPath(search: string, origin = window.location.origin): string {
  const raw = new URLSearchParams(search).get("redirect_url");
  if (!raw) return "/portal";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname.startsWith("/portal/login")) return "/portal";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/portal";
  }
}
