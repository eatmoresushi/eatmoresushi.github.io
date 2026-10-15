/**
 * The draft store (UI_V1.6.1_ARCHITECTURE §3.5): reset to `initial` when the window's key changes
 * and on this client's own success; kept and revalidated against every new model otherwise;
 * derivations memoised so `useSyncExternalStore` sees stable values; stubs report `todo`.
 */
import { describe, expect, it } from "vitest";
import type { PlayerView } from "../../../../src/game/index.ts";
import { decisionWindow, windowDraftKey } from "../../../../src/app/state/decisionWindow.ts";
import { DraftStore, REVALIDATE, defineWindow, noDraft, stubDraft } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { DECISION_WINDOW_KINDS } from "../../../../src/app/state/decisionWindow.ts";
import { fixture } from "../support/fixtures.ts";
import { contributionDraft, kilnDraft } from "../support/toyWindows.tsx";

function contextOf(view: PlayerView) {
  const model = buildGameModel(view, []);
  return { model, engine: engineViewOf(view), key: windowDraftKey(decisionWindow(view)) };
}

/** The same window at a later revision (another player committed something). */
function laterRevision(view: PlayerView, patch: Partial<PlayerView["game"]> = {}): PlayerView {
  return { ...view, game: { ...view.game, revision: view.game.revision + 1, ...patch } };
}

describe("DraftStore", () => {
  it("starts from initial, and returns the same value while nothing changes", () => {
    const store = new DraftStore();
    const { model, engine, key } = contextOf(fixture("w-kiln-selection").playerView);
    const first = store.read(key, kilnDraft, model, engine);
    expect(first).toEqual({ kilnId: null });
    expect(store.read(key, kilnDraft, model, engine)).toBe(first);
  });

  it("applies actions, and keeps the draft (revalidated) across another player's commit", () => {
    const store = new DraftStore();
    const view = fixture("w-kiln-selection").playerView;
    const { model, engine, key } = contextOf(view);
    store.dispatch(key, kilnDraft, model, engine, { type: "pick", kilnId: "JU" });
    expect(store.read(key, kilnDraft, model, engine)).toEqual({ kilnId: "JU" });
    const later = contextOf(laterRevision(view));
    expect(later.key).toBe(key);
    const kept = store.read(key, kilnDraft, later.model, later.engine);
    expect(kept).toEqual({ kilnId: "JU" });
    expect(store.read(key, kilnDraft, later.model, later.engine)).toBe(kept);
  });

  it("drops a choice the new options no longer offer", () => {
    const store = new DraftStore();
    const view = fixture("w-kiln-selection").playerView;
    const { model, engine, key } = contextOf(view);
    const available = kilnDraft.options({ kilnId: null }, model, engine);
    const pick = available[0]!;
    store.dispatch(key, kilnDraft, model, engine, { type: "pick", kilnId: pick });
    const taken = laterRevision(view, {
      players: { ...view.game.players, [view.game.playerOrder.find((pid) => pid !== view.viewerId)!]: { ...view.game.players[view.game.playerOrder.find((pid) => pid !== view.viewerId)!]!, kilnId: pick } },
    });
    const later = contextOf(taken);
    expect(kilnDraft.options({ kilnId: null }, later.model, later.engine)).not.toContain(pick);
    expect(store.read(key, kilnDraft, later.model, later.engine)).toEqual({ kilnId: null });
  });

  it("resets when the window's key changes", () => {
    const store = new DraftStore();
    const view = fixture("m9_contributions_step1_3p").playerView;
    const { model, engine, key } = contextOf(view);
    const offered = contributionDraft.options({ card: null }, model, engine);
    store.dispatch(key, contributionDraft, model, engine, { type: "card", card: offered[0]! });
    const phase = view.game.phase as { windowId: string };
    const next = contextOf(laterRevision(view, { phase: { ...view.game.phase, windowId: `${phase.windowId}-2` } as PlayerView["game"]["phase"] }));
    expect(next.key).not.toBe(key);
    expect(store.read(next.key, contributionDraft, next.model, next.engine)).toEqual({ card: null });
  });

  it("resets to initial on this client's own success", () => {
    const store = new DraftStore();
    const { model, engine, key } = contextOf(fixture("w-kiln-selection").playerView);
    store.dispatch(key, kilnDraft, model, engine, { type: "pick", kilnId: "JU" });
    const version = store.getVersion();
    store.reset();
    expect(store.getVersion()).toBe(version + 1);
    expect(store.read(key, kilnDraft, model, engine)).toEqual({ kilnId: null });
    store.reset();
    expect(store.getVersion()).toBe(version + 1);
  });

  it("revalidates a `set` and a seeded draft", () => {
    const store = new DraftStore();
    const { model, engine, key } = contextOf(fixture("w-kiln-selection").playerView);
    store.dispatch(key, kilnDraft, model, engine, { type: "set", draft: { kilnId: "NOT_A_KILN" as never } });
    expect(store.read(key, kilnDraft, model, engine)).toEqual({ kilnId: null });
    store.seed(key, { kilnId: "JU" });
    expect(store.read(key, kilnDraft, model, engine)).toEqual({ kilnId: "JU" });
  });

  it("notifies subscribers on every stored change", () => {
    const store = new DraftStore();
    const { model, engine, key } = contextOf(fixture("w-kiln-selection").playerView);
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    store.dispatch(key, kilnDraft, model, engine, { type: "pick", kilnId: "JU" });
    store.reset();
    stop();
    store.seed(key, { kilnId: "RU" });
    expect(calls).toBe(2);
  });
});

describe("stub and empty draft models", () => {
  it("a stub builds nothing, expresses nothing and is marked", () => {
    const stub = stubDraft();
    const { model, engine } = contextOf(fixture("w-kiln-selection").playerView);
    const draft = stub.initial(model, engine);
    expect(stub.stub).toBe(true);
    expect(stub.build(draft, model, engine)).toBeNull();
    expect(stub.fromCommand({ type: "SELECT_KILN", kilnId: "JU" }, model, engine)).toBeNull();
    expect(stub.reduce(draft, REVALIDATE, model, engine)).toBe(draft);
    expect(noDraft().stub).toBeUndefined();
  });

  it("every phase A registry entry names its own kind", () => {
    for (const kind of DECISION_WINDOW_KINDS) expect(WINDOWS[kind].kind).toBe(kind);
  });

  it("defineWindow keeps the spec unchanged", () => {
    const spec = { kind: "final" as const, Component: () => null, draft: noDraft(), title: () => () => "" };
    expect(defineWindow(spec)).toBe(spec);
  });
});
