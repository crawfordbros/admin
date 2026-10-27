import { useEffect } from "react";

export function ComingSoon({ title, detail }: { title: string; detail: string }) {
  useEffect(() => {
    document.title = `${title} | CBES Admin`;
  }, [title]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mt-0 mb-3 text-3xl font-bold text-navy">{title}</h1>
      <div className="rounded-xl border-2 border-dashed border-gold bg-white p-6">
        <p className="mt-0 mb-1 font-semibold text-gold-text">Coming in Phase 2</p>
        <p className="m-0 leading-relaxed text-muted">{detail}</p>
      </div>
    </div>
  );
}
