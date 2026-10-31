// US mobile numbers, as the API stores them (E.164, +14045550119) and as people read them.

/** E.164 for a 10-digit US number (an optional leading 1 is fine); null otherwise. */
export function usMobile(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "(404) 555-0119" for a stored +1 number; anything else as it is. */
export function displayPhone(e164: string | null): string {
  const m = e164?.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 ?? "");
}
