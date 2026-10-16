/**
 * Expressibility, complete (UI_V1.6.1_ARCHITECTURE §9.4, `expressibility_complete`). Owner: B6,
 * merged after B4 and B5.
 *
 * Every window of the registry is real (no phase A stub), and over every acting scenario and
 * moment every canonical legal command is expressed by its form: `fromCommand` gives a draft,
 * every value of it is offered by `options()`, `build` gives the command back and it passes the
 * ConfirmBar check. No row is `todo`, and every acting `DecisionWindow` kind and the composed
 * Canal Barge form are covered. (The per-package files add exhaustive mode and seeded games:
 * `decision/expressibility.{work,firing}.test.ts`.)
 */
import { describe, expect, it } from "vitest";
import { WINDOWS } from "../../../src/app/decision/windows.ts";
import { DECISION_WINDOW_KINDS } from "../../../src/app/state/decisionWindow.ts";
import type { ActingWindowKind } from "../../../src/app/state/decisionWindow.ts";
import { checkView } from "./support/expressibility.ts";
import type { ExpressibilityForm, ExpressibilityRow } from "./support/expressibility.ts";
import { allFixtures } from "./support/fixtures.ts";

const ACTING: readonly ActingWindowKind[] = DECISION_WINDOW_KINDS.filter((kind): kind is ActingWindowKind => kind !== "final" && kind !== "waiting");

describe("expressibility, complete (§9.4)", () => {
  const acting = allFixtures().filter((entry) => entry.viewerActs === true);
  const rows: ExpressibilityRow[] = [];

  it("has no stub window left in the registry", () => {
    for (const kind of DECISION_WINDOW_KINDS) expect(WINDOWS[kind].draft.stub, kind).toBeUndefined();
  });

  it.each(acting.map((entry) => [entry.id, entry] as const))("%s: every canonical command is expressed, none todo", (_, entry) => {
    const report = checkView(entry.playerView);
    expect(report.rows.length, "the window has legal commands").toBeGreaterThan(0);
    rows.push(...report.rows);
    const problems = report.rows.filter((row) => row.status !== "ok").map((row) => `${row.form} ${JSON.stringify(row.command)}: ${row.status} ${row.problem ?? ""}`);
    expect(problems).toEqual([]);
  });

  it("covers every acting window kind and the composed Canal Barge form", () => {
    expect(rows.length).toBeGreaterThan(500);
    const windows = new Set(rows.map((row) => row.window));
    for (const kind of ACTING) expect(windows.has(kind), kind).toBe(true);
    const forms = new Set<ExpressibilityForm>(rows.map((row) => row.form));
    expect(forms.has("canal_barge")).toBe(true);
    expect(rows.every((row) => row.status === "ok")).toBe(true);
  });
});
