import { useEffect, useRef, useState } from "react";

/**
 * True once the element comes within `margin` of the screen, and stays true. Lists use it to fetch a
 * photo only when its row is about to show, so a long list doesn't download every photo at once.
 */
export function useNearScreen<T extends Element>(margin = "400px 0px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const watch = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: margin });
    watch.observe(el);
    return () => watch.disconnect();
  }, [margin, near]);
  return { ref, near };
}
