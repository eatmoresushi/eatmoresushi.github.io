/**
 * The lobby driver hooks (UI_V1.6.1_ARCHITECTURE §9.6) after change request CR-B1-3: the real
 * lobby screens carry every e2e hook, once each, with dev tools on and off, and no screen renders
 * the phase A dev session panel (removed, §10.4 C1).
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

describe("lobby driver hooks on the real screens (CR-B1-3)", () => {
  it("is a dev-tool build under vitest", () => {
    expect(DEV_TOOLS_BUILD).toBe(true);
  });

  it.each(SCREENS)("%s renders no dev session panel, with dev tools on or off", (_name, element) => {
    for (const devTools of [false, true]) {
      const html = renderToStaticMarkup(harness(empty, { devTools }).wrap(element));
      expect(html).not.toContain("dev-session");
    }
  });

  it("the home screen carries the smoke test's hooks once each, with dev tools on and off", () => {
    for (const devTools of [false, true]) {
      const html = renderToStaticMarkup(harness(empty, { devTools }).wrap(<HomeScreen />));
      for (const hook of ['name="displayName"', 'name="roomCode"', 'data-action="create-room"', 'data-action="join-room"']) {
        expect(html.split(hook), `${hook} devTools=${String(devTools)}`).toHaveLength(2);
      }
    }
  });
});
