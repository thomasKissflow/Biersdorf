// Read-only view of the portal's roles (with member counts) and which role holds which grant on each flow. On a phone
// (Thomas, 30 Oct) both tables are cards: a role with its members and id; a flow with each role's grant.
import { Badge, Card, CardHeader, CardList, CardListItem, EmptyState, Mono, PageHeader, Table, Td, Tr } from "@/components/ui";
import { useIsPhone } from "@/shell/useLayoutMode";
import { FLOWS, PORTAL_ID, type FlowKey } from "../kf/portal";
import { rowsOf } from "../kf/sdk";
import { usePortalMode } from "../mode";
import { FLOW_LABEL, useAsync } from "./common";

interface RoleRow {
  id: string;
  name: string;
  users: number | undefined;
}
interface Grant {
  role: string;
  roleName: string;
  level: string;
  permission: string[];
}

export function RolesGrants() {
  const { client } = usePortalMode();
  const q = useAsync(async () => {
    const acc = client!.accountId;
    const roles: RoleRow[] = [];
    for (const r of rowsOf(await client!.apiGet(`/app_role/2/${acc}/list?_application_id=${PORTAL_ID}&page_number=1&page_size=100`))) {
      const detail = (await client!.apiGet(`/app_role/2/${acc}/${String(r._id)}?_application_id=${PORTAL_ID}`)) as { UserCount?: number } | undefined;
      roles.push({ id: String(r._id), name: String(r.Name ?? r._id), users: detail?.UserCount });
    }
    const grants: Partial<Record<FlowKey, Grant[]>> = {};
    for (const [key, f] of Object.entries(FLOWS) as [FlowKey, (typeof FLOWS)[FlowKey]][]) {
      const family = f.kind === "form" ? "form" : "process";
      grants[key] = rowsOf(await client!.apiGet(`/flow/2/${acc}/${family}/${f.id}/member?_application_id=${PORTAL_ID}`)).map((m) => ({
        role: String(m._id),
        roleName: String(m.Name ?? m._id),
        level: String(m.Role ?? ""),
        permission: Array.isArray(m.Permission) ? (m.Permission as string[]) : [],
      }));
    }
    return { roles, grants };
  }, [client]);
  const phone = useIsPhone();
  const grantBadge = (g: Grant) => <Badge tone={g.level === "Admin" ? "violet" : "info"}>{`${g.level}${g.permission.length ? ` · ${g.permission.join(", ")}` : ""}`}</Badge>;

  return (
    <div className="space-y-5">
      <PageHeader title="Roles & grants" subtitle="Read-only. Change roles and grants with the build scripts, never by hand, so the record stays true." />
      {q.loading && !q.data ? (
        <Card className="p-6 text-[13px] text-ink-3">Loading…</Card>
      ) : q.error ? (
        <Card>
          <EmptyState title="Could not load roles and grants">{q.error}</EmptyState>
        </Card>
      ) : (
        q.data && (
          <>
            <Card>
              <CardHeader title="Roles" subtitle={`${q.data.roles.length} roles in the portal`} />
              {phone ? (
                <CardList label="Roles" className="p-3" data-testid="roles-cards">
                  {q.data.roles.map((r) => (
                    <CardListItem key={r.id} title={r.name} fields={[{ label: "Members", value: r.users ?? "—" }, { label: "Id", value: <Mono>{r.id}</Mono>, wide: true }]} />
                  ))}
                </CardList>
              ) : (
              <Table head={["Role", "Members", "Id"]}>
                {q.data.roles.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td>{r.users ?? "—"}</Td>
                    <Td>
                      <Mono>{r.id}</Mono>
                    </Td>
                  </Tr>
                ))}
              </Table>
              )}
            </Card>
            <Card>
              <CardHeader title="Grants per flow" />
              {phone ? (
                <CardList label="Grants per flow" className="p-3" data-testid="grants-cards">
                  {(Object.keys(FLOWS) as FlowKey[]).map((k) => (
                    <CardListItem
                      key={k}
                      title={FLOW_LABEL[k]}
                      fields={q.data!.roles.map((r) => {
                        const g = q.data!.grants[k]?.find((x) => x.role === r.id);
                        return { label: r.name, value: g ? grantBadge(g) : <span className="text-ink-3">—</span>, wide: true };
                      })}
                    />
                  ))}
                </CardList>
              ) : (
              <Table head={["Flow", ...q.data.roles.map((r) => r.name)]}>
                {(Object.keys(FLOWS) as FlowKey[]).map((k) => (
                  <Tr key={k}>
                    <Td className="font-medium">{FLOW_LABEL[k]}</Td>
                    {q.data!.roles.map((r) => {
                      const g = q.data!.grants[k]?.find((x) => x.role === r.id);
                      return <Td key={r.id}>{g ? grantBadge(g) : <span className="text-ink-3">—</span>}</Td>;
                    })}
                  </Tr>
                ))}
              </Table>
              )}
            </Card>
          </>
        )
      )}
    </div>
  );
}
