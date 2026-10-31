/**
 * Table components (B2; UI_V1.6.1_ARCHITECTURE §9.2 `table/`): central board and location cards,
 * the Shared Kiln strip, the Main Order display, the viewer's private look and hand, the Finished
 * ceramics strip, the Tech display and the Recognition track. (The public-hands block was removed
 * in the owner review of 2026-10-17; `shell/world_sections.test.tsx` checks it stays gone.)
 *
 * Fixtures render through the real hooks (`renderComponent`) in English and Chinese. Table
 * targets come from test-only window adapters (`tableWindows.tsx`) built on engine selectors,
 * seeded through the draft store, as B4's and B5's real adapters will be.
 */
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPERIAL_TRACK,
  completableOrders,
  kilnLayout,
  orderMatchOptions,
  placementOptions,
  shortTextSegments,
} from "../../../../src/game/index.ts";
import type { CentralLocationId, LocationId } from "../../../../src/game/index.ts";
import { guildInspectionOptions, guildOptions } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { workDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { disciplineName, locationName, recognitionMilestones, techText } from "../../../../src/app/i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../../../src/app/i18n/errors.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { buildGameModel, engineViewOf, gameModelOf } from "../../../../src/app/state/model.ts";
import { CentralBoard } from "../../../../src/app/table/CentralBoard.tsx";
import { FinishedCeramicsStrip } from "../../../../src/app/table/FinishedCeramicsStrip.tsx";
import { HandRow } from "../../../../src/app/table/HandRow.tsx";
import { KilnMini } from "../../../../src/app/table/KilnMini.tsx";
import { LookedOrders } from "../../../../src/app/table/LookedOrders.tsx";
import { OrderDisplay } from "../../../../src/app/table/OrderDisplay.tsx";
import { RecognitionTrack } from "../../../../src/app/table/RecognitionTrack.tsx";
import { TechDisplay } from "../../../../src/app/table/TechDisplay.tsx";
import { tableCeramics } from "../../../../src/app/table/tableData.ts";
import { ROOT } from "../../support/glossary.ts";
import { fixture, fixtureSource, secretIds } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import type { RenderOptions } from "../support/render.tsx";
import { textOf, visibleText } from "./markup.ts";
import { INERT_WINDOWS, TABLE_WINDOWS, withModelCeramics } from "./tableWindows.tsx";

const EN = createTranslator("en", { strict: true });

/** React's text escaping, for comparing markup with content strings. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function render(id: string, element: ReactElement, options: RenderOptions = {}): string {
  return renderComponent(fixtureSource(id), element, { registry: TABLE_WINDOWS, ...options });
}

function viewOf(id: string) {
  return fixture(id).playerView;
}

/** The markup of one location card. */
function card(html: string, locationId: string): string {
  const start = html.indexOf(`data-location-id="${locationId}"`);
  if (start < 0) throw new Error(`no card for ${locationId}`);
  const from = html.lastIndexOf("<article", start);
  return html.slice(from, html.indexOf("</article>", start) + "</article>".length);
}

/** The markup of one Order card (`<article … data-order-id>`). */
function orderCard(html: string, orderId: string): string {
  const start = html.indexOf(`data-order-id="${orderId}"`);
  if (start < 0) throw new Error(`no card for ${orderId}`);
  const from = html.lastIndexOf("<article", start);
  return html.slice(from, html.indexOf("</article>", start) + "</article>".length);
}

// ── Central board ─────────────────────────────────────────────────────────────────────────

describe("CentralBoard and LocationCard", () => {
  it("shows every central location with its occupants and capacity (m5: Magistrate's Hall 1/1)", () => {
    const html = render("m5_two_player_board_2p", <CentralBoard />);
    const view = viewOf("m5_two_player_board_2p");
    for (const location of ["materials_yard", "commission_market", "guild_hall", "canal_wharf", "magistrates_hall"] as const) {
      expect(html).toContain(`data-location-id="${location}"`);
      expect(textOf(card(html, location))).toContain(locationName(location, "en"));
    }
    const magistrate = card(html, "magistrates_hall");
    expect(visibleText(magistrate)).toContain("1/1 taken");
    expect(magistrate).toContain("loc-count--full");
    expect(visibleText(magistrate)).toContain("Recognition 0–2 only");
    // Lin's Shifu stands there, named in words (D9).
    expect(magistrate).toContain('aria-label="Lin’s Shifu"');
    expect(magistrate).not.toMatch(/\bp\d:(shifu|apprentice)/);
    // The Canal Wharf has no limit.
    expect(visibleText(card(html, "canal_wharf"))).toContain("No limit");
    expect(view.game.playerCount).toBe(2);
  });

  it("opens no rules details from an action space card: no Full rules link (owner review, 2026-10-17)", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render("m1_work_phase_r2_3p", <CentralBoard />, { locale });
      expect(html).not.toContain("kit-detail-trigger");
      expect(html).not.toContain("data-rules-detail");
      expect(textOf(html)).not.toContain(locale === "en" ? "Full rules" : "完整规则");
      // The one-line effects stay, as plain text.
      expect(card(html, "canal_wharf")).toMatch(/<p class="loc-fx">/);
    }
  });

  it("renders the one-line effects in English and Chinese from the location summaries", () => {
    const en = visibleText(card(render("m1_work_phase_r2_3p", <CentralBoard />), "canal_wharf"));
    expect(en).toContain("Apprentice: 2 Coins");
    expect(en).toContain("Shifu: 4 Coins");
    const zh = visibleText(card(render("m1_work_phase_r2_3p", <CentralBoard />, { locale: "zh-CN" }), "canal_wharf"));
    expect(zh).toContain("学徒：得2铜钱");
    expect(zh).toContain("不限");
  });

  it("offers Place shortcuts from TableSelection, pressed for the draft's choice", () => {
    const RICH = "w-before-the-worker-action-rich-4-player-start";
    const plain = render(RICH, <CentralBoard />);
    const yard = card(plain, "materials_yard");
    expect(yard).toContain('data-act="place"');
    expect(yard).toContain('aria-label="Place Shifu at Materials Yard"');
    expect(yard).toContain('aria-label="Place Apprentice at Materials Yard"');
    expect(yard).not.toContain('aria-pressed="true"');
    const seeded = render(RICH, <CentralBoard />, { draft: { locationId: "materials_yard", workerKey: "shifu" } });
    const chosen = card(seeded, "materials_yard");
    expect(chosen).toContain('class="loc loc--chosen"');
    expect(chosen).toMatch(/aria-pressed="true"[^>]*aria-label="Place Shifu at Materials Yard"/);
    expect(chosen).toMatch(/aria-pressed="false"[^>]*aria-label="Place Apprentice at Materials Yard"/);
    // Without a table adapter the table is inert: no shortcuts.
    expect(render(RICH, <CentralBoard />, { registry: INERT_WINDOWS })).not.toContain('data-act="place"');
    // m5's Magistrate's Hall is full: no shortcut there, the reason instead.
    expect(card(render("m5_two_player_board_2p", <CentralBoard />), "magistrates_hall")).not.toContain('data-act="place"');
    expect(visibleText(card(render("m5_two_player_board_2p", <CentralBoard />), "magistrates_hall"))).toContain("Can’t place here");
  });

  it("renders Place shortcuts as compact worker pieces, the full sentence only in the accessible name (wireframe `.pbtn`)", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const yard = card(render("w-before-the-worker-action-rich-4-player-start", <CentralBoard />, { locale }), "materials_yard");
      const heading = locale === "en" ? "Place:" : "派工：";
      expect(yard).toContain(`<span class="loc-place-h" aria-hidden="true">${heading}</span>`);
      const buttons = yard.match(/<button[^>]*data-act="place"[\s\S]*?<\/button>/g) ?? [];
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      for (const button of buttons) {
        // The visible name is the worker alone (shown where the card has room), never "Place Shifu".
        expect(textOf(button)).not.toMatch(locale === "en" ? /Place/ : /派/);
        expect(button).toMatch(/<span class="pbtn-w" aria-hidden="true">[^<]+<\/span>/);
      }
    }
    const css = readFileSync(join(ROOT, "src/app/table/LocationCard.css"), "utf8");
    expect(css).toMatch(/@container location \(min-width: 200px\)\s*\{\s*\.pbtn-w/);
    expect(css).toMatch(/\.pbtn \{\s*min-width: var\(--target-min\);\s*min-height: var\(--target-min\);/);
  });

  it("shows unavailable reasons through ruleErrorText, with their details (§5 gap 12)", () => {
    let checked = 0;
    for (const id of ["m5_two_player_board_2p", "w-before-the-worker-action-rich-4-player-start"]) {
      const view = viewOf(id);
      const html = render(id, <CentralBoard />);
      const model = gameModelOf(view, []);
      const options = errorTextOptions(tableCeramics(model).labelView, EN);
      for (const option of placementOptions(view)) {
        if (option.locationId === "form_decorate" || option.locationId === "glaze_load") continue;
        const text = visibleText(card(html, option.locationId as CentralLocationId));
        if (option.workers.some((worker) => worker.legal)) {
          expect(text).not.toContain("Can’t place here");
          continue;
        }
        expect(text).toContain("Can’t place here");
        for (const worker of option.workers) {
          const error = worker.error ?? (worker.reason === null ? null : { code: worker.reason });
          if (error !== null) expect(text).toContain(ruleErrorText(error, EN, options));
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(2);
    // The Magistrate's Hall names the 4 Coins it needs for either worker (the error's details, change 33).
    expect(visibleText(card(render("w-before-the-worker-action-rich-4-player-start", <CentralBoard />), "magistrates_hall"))).toContain("Not enough Coins: you need 4 and have 3");
  });
});

// ── Shared Kiln strip ─────────────────────────────────────────────────────────────────────

describe("KilnMini", () => {
  /** The glyph's cells by D8 row, top to bottom: the space IDs each row draws. */
  function glyphRows(html: string): Array<{ zone: string; spaceIds: string[] }> {
    return [...html.matchAll(/kglyph-row--(low|middle|high)">(.*?)<\/span>/g)].map((match) => ({
      zone: match[1] ?? "",
      spaceIds: [...(match[2] ?? "").matchAll(/data-space-id="([^"]+)"/g)].map((cell) => cell[1] ?? ""),
    }));
  }

  it("summarises the 2-player kiln (2-1-1), the Kiln Die and the open Fire discard, naming no covered space (m5)", () => {
    const html = render("m5_two_player_board_2p", <KilnMini />);
    const view = viewOf("m5_two_player_board_2p");
    const text = textOf(html);
    expect(text).toContain("4 spaces (2-1-1) ·");
    expect(text).not.toMatch(/covered/i);
    expect(text).toContain(`Kiln Die: ${view.game.kilnDie?.value ?? ""}`);
    expect(text).toContain("Fire discard (open)");
    for (const value of view.game.fireDiscard) expect(html).toContain(`data-fire="${value}"`);
    expect(html).not.toMatch(/cards? (left|remaining)|left in the deck/i);
    expect(html).toContain("Open Kiln");
    expect(textOf(render("m5_two_player_board_2p", <KilnMini />, { locale: "zh-CN" }))).not.toMatch(/停用|盖/);
  });

  // Owner review 2026-10-17: covered spaces are not drawn at all; the glyph shows exactly the
  // engine's active spaces (`kilnLayout`), each D8 row centred: 2p 1/1/2, 3p 2/2/2, 4p 2/3/3.
  it.each([
    ["m5_two_player_board_2p", [1, 1, 2], "4 spaces (2-1-1)", "4个窑位（2-1-1）"],
    ["m1_work_phase_r2_3p", [2, 2, 2], "6 spaces (2-2-2)", "6个窑位（2-2-2）"],
    ["m2_commission_market_look_r3_4p", [2, 3, 3], "8 spaces (3-3-2)", "8个窑位（3-3-2）"],
  ] as const)("draws only the active spaces, Low at the top, then Middle, then High (D8): %s", (id, counts, en, zh) => {
    const html = render(id, <KilnMini />);
    const rows = glyphRows(html);
    expect(rows.map((row) => row.zone)).toEqual(["low", "middle", "high"]);
    expect(rows.map((row) => row.spaceIds.length)).toEqual(counts);
    const layout = kilnLayout(viewOf(id));
    expect(rows.flatMap((row) => row.spaceIds).sort()).toEqual([...layout.activeSpaceIds].sort());
    for (const covered of layout.coveredSpaceIds) expect(html).not.toContain(`data-space-id="${covered}"`);
    expect(html).not.toContain("kglyph-cell--covered");
    expect(textOf(html)).toContain(en);
    expect(textOf(render(id, <KilnMini />, { locale: "zh-CN" }))).toContain(zh);
  });

  it("gives way to the firing stage during the Firing Phase (D3)", () => {
    expect(render("m3_kiln_master_marker_3p", <KilnMini />)).toBe("");
  });

  it("keeps no hatched covered-cell style in its stylesheet", () => {
    const css = readFileSync(join(ROOT, "src/app/table/KilnMini.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/covered/);
  });
});

// ── Orders ────────────────────────────────────────────────────────────────────────────────

describe("OrderDisplay", () => {
  it("leaves a reserved position empty until the reserver's turn ends (m2 after its reservation)", () => {
    const id = "d-commission-after-face-up-reservation";
    // The viewer's own reservation says "your turn"; another player's names them.
    const en = render(id, <OrderDisplay />);
    expect(en).toContain("Empty. Refills when your turn ends.");
    expect(render(id, <OrderDisplay />, { locale: "zh-CN" })).toContain("空位：你的回合结束时补榜。");
    const entry = structuredClone(fixture(id));
    const other = Object.keys(entry.playerView.game.players).find((playerId) => playerId !== entry.viewerId)!;
    entry.playerView.game.market.refillPendingFor = other;
    const name = entry.playerView.game.players[other]!.displayName;
    const others = renderComponent(new FixtureGameSource(entry), <OrderDisplay />, { registry: TABLE_WINDOWS });
    expect(others).toContain(`Empty. Refills when <strong>${name}</strong>’s turn ends.`);
    const zh = renderComponent(new FixtureGameSource(entry), <OrderDisplay />, { registry: TABLE_WINDOWS, locale: "zh-CN" });
    expect(zh).toContain(`空位：<strong>${name}</strong>的回合结束时补榜。`);
    // During the look nothing is reserved yet, so the display is full (v1.6.2 L195–196).
    expect(render("m2_commission_market_look_r3_4p", <OrderDisplay />)).not.toContain("Refills when");
    const counts = viewOf(id).game.counts;
    expect(textOf(en)).toContain(`Main deck ${counts.mainDeck} · discard ${counts.mainDiscard} (face down)`);
    expect(textOf(en)).toContain("#1 oldest → #6 newest");
  });

  it("says an empty position cannot refill when both piles ran out", () => {
    const html = render("t-empty-main-supply", <OrderDisplay />);
    const display = viewOf("t-empty-main-supply").game.market.display;
    expect(display).toContain(null);
    expect(textOf(html)).toContain("Empty: no card to refill.");
  });

  it("prints each face-up Order: number, kind, VP, requirement, quality line, Coins and Crowns", () => {
    const html = render("m17_after_action", <OrderDisplay />);
    const face = visibleText(orderCard(html, "O42"));
    expect(face).toContain("O42");
    expect(face).toContain("Crown");
    expect(face).toContain("16 VP");
    expect(face).toContain("Brush Washer + Censer; different Glazes; same Decoration");
    expect(face).toContain("Fine+");
    expect(face).toContain("2 Crowns");
    expect(orderCard(html, "O42")).toContain('class="ord ord--crown"');
    const plain = visibleText(orderCard(html, "O10"));
    expect(plain).toContain("5 VP");
    expect(plain).toContain("any Shape · any Glaze · Plain");
    expect(plain).toContain("3 Coins");
    expect(orderCard(html, "O10")).not.toContain("ord--crown");
    // A re-valued Main Order prints its V1.6.2 value (change 24): O20 6 VP.
    expect(visibleText(orderCard(render("t-empty-main-supply", <OrderDisplay />), "O20"))).toContain("6 VP");
  });

  it("marks display slots the Commission adapter offers, keyed slot:<i>", () => {
    const id = "w-commission-market-shifu-top-3-look-2-reservations";
    const html = render(id, <OrderDisplay />, { draft: { slot: 1 } });
    expect(html).toMatch(/data-motion-key="slot:1"[^>]*>/);
    expect(html).toMatch(/data-target="chosen"[^>]*data-motion-key="slot:1"/);
    expect(html).toContain('data-act="order"');
  });
});

describe("LookedOrders", () => {
  it("shows the viewer's own private look, marked Only you can see (m2)", () => {
    const view = viewOf("m2_commission_market_look_r3_4p");
    const pending = view.own?.pendingLook ?? null;
    const look = pending !== null && "orderIds" in pending ? pending.orderIds : [];
    expect(look).toHaveLength(3);
    const html = render("m2_commission_market_look_r3_4p", <LookedOrders />);
    expect(textOf(html)).toContain("Top 3 of the Main deck");
    expect(textOf(html)).toContain("Only you can see");
    for (const orderId of look) expect(html).toContain(`data-order-id="${orderId}"`);
    expect(textOf(render("m2_commission_market_look_r3_4p", <LookedOrders />, { locale: "zh-CN" }))).toContain("仅你可见");
  });

  it("names Colour Samples for its look, and renders nothing without a look", () => {
    expect(textOf(render("m16_colour_samples", <LookedOrders />))).toContain("Colour Samples: top 3 of the Main deck");
    expect(render("m1_work_phase_r2_3p", <LookedOrders />)).toBe("");
  });
});

describe("HandRow", () => {
  it("shows the viewer's hand with its limit, and warns when Cleanup will trim (m2 after its reservation)", () => {
    const id = "d-commission-after-face-up-reservation";
    const html = render(id, <HandRow />);
    const hand = viewOf(id).own?.orderHand ?? [];
    expect(hand).toHaveLength(5);
    for (const orderId of hand) expect(html).toContain(`data-order-id="${orderId}"`);
    expect(textOf(html)).toContain(`${hand.length}/4 held`);
    expect(textOf(html)).toContain("Over the limit: trimmed at Cleanup");
  });

  it("carries no Only you can see pill beside Your hand (owner review, 2026-10-17)", () => {
    for (const id of ["m1_work_phase_r2_3p", "m2_commission_market_look_r3_4p", "m6_order_phase_crackle_3p", "m7_cleanup_hand_limit_3p", "t-round5-over-limit"]) {
      const html = render(id, <HandRow />);
      expect(textOf(html), id).toContain("Your hand");
      expect(textOf(html), id).not.toContain("Only you can see");
      expect(html, id).not.toContain("kit-chip--private");
      expect(textOf(render(id, <HandRow />, { locale: "zh-CN" })), id).not.toContain("仅你可见");
    }
  });

  it("says the final round skips the trim, and drops the warning inside the trim window", () => {
    expect(textOf(render("t-round5-over-limit", <HandRow />))).toContain("No trim in the final round");
    const trim = textOf(render("m7_cleanup_hand_limit_3p", <HandRow />));
    expect(trim).not.toContain("Over the limit");
    expect(trim).not.toContain("No trim in the final round");
  });

  it("renders nothing of a hand for a spectator", () => {
    const entry = structuredClone(fixture("m1_work_phase_r2_3p"));
    const spectator = { ...entry, playerView: { ...entry.playerView, viewerId: null, own: null } };
    expect(renderComponent(new FixtureGameSource(spectator), <HandRow />)).toBe("");
  });
});

describe("Order Phase: hand states and the Finished ceramics strip (m6)", () => {
  const id = "m6_order_phase_crackle_3p";

  it("marks each held Order completable or blocked from the window's adapter", () => {
    const view = viewOf(id);
    const completable = new Set(completableOrders(view).map((option) => option.orderId));
    expect(completable.size).toBeGreaterThan(0);
    const html = render(id, <HandRow />);
    for (const orderId of view.own?.orderHand ?? []) {
      const markup = orderCard(html, orderId);
      if (completable.has(orderId)) {
        expect(markup).toContain('data-target="completable"');
        expect(visibleText(markup)).toContain("Deliver");
        expect(markup).toContain(`aria-label="Deliver: Order ${orderId}"`);
      } else {
        expect(markup).toContain('data-target="blocked"');
        expect(visibleText(markup)).toContain("No matching ceramics");
        expect(markup).not.toContain('data-act="order"');
      }
    }
  });

  it("presses the chosen Order and highlights its ceramics", () => {
    const view = viewOf(id);
    const chosen = completableOrders(view)[0]!.orderId;
    const group = orderMatchOptions(view, chosen, 1)[0]!.ceramicIds;
    const source = withModelCeramics(fixtureSource(id));
    const hand = renderComponent(source, <HandRow />, { registry: TABLE_WINDOWS, draft: { orderId: chosen } });
    expect(orderCard(hand, chosen)).toContain('data-target="chosen"');
    expect(orderCard(hand, chosen)).toMatch(/aria-pressed="true"/);
    const strip = renderComponent(source, <FinishedCeramicsStrip />, { registry: TABLE_WINDOWS, draft: { orderId: chosen } });
    expect((strip.match(/cchip--highlighted/g) ?? []).length).toBe(group.length);
    for (const ceramicId of group) expect(strip).toContain(`data-motion-key="${ceramicId}"`);
    expect(textOf(strip)).not.toMatch(/\bc\d+\b/);
  });

  it("lists the viewer's Finished ceramics in words, with the face-up reminder", () => {
    const view = viewOf(id);
    const finishedIds = Object.values(view.game.ceramics).filter((ceramic) => ceramic.ownerId === view.viewerId && ceramic.stage === "finished");
    const html = renderComponent(withModelCeramics(fixtureSource(id)), <FinishedCeramicsStrip />, { registry: TABLE_WINDOWS });
    expect((html.match(/data-motion="ceramic"/g) ?? []).length).toBe(finishedIds.length);
    expect(textOf(html)).toContain("Face-up Main Orders cannot be completed; reserve them at the Commission Market.");
    // CR B2-1 has landed: the plain fixture source describes every Finished ceramic too.
    expect((render(id, <FinishedCeramicsStrip />).match(/data-motion="ceramic"/g) ?? []).length).toBe(finishedIds.length);
    expect(textOf(renderComponent(withModelCeramics(fixtureSource(id)), <FinishedCeramicsStrip />, { locale: "zh-CN" }))).toContain("委托榜上的委托不能直接完成，要先在瓷牙行承接。");
  });

  it("is shown in the Order Phase and, with Finished ceramics, in the viewer's own Work turn (free actions, owner revision 5)", () => {
    // m1's viewer holds no Finished ceramic.
    expect(render("m1_work_phase_r2_3p", <FinishedCeramicsStrip />)).toBe("");
    // Before the worker action: the ceramics a completion delivers, and a Sell button on a Flawed one.
    const delivery = "m28_before_action_delivery";
    expect(render(delivery, <FinishedCeramicsStrip />, { registry: WINDOWS })).toContain('class="finished-strip"');
    const sale = render("t-work-turn-sale", <FinishedCeramicsStrip />, { registry: WINDOWS });
    expect(sale).toContain('data-act="sell"');
    // Another player's turn: no strip, whatever the viewer holds.
    const waiting = structuredClone(fixture(delivery));
    const phase = waiting.playerView.game.phase;
    if (phase.type !== "work_turn") throw new Error("fixture changed");
    phase.activePlayerId = waiting.playerView.game.playerOrder.find((playerId) => playerId !== waiting.viewerId)!;
    expect(renderComponent(new FixtureGameSource(waiting), <FinishedCeramicsStrip />, { registry: WINDOWS })).toBe("");
  });
});

describe("Hand trim tags (m7)", () => {
  it("tags the Orders chosen for discard", () => {
    const hand = viewOf("m7_cleanup_hand_limit_3p").own?.orderHand ?? [];
    const [first, ...rest] = hand;
    const html = render("m7_cleanup_hand_limit_3p", <HandRow />, { draft: { orderIds: [first] } });
    const chosen = orderCard(html, first!);
    expect(chosen).toContain('data-target="discard"');
    expect(chosen).toContain('class="ord ord--starting ord--own ord--discard"');
    expect(chosen).toMatch(/aria-pressed="true"[^>]*>Discard</);
    for (const orderId of rest) expect(orderCard(html, orderId)).toMatch(/aria-pressed="false"[^>]*>Choose</);
    expect(textOf(render("m7_cleanup_hand_limit_3p", <HandRow />, { draft: { orderIds: [first] }, locale: "zh-CN" }))).toContain("弃置");
  });
});

// ── Techs and Recognition ─────────────────────────────────────────────────────────────────

describe("TechDisplay", () => {
  it("shows each discipline's face-up Techs from content, with deck counts", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render("m1_work_phase_r2_3p", <TechDisplay />, { locale });
      const display = viewOf("m1_work_phase_r2_3p").game.techDisplay;
      const counts = viewOf("m1_work_phase_r2_3p").game.counts.techDecks;
      for (const discipline of ["workshop", "glazing_loading", "firing"] as const) {
        expect(textOf(html)).toContain(disciplineName(discipline, locale));
        expect(textOf(html)).toContain(locale === "en" ? `deck ${counts[discipline]}` : `牌堆${counts[discipline]}张`);
        for (const techId of display[discipline]) {
          const text = techText(techId, locale);
          expect(visibleText(html)).toContain(text.name);
          const timing = shortTextSegments(text.short)[0]!;
          expect(html).toContain(`<strong>${escapeHtml(timing.text)}</strong>`);
        }
      }
    }
    expect(textOf(render("m1_work_phase_r2_3p", <TechDisplay />))).toContain("Form & Decorate");
    // No VP for a Tech (v1.6.2 change 27): the display says where Techs are bought, nothing about scoring.
    expect(textOf(render("m1_work_phase_r2_3p", <TechDisplay />))).toContain("2 face-up per discipline · bought at the Guild Hall");
    expect(textOf(render("m1_work_phase_r2_3p", <TechDisplay />, { locale: "zh-CN" }))).toContain("每门类公开2张 · 在陶工行习得");
    for (const locale of ["en", "zh-CN"] as const) expect(textOf(render("m1_work_phase_r2_3p", <TechDisplay />, { locale }))).not.toMatch(/when gained|习得时得/);
  });
});

/** The real work draft after a table Place shortcut, as the pane's draft holds it. */
function placed(id: string, locationId: LocationId, workerKey: string): unknown {
  const view = viewOf(id);
  const model = buildGameModel(view, []);
  const engine = engineViewOf(view);
  const initial = workDraft.initial(model, engine);
  const action = WINDOWS.work.table?.act(initial as never, { type: "place", locationId, workerKey }, model, engine);
  if (action === null || action === undefined) throw new Error(`${id}: cannot place ${workerKey} at ${locationId}`);
  return workDraft.reduce(initial, action as never, model, engine);
}

describe("TechDisplay: the Guild Hall chooser (owner review, 2026-10-17)", () => {
  const real = (id: string, draft: unknown, locale: "en" | "zh-CN" = "en") => renderComponent(fixtureSource(id), <TechDisplay />, { registry: WINDOWS, draft, locale });

  it("is an ordinary display until a worker is placed at the Guild Hall", () => {
    const html = renderComponent(fixtureSource("m5_two_player_board_2p"), <TechDisplay />, { registry: WINDOWS });
    expect(html).not.toContain("data-tech-chooser");
    expect(html).not.toMatch(/data-act="(tech|inspect)"/);
    // Every tile opens its rules details (D10).
    expect((html.match(/kit-detail-trigger/g) ?? []).length).toBe(Object.values(viewOf("m5_two_player_board_2p").game.techDisplay).flat().length);
    expect(real("m5_two_player_board_2p", placed("m5_two_player_board_2p", "canal_wharf", "apprentice"))).not.toContain("data-tech-chooser");
  });

  it("buy (Apprentice): every face-up Tech is a toggle at its printed cost; one it cannot buy is greyed out with the engine's reason", () => {
    const id = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
    const html = real(id, placed(id, "guild_hall", "apprentice"));
    expect(html).toMatch(/<p id="[^"]+" class="techs-choose" tabindex="-1" data-tech-chooser="">Apprentice at the Guild Hall: choose a face-up Tech to buy<\/p>/);
    expect(html).toMatch(/<div class="techs" role="group" aria-labelledby="[^"]+">/);
    for (const option of guildOptions(viewOf(id), "apprentice").faceUp) {
      const button = new RegExp(`<button type="button" class="tech-pick" data-act="tech" data-tech-id="${option.techId}" aria-pressed="false"${option.legal ? "" : ' aria-disabled="true"'} aria-labelledby="[^"]+" aria-describedby="[^"]+"`);
      expect(html, option.techId).toMatch(button);
      const tile = html.slice(html.lastIndexOf("<div", html.indexOf(`data-act="tech" data-tech-id="${option.techId}"`)));
      // The printed cost alone (no Shifu discount, owner revision 2026-10-17).
      expect(/class="tech-cost">([^<]*)</.exec(tile)?.[1], option.techId).toBe(`${String(option.cost)} ${option.cost === 1 ? "Coin" : "Coins"}`);
      if (!option.legal) {
        expect(tile.slice(0, 80)).toContain("tech--unavailable");
        expect(visibleText(tile.slice(0, tile.indexOf("</li>")))).toMatch(/You already own|Not enough|at most/);
      }
    }
    // The chooser tiles open no rules details.
    expect(html).not.toContain("kit-detail-trigger");
    expect(textOf(real(id, placed(id, "guild_hall", "apprentice"), "zh-CN"))).toContain("派学徒到陶工行：选择要习得的公开技艺");
  });

  it("a taken Tech's position stays empty until the taker's turn ends (v1.6.2 L209), shown as an empty tile, with no count", () => {
    // Lin took Colour Samples (Glazing & Loading) this turn and is in the after-action window.
    const id = "t-colour-samples-select-face-up";
    const view = viewOf(id);
    expect(view.game.techDisplay.glazing_loading).toHaveLength(1);
    const html = renderComponent(fixtureSource(id), <TechDisplay />, { registry: WINDOWS });
    const column = html.slice(html.indexOf('data-discipline="glazing_loading"'), html.indexOf('data-discipline="firing"'));
    expect((column.match(/data-empty-position=""/g) ?? []).length).toBe(1);
    expect(textOf(column)).toContain("Empty until this turn ends");
    expect(textOf(renderComponent(fixtureSource(id), <TechDisplay />, { registry: WINDOWS, locale: "zh-CN" }))).toContain("空着，本回合结束时补上");
    // Full columns, and a column whose deck ran out, show no empty position.
    expect((html.match(/data-empty-position=""/g) ?? []).length).toBe(1);
    const rich = renderComponent(fixtureSource("w-before-the-worker-action-rich-4-player-start"), <TechDisplay />, { registry: WINDOWS });
    expect(rich).not.toContain("data-empty-position");
  });

  it("inspect (Shifu): each discipline offers its deck; the Techs keep their rules details", () => {
    const id = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
    const html = real(id, placed(id, "guild_hall", "shifu"));
    expect(textOf(html)).toContain("Shifu at the Guild Hall: choose a discipline and inspect the top of its deck");
    const inspect = [...html.matchAll(/<button type="button" class="disc-inspect" data-act="inspect" data-discipline="([a-z_]+)" aria-pressed="false" aria-label="([^"]+)">([^<]+)<\/button>/g)];
    expect(inspect.map((match) => match[1])).toEqual(["workshop", "glazing_loading", "firing"]);
    expect(inspect.map((match) => decodeEntities(match[2]!))).toEqual(["workshop", "glazing_loading", "firing"].map((discipline) => `Inspect the deck: ${disciplineName(discipline as never, "en")} (only you see the cards)`));
    expect(inspect.every((match) => match[3] === "Inspect the deck")).toBe(true);
    expect(html).not.toContain('data-act="tech"');
    expect(html).toContain("kit-detail-trigger");
    expect(textOf(real(id, placed(id, "guild_hall", "shifu"), "zh-CN"))).toContain("查看牌堆顶");
  });
});

/** `&amp;` and friends back to text. */
function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

describe("TechDisplay: Guild Hall Shifu inspection", () => {
  /** The table as a seat that is not the looker sees it: no inspection window, so no chooser. */
  const { table: _chooser, ...inspection } = TABLE_WINDOWS.guild_inspection;
  const ONLOOKER_WINDOWS: typeof TABLE_WINDOWS = { ...TABLE_WINDOWS, guild_inspection: inspection };

  /** m12 as someone else at the table sees it (a spectator view: no hand, no look of their own). */
  const onlooker = (entry: ReturnType<typeof fixture>) => new FixtureGameSource({ ...entry, playerView: { ...entry.playerView, viewerId: null, own: null } });

  it("says who is looking at how many Techs, never which (m12)", () => {
    const id = "m12_guild_shifu_inspection";
    const look = viewOf(id).game.counts.pendingLook!;
    expect(look.kind).toBe("guild_inspection");
    const en = renderComponent(onlooker(fixture(id)), <TechDisplay />, { registry: ONLOOKER_WINDOWS });
    expect(en).toContain(`class="techs-looking" data-player-id="${look.playerId}"`);
    expect(textOf(en)).toMatch(new RegExp(`is looking at ${look.count} Techs?`));
    expect(textOf(en)).not.toMatch(/looking at \d+ Orders?/);
    for (const secret of secretIds(id)) expect(en).not.toMatch(new RegExp(`\\b${secret}\\b`));
    expect(textOf(renderComponent(onlooker(fixture(id)), <TechDisplay />, { locale: "zh-CN", registry: ONLOOKER_WINDOWS }))).toContain(`正在查看${look.count}张技艺`);
    // The looker's own display never names them as "looking", chooser or not (the pane addresses them).
    expect(render(id, <TechDisplay />, { registry: ONLOOKER_WINDOWS })).not.toContain("techs-looking");
  });

  it("a taken Tech's position shows as refilling while the inspection holds that deck's last cards (v1.6.2 L209, B2)", () => {
    // w-guild-hall-shifu-inspection inspects Firing; here its deck held only the 2 inspected
    // Techs, and the Shifu then took a face-up Firing Tech. The 2 untaken go back under the deck
    // before the refill, so the taken position refills at the end of the turn.
    const entry = structuredClone(fixture("w-guild-hall-shifu-inspection"));
    const game = entry.playerView.game;
    const phase = game.phase;
    if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection" || phase.step.discipline !== "firing") throw new Error("fixture changed");
    const taken = game.techDisplay.firing[0]!;
    game.techDisplay.firing = game.techDisplay.firing.slice(1);
    game.counts.techDecks.firing = 0;
    phase.step = { ...phase.step, takes: [{ kind: "face_up", techId: taken }] };
    const viewer = game.players[entry.viewerId]!;
    viewer.techs = [...viewer.techs, { id: taken, acquiredInRound: game.round, usedThisRound: false }];
    const firing = (html: string) => html.slice(html.indexOf('data-discipline="firing"'));
    for (const html of [
      renderComponent(new FixtureGameSource(entry), <TechDisplay />, { registry: WINDOWS }),
      renderComponent(onlooker(entry), <TechDisplay />, { registry: ONLOOKER_WINDOWS }),
    ]) {
      expect(firing(html)).toContain("deck 0");
      expect((firing(html).match(/data-empty-position=""/g) ?? []).length).toBe(1);
      expect(textOf(firing(html))).toContain("Empty until this turn ends");
    }
    // Without an open inspection, a position whose deck ran out never refills: no placeholder.
    const done = structuredClone(entry);
    const donePhase = done.playerView.game.phase;
    if (donePhase.type !== "work_turn") throw new Error("fixture changed");
    donePhase.step = { kind: "after_action" };
    if (done.playerView.own !== null) done.playerView.own.pendingLook = null;
    done.playerView.game.counts.pendingLook = null;
    expect(firing(renderComponent(new FixtureGameSource(done), <TechDisplay />, { registry: WINDOWS }))).not.toContain("data-empty-position");
  });

  it("the looker's own display is the take chooser: its prompt, every face-up Tech at its printed cost, no inspected Tech and no \"is looking\" line (D14, v1.6.2 L207)", () => {
    const id = "m12_guild_shifu_inspection";
    const view = viewOf(id);
    const options = guildInspectionOptions(view)!;
    const html = render(id, <TechDisplay />);
    expect(html).toContain('data-chooser="take"');
    expect(html).not.toContain("techs-looking");
    expect(html).toMatch(/<p id="[^"]+" class="techs-choose" tabindex="-1" data-tech-chooser="">Shifu at the Guild Hall: take a face-up Tech here, or one of the Techs you inspected<\/p>/);
    const buttons = [...html.matchAll(/data-act="tech" data-tech-id="(T\d+)"/g)].map((match) => match[1]);
    expect(buttons).toEqual(options.faceUp.map((option) => option.techId));
    // The inspected Techs are private and stay in the pane (B2): never on the display.
    for (const option of options.inspected) expect(html).not.toContain(`data-tech-id="${option.techId}"`);
    for (const secret of secretIds(id)) expect(html).not.toMatch(new RegExp(`\\b${secret}\\b`));
    for (const option of options.faceUp) {
      const tile = html.slice(html.lastIndexOf("<div", html.indexOf(`data-act="tech" data-tech-id="${option.techId}"`)));
      expect(/class="tech-cost">([^<]*)</.exec(tile)?.[1], option.techId).toBe(`${String(option.cost)} ${option.cost === 1 ? "Coin" : "Coins"}`);
      expect(tile.slice(0, 80).includes("tech--unavailable"), option.techId).toBe(!option.legal);
    }
    expect(textOf(render(id, <TechDisplay />, { locale: "zh-CN" }))).toContain("师傅在陶工行：在这里习得一张公开技艺，或习得你所看的技艺");
  });

  it("after the first take: the second-take prompt, the taken discipline greyed out with its reason, the taken position empty (v1.6.2 L207, L209)", () => {
    const id = "d-guild-hall-after-a-take";
    const options = guildInspectionOptions(fixture(id).playerView)!;
    expect(options.takes).toHaveLength(1);
    const html = render(id, <TechDisplay />);
    expect(textOf(html)).toContain("Shifu at the Guild Hall: take a second Tech from another discipline, or stop");
    const column = html.slice(html.indexOf('data-discipline="glazing_loading"'), html.indexOf('data-discipline="firing"'));
    expect((column.match(/data-empty-position=""/g) ?? []).length).toBe(1);
    for (const option of options.faceUp.filter((candidate) => candidate.discipline === "glazing_loading")) {
      const tile = html.slice(html.lastIndexOf("<div", html.indexOf(`data-act="tech" data-tech-id="${option.techId}"`)));
      expect(tile.slice(0, 80)).toContain("tech--unavailable");
      expect(visibleText(tile.slice(0, tile.indexOf("</li>")))).toContain("You already own a Glazing & Loading Tech.");
    }
    expect(textOf(render(id, <TechDisplay />, { locale: "zh-CN" }))).toContain("师傅在陶工行：再习得一项其他门类的技艺，或不再习得");
  });

  it("shows no inspection line for a look at Orders (m2) or without a look (m1)", () => {
    expect(render("m2_commission_market_look_r3_4p", <TechDisplay />)).not.toContain("techs-looking");
    expect(render("m1_work_phase_r2_3p", <TechDisplay />)).not.toContain("techs-looking");
  });
});

describe("RecognitionTrack", () => {
  it("shows every milestone with its reward and each player's marker", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render("m5_two_player_board_2p", <RecognitionTrack />, { locale });
      for (const milestone of recognitionMilestones(locale)) {
        expect(visibleText(html)).toContain(milestone.title);
        if (milestone.reward !== null) expect(visibleText(html)).toContain(milestone.reward);
      }
    }
    const html = render("m5_two_player_board_2p", <RecognitionTrack />);
    // Zhao is on 0, Lin on 2 (m5).
    expect(html).toMatch(/data-recognition="0"[\s\S]*?Here: Zhao[\s\S]*?data-recognition="1"/);
    expect(html).toMatch(/data-recognition="2"[\s\S]*?Here: Lin/);
    expect(IMPERIAL_TRACK.track).toHaveLength(5);
  });

  it("keeps the rewards at every width (no display: none in its stylesheet)", () => {
    const css = readFileSync(join(ROOT, "src/app/table/RecognitionTrack.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/display\s*:\s*none/);
    expect(css).toMatch(/overflow-x\s*:\s*auto/);
  });
});

// ── Words, not IDs ────────────────────────────────────────────────────────────────────────

describe("no internal IDs and no lock wording in table text", () => {
  it.each(["m1_work_phase_r2_3p", "m2_commission_market_look_r3_4p", "m6_order_phase_crackle_3p", "m9_contributions_step1_3p"])("%s", (id) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render(id, (
        <>
          <KilnMini />
          <CentralBoard />
          <LookedOrders />
          <OrderDisplay />
          <HandRow />
          <FinishedCeramicsStrip />
          <RecognitionTrack />
          <TechDisplay />
        </>
      ), { locale });
      const text = textOf(html) + [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]).join(" ");
      expect(text).not.toMatch(/\bc\d+\b/);
      expect(text).not.toMatch(/\b[pP]\d+:(?:shifu|apprentice)/);
      if (locale === "en") expect(text).not.toMatch(/\b(un)?lock/i);
      else expect(text).not.toMatch(/锁/);
      for (const secret of secretIds(id)) expect(html).not.toMatch(new RegExp(`\\b${secret}\\b`));
    }
  });
});

