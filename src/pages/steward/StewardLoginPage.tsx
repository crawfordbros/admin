import { StewardAuthLayout } from "../../components/steward/StewardAuthLayout";
import { useT } from "../../lib/steward/preferences";
import { LoginPage } from "../LoginPage";

/** Screen 1, Sign in: the portal's sign-in steps (password, Google, second step) in the Steward look. */
export function StewardLoginPage() {
  const t = useT();
  return <LoginPage layout={StewardAuthLayout} title={t("signin.title")} documentTitle={`${t("signin.title")} | Steward`} home="/steward" />;
}
