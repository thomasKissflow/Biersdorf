// #/ → the first landing by priority (§5.5): RMM → reviewer → approver → business admin → reader.
import { Navigate } from "react-router-dom";
import { useWorkbench } from "../data/hooks";
import { landingOf } from "../kf/app";
import { FeatureStub } from "../ui/FeatureStub";

export function Home() {
  const { caps } = useWorkbench();
  const to = landingOf(caps);
  if (!to) return <FeatureStub title="Nothing to show for this role" owner="T1" testId="wb-home-empty">The selected role has no Workbench page. Choose "All my roles" in View as.</FeatureStub>;
  return <Navigate to={to} replace />;
}
