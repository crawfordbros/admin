import { useUser } from "@clerk/clerk-react";
import { roleFrom } from "../../access";
import { crewView, type CrewView } from "./nav";

/** Which tab set the signed-in person sees: the Steward's or the valet's. */
export function useCrewView(): CrewView {
  const { user } = useUser();
  return crewView(roleFrom(user?.publicMetadata));
}
