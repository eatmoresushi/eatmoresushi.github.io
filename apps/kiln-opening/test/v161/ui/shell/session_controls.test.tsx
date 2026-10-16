/**
 * Session menu and connection banner (UI_V1.6.1_ARCHITECTURE §3.6, §3.8, §4.1, §9.2; B1).
 *
 * - SessionMenu: a menu button with Theme (radio items), the room code, Leave view, and End
 *   session for the host only;
 * - ConnectionBanner in every status state: empty (no space), reconnecting, offline, a latched
 *   computer failure (failed or timed out) with Retry, an unsent command with Send again.
 */
import { describe, expect, it } from "vitest";
import { ConnectionBanner } from "../../../../src/app/shell/ConnectionBanner.tsx";
import { SessionMenu } from "../../../../src/app/shell/SessionMenu.tsx";
import { fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { modelOf } from "./support.tsx";

const menuItems = (html: string): string[] => [...html.matchAll(/<button[^>]*role="(menuitem|menuitemradio)"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?([^<]*)<\/button>/g)].map((match) => match[2] ?? "");

describe("session menu", () => {
  // fixtureSnapshot seats the first player as host; m1's viewer is p3 (seat 2), m5's is p1 (seat 0).
  it("offers End session only to the host", () => {
    const guest = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SessionMenu />);
    const host = renderComponent(fixtureSource("m5_two_player_board_2p"), <SessionMenu />);
    expect(menuItems(guest)).toEqual(["Light", "Dark", "System", "Room FIXTURE · copy code", "Leave view (your seat is kept)"]);
    expect(menuItems(host)).toEqual(["Light", "Dark", "System", "Room FIXTURE · copy code", "Leave view (your seat is kept)", "End session for everyone…"]);
    expect(host).toContain("<dialog");
    expect(guest).not.toContain("<dialog");
  });

  it("is a menu button with the theme as checked radio items", () => {
    const html = renderComponent(fixtureSource("m5_two_player_board_2p"), <SessionMenu />, { ui: { theme: "dark" } });
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-label="Session menu"/);
    expect(html).toMatch(/role="group" aria-label="Theme"/);
    expect(html).toMatch(/role="menuitemradio" aria-checked="true"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?Dark</);
    expect(html).toMatch(/role="menuitemradio" aria-checked="false"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?Light</);
    expect(html).toMatch(/kit-menu-item--danger"[^>]*>End session for everyone…/);
  });

  it("speaks Chinese", () => {
    const html = renderComponent(fixtureSource("m5_two_player_board_2p"), <SessionMenu />, { locale: "zh-CN" });
    expect(menuItems(html)).toEqual(["浅色", "深色", "跟随系统", "房间FIXTURE · 复制房间码", "离开（保留座位）", "为所有人结束对局……"]);
  });
});

describe("connection banner", () => {
  const banner = (options: Parameters<typeof fixtureSource>[1], locale: "en" | "zh-CN" = "en") =>
    renderComponent(fixtureSource("m1_work_phase_r2_3p", options), <ConnectionBanner />, { locale });

  it("takes no space when there is nothing to say, but keeps both live regions", () => {
    const html = banner({});
    expect(html).toMatch(/^<div class="conn-banner" data-empty="" role="region" aria-label="Connection">/);
    expect(html).toContain('<div class="conn-banner-status" role="status"></div>');
    expect(html).toContain('<div class="conn-banner-alert" role="alert"></div>');
  });

  it("says it is reconnecting (polite)", () => {
    const html = banner({ status: { reconnecting: true } });
    expect(html).not.toContain("data-empty");
    expect(html).toMatch(/role="status"><p class="conn-banner-line" data-state="reconnecting"><span>Reconnecting…<\/span>/);
  });

  it("says it is offline, with Reconnect now", () => {
    const html = banner({ status: { connection: "offline" } });
    expect(html).toMatch(/role="status"><p class="conn-banner-line" data-state="offline">/);
    expect(html).toContain("You are offline.");
    expect(html).toMatch(/data-banner="reconnect"[^>]*>Reconnect now</);
  });

  it("alerts a latched computer failure, with Retry computer turn", () => {
    const revision = modelOf("m1_work_phase_r2_3p").revision;
    const failed = banner({ status: { computerFailure: { revision, error: { kind: "mp", code: "COMPUTER_TURN_FAILED" }, timedOut: false } } });
    expect(failed).toMatch(/role="alert"><p class="conn-banner-line" data-state="computer-failure"><span>A computer player could not take its turn.<\/span>/);
    expect(failed).toMatch(/data-banner="retry-computers"[^>]*>Retry computer turn</);
    const timedOut = banner({ status: { computerFailure: { revision, error: { kind: "mp", code: "COMPUTER_TURN_FAILED" }, timedOut: true } } });
    expect(timedOut).toContain("A computer player took too long to move.");
  });

  it("alerts an unsent command, with Send again", () => {
    const html = banner({
      status: { unsent: { commandId: "x", expectedRevision: 1, command: { type: "END_TURN" } }, error: { kind: "mp", code: "SERVICE_UNAVAILABLE" } },
    });
    expect(html).toMatch(/role="alert"><p class="conn-banner-line" data-state="unsent"><span>Your last move may not have reached the table.<\/span>/);
    expect(html).toMatch(/data-banner="send-again"[^>]*>Send again</);
    const zh = banner({ status: { unsent: { commandId: "x", expectedRevision: 1, command: { type: "END_TURN" } } } }, "zh-CN");
    expect(zh).toContain("你的上一步可能未送达牌桌。");
    expect(zh).toContain(">重新发送<");
  });
});
