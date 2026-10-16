/**
 * Home, lobby and ended screens and the end-session dialog (UI_V1.6.1_ARCHITECTURE §1.1, §3.9,
 * §4.2, §9.2; B1). Shell-state fixtures through a static source (§9.1 item 4).
 *
 * - home without and with a saved seat (Resume, Forget seat);
 * - the lobby as host (add and remove computers, start with 2–4, the reason a control is
 *   unavailable) and as guest (waiting for the host); computer seats say "Computer player",
 *   the raw strategy version only in the seat's details;
 * - the ended screen names who ended which room;
 * - errors are formatted from their code in the current language;
 * - the language toggle is on every screen; no internal ID is perceivable;
 * - the e2e driver hooks stay with the dev session panel until B6 retargets them (CR-B1-3).
 */
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_SNAPSHOT } from "../../../../src/app/session/gameSource.ts";
import type { GameSnapshot } from "../../../../src/app/session/gameSource.ts";
import { EndSessionDialog } from "../../../../src/app/lobby/EndSessionDialog.tsx";
import { EndedScreen } from "../../../../src/app/lobby/EndedScreen.tsx";
import { HomeScreen } from "../../../../src/app/lobby/HomeScreen.tsx";
import { LobbyScreen } from "../../../../src/app/lobby/LobbyScreen.tsx";
import { REAL_LOBBY_HOOKS, actionHook, nameHook, roomCodeHook, seatHook } from "../../../../src/app/lobby/driverHooks.ts";
import { harness } from "../support/render.tsx";
import { StaticSource, lobbySnapshot, perceivable } from "../shell/support.tsx";

const render = (snapshot: GameSnapshot, element: ReactElement, locale: "en" | "zh-CN" = "en", devTools = false): string =>
  renderToStaticMarkup(harness(new StaticSource(snapshot), { locale, devTools }).wrap(element));

describe("home screen", () => {
  it("offers create and join with one name field, and the language and theme controls", () => {
    const html = render(EMPTY_SNAPSHOT, <HomeScreen />);
    expect(html).toContain('<main class="lobby-main" aria-labelledby=');
    expect(html).toContain("<h1");
    expect(html).toContain("Build the workshop. Share the kiln. Master the craft.");
    expect(html).toContain("2–4 players · 5 rounds");
    expect(html.match(/<input/g)).toHaveLength(2);
    expect(html).toContain(">Your name</label>");
    expect(html).toContain(">Room code</label>");
    expect(html).toContain(">Create room</button>");
    expect(html).toContain(">Join room</button>");
    expect(html).toContain('aria-label="Language"');
    expect(html).toContain('aria-label="Theme"');
    expect(html).not.toContain("Resume");
  });

  it("offers Resume and Forget seat for a saved seat", () => {
    const html = render({ ...EMPTY_SNAPSHOT, savedRoomCode: "KILN42" }, <HomeScreen />);
    expect(html).toContain("Your saved seat");
    expect(html).toContain("Room KILN42");
    expect(html).toContain(">Resume</button>");
    expect(html).toContain(">Forget seat</button>");
  });

  it("formats a stored error at render time, in either language", () => {
    const snapshot: GameSnapshot = { ...EMPTY_SNAPSHOT, status: { ...EMPTY_SNAPSHOT.status, error: { kind: "mp", code: "ROOM_NOT_FOUND" } } };
    const en = render(snapshot, <HomeScreen />);
    const zh = render(snapshot, <HomeScreen />, "zh-CN");
    const text = (html: string) => /<p[^>]*class="lobby-error" role="alert">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    expect(text(en)).not.toBe("");
    expect(text(zh)).not.toBe("");
    expect(text(en)).not.toBe(text(zh));
    expect(text(en)).not.toContain("ROOM_NOT_FOUND");
  });

  it("shows progress while a request is in flight", () => {
    const html = render({ ...EMPTY_SNAPSHOT, status: { ...EMPTY_SNAPSHOT.status, lobbyAction: "create" } }, <HomeScreen />);
    expect(html).toMatch(/aria-busy="true"[^>]*>Create room</);
    expect(html).toContain("Working…");
  });

  it("speaks Chinese", () => {
    const html = render(EMPTY_SNAPSHOT, <HomeScreen />, "zh-CN");
    expect(html).toContain("立作坊，共窑火，精匠艺。");
    expect(html).toContain("2–4人 · 共5轮");
    expect(html).toContain(">创建房间</button>");
  });
});

describe("lobby screen", () => {
  it("shows the room code, every seat and the host's controls", () => {
    const snapshot = lobbySnapshot("m1_work_phase_r2_3p", { seatCount: 3, computers: [2] });
    const html = render(snapshot, <LobbyScreen />);
    expect(html).toContain("Room KILN42");
    expect(html).toContain(">Copy code</button>");
    expect(html).toContain("3 of 4 seats taken");
    const seats = html.split('<li class="lobby-seat"').slice(1);
    expect(seats).toHaveLength(4);
    expect(seats[0]).toContain("Lin (you)");
    expect(seats[0]).toContain(">Host</span>");
    expect(seats[1]).toContain(">Player</span>");
    expect(seats[2]).toContain(">Computer player</span>");
    expect(seats[2]).toContain("Strategy version: v161-strategic-1");
    expect(seats[2]).toMatch(/aria-label="Remove Wen"/);
    // Each card: the seat colour, then one top-aligned text column; Details and Remove share one
    // action row inside it.
    for (const seat of seats) expect(seat).toMatch(/^[^>]*><span class="lobby-seat-swatch" aria-hidden="true"><\/span><div class="lobby-seat-body">/);
    const actions = /<div class="lobby-seat-actions">([^]*)<\/div><\/div><\/li>/.exec(seats[2]!)?.[1] ?? "";
    expect(actions).toMatch(/^<details[^>]*class="[^"]*lobby-seat-details/);
    expect(/<button[^>]*aria-label="Remove Wen"[^>]*>/.exec(actions)?.[0]).toMatch(/class="[^"]*lobby-seat-remove/);
    expect(seats[0]).not.toContain("lobby-seat-actions");
    expect(seats[3]).toContain("Open seat");
    expect(html).toMatch(/<button[^>]*>Add a computer player<\/button>/);
    expect(html).toContain(">Start with 3 players</button>");
    expect(html).not.toMatch(/aria-disabled="true"[^>]*>Start with/);
    expect(html).toContain(">End session</button>");
    expect(html).toContain("<dialog");
  });

  it("says why a control is unavailable", () => {
    const one = render(lobbySnapshot("m1_work_phase_r2_3p", { seatCount: 1 }), <LobbyScreen />);
    const start = /<button[^>]*>Start with 1 player</.exec(one)?.[0] ?? "";
    expect(start).toContain('aria-disabled="true"');
    const note = /aria-describedby="([^"]+)"/.exec(start)?.[1];
    expect(one).toContain(`<p id="${note}" class="lobby-note">At least 2 players are needed to start.</p>`);
    const full = render(lobbySnapshot("m2_commission_market_look_r3_4p", { computers: [1, 2, 3] }), <LobbyScreen />);
    const add = /<button[^>]*>Add a computer player</.exec(full)?.[0] ?? "";
    expect(add).toContain('aria-disabled="true"');
    expect(add).toMatch(/aria-describedby="[^"]+"/);
    expect(full).toContain("Every seat is taken.");
  });

  it("lets a guest wait for the host, without host controls", () => {
    const html = render(lobbySnapshot("m1_work_phase_r2_3p", { viewerSeat: 1, seatCount: 2 }), <LobbyScreen />);
    expect(html).toContain("Waiting for Lin to start…");
    expect(html).not.toContain("Add a computer player");
    expect(html).not.toContain("Start with");
    expect(html).not.toContain("Remove");
    expect(html).not.toContain("<dialog");
    expect(html).toContain(">Leave (your seat is kept)</button>");
  });

  it("speaks Chinese", () => {
    const html = render(lobbySnapshot("m1_work_phase_r2_3p", { seatCount: 3, computers: [2] }), <LobbyScreen />, "zh-CN");
    expect(html).toContain("房间KILN42");
    expect(html).toContain("已坐3人／共4座");
    expect(html).toContain(">以3人开局</button>");
    expect(html).toContain(">电脑玩家</span>");
  });
});

describe("ended screen", () => {
  it("says who ended which room, and offers home and forget", () => {
    const html = render(lobbySnapshot("m1_work_phase_r2_3p", { status: "abandoned", endedBy: 0, viewerSeat: 1 }), <EndedScreen />);
    expect(html).toContain("This session has ended.");
    expect(html).toContain("Lin ended room KILN42 for everyone.");
    expect(html).toContain(">Return home</button>");
    expect(html).toContain(">Forget this seat</button>");
    const unknown = render(lobbySnapshot("m1_work_phase_r2_3p", { status: "abandoned" }), <EndedScreen />, "zh-CN");
    expect(unknown).toContain("房主已为所有人结束房间KILN42。");
  });
});

describe("end-session dialog", () => {
  it("is a native dialog with a destructive confirmation", () => {
    const html = render(lobbySnapshot("m1_work_phase_r2_3p"), <EndSessionDialog open={false} onClose={() => undefined} />);
    expect(html).toMatch(/^<dialog class="end-dialog" aria-labelledby="[^"]+" aria-describedby="[^"]+">/);
    expect(html).toContain("End room KILN42 for everyone?");
    expect(html).toContain(">Keep playing</button>");
    expect(html).toMatch(/kit-btn--danger[^>]*>End session for everyone</);
  });
});

describe("all pre-game screens", () => {
  const screens: Array<[string, GameSnapshot, ReactElement]> = [
    ["home", EMPTY_SNAPSHOT, <HomeScreen key="h" />],
    ["home-saved", { ...EMPTY_SNAPSHOT, savedRoomCode: "KILN42" }, <HomeScreen key="hs" />],
    ["lobby-host", lobbySnapshot("m2_commission_market_look_r3_4p", { computers: [2, 3] }), <LobbyScreen key="lh" />],
    ["lobby-guest", lobbySnapshot("m2_commission_market_look_r3_4p", { viewerSeat: 1 }), <LobbyScreen key="lg" />],
    ["ended", lobbySnapshot("m1_work_phase_r2_3p", { status: "abandoned", endedBy: 0 }), <EndedScreen key="e" />],
  ];

  it.each(screens)("%s shows no internal ID and no placeholder in either language", (_name, snapshot, element) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const seen = perceivable(render(snapshot, element, locale));
      expect(seen).not.toMatch(/\bseat-\d\b|\bp\d+\b|test-room/);
      expect(seen).not.toMatch(/[{}]/);
    }
  });

  it("the hook helpers switch every hook with one flag", () => {
    expect(actionHook("create-room")).toEqual(REAL_LOBBY_HOOKS ? { "data-action": "create-room" } : {});
    expect(nameHook("displayName")).toEqual(REAL_LOBBY_HOOKS ? { name: "displayName" } : {});
    expect(roomCodeHook("K")).toEqual(REAL_LOBBY_HOOKS ? { "data-room-code": "K" } : {});
    expect(seatHook(1)).toEqual(REAL_LOBBY_HOOKS ? { "data-seat-index": 1 } : {});
  });

  // B6 flipped the flag (CR-B1-3) after the kit Button kept a passed `data-action` (CR-B1-4).
  it("puts every driver hook on the real controls", () => {
    expect(REAL_LOBBY_HOOKS).toBe(true);
    const home = render({ ...EMPTY_SNAPSHOT, savedRoomCode: "KILN42" }, <HomeScreen />);
    for (const hook of ['name="displayName"', 'name="roomCode"', 'data-action="create-room"', 'data-action="join-room"', 'data-action="resume"', 'data-action="forget-seat"']) {
      expect(home.split(hook)).toHaveLength(2);
    }
    const lobby = render(lobbySnapshot("m2_commission_market_look_r3_4p", { computers: [2, 3] }), <LobbyScreen />);
    for (const hook of ['data-action="add-computer"', 'data-action="start-game"', 'data-action="leave"', "data-room-code="]) {
      expect(lobby.split(hook)).toHaveLength(2);
    }
    expect(lobby.match(/data-action="remove-computer"/g)).toHaveLength(2);
    expect(lobby.match(/data-seat-index=/g)).toHaveLength(4);
    expect(lobby).not.toContain("dev-session");
  });

  it("keeps exactly one set of driver hooks with dev tools on (no dev panel)", () => {
    const html = render(lobbySnapshot("m1_work_phase_r2_3p", { seatCount: 2 }), <LobbyScreen />, "en", true);
    expect(html.match(/data-action="add-computer"/g)).toHaveLength(1);
    expect(html.match(/data-seat-index=/g)).toHaveLength(2);
    expect(html.match(/data-room-code=/g)).toHaveLength(1);
    const home = render(EMPTY_SNAPSHOT, <HomeScreen />, "en", true);
    expect(home.match(/name="displayName"/g)).toHaveLength(1);
    expect(home.match(/data-action="create-room"/g)).toHaveLength(1);
  });
});
