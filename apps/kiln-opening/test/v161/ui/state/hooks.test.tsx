/**
 * The hook layer under `renderToStaticMarkup` (UI_V1.6.1_ARCHITECTURE §3.3, §9.2): every hook
 * renders on the server (so `getServerSnapshot` is wired), reads the source it is given, and a
 * seeded draft drives table selection synchronously.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useT } from "../../../../src/app/i18n/I18nProvider.tsx";
import { EMPTY_SNAPSHOT } from "../../../../src/app/session/gameSource.ts";
import type { GameSnapshot, GameSource, SubmitOutcome } from "../../../../src/app/session/gameSource.ts";
import {
  GameProvider,
  NO_SESSION_ACTIONS,
  useDecision,
  useDevTools,
  useDraft,
  useEngineView,
  useGame,
  useLayoutMode,
  useLog,
  useModel,
  useOptionalGame,
  useSession,
  useSnapshot,
  useTableSelection,
  useUi,
} from "../../../../src/app/state/hooks.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { engineViewOf, gameModelOf } from "../../../../src/app/state/model.ts";
import { fixtureSource } from "../support/fixtures.ts";
import { harness, renderComponent } from "../support/render.tsx";
import { TOY_WINDOWS } from "../support/toyWindows.tsx";

/** Renders every hook and prints what it read. */
function EveryHook() {
  const t = useT();
  const snapshot = useSnapshot();
  const session = useSession();
  const game = useGame();
  const round = useModel((model) => model.round);
  const engine = useEngineView();
  const decision = useDecision();
  const [draft] = useDraft<unknown>();
  const table = useTableSelection();
  const ui = useUi();
  const layout = useLayoutMode();
  const dev = useDevTools();
  const optional = useOptionalGame();
  return (
    <dl>
      <dt>t</dt>
      <dd>{t("common.verb.confirm")}</dd>
      <dt>snapshot</dt>
      <dd>{snapshot.room?.code}</dd>
      <dt>session</dt>
      <dd>{session.seat?.playerId}</dd>
      <dt>game</dt>
      <dd>{game.revision}</dd>
      <dt>round</dt>
      <dd>{round}</dd>
      <dt>engine</dt>
      <dd>{engine.actor?.viewerId}</dd>
      <dt>window</dt>
      <dd>{decision.window.kind}</dd>
      <dt>draft</dt>
      <dd>{JSON.stringify(draft)}</dd>
      <dt>table</dt>
      <dd>{String(table.interactive)}</dd>
      <dt>ui</dt>
      <dd>{ui.section}</dd>
      <dt>layout</dt>
      <dd>{layout}</dd>
      <dt>dev</dt>
      <dd>{String(dev)}</dd>
      <dt>optional</dt>
      <dd>{String(optional === game)}</dd>
    </dl>
  );
}

const valueOf = (html: string, name: string) => new RegExp(`<dt>${name}</dt><dd>([^<]*)</dd>`).exec(html)?.[1];

describe("every hook renders on the server", () => {
  it("reads a fixture source", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <EveryHook />, { layoutMode: "phone" });
    expect(valueOf(html, "t")).toBe("Confirm");
    expect(valueOf(html, "snapshot")).toBe("FIXTURE");
    expect(valueOf(html, "session")).toBe("p3");
    expect(valueOf(html, "round")).toBe("2");
    expect(valueOf(html, "engine")).toBe("p3");
    expect(valueOf(html, "window")).toBe("work");
    // The work window's real initial draft (B4; CR B4-3, B5-3), from the fixture.
    const source = fixtureSource("m1_work_phase_r2_3p");
    const view = source.getServerSnapshot().view!;
    const initial = WINDOWS.work.draft.initial(gameModelOf(view, source.getServerSnapshot().seats), engineViewOf(view));
    expect(valueOf(html, "draft")).toBe(JSON.stringify(initial).replace(/"/g, "&quot;"));
    // The real work window (B4) drives the table: Place shortcuts are live for the acting viewer.
    expect(valueOf(html, "table")).toBe("true");
    expect(valueOf(html, "ui")).toBe("workshop");
    expect(valueOf(html, "layout")).toBe("phone");
    expect(valueOf(html, "dev")).toBe("false");
    expect(valueOf(html, "optional")).toBe("true");
  });

  it("uses getServerSnapshot, not getSnapshot, on the server", () => {
    const base = fixtureSource("m1_work_phase_r2_3p");
    let server = 0;
    let client = 0;
    const source: GameSource = {
      ...base,
      getSnapshot: () => {
        client += 1;
        return base.getSnapshot();
      },
      getServerSnapshot: () => {
        server += 1;
        return base.getServerSnapshot();
      },
      subscribe: base.subscribe,
      submit: (command) => base.submit(command),
      resend: () => base.resend(),
      reconnect: () => base.reconnect(),
      retryComputers: () => base.retryComputers(),
    };
    renderComponent(source, <EveryHook />);
    expect(server).toBeGreaterThan(0);
    expect(client).toBe(0);
  });

  it("game hooks throw outside a game; session hooks work without one", () => {
    const empty: GameSource = {
      getSnapshot: () => EMPTY_SNAPSHOT,
      getServerSnapshot: () => EMPTY_SNAPSHOT,
      subscribe: () => () => undefined,
      submit: async (): Promise<SubmitOutcome> => ({ kind: "ignored" }),
      resend: async (): Promise<SubmitOutcome> => ({ kind: "ignored" }),
      reconnect: async () => undefined,
      retryComputers: () => undefined,
    };
    function SessionOnly() {
      const session = useSession();
      const game = useOptionalGame();
      const ui = useUi();
      const table = useTableSelection();
      return <p>{`${session.room === null}|${game === null}|${ui.section}|${table.interactive}`}</p>;
    }
    expect(renderComponent(empty, <SessionOnly />)).toBe("<p>true|true|table|false</p>");
    expect(() => renderComponent(empty, <EveryHook />)).toThrow(/needs an open game/);
  });

  it("needs a GameProvider", () => {
    expect(() => renderToStaticMarkup(<EveryHook />)).toThrow();
    expect(
      renderToStaticMarkup(
        <GameProvider source={fixtureSource("m1_work_phase_r2_3p")} registry={WINDOWS}>
          <Probe />
        </GameProvider>,
      ),
    ).toBe("<p>work</p>");
  });

  it("offers inert session actions for a fixture", async () => {
    expect(await NO_SESSION_ACTIONS.create("Lin")).toEqual({ ok: false, error: { kind: "mp", code: "SERVICE_UNAVAILABLE" } });
    expect(await NO_SESSION_ACTIONS.restore()).toBeNull();
  });
});

function Probe() {
  return <p>{useDecision().window.kind}</p>;
}

describe("seeded drafts and table selection (§3.5)", () => {
  function Targets() {
    const table = useTableSelection();
    const [draft] = useDraft<{ spaceId: string | null }>();
    return (
      <p>
        {[...table.kilnTargets].map(([spaceId, target]) => `${spaceId}${target.pressed ? "*" : ""}`).join(",")}|{draft.spaceId ?? "none"}
      </p>
    );
  }

  it("derives the targets from a seeded draft synchronously", () => {
    const source = fixtureSource("w-setters-mark-window");
    const unseeded = renderComponent(source, <Targets />, { registry: TOY_WINDOWS });
    const spaces = /<p>([^|]*)\|/.exec(unseeded)![1]!.split(",");
    expect(spaces.length).toBeGreaterThan(0);
    expect(unseeded).not.toContain("*");
    const seeded = renderComponent(source, <Targets />, { registry: TOY_WINDOWS, draft: { spaceId: spaces[0] } });
    expect(seeded).toContain(`${spaces[0]}*`);
    expect(seeded).toContain(`|${spaces[0]}`);
  });

  it("table clicks become draft actions of the open window", () => {
    const source = fixtureSource("w-setters-mark-window");
    const h = harness(source, { registry: TOY_WINDOWS });
    let act: ((action: { type: "kilnSpace"; spaceId: string }) => void) | null = null;
    function Capture() {
      const table = useTableSelection();
      act = table.act as typeof act;
      return null;
    }
    renderToStaticMarkup(h.wrap(<Capture />));
    const first = renderToStaticMarkup(h.wrap(<Targets />));
    const space = /<p>([^,|]*)/.exec(first)![1]!;
    act!({ type: "kilnSpace", spaceId: space });
    expect(renderToStaticMarkup(h.wrap(<Targets />))).toContain(`|${space}`);
  });
});

describe("useLog", () => {
  it("exposes the snapshot's log and last batch, and nothing of the raw view", () => {
    const base = fixtureSource("m1_work_phase_r2_3p");
    const snapshot = base.getServerSnapshot();
    expect(snapshot.log.length).toBeGreaterThan(0);
    const last = snapshot.log[snapshot.log.length - 1]!;
    const batch = { revision: last.revision, firstSequence: last.sequence, events: [last.event], origin: "computers" as const };
    const withBatch: GameSnapshot = { ...snapshot, lastBatch: batch };
    const source: GameSource = {
      getSnapshot: () => withBatch,
      getServerSnapshot: () => withBatch,
      subscribe: base.subscribe,
      submit: (command) => base.submit(command),
      resend: () => base.resend(),
      reconnect: () => base.reconnect(),
      retryComputers: () => base.retryComputers(),
    };
    let seen: ReturnType<typeof useLog> | null = null;
    function Grab() {
      seen = useLog();
      return null;
    }
    renderComponent(source, <Grab />);
    expect(seen).not.toBeNull();
    expect(Object.keys(seen!).sort()).toEqual(["lastBatch", "log"]);
    expect(seen!.log).toBe(snapshot.log);
    expect(seen!.lastBatch).toBe(batch);
  });

  it("works outside a game (empty log, no batch)", () => {
    const empty: GameSource = {
      getSnapshot: () => EMPTY_SNAPSHOT,
      getServerSnapshot: () => EMPTY_SNAPSHOT,
      subscribe: () => () => undefined,
      submit: async (): Promise<SubmitOutcome> => ({ kind: "ignored" }),
      resend: async (): Promise<SubmitOutcome> => ({ kind: "ignored" }),
      reconnect: async () => undefined,
      retryComputers: () => undefined,
    };
    function Count() {
      const { log, lastBatch } = useLog();
      return <p>{`${log.length}|${lastBatch === null}`}</p>;
    }
    expect(renderComponent(empty, <Count />)).toBe("<p>0|true</p>");
  });
});

describe("snapshot identity", () => {
  it("useSnapshot returns the source's snapshot object", () => {
    const source = fixtureSource("m1_work_phase_r2_3p");
    let seen: GameSnapshot | null = null;
    function Grab() {
      seen = useSnapshot();
      return null;
    }
    renderComponent(source, <Grab />);
    expect(seen).toBe(source.getServerSnapshot());
  });
});
