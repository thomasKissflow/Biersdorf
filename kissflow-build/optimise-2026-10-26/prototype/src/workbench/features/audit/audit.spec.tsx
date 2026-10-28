// T3 AuditTimeline (§8.16): props only, newest first, labels for the Workbench's action codes (correcting rows
// marked), the snapshot collapsible, dense mode, the empty state. Rendered with react-dom/server (no jsdom).
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toAuditVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { AuditTimeline, eventTone } from "./AuditTimeline";
import { actionLabel, actorLine, fmtDate, fmtDateTime, prettySnapshot, sortEventsNewestFirst } from "./format";

const ev = (id: string, o: Record<string, unknown>) => toAuditVM({ _id: id, Event_Key: `EV-${id}`, ...o } as RawItem);
const events = [
  ev("a", { Event_At: "2026-10-02T09:00:00Z", Event_Category: "Cancellation", Action_Code: "case.cancel", Actor_Name: "Alex Rivera", Actor_Dept: "RMM", Actor_Side: "BDF", Case_Code: "CIQ-2026-PkC2", Cycle_No: 1, Event_Reason: "Supplier withdrew the material", Notify_Recipient: "ana.contact@example.test" }),
  ev("b", { Event_At: "2026-10-03T09:00:00Z", Event_Category: "Cancellation", Action_Code: "case.cancel.correction", Actor_Name: "Alex Rivera", Object_Key: "EV-a" }),
  ev("c", { Event_At: "2026-10-04T09:00:00Z", Event_Category: "Case", Action_Code: "lane.completed", Actor_Name: "Jo Weber", Actor_Dept: "SAF", Snapshot_JSON: JSON.stringify({ SAF_Review_Confirm: "Confirmed" }) }),
  ev("d", { Event_Category: "Configuration", Action_Code: "config.retire", Old_Value_Text: "Published", New_Value_Text: "Retired" }),
];

describe("format helpers", () => {
  it("labels known codes, marks correcting rows, keeps unknown codes", () => {
    expect(actionLabel({ actionCode: "case.cancel", category: "Cancellation" })).toBe("Case cancelled");
    expect(actionLabel({ actionCode: "case.cancel.correction", category: "Cancellation" })).toBe("Case cancelled (correcting row)");
    expect(actionLabel({ actionCode: "custom.code", category: "Case" })).toBe("custom.code");
    expect(actionLabel({ actionCode: "", category: "Notification" })).toBe("Notification");
  });
  it("actor line, newest-first sort (rows without a time last), dates", () => {
    expect(actorLine(events[0])).toBe("Alex Rivera · RMM · BDF");
    expect(actorLine({ actorName: "Jo Weber", actorEmail: "", actorDept: "SAF", actorSide: "BDF" })).toBe("Jo Weber · Safety · BDF"); // UX-11: names, not codes
    expect(actorLine(ev("x", {}))).toBe("Unknown actor");
    expect(sortEventsNewestFirst(events).map((e) => e._id)).toEqual(["c", "b", "a", "d"]);
    expect(fmtDateTime("")).toBe("—");
    expect(fmtDateTime("not a date")).toBe("not a date");
    expect(fmtDateTime("2026-10-08T10:00:00Z")).toMatch(/2026/);
    // UX-12: one en-GB format; a Date field is a calendar day (never the day before in a western time zone)
    expect(fmtDate("2026-10-15")).toBe("15 Oct 2026");
    expect(fmtDateTime("2026-10-08T10:00:07Z")).not.toMatch(/UTC|:07/);
    expect(prettySnapshot({ a: 1 }, "", 5)).toMatch(/more characters/);
  });
  it("tones: a cancellation is bad, a correcting row warns", () => {
    expect(eventTone(events[0])).toBe("bad");
    expect(eventTone(events[1])).toBe("warn");
    expect(eventTone(events[3])).toBe("violet");
  });
});

describe("AuditTimeline (server render)", () => {
  it("renders every event newest first with its test id, reason, change and snapshot", () => {
    const html = renderToString(<AuditTimeline events={events} />);
    expect(html).toContain('data-testid="wb-audit-timeline"');
    const order = ["EV-c", "EV-b", "EV-a", "EV-d"].map((k) => html.indexOf(`wb-audit-event-${k}`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html).toContain("Supplier withdrew the material");
    expect(html).toContain("Case cancelled (correcting row)");
    expect(html).toContain("Published");
    expect(html).toContain("Snapshot");
    expect(html).toContain("not notified automatically");
    expect(html).not.toMatch(/sent to supplier|e-mailed|PDF generated/i);
  });
  it("dense mode and the empty state", () => {
    const dense = renderToString(<AuditTimeline events={events} dense />);
    expect(dense).toContain("wb-audit-event-EV-a");
    expect(dense).not.toContain("Snapshot");
    expect(renderToString(<AuditTimeline events={[]} />)).toContain("No audit events yet.");
  });
});
