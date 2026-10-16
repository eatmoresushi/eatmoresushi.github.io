/**
 * Table components (B2; UI_V1.6.1_ARCHITECTURE §9.2 `table/`): central board and location cards,
 * the Shared Kiln strip, the Main Order display, the viewer's private look and hand, the public
 * hands, the Finished ceramics strip, the Tech display and the Recognition track.
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
  orderMatchOptions,
  placementOptions,
  shortTextSegments,
} from "../../../../src/game/index.ts";
import type { CentralLocationId } from "../../../../src/game/index.ts";
import { disciplineName, locationName, recognitionMilestones, techText } from "../../../../src/app/i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../../../src/app/i18n/errors.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { gameModelOf } from "../../../../src/app/state/model.ts";
import { CentralBoard } from "../../../../src/app/table/CentralBoard.tsx";
import { FinishedCeramicsStrip } from "../../../../src/app/table/FinishedCeramicsStrip.tsx";
import { HandRow } from "../../../../src/app/table/HandRow.tsx";
import { KilnMini } from "../../../../src/app/table/KilnMini.tsx";
import { LookedOrders } from "../../../../src/app/table/LookedOrders.tsx";
import { OrderDisplay } from "../../../../src/app/table/OrderDisplay.tsx";
import { PublicHands } from "../../../../src/app/table/PublicHands.tsx";
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
    // Zhao's Apprentice stands there, named in words (D9).
    expect(magistrate).toContain('aria-label="Zhao’s Apprentice"');
    // The Canal Wharf has no limit.
    expect(visibleText(card(html, "canal_wharf"))).toContain("No limit");
    expect(view.game.playerCount).toBe(2);
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
    const plain = render("m1_work_phase_r2_3p", <CentralBoard />);
    const yard = card(plain, "materials_yard");
    expect(yard).toContain('data-act="place"');
    expect(yard).toContain('aria-label="Place Shifu at Materials Yard"');
    expect(yard).toContain('aria-label="Place Apprentice at Materials Yard"');
    expect(yard).not.toContain('aria-pressed="true"');
    const seeded = render("m1_work_phase_r2_3p", <CentralBoard />, { draft: { locationId: "materials_yard", workerKey: "shifu" } });
    const chosen = card(seeded, "materials_yard");
    expect(chosen).toContain('class="loc loc--chosen"');
    expect(chosen).toMatch(/aria-pressed="true"[^>]*aria-label="Place Shifu at Materials Yard"/);
    expect(chosen).toMatch(/aria-pressed="false"[^>]*aria-label="Place Apprentice at Materials Yard"/);
    // Without a table adapter the table is inert: no shortcuts.
    expect(render("m1_work_phase_r2_3p", <CentralBoard />, { registry: INERT_WINDOWS })).not.toContain('data-act="place"');
  });

  it("renders Place shortcuts as compact worker pieces, the full sentence only in the accessible name (wireframe `.pbtn`)", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const yard = card(render("m1_work_phase_r2_3p", <CentralBoard />, { locale }), "materials_yard");
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
    const id = "m1_work_phase_r2_3p";
    const view = viewOf(id);
    const html = render(id, <CentralBoard />);
    const model = gameModelOf(view, []);
    const options = errorTextOptions(tableCeramics(model).labelView, EN);
    let checked = 0;
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
    expect(checked).toBeGreaterThan(0);
    // The Magistrate's Hall names the Coins it needs (the error's details).
    expect(visibleText(card(html, "magistrates_hall"))).toMatch(/Not enough Coins: you need \d and have \d/);
  });
});

// ── Shared Kiln strip ─────────────────────────────────────────────────────────────────────

describe("KilnMini", () => {
  it("summarises the 2-player cover (2-1-1), the Kiln Die and the open Fire discard (m5)", () => {
    const html = render("m5_two_player_board_2p", <KilnMini />);
    const view = viewOf("m5_two_player_board_2p");
    const text = textOf(html);
    expect(text).toContain("4 active (2-1-1) · 4 covered ·");
    expect(text).toContain(`Kiln Die: ${view.game.kilnDie?.value ?? ""}`);
    expect(text).toContain("Fire discard (open)");
    for (const value of view.game.fireDiscard) expect(html).toContain(`data-fire="${value}"`);
    expect(html).not.toMatch(/cards? (left|remaining)|left in the deck/i);
    expect(html).toContain("Open Kiln");
  });

  it("draws the glyph Low at the top (2 spaces), then Middle, then High (D8)", () => {
    const html = render("m1_work_phase_r2_3p", <KilnMini />);
    const rows = [...html.matchAll(/kglyph-row--(low|middle|high)/g)].map((match) => match[1]);
    expect(rows).toEqual(["low", "middle", "high"]);
    const low = /kglyph-row--low">(.*?)<\/span>/.exec(html)?.[1] ?? "";
    expect(low.match(/<i /g)).toHaveLength(2);
    expect(textOf(render("m1_work_phase_r2_3p", <KilnMini />, { locale: "zh-CN" }))).toContain("启用6格（2-2-2）· 停用2格");
  });

  it("gives way to the firing stage during the Firing Phase (D3)", () => {
    expect(render("m3_heat_marker_step_3p", <KilnMini />)).toBe("");
  });
});

// ── Orders ────────────────────────────────────────────────────────────────────────────────

describe("OrderDisplay", () => {
  it("leaves a reserved position empty until the reserver's turn ends (m2)", () => {
    const en = render("m2_commission_market_look_r3_4p", <OrderDisplay />);
    expect(en).toContain("Empty. Refills when <strong>Zhao</strong>’s turn ends.");
    const zh = render("m2_commission_market_look_r3_4p", <OrderDisplay />, { locale: "zh-CN" });
    expect(zh).toContain("空位：<strong>Zhao</strong>的回合结束时补榜。");
    const counts = viewOf("m2_commission_market_look_r3_4p").game.counts;
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
    const html = render("m1_work_phase_r2_3p", <OrderDisplay />);
    const face = visibleText(orderCard(html, "O21"));
    expect(face).toContain("O21");
    expect(face).toContain("Crown");
    expect(face).toContain("9 VP");
    expect(face).toContain("Plate · White · Plain");
    expect(face).toContain("Masterpiece");
    expect(face).toContain("1 Coin");
    expect(face).toContain("1 Crown");
    expect(orderCard(html, "O21")).toContain('class="ord ord--crown"');
  });

  it("marks display slots the Commission adapter offers, keyed slot:<i>", () => {
    const id = "w-commission-market-second-reservation-or-stop";
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

describe("HandRow and PublicHands", () => {
  it("shows the viewer's hand with its limit, privately, and warns when Cleanup will trim (m2)", () => {
    const html = render("m2_commission_market_look_r3_4p", <HandRow />);
    const hand = viewOf("m2_commission_market_look_r3_4p").own?.orderHand ?? [];
    for (const orderId of hand) expect(html).toContain(`data-order-id="${orderId}"`);
    expect(textOf(html)).toContain("Only you can see");
    expect(textOf(html)).toContain(`${hand.length}/4 held`);
    expect(textOf(html)).toContain("Over the limit: trimmed at Cleanup");
  });

  it("says the final round skips the trim, and drops the warning inside the trim window", () => {
    expect(textOf(render("t-round5-over-limit", <HandRow />))).toContain("No trim in the final round");
    const trim = textOf(render("m7_cleanup_hand_limit_3p", <HandRow />));
    expect(trim).not.toContain("Over the limit");
    expect(trim).not.toContain("No trim in the final round");
  });

  it("shows others' hands as counts only, with who is looking (m2)", () => {
    const id = "m2_commission_market_look_r3_4p";
    const html = render(id, <PublicHands />);
    const game = viewOf(id).game;
    for (const playerId of game.playerOrder) {
      expect(html).toContain(`data-player-id="${playerId}"`);
      expect(textOf(html)).toContain(`${game.counts.orderHands[playerId] ?? 0}/`);
    }
    expect(textOf(html)).toContain("Zhao is looking at 3 Orders");
    expect(html).not.toMatch(/data-order-id/);
    for (const secret of secretIds(id)) expect(html).not.toMatch(new RegExp(`\\b${secret}\\b`));
    expect(textOf(render(id, <PublicHands />, { locale: "zh-CN" }))).toContain("Zhao正在查看3张委托");
  });

  it("does not call a Guild Hall Shifu inspection a look at Orders (m12; TechDisplay announces it)", () => {
    const id = "m12_guild_shifu_inspection";
    const look = viewOf(id).game.counts.pendingLook;
    expect(look?.kind).toBe("guild_inspection");
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render(id, <PublicHands />, { locale });
      expect(html).not.toContain("hands-looking");
      expect(textOf(html)).not.toMatch(locale === "en" ? /looking at/ : /正在查看/);
    }
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
        expect(visibleText(markup)).toContain("Can complete");
        expect(markup).toContain(`aria-label="Can complete: Order ${orderId}"`);
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
    expect(textOf(renderComponent(withModelCeramics(fixtureSource(id)), <FinishedCeramicsStrip />, { locale: "zh-CN" }))).toContain("委托榜上的委托不能直接完成，须先在瓷牙行承接。");
  });

  it("is shown only in the Order Phase", () => {
    expect(render("m1_work_phase_r2_3p", <FinishedCeramicsStrip />)).toBe("");
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
    expect(textOf(render("m1_work_phase_r2_3p", <TechDisplay />))).toContain("+1 VP when gained");
  });
});

describe("TechDisplay: Guild Hall Shifu inspection", () => {
  it("says who is looking at how many Techs, never which (m12)", () => {
    const id = "m12_guild_shifu_inspection";
    const look = viewOf(id).game.counts.pendingLook!;
    expect(look.kind).toBe("guild_inspection");
    const en = render(id, <TechDisplay />);
    expect(en).toContain(`class="techs-looking" data-player-id="${look.playerId}"`);
    expect(textOf(en)).toMatch(new RegExp(`is looking at ${look.count} Techs?`));
    expect(textOf(en)).not.toMatch(/looking at \d+ Orders?/);
    for (const secret of secretIds(id)) expect(en).not.toMatch(new RegExp(`\\b${secret}\\b`));
    expect(textOf(render(id, <TechDisplay />, { locale: "zh-CN" }))).toContain(`正在查看${look.count}张技艺`);
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
    // Lin is on 0, Zhao on 2 (m5).
    expect(html).toMatch(/data-recognition="0"[\s\S]*?Here: Lin[\s\S]*?data-recognition="1"/);
    expect(html).toMatch(/data-recognition="2"[\s\S]*?Here: Zhao/);
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
          <PublicHands />
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

