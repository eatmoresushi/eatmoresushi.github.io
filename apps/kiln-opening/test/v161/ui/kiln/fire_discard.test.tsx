/**
 * The open Fire discard (B3; UI_V1.6.1_ARCHITECTURE §1.3 port of `test/v127/fire_card_history`,
 * §9.2; owner decision D4): players can see which Fire cards have been discarded, at any time,
 * and that is all the Fire-deck information on screen.
 * - every discard list on the full game screen shows `game.fireDiscard`, oldest first, in both
 *   languages, during a firing (the heat equation) and between firings (the Kiln section);
 * - after a reshuffle the discard is empty and says so;
 * - no Fire-deck size anywhere: not as text, not as an attribute, in no wording (§9.2's list).
 */
import { describe, expect, it } from "vitest";
import type { FireModifier } from "../../../../src/game/index.ts";
import { FireDiscard } from "../../../../src/app/firing/FireDiscard.tsx";
import { FiringStage } from "../../../../src/app/firing/FiringStage.tsx";
import { IdleFiringRecap } from "../../../../src/app/kiln/IdleFiringRecap.tsx";
import { KilnBlock } from "../../../../src/app/kiln/KilnBlock.tsx";
import { ResultsSection } from "../../../../src/app/results/ResultsSection.tsx";
import { allFixtures, fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderScreen } from "../support/render.tsx";
import { elementAt, perceivable, withoutRulesPanels } from "./support.ts";

/**
 * B3's part of the game screen for a fixture: the firing stage during a firing, else the idle
 * recap and the kiln; the results once finished. (The full screen, with every package's
 * sections, is B6's `rendered_text`; this keeps B3's checks independent of the decision forms.)
 */
function b3Sections(id: string, locale: "en" | "zh-CN" = "en"): string {
  const firing = fixture(id).playerView.game.phase.type.startsWith("firing_");
  return renderComponent(
    fixtureSource(id),
    <>
      {firing ? <FiringStage /> : <><IdleFiringRecap /><KilnBlock /></>}
      <ResultsSection />
    </>,
    { locale },
  );
}

const signed = (value: number): string => (value > 0 ? `+${String(value)}` : value < 0 ? `−${String(-value)}` : "0");

/** The values of every B3 discard list in the markup, in document order. */
function discardLists(html: string): FireModifier[][] {
  const lists: FireModifier[][] = [];
  for (let at = html.indexOf('<ol class="fdiscard-list"'); at >= 0; at = html.indexOf('<ol class="fdiscard-list"', at + 1)) {
    const list = elementAt(html.slice(at), /<ol class="fdiscard-list"/);
    lists.push([...list.matchAll(/data-fire="(-?\d)"/g)].map((match) => Number(match[1]) as FireModifier));
  }
  return lists;
}

describe("the open Fire discard (D4)", () => {
  it("lists the discarded Fire cards oldest first, with words for each card", () => {
    const discard: FireModifier[] = [-2, 0, 1, -1];
    for (const locale of ["en", "zh-CN"] as const) {
      const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <FireDiscard discard={discard} />, { locale });
      expect(discardLists(html)).toEqual([discard]);
      const text = perceivable(html);
      let at = -1;
      for (const value of discard) {
        const words = locale === "en" ? `Fire card ${signed(value)}` : signed(value);
        const next = text.indexOf(words, at + 1);
        expect(next, words).toBeGreaterThan(at);
        at = next;
      }
      expect(html).toContain(locale === "en" ? 'aria-label="Fire discard, oldest first"' : 'aria-label="窑火弃牌堆，最早在前"');
      expect(text).toContain(locale === "en" ? "Fire discard (open)" : "窑火弃牌堆（公开）");
    }
  });

  it("reads 'none yet' when the discard is empty (before the first Fire card, after a reshuffle)", () => {
    const empty = renderComponent(fixtureSource("t-fire-deck-reshuffle"), <FireDiscard discard={[]} />);
    expect(perceivable(empty)).toMatch(/Fire discard \(open\)\s+none yet/);
    expect(empty).not.toContain("fdiscard-list");
    expect(perceivable(renderComponent(fixtureSource("t-fire-deck-reshuffle"), <FireDiscard discard={[]} />, { locale: "zh-CN" }))).toContain("暂无");
    expect(fixture("t-fire-deck-reshuffle").playerView.game.fireDiscard).toEqual([]);
    expect(perceivable(renderScreen(fixtureSource("t-fire-deck-reshuffle")))).toMatch(/Fire discard \(open\)\s+none yet/);
  });

  it.each(["m1_work_phase_r2_3p", "m2_commission_market_look_r3_4p", "m3_heat_marker_step_3p", "m4_after_quality_3p", "m7_cleanup_hand_limit_3p", "m14_salvage"])(
    "%s: every discard list on the game screen is the public discard, in both languages",
    (id) => {
      const discard = fixture(id).playerView.game.fireDiscard;
      expect(discard.length).toBeGreaterThan(0);
      for (const locale of ["en", "zh-CN"] as const) {
        const lists = discardLists(b3Sections(id, locale));
        expect(lists.length).toBeGreaterThan(0);
        for (const list of lists) expect(list).toEqual(discard);
      }
    },
  );

  it("is shown during a firing (the heat equation) and between firings (the Kiln section)", () => {
    const firing = renderScreen(fixtureSource("m3_heat_marker_step_3p"));
    expect(elementAt(firing, /<section id="sec-firing"/)).toContain('class="fdiscard-list"');
    const idle = renderScreen(fixtureSource("m7_cleanup_hand_limit_3p"));
    expect(elementAt(idle, /<section id="sec-kiln"/)).toContain('class="fdiscard-list"');
  });

  it("never shows the Fire-deck size, in any fixture or language", () => {
    for (const entry of allFixtures()) {
      const deck = entry.playerView.game.counts.fireDeck;
      for (const locale of ["en", "zh-CN"] as const) {
        const html = b3Sections(entry.id, locale);
        // Rulebook text in a rules-details panel ("reveal 1 Fire card", "the Fire deck") is not a count.
        const text = perceivable(withoutRulesPanels(html));
        // §9.2's wording list.
        expect(text, entry.id).not.toMatch(/cards left|cards remaining|left in the deck|余张|剩余火牌|牌堆剩余/i);
        // A count of cards ("11 Fire cards"), not a turned card's value ("−2 Fire card −2").
        expect(text, entry.id).not.toMatch(new RegExp(`(?<![−+])\\b${String(deck)}\\s*(Fire cards|张窑火牌)`));
        expect(html, entry.id).not.toMatch(/data-[\w-]*deck[\w-]*="/i);
      }
    }
  });
});
