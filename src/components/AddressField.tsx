import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { placesAvailable, placesSession, type PlaceAddress, type Suggestion } from "../lib/places";
import { Icon } from "./icons";
import { cx } from "./styles";

/**
 * Street address with Google suggestions: type 3 or more characters, pick one with the arrow keys
 * and Enter (or a click), and `onPlace` gets the city, county, ZIP and location. Typing an
 * address by hand always works too.
 */
export function AddressField({
  value,
  onChange,
  onPlace,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlace: (place: PlaceAddress) => void;
  error?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const session = useMemo(() => (placesAvailable() ? placesSession() : null), []);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(!session);
  // Only text the person typed is looked up, not an address filled in from a suggestion.
  const typed = useRef(false);

  useEffect(() => {
    if (!session || failed || !typed.current) return;
    const input = value.trim();
    if (input.length < 3) return;
    let current = true;
    const t = setTimeout(() => {
      setSearching(true);
      session
        .suggest(input)
        .then((s) => {
          if (!current) return;
          setSuggestions(s);
          setActive(0);
          setOpen(s.length > 0);
        })
        .catch(() => current && setFailed(true))
        .finally(() => current && setSearching(false));
    }, 250);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [value, session, failed]);

  const choose = async (s: Suggestion) => {
    setOpen(false);
    typed.current = false;
    onChange(s.main);
    try {
      const place = await session!.details(s);
      onPlace({ ...place, address: place.address || s.main });
    } catch {
      setFailed(true);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(suggestions[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const describedBy = [error ? `${id}-error` : null, failed && session ? `${id}-note` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-semibold">
        Street address
      </label>
      <div
        className={cx(
          "flex h-12 items-center gap-2.5 rounded-[10px] border bg-white px-3.5 focus-within:border-2 focus-within:border-navy focus-within:shadow-[0_0_0_4px_#e3e4f6]",
          error ? "border-danger" : "border-field",
        )}
      >
        <Icon name="pin" size={18} strokeWidth={2} className="text-navy" />
        <input
          id={id}
          type="text"
          role={session && !failed ? "combobox" : undefined}
          aria-expanded={session && !failed ? open : undefined}
          aria-controls={session && !failed ? listId : undefined}
          aria-autocomplete={session && !failed ? "list" : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder={session && !failed ? "Start typing the address" : undefined}
          value={value}
          onChange={(e) => {
            typed.current = true;
            onChange(e.target.value);
            if (e.target.value.trim().length < 3) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none"
        />
        {searching && <span className="text-[12px] text-muted">Searching…</span>}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Address suggestions" className="absolute top-full right-0 left-0 z-20 m-0 mt-1 list-none rounded-xl border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(26,28,94,0.16)]">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void choose(s)}
              className={cx("flex cursor-pointer items-center gap-2.5 rounded-[9px] px-3 py-2.5", i === active && "bg-tint-2")}
            >
              <Icon name="pin" size={18} strokeWidth={2} className="text-muted" />
              <span>
                <span className="block text-[14px] font-bold">{s.main}</span>
                <span className="block text-[12.5px] text-muted">{s.secondary}</span>
              </span>
            </li>
          ))}
          <li role="presentation" className="mt-1 border-t border-row-line px-3 pt-2 pb-1 text-right text-[11.5px] text-muted">
            Address suggestions powered by Google
          </li>
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      {failed && session && (
        <p id={`${id}-note`} className="m-0 text-[12.5px] text-muted">
          Address suggestions are unavailable right now. Type the address.
        </p>
      )}
    </div>
  );
}
