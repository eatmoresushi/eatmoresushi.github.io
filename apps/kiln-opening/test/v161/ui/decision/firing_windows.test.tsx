/**
 * SSR of B5's windows from every scenario and moment, in English and Chinese
 * (UI_V1.6.1_ARCHITECTURE §9.2, §10.3 B5). Owner: B5.
 *
 * - Every firing, Order, Cleanup, final and waiting window renders its real component (no
 *   phase A placeholder), with its title and its alternative button.
 * - Owner decisions D3/D4: no odds, previews, ladders or Fire-deck counts in any of them.
 * - D10: Tech, Kiln and Order names open rules details with the card text, the full rule and
 *   the clarifications with their source labels.
 * - Seeded drafts show their table targets through `useTableSelection` (§3.5).
 */
import { describe, expect, it } from "vitest";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { useTableSelection } from "../../../../src/app/state/hooks.ts";
import { allFixtures, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderWindow } from "../support/render.tsx";

const B5_KINDS: ReadonlySet<DecisionWindowKind> = new Set<DecisionWindowKind>([
  "contributions",
  "test_pieces",
  "heat_markers",
  "jun",
  "after_quality",
  "salvage",
  "orders",
  "hand_limit",
  "final",
  "waiting",
]);

const B5_STUBS = ["Contributions", "TestPieces", "HeatMarkers", "Jun", "AfterQuality", "Salvage", "OrderTurn", "OrderCompletionPicker", "CrackleDeclarations", "HandTrim", "FinalSummary", "Waiting"];

/** What a player perceives: text nodes plus `aria-label`, `title` and `alt` values. */
function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, " "), ...attributes].join(" ").replace(/\s+/g, " ");
}

/** D3/D4 vocabulary (§9.2): "ledger" is allowed only as the Fuel Ledger name. */
const BANNED_EN = /\b(odds|chance|probability|ladder|preview|expected)\b|cards left|cards remaining|left in the deck/i;
const BANNED_ZH = /概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/;

const entries = allFixtures().filter((entry) => B5_KINDS.has(decisionWindow(entry.playerView).kind));

describe("B5 windows render from every fixture", () => {
  it("covers every B5 window kind", () => {
    const kinds = new Set(entries.map((entry) => decisionWindow(entry.playerView).kind));
    expect([...kinds].sort()).toEqual([...B5_KINDS].sort());
  });

  it.each(entries.map((entry) => [entry.id] as const))("%s", (id) => {
    const window = decisionWindow(allFixtures().find((entry) => entry.id === id)!.playerView);
    for (const locale of ["en", "zh-CN"] as const) {
      const html = renderWindow(fixtureSource(id), { locale });
      expect(html).toContain(`data-window="${window.kind}"`);
      for (const stub of B5_STUBS) expect(html, stub).not.toContain(`data-placeholder="${stub}"`);
      const seen = perceivable(html);
      expect(seen).not.toMatch(locale === "en" ? BANNED_EN : BANNED_ZH);
      expect(seen.replace(/Fuel Ledger/g, "")).not.toMatch(/\bledger\b/i);
      expect(seen, "ceramic ID").not.toMatch(/\bc\d+\b/);
    }
  });
});

const en = (id: string, draft?: unknown) => renderWindow(fixtureSource(id), { locale: "en", ...(draft === undefined ? {} : { draft }) });
const zh = (id: string) => renderWindow(fixtureSource(id), { locale: "zh-CN" });
/** Every `<input>` as its attributes. */
function inputs(html: string): Record<string, string>[] {
  return [...html.matchAll(/<input\b([^>]*)\/?>/g)].map((match) => Object.fromEntries([...(match[1] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1]!, attr[2]!])));
}
const heading = (html: string) => /<h2 [^>]*class="pane-heading"[^>]*>(.*?)<\/h2>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? "";
const alt = (html: string) => /data-action="alt"[^>]*>(.*?)<\/button>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? null;

describe("titles, alternatives and window content", () => {
  it("Contributions: who has chosen, never what; the Fuel Ledger toggle", () => {
    const html = en("m9_contributions_step1_3p");
    expect(heading(html)).toBe("Choose your Contribution");
    expect(heading(zh("m9_contributions_step1_3p"))).toBe("暗选控火");
    expect(perceivable(html)).toMatch(/Lin: chosen .*Zhao \(you\): choosing… .*Wen: choosing…/);
    expect(inputs(html).some((input) => input["name"] === "fuelLedger")).toBe(true);
    expect(alt(html)).toBeNull();
  });

  it("Test Pieces: the private peek, marked only you", () => {
    const decide = en("m11a_test_pieces_decision");
    expect(heading(decide)).toBe("Use Test Pieces?");
    const bury = en("w-test-pieces-bury");
    expect(heading(bury)).toBe("Test Pieces: the card you saw");
    expect(perceivable(bury)).toContain("The card you saw Only you can see");
    expect(bury).toContain('data-fire="0"');
  });

  it("Heat markers: the marked ceramic in words with its place, and the three choices", () => {
    const html = en("m3_heat_marker_step_3p");
    expect(heading(html)).toBe("Decide your Heat marker");
    expect(perceivable(html)).toContain("Grey-Green Censer, Impressed (in the Imperial Kiln), Heat marker, face down");
    expect(inputs(html).filter((input) => input["name"] === "ownMarker").map((input) => input["value"])).toEqual(["1", "-1", "return"]);
    expect(perceivable(html)).toContain("Adds +1 to this ceramic’s Actual Heat.");
  });

  it("Jun: decline is the alternative; R7 shows the extra Fire card beside its ceramic", () => {
    const first = en("m13_jun_heat_adjustment");
    expect(heading(first)).toBe("Jun Kiln · Kiln Transformation");
    expect(alt(first)).toBe("Decline");
    const second = en("m18_jun_second_firing");
    expect(perceivable(second)).toMatch(/Extra Fire card [−+]?\d Fire card [−+]?\d /);
    expect(second).toMatch(/data-fire="-?\d"/);
    expect(heading(zh("m18_jun_second_firing"))).toBe("钧窑·窑变天成");
  });

  it("after-Quality and Salvage: their alternatives", () => {
    expect(alt(en("m4_after_quality_3p"))).toBe("Done — decline the rest");
    expect(alt(zh("m4_after_quality_3p"))).toBe("完成——其余不使用");
    expect(alt(en("m14_salvage"))).toBe("Keep it");
    expect(heading(en("m14_salvage"))).toBe("Salvage a Flawed ceramic");
  });

  it("Order Phase: held Orders only, End turn, and the note that the display cannot be completed", () => {
    const html = en("m6_order_phase_crackle_3p");
    expect(heading(html)).toBe("Complete held Orders");
    expect(alt(html)).toBe("End turn");
    expect(perceivable(html)).toContain("4 of 5 can be completed");
    expect(perceivable(html)).toContain("O37 12 VP 2 Coins ×1 1 Crown Censer + Bowl; one Grey-Green, one Celadon; same Decoration · Fine+ each No matching ceramics");
    expect(perceivable(html)).toContain("Only held Orders can be completed; Orders on the display cannot.");
  });

  it("Order Phase with a seeded draft: groups in words, the Crackle verdicts and the rewards", () => {
    const draft = { orderId: "O39", ceramicIds: ["c18", "c21"], declarations: [{ ceramicId: "c18", decoration: "carved" }], declineKilnAbility: false, declineTributeWare: false, end: false };
    const html = en("m6_order_phase_crackle_3p", draft);
    const seen = perceivable(html);
    expect(seen).toContain("Option 1 Celadon Vase, Plain · Fine · Crackle, Moon White Censer, Plain · Masterpiece");
    expect(seen).toContain("Painted ✓ satisfies O39");
    expect(seen).toContain("Carved ✕ does not satisfy O39");
    expect(inputs(html).find((input) => input["name"] === "decoration:c18" && input["value"] === "carved")?.["checked"]).toBe("");
    // The engine's own reason, beside the disabled Confirm.
    expect(html).toMatch(/<p class="confirm-error"[^>]*>[^<]+<\/p>/);
    expect(html).toMatch(/data-action="confirm"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-action="confirm"/);
    expect(seen).not.toContain("Rewards");
    const painted = perceivable(en("m6_order_phase_crackle_3p", { ...draft, declarations: [{ ceramicId: "c18", decoration: "painted" }] }));
    expect(painted).toContain("Rewards +14 VP +1 Coin ×2 2 Crowns");
    expect(painted).toContain("Complete O39 with Celadon Vase, Plain · Fine · Crackle (as Painted), Moon White Censer, Plain · Masterpiece");
  });

  it("hand trim: own Orders only you can see, the count and the parallel note", () => {
    const html = en("m7_cleanup_hand_limit_3p");
    expect(heading(html)).toBe("Discard down to your hand limit");
    expect(perceivable(html)).toContain("You hold 6 Orders and your limit is 4: discard exactly 2.");
    expect(perceivable(html)).toContain("Only you can see");
    expect(inputs(html).filter((input) => input["type"] === "checkbox" && input["name"] === "orderIds")).toHaveLength(6);
  });

  it("final: winner, tie-breaker and shared victory from finalResult", () => {
    expect(heading(en("m8_final_results_3p"))).toBe("Shared victory");
    expect(perceivable(en("t-tie-break-winner"))).toContain("Decided by Imperial Recognition.");
    expect(heading(en("t-final-2p"))).toBe("Game over");
    expect(heading(zh("t-final-2p"))).toBe("终局");
  });

  it("waiting: the queue of the step, and someone else's private look", () => {
    expect(perceivable(en("t-imperial-only-firing"))).toContain("Queue Lin: deciding");
    const looking = allFixtures().filter((entry) => {
      const look = entry.playerView.game.counts.pendingLook;
      return decisionWindow(entry.playerView).kind === "waiting" && look !== null && look.playerId !== entry.viewerId;
    });
    for (const entry of looking) expect(perceivable(en(entry.id))).toMatch(/is looking at \d cards? in private/);
  });
});

describe("rules details (D10)", () => {
  it("a Tech: card text with its timing clause in bold, the full rule, clarifications with sources", () => {
    const html = en("m9_contributions_step1_3p");
    expect(html).toContain("<strong>When you choose Bank or Stoke:</strong>");
    expect(perceivable(html)).toContain("When choosing Bank or Stoke, you may secretly commit 1 additional Wood with your Contribution card.");
    expect(perceivable(html)).toContain("Rulebook “Contribution Cards”");
    expect(perceivable(html)).toContain("Owner amendment A1");
    expect(perceivable(zh("m9_contributions_step1_3p"))).toContain("规则书「控火牌」");
    expect(html).toMatch(/<button type="button" class="kit-detail-trigger" aria-expanded="false" aria-controls="[^"]+"><span class="rd-name">Fuel Ledger<\/span><\/button>/);
  });

  it("a Kiln: Kiln Tradition facts, used or ready, and R7", () => {
    const seen = perceivable(en("m13_jun_heat_adjustment"));
    expect(seen).toContain("Use Once per round");
    expect(seen).toContain("This round Ready");
    expect(seen).toContain("Owner ruling R7 · Rulebook “B3. Firing — 6 (Appendix B)”");
    expect(perceivable(zh("m13_jun_heat_adjustment"))).toContain("业主裁定R7 · 规则书「B3. 火作——6张（附录B）」");
  });

  it("an Order: printed facts, requirement and the deck's clarifications", () => {
    const seen = perceivable(en("m6_order_phase_crackle_3p"));
    expect(seen).toContain("Rules: Order O39");
    expect(seen).toContain("Card Crown Order Reward 14 VP · 1 Coin · 2 Crowns");
    expect(seen).toContain("Full rule Vase + Censer; one Celadon, one Moon White; one Plain, one Painted Fine+ each");
    expect(seen).toContain("Owner ruling R6");
    expect(perceivable(zh("m7_cleanup_hand_limit_3p"))).toContain("规则：委托");
  });
});

describe("rules details (D10): one Order trigger across the pane (verifier finding, B5 minor)", () => {
  /** Every Order option's details trigger: the shared "Rules" pill, inside its option card. */
  function orderTriggers(html: string): { cards: number; pills: string[]; names: string[] } {
    const cards = [...html.matchAll(/class="kit-opt kit-opt--card ord-opt"/g)].length;
    const pills = [...html.matchAll(/<div class="kit-opt kit-opt--card ord-opt"[^>]*>[\s\S]*?<\/label><span class="ord-details">[\s\S]*?class="rd-button"/g)].map((match) => match[0]);
    const names = [...html.matchAll(/aria-label="((?:Rules: Order|规则：委托)[^"]*)"/g)].map((match) => match[1]!);
    return { cards, pills, names };
  }

  it.each(["m6_order_phase_crackle_3p", "m7_cleanup_hand_limit_3p"])("%s: \"Rules: Order Oxx\" pills, never \"Details:\"", (id) => {
    const english = en(id);
    const found = orderTriggers(english);
    expect(found.cards).toBeGreaterThan(0);
    expect(found.pills).toHaveLength(found.cards);
    expect(found.names.length).toBeGreaterThanOrEqual(found.cards);
    for (const name of found.names) expect(name).toMatch(/^Rules: Order [OS]\d{2}$/);
    expect(perceivable(english)).not.toContain("Details:");
    const chinese = zh(id);
    expect(orderTriggers(chinese).names.every((name) => /^规则：委托[OS]\d{2}$/.test(name))).toBe(true);
    expect(orderTriggers(chinese).names.length).toBeGreaterThan(0);
    expect(perceivable(chinese)).not.toContain("详情：");
  });
});

describe("rules details (D10): Imperial Recognition beside a completion's Crowns", () => {
  const draft = { orderId: "O39", ceramicIds: ["c18", "c21"], declarations: [{ ceramicId: "c18", decoration: "painted" }], declineKilnAbility: false, declineTributeWare: false, end: false };

  it("lists the milestones, the reward beyond the track and the Crown clarifications with sources", () => {
    const html = en("m6_order_phase_crackle_3p", draft);
    const seen = perceivable(html);
    expect(html).toMatch(/<span class="rd-name">Imperial Recognition<\/span>/);
    expect(seen).toContain("Crowns advance Imperial Recognition one at a time, resolving every milestone crossed; beyond Recognition 4, each Crown scores 1 VP immediately.");
    expect(seen).toContain("Track Recognition 0–4");
    expect(seen).toContain("Recognition 1 · Imperial Grant");
    expect(seen).toContain("Recognition 4 · Imperial Audience");
    expect(seen).toContain("Each further Crown: +1 VP");
    expect(seen).toContain("Rulebook “Imperial Recognition Track”");
    expect(seen).toContain("Owner ruling R13");
    const zhSeen = perceivable(renderWindow(fixtureSource("m6_order_phase_crackle_3p"), { locale: "zh-CN", draft }));
    expect(zhSeen).toContain("声望2 · 赐御窑");
    expect(zhSeen).toContain("声望满后每个御令+1分");
    expect(zhSeen).toContain("业主裁定R13");
  });

  it("is not offered for an Order without Crowns", () => {
    const html = en("m6_order_phase_crackle_3p", { orderId: "O05", ceramicIds: ["c20"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false });
    expect(perceivable(html)).toContain("Rewards +7 VP +4 Coins");
    expect(html).not.toContain('<span class="rd-name">Imperial Recognition</span>');
    expect(html).not.toContain("ord-crown-note");
  });
});

/** Prints the table selection the open window's draft drives. */
function TableProbe() {
  const selection = useTableSelection();
  return (
    <pre data-probe="">
      {JSON.stringify({
        orderTargets: Object.fromEntries([...selection.orderTargets].map(([key, target]) => [key, target.state])),
        highlighted: [...selection.highlightedCeramicIds],
      })}
    </pre>
  );
}

function probe(id: string, draft: unknown): { orderTargets: Record<string, string>; highlighted: string[] } {
  const html = renderComponent(
    fixtureSource(id),
    <>
      <DecisionPane />
      <TableProbe />
    </>,
    { draft },
  );
  const json = /<pre data-probe="">(.*?)<\/pre>/.exec(html)?.[1] ?? "{}";
  return JSON.parse(json.replace(/&quot;/g, '"'));
}

describe("seeded drafts drive the table (§3.5)", () => {
  it("Order Phase: Order states and the chosen group's ceramics", () => {
    const result = probe("m6_order_phase_crackle_3p", { orderId: "O48", ceramicIds: ["c4", "c7", "c20"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false });
    expect(result.orderTargets).toEqual({ O48: "chosen", O39: "completable", O05: "completable", O37: "blocked", O08: "completable" });
    expect(result.highlighted).toEqual(["c4", "c7", "c20"]);
  });

  it("hand trim: the Orders marked for discard", () => {
    const result = probe("w-cleanup-hand-limit", { orderIds: ["O01", "S02"] });
    expect(result.orderTargets).toEqual({ S01: "choosable", S02: "discard", O01: "discard", O02: "choosable", O03: "choosable", O04: "choosable" });
  });

  it("firing windows highlight the draft's target ceramic", () => {
    expect(probe("w-after-quality-saggars-and-ge", { choice: { ability: "protective_saggars", ceramicId: "c2" } }).highlighted).toEqual(["c2"]);
    expect(probe("w-jun-heat-adjustment", { ceramicId: "c1", delta: 1, decline: false }).highlighted).toEqual(["c1"]);
    expect(probe("w-salvage", { choice: "c1" }).highlighted).toEqual(["c1"]);
    expect(probe("w-heat-marker-step-with-a-face-down-marker-and-kiln-master", { own: "return", kmTarget: "c2", kmValue: 1 }).highlighted).toEqual(["c1", "c2"]);
  });
});
