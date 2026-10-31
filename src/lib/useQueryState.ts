import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * List pages keep their filters, tab, sort and page in the query string so links can be shared
 * and the back button works. `update` merges a patch (null or "" removes a key) and, unless the
 * patch sets `page`, goes back to page 1.
 */
export function useQueryState() {
  const [params, setParams] = useSearchParams();

  const update = useCallback(
    (patch: Record<string, string | string[] | null | undefined>, { replace = true } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, v] of Object.entries(patch)) {
            const value = Array.isArray(v) ? v.join(",") : v;
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  const list = useCallback((key: string) => params.get(key)?.split(",").filter(Boolean) ?? [], [params]);

  return { params, update, list };
}
