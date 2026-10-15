/**
 * The dev session panel is a dev tool (UI_V1.6.1_ARCHITECTURE §9.5): like the canonical-move
 * button it renders only when dev tools are on, so the lobby stubs show players nothing of it.
 * A production bundle drops it entirely (`DEV_TOOLS_BUILD` is false there).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EndedScreen } from "../../../../src/app/lobby/EndedScreen.tsx";
import { HomeScreen } from "../../../../src/app/lobby/HomeScreen.tsx";
import { LobbyScreen } from "../../../../src/app/lobby/LobbyScreen.tsx";
import { EMPTY_SNAPSHOT } from "../../../../src/app/session/gameSource.ts";
import type { GameSource, SubmitOutcome } from "../../../../src/app/session/gameSource.ts";
import { DEV_TOOLS_BUILD } from "../../../../src/app/state/hooks.ts";
import { harness } from "../support/render.tsx";

const empty: GameSource = {
  getSnapshot: () => EMPTY_SNAPSHOT,
  getServerSnapshot: () => EMPTY_SNAPSHOT,
  subscribe: () => () => undefined,
  submit: async (): Promise<SubmitOutcome> => ({ kind: "ignored" }),
  resend: async (): Promise<SubmitOutcome> => ({ kind: "ignored" }),
  reconnect: async () => undefined,
  retryComputers: () => undefined,
};

const SCREENS = [
  ["HomeScreen", <HomeScreen key="home" />],
  ["LobbyScreen", <LobbyScreen key="lobby" />],
  ["EndedScreen", <EndedScreen key="ended" />],
] as const;

describe("dev session panel gate", () => {
  it("is a dev-tool build under vitest", () => {
    expect(DEV_TOOLS_BUILD).toBe(true);
  });

  it.each(SCREENS)("%s shows no dev panel with dev tools off", (_name, element) => {
    const html = renderToStaticMarkup(harness(empty, { devTools: false }).wrap(element));
    expect(html).not.toContain("dev-session");
    expect(html).not.toContain("data-action=");
  });

  it.each(SCREENS)("%s shows the dev panel with dev tools on", (_name, element) => {
    const html = renderToStaticMarkup(harness(empty, { devTools: true }).wrap(element));
    expect(html).toContain('class="dev-session"');
  });

  it("the home panel keeps the smoke test's driver hooks", () => {
    const html = renderToStaticMarkup(harness(empty, { devTools: true }).wrap(<HomeScreen />));
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="roomCode"');
    expect(html).toContain('data-action="create-room"');
    expect(html).toContain('data-action="join-room"');
  });
});
