/**
 * Expressibility, complete (UI_V1.6.1_ARCHITECTURE §9.4, `expressibility_complete`). Owner: B6,
 * merged after B4 and B5.
 *
 * Every window of the registry is real (no phase A stub), and over every acting scenario and
 * moment every canonical legal command is expressed by its form: `fromCommand` gives a draft,
 * every value of it is offered by `options()`, `build` gives the command back and it passes the
 * ConfirmBar check. No row is `todo`, and every acting `DecisionWindow` kind is covered, with
 * every V1.6.2 command family (the Commission reservation, the Guild Hall's takes and finish, the
 * Colour Samples swap and its look, Second Firing's choice). (The per-package files add exhaustive mode and seeded games:
 * `decision/expressibility.{work,firing}.test.ts`.)
 */
import { describe, expect, it } from "vitest";
import { WINDOWS } from "../../../src/app/decision/windows.ts";
import { DECISION_WINDOW_KINDS } from "../../../src/app/state/decisionWindow.ts";
import type { ActingWindowKind } from "../../../src/app/state/decisionWindow.ts";
import { checkView } from "./support/expressibility.ts";
import type { ExpressibilityForm, ExpressibilityRow } from "./support/expressibility.ts";
import { allFixtures, derivedFixtureIds, fixture } from "./support/fixtures.ts";

const ACTING: readonly ActingWindowKind[] = DECISION_WINDOW_KINDS.filter((kind): kind is ActingWindowKind => kind !== "final" && kind !== "waiting");

describe("expressibility, complete (§9.4)", () => {
  const acting = allFixtures().filter((entry) => entry.viewerActs === true);
  const rows: ExpressibilityRow[] = [];

  it("has no stub window left in the registry", () => {
    for (const kind of DECISION_WINDOW_KINDS) expect(WINDOWS[kind].draft.stub, kind).toBeUndefined();
  });

  // The derived states (`d-…`: states no generated fixture holds, such as a Guild Hall inspection
  // after its first take) are checked the same way.
  const derived = derivedFixtureIds().map((id) => fixture(id)).filter((entry) => entry.viewerActs === true);
  it.each([...acting, ...derived].map((entry) => [entry.id, entry] as const))("%s: every canonical command is expressed, none todo", (_, entry) => {
    const report = checkView(entry.playerView);
    expect(report.rows.length, "the window has legal commands").toBeGreaterThan(0);
    rows.push(...report.rows);
    const problems = report.rows.filter((row) => row.status !== "ok").map((row) => `${row.form} ${JSON.stringify(row.command)}: ${row.status} ${row.problem ?? ""}`);
    expect(problems).toEqual([]);
  });

  it("covers every acting window kind and every V1.6.2 command family", () => {
    expect(rows.length).toBeGreaterThan(500);
    const windows = new Set(rows.map((row) => row.window));
    for (const kind of ACTING) expect(windows.has(kind), kind).toBe(true);
    const forms = new Set<ExpressibilityForm>(rows.map((row) => row.form));
    for (const kind of ACTING) expect(forms.has(kind), kind).toBe(true);
    const families = new Set(rows.map((row) => row.command.type as string));
    for (const type of ["SELECT_CHOOSE", "GUILD_TAKE", "GUILD_FINISH", "USE_COLOUR_SAMPLES_SWAP", "SECOND_FIRING_CHOOSE"]) expect(families.has(type), type).toBe(true);
    // Retired by V1.6.2 (changes 21–22, and change 25's one Select command): never offered, so never expressed.
    for (const type of ["USE_CANAL_BARGE", "COMMISSION_RESERVE", "COMMISSION_STOP", "COMMISSION_CHOOSE_LOOKED", "COMMISSION_GAIN", "COMMISSION_CHOOSE", "COLOUR_SAMPLES_CHOOSE", "COLOUR_SAMPLES_SWAP_CHOOSE"]) expect(families.has(type), type).toBe(false);
    expect(rows.every((row) => row.status === "ok")).toBe(true);
  });
});
