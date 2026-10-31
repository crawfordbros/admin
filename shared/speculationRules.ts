// Cloudflare Speed Brain cannot prefetch uncached portal pages or Worker routes.
// An origin-provided rules header prevents Cloudflare from injecting its rules.
export const SPECULATION_RULES_PATH = "/portal/speculation-rules.json";
export const SPECULATION_RULES_HEADER = `"${SPECULATION_RULES_PATH}"`;
export const SPECULATION_RULES_BODY = "{}";
export const SPECULATION_RULES_HEADERS = {
  "Content-Type": "application/speculationrules+json",
  "Cache-Control": "no-store",
};
