import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState } from "@/components/ui";
import type { Persona } from "@/domain/types";
import { useStore } from "@/store/store";

/** Admin screens: the Business administrator maintains them; the Auditor reads the rules (its menu's "Rules"). */
export function AdminGate({ children }: { children: ReactNode }) {
  const { persona } = useStore();
  if (persona.id === "admin" || persona.id === "auditor") return <>{children}</>;
  return (
    <EmptyState data-testid="admin-only" title="Administrator area">
      Only the Business administrator maintains rules, the questionnaire, section owners and reminders.
    </EmptyState>
  );
}

const under = (pathname: string, to: string) => pathname === to || pathname.startsWith(to + "/");

/**
 * Route access follows the menu (spec §3): a page is open when its menu entry is in the persona's menu, detail pages
 * included (/review/:caseId under My reviews). Cases and the case page are open to every internal role (spec §4).
 */
export function routeAllowed(persona: Persona, pathname: string): boolean {
  if (persona.side === "internal" && under(pathname, "/cases")) return true;
  return persona.nav.some((n) => under(pathname, n.to)) || (persona.hiddenRoutes ?? []).some((r) => under(pathname, r));
}

/** Shown in the shell instead of a page outside the persona's menu. */
export function NoAccess() {
  const { persona } = useStore();
  const nav = useNavigate();
  const home = persona.nav.find((n) => n.to === persona.landing) ?? persona.nav[0];
  return (
    <Card>
      <EmptyState
        data-testid="no-access"
        icon={<Lock size={26} strokeWidth={1.7} />}
        title="This page is not part of your role"
        action={
          home && (
            <Button variant="primary" onClick={() => nav(home.to)} data-testid="no-access-home">
              Go to {home.label}
            </Button>
          )
        }
      >
        {persona.label} works with: {persona.nav.map((n) => n.label).join(" · ")}.
      </EmptyState>
    </Card>
  );
}
