/**
 * The expressibility helper itself (UI_V1.6.1_ARCHITECTURE §9.4): stub windows report `todo`
 * (CR B4-3, B5-3: checked on a registry of `stubDraft()` windows, since the real ones are real);
 * a real draft model passes; each of the four checks fails a model that breaks it; the Colour
 * Samples swap belongs to the work window (V1.6.2 has no Canal Barge form); exhaustive mode samples
 * above its cap.
 */
import { describe, expect, it } from "vitest";
import type { AuthoritativeCommand } from "../../../../src/game/index.ts";
import { DECISION_WINDOW_KINDS } from "../../../../src/app/state/decisionWindow.ts";
import { defineWindow, stubDraft } from "../../../../src/app/state/draftStore.ts";
import type { DraftModel, WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { checkView, commandsFor, formFor, normalizeCommand } from "../support/expressibility.ts";
import { allFixtures, fixture } from "../support/fixtures.ts";
import { TOY_WINDOWS, ToyKilnForm, kilnDraft } from "../support/toyWindows.tsx";
import type { KilnAction, KilnDraft } from "../support/toyWindows.tsx";

/** The real registry with every draft model replaced by a phase A stub (`stubDraft()`). */
function stubbed(): WindowRegistry {
  const registry: Record<string, unknown> = {};
  for (const [kind, spec] of Object.entries(WINDOWS)) registry[kind] = { ...spec, draft: stubDraft() };
  return registry as unknown as WindowRegistry;
}

function withKiln(model: DraftModel<KilnDraft, KilnAction, readonly string[]>): WindowRegistry {
  return { ...WINDOWS, kiln_selection: defineWindow({ kind: "kiln_selection", Component: ToyKilnForm, draft: model, title: () => () => "" }) };
}

describe("expressibility helper", () => {
  it("reports a stub window (stubDraft) as todo, never as a failure", () => {
    // The real windows are no longer stubs (B4, B5); a registry of stubs keeps the helper honest.
    const registry = stubbed();
    const acting = allFixtures().filter((entry) => entry.viewerActs === true);
    expect(acting.length).toBeGreaterThan(30);
    let rows = 0;
    for (const entry of acting) {
      const report = checkView(entry.playerView, { registry });
      expect(report.rows.length, entry.id).toBeGreaterThan(0);
      for (const row of report.rows) expect(row.status, `${entry.id} ${row.command.type}`).toBe("todo");
      rows += report.rows.length;
    }
    expect(rows).toBeGreaterThan(100);
  });

  it("passes a real draft model", () => {
    const report = checkView(fixture("w-kiln-selection").playerView, { registry: TOY_WINDOWS });
    expect(report.window.kind).toBe("kiln_selection");
    expect(report.rows.map((row) => row.status)).toEqual(report.rows.map(() => "ok"));
    expect(report.rows.length).toBeGreaterThan(1);
  });

  it("fails a model that cannot express a command", () => {
    const report = checkView(fixture("w-kiln-selection").playerView, { registry: withKiln({ ...kilnDraft, fromCommand: () => null }) });
    expect(report.rows.every((row) => row.status === "fail" && row.problem === "fromCommand returned null")).toBe(true);
  });

  it("fails a draft holding a value its options do not offer", () => {
    const report = checkView(fixture("w-kiln-selection").playerView, {
      registry: withKiln({ ...kilnDraft, reduce: (draft, action) => (action.type === "revalidate" ? { kilnId: null } : draft) }),
    });
    expect(report.rows.every((row) => row.status === "fail" && /options\(\)/.test(row.problem ?? ""))).toBe(true);
  });

  it("fails a build that differs from the command, or does not validate", () => {
    const wrong = checkView(fixture("w-kiln-selection").playerView, { registry: withKiln({ ...kilnDraft, build: () => ({ type: "SELECT_KILN", kilnId: "RU" }) }) });
    expect(wrong.rows.some((row) => row.status === "fail" && /^build gave/.test(row.problem ?? ""))).toBe(true);
    const incomplete = checkView(fixture("w-kiln-selection").playerView, { registry: withKiln({ ...kilnDraft, build: () => null }) });
    expect(incomplete.rows.every((row) => row.problem === "build returned null")).toBe(true);
  });

  it("routes the Colour Samples swap to the work window, and offers no Canal Barge command", () => {
    const view = fixture("m17_after_action").playerView;
    const commands = commandsFor(view).commands;
    const swap = commands.find((command) => command.type === "USE_COLOUR_SAMPLES_SWAP");
    expect(swap).toBeDefined();
    expect(commands.map((command) => command.type as string)).not.toContain("USE_CANAL_BARGE");
    const report = checkView(view);
    const row = report.rows.find((candidate) => candidate.command.type === "USE_COLOUR_SAMPLES_SWAP");
    expect(row?.form).toBe("work");
    expect(row?.status).toBe("ok");
    expect(formFor({ type: "END_TURN" }, report.window).form).toBe("work");
  });

  it("normalises absent and false optional flags", () => {
    const a = { type: "PLACE_MATERIALS_YARD", workerId: "w", clay: 2, wood: 1, seniorApprentice: false } as AuthoritativeCommand;
    const b = { type: "PLACE_MATERIALS_YARD", workerId: "w", clay: 2, wood: 1 } as AuthoritativeCommand;
    expect(normalizeCommand(a)).toEqual(normalizeCommand(b));
    expect(normalizeCommand({ loads: [{ x: false, y: 1 }] })).toEqual({ loads: [{ y: 1 }] });
  });

  it("samples exhaustive mode above its cap, and counts the total", () => {
    const view = fixture("w-before-the-worker-action-rich-4-player-start").playerView;
    const sampled = commandsFor(view, { mode: "exhaustive", cap: 10, seed: 7 });
    expect(sampled.commands).toHaveLength(10);
    expect(sampled.total).toBeGreaterThan(10);
    expect(commandsFor(view, { mode: "exhaustive", cap: 10, seed: 7 }).commands).toEqual(sampled.commands);
  });

  it("covers every acting window kind with at least one fixture", () => {
    const kinds = new Set(allFixtures().filter((entry) => entry.viewerActs === true).map((entry) => checkView(entry.playerView).window.kind));
    for (const kind of DECISION_WINDOW_KINDS) if (kind !== "final" && kind !== "waiting") expect(kinds.has(kind), kind).toBe(true);
  });
});
