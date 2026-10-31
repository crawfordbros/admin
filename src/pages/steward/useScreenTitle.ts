import { useEffect } from "react";

/** The browser tab and the home-screen app switcher show the screen's name. */
export function useScreenTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | Steward`;
  }, [title]);
}
