import { useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { isCrewMember, useCrewProfile } from "../../lib/steward/crew";
import { useCrewView } from "./useCrewView";

// The tablet command view (STEWARD_APP_SPEC screen 15, docs/design/steward/Steward-Tablet): Stewards on a
// screen 1024 px or wider get Crew, Review and an issue reply side by side on /steward. "My shift"
// (?view=shift) shows the usual Tonight screen, to check in or out.

const WIDE = "(min-width: 1024px)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export function useWideScreen() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
}

export function useCommandView() {
  const view = useCrewView();
  const wide = useWideScreen();
  const { pathname, search } = useLocation();
  const profile = useCrewProfile().data;
  // Someone still waiting for their first property sees the waiting screen instead.
  const waiting = profile ? isCrewMember(profile.role) && profile.properties.length === 0 : true;
  return view === "steward" && wide && !waiting && pathname === "/steward" && new URLSearchParams(search).get("view") !== "shift";
}
