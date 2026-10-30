/* eslint-disable react-refresh/only-export-components -- form pieces and their hook belong together */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../lib/api";
import { IMAGE_TYPES } from "../../lib/images";
import { Icon } from "../../components/icons";
import { cx } from "../../components/styles";

// Form pieces shared by the admin and Representative Add property dialogs.

export const input = "h-11 w-full rounded-[10px] border border-field bg-white px-3 text-[14px] text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25 aria-[invalid=true]:border-danger";

export function Field({ label, error, hint, children, className, extra }: { label: ReactNode; error?: string; hint?: ReactNode; children: (id: string, describedBy?: string) => ReactNode; className?: string; extra?: ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[13.5px] font-semibold">
          {label}
        </label>
        {extra}
      </span>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 text-[12px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5" aria-labelledby={`add-step-${n}`}>
      <h2 id={`add-step-${n}`} className="m-0 flex items-center gap-2.5 text-[17px] text-ink">
        <span aria-hidden="true" className="flex size-[26px] items-center justify-center rounded-full bg-navy text-[13px] text-white">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PhotoPicker({ url, error, onPick, onRemove }: { url: string | null; error?: string; onPick: (file: File | undefined) => void; onRemove: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex w-[132px] flex-none flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex size-[132px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[18px] border-2 border-dashed border-placeholder bg-subtle text-[12.5px] font-bold text-navy hover:border-navy"
      >
        {url ? (
          <>
            <img src={url} alt="" className="size-full object-cover" />
            <span className="sr-only">Replace photo or logo</span>
          </>
        ) : (
          <>
            <Icon name="camera" size={28} />
            Add photo
            <span className="font-semibold text-muted">or logo</span>
          </>
        )}
      </button>
      <input ref={ref} type="file" accept={IMAGE_TYPES} tabIndex={-1} aria-hidden="true" className="sr-only" onChange={(e) => {
        onPick(e.target.files?.[0]);
        e.target.value = "";
      }} />
      {url ? (
        <button type="button" onClick={onRemove} className="text-[12.5px] font-bold text-navy hover:underline">
          Remove photo
        </button>
      ) : (
        <span className="text-center text-[11.5px] text-muted">PNG, JPG or WebP, up to 5 MB. Cropped to a square.</span>
      )}
      {error && (
        <p role="alert" className="m-0 text-center text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Checks the web address while it's typed (debounced); undefined until there's an answer. */
export function useSlugCheck(orgId: string, slug: string) {
  const api = useApi();
  const [term, setTerm] = useState(slug);
  useEffect(() => {
    const t = setTimeout(() => setTerm(slug), 350);
    return () => clearTimeout(t);
  }, [slug]);
  const { data } = useQuery({
    queryKey: ["slug-available", orgId, term],
    queryFn: () => api<{ available: boolean; suggestion: string | null }>(`/organizations/${orgId}/slug-available?slug=${encodeURIComponent(term)}`),
    enabled: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(term),
    retry: false,
    staleTime: 30_000,
  });
  return { available: data?.available, suggestion: data?.suggestion ?? null };
}
