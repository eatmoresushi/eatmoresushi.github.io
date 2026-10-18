/**
 * Playtest Form V3 page (B3; UI_V1.6.1_ARCHITECTURE §1.3 port of test/v127 playtest_form, §9.2,
 * §10.3): SSR in English and Chinese for 2–4 players; per-discipline Techs; all five Kilns; the
 * Kiln Die; Fuel Ledger ±2 only for its owner (`reconcileFiringTechOwnership`); draft save and
 * restore (`restorePlaytestDraft`); every `validatePlaytestSubmission` message rendered in the
 * reader's language; the pure draft edits.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DISCIPLINES, GAME_CONFIG, KILN_IDS, ORDER_IDS, techsOfDiscipline } from "../../../../src/game/index.ts";
import { createPlaytestDraft, submissionCandidate } from "../../../../src/playtest/model.ts";
import { KILN_DIE_FACES, validatePlaytestSubmission } from "../../../../src/playtest/schema.ts";
import type { PlaytestDraft } from "../../../../src/playtest/types.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { PLAYTEST_DRAFT_KEY, PlaytestFormPage, loadPlaytestDraft, savePlaytestDraft } from "../../../../src/app/playtest/PlaytestFormPage.tsx";
import {
  addCompletedOrder,
  fuelLedgerOwnerIndex,
  removeCompletedOrder,
  roundGlobalHeat,
  setCompletedOrder,
  setContribution,
  setPlayerCount,
  setTech,
  toggleFiringTech,
  updateRound,
} from "../../../../src/app/playtest/draftOps.ts";
import { MATCHED_PATTERNS, RENDERED_ISSUE_CODES, issueField, issueMessage, issueMessageOf, issueText } from "../../../../src/app/playtest/issueText.ts";
import { ROOT } from "../../support/glossary.ts";
import { MemoryStorage, validDraft } from "./support.ts";

function render(draft: PlaytestDraft, locale: "en" | "zh-CN" = "en"): string {
  return renderToStaticMarkup(
    <I18nProvider locale={locale} strict>
      <PlaytestFormPage initialDraft={draft} storage={null} />
    </I18nProvider>,
  );
}

describe("SSR in English and Chinese for 2–4 players", () => {
  it.each([2, 3, 4] as const)("%i players", (count) => {
    const draft = createPlaytestDraft(count);
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render(draft, locale);
      expect(html).toContain('data-form="playtest-v3"');
      expect(html.match(/<article class="pt-card"/g)).toHaveLength(count);
      expect(html.match(/<details class="pt-round"/g)).toHaveLength(GAME_CONFIG.rounds);
      expect(html.match(/name="rounds\.\d\.players\.\d\.contribution"/g)).toHaveLength(count * GAME_CONFIG.rounds);
      // Every Kiln (all five, R1) and one Tech select per discipline, per player.
      for (const kilnId of KILN_IDS) expect(html.match(new RegExp(`<option value="${kilnId}"`, "g"))).toHaveLength(count);
      for (const discipline of DISCIPLINES) {
        for (const techId of techsOfDiscipline(discipline)) expect(html.match(new RegExp(`<option value="${techId}"`, "g"))).toHaveLength(count);
      }
      expect(html.match(/name="players\.\d\.(workshopTechId|glazingLoadingTechId|firingTechId)"/g)).toHaveLength(count * 3);
      // The Kiln Die faces.
      for (const face of KILN_DIE_FACES) expect(html).toContain(`<option value="${String(face)}">${String(face)}</option>`);
      expect(html).not.toMatch(/Starting Tech|起始技艺|Kiln Yard/);
    }
    const zh = render(draft, "zh-CN");
    expect(zh).toContain("说说这一局的经过。");
    expect(zh).toContain("逐轮烧窑");
    expect(zh).toContain("坯作技艺");
    expect(render(draft)).toContain("Form &amp; Decorate Tech");
  });

  it("offers Bank −2 / Stoke +2 only to the player who owns Fuel Ledger", () => {
    const plain = render(createPlaytestDraft(3));
    expect(plain).not.toMatch(/value="(bank_2|stoke_2)"/);
    const draft = setTech(1, "firing", "T12")(createPlaytestDraft(3));
    expect(fuelLedgerOwnerIndex(draft)).toBe(1);
    const html = render(draft);
    for (let round = 0; round < GAME_CONFIG.rounds; round += 1) {
      for (let seat = 0; seat < 3; seat += 1) {
        const select = new RegExp(`name="rounds\\.${String(round)}\\.players\\.${String(seat)}\\.contribution"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? "";
        expect(select.includes('value="bank_2"'), `round ${String(round)} seat ${String(seat)}`).toBe(seat === 1);
        expect(select.includes('value="stoke_2"')).toBe(seat === 1);
      }
    }
    expect(html).toContain("Fuel Ledger Bank (−2)");
  });
});

describe("draft edits", () => {
  it("ticks Fuel Ledger with a ±2 Contribution and unticks it with the last one", () => {
    let draft = setTech(0, "firing", "T12")(createPlaytestDraft(2));
    draft = setContribution(0, 0, "stoke_2")(draft);
    expect(draft.rounds[0]!.firingTechIds).toEqual(["T12"]);
    draft = setContribution(0, 0, "stoke")(draft);
    expect(draft.rounds[0]!.firingTechIds).toEqual([]);
    draft = setContribution(0, 0, "bank_2")(draft);
    draft = toggleFiringTech(0, "T12", false)(draft);
    expect(draft.rounds[0]!.players[0]!.contribution).toBe("bank");
  });

  it("clears ±2 Contributions and used Firing Techs when their owner gives the Tech up", () => {
    let draft = setTech(0, "firing", "T12")(createPlaytestDraft(2));
    draft = setContribution(2, 0, "bank_2")(draft);
    draft = setTech(0, "firing", "T13")(draft);
    expect(draft.rounds[2]!.players[0]!.contribution).toBe("bank");
    expect(draft.rounds[2]!.firingTechIds).not.toContain("T12");
    draft = toggleFiringTech(1, "T13", true)(draft);
    expect(draft.rounds[1]!.firingTechIds).toEqual(["T13"]);
    draft = setTech(0, "firing", null)(draft);
    expect(draft.rounds[1]!.firingTechIds).toEqual([]);
  });

  it("resizes players and rounds, and edits completed Orders", () => {
    let draft = setPlayerCount(4)(createPlaytestDraft(2));
    expect(draft.players).toHaveLength(4);
    expect(draft.rounds.every((round) => round.players.length === 4)).toBe(true);
    draft = addCompletedOrder(0)(draft);
    draft = setCompletedOrder(0, 0, ORDER_IDS[0]!)(draft);
    draft = addCompletedOrder(0)(draft);
    expect(draft.players[0]!.completedOrderIds).toEqual([ORDER_IDS[0], ""]);
    draft = removeCompletedOrder(0, 1)(draft);
    expect(draft.players[0]!.completedOrderIds).toEqual([ORDER_IDS[0]]);
  });

  it("shows Global Heat as Base Heat plus the Fire card once both are recorded", () => {
    let draft = createPlaytestDraft(2);
    expect(roundGlobalHeat(draft.rounds[0]!)).toBeNull();
    draft = updateRound(0, { kilnDie: 2 })(draft);
    draft = setContribution(0, 0, "stoke")(draft);
    expect(roundGlobalHeat(draft.rounds[0]!)).toBeNull();
    draft = updateRound(0, { fireModifier: -2 })(draft);
    expect(roundGlobalHeat(draft.rounds[0]!)).toBe(1);
    const html = render(draft);
    expect(html).toContain("Base Heat 3 · Global Heat 1");
  });
});

describe("draft save and restore", () => {
  it("saves under the V3 key and restores through restorePlaytestDraft", () => {
    const storage = new MemoryStorage();
    const draft = setTech(1, "firing", "T12")(createPlaytestDraft(3));
    savePlaytestDraft(storage, draft);
    expect(storage.getItem(PLAYTEST_DRAFT_KEY)).toBe(JSON.stringify(draft));
    expect(loadPlaytestDraft(storage)).toEqual(draft);
  });

  it("starts a new draft for a missing, corrupt or older draft, or blocked storage", () => {
    const storage = new MemoryStorage();
    expect(loadPlaytestDraft(storage).formVersion).toBe(3);
    storage.setItem(PLAYTEST_DRAFT_KEY, "{not json");
    expect(loadPlaytestDraft(storage).players).toHaveLength(2);
    storage.setItem(PLAYTEST_DRAFT_KEY, JSON.stringify({ ...createPlaytestDraft(2), formVersion: 2 }));
    expect(loadPlaytestDraft(storage).formVersion).toBe(3);
    storage.setItem("kiln-opening:playtest-draft-v2", JSON.stringify(createPlaytestDraft(4)));
    expect(loadPlaytestDraft(new MemoryStorage()).players).toHaveLength(2);
    const blocked = new MemoryStorage();
    blocked.getItem = () => {
      throw new Error("blocked");
    };
    blocked.setItem = () => {
      throw new Error("blocked");
    };
    expect(() => savePlaytestDraft(blocked, createPlaytestDraft(2))).not.toThrow();
    expect(loadPlaytestDraft(blocked).formVersion).toBe(3);
    expect(loadPlaytestDraft(null).formVersion).toBe(3);
  });
});

describe("validation issues in the reader's language", () => {
  const en = createTranslator("en", { strict: true });
  const zh = createTranslator("zh-CN", { strict: true });

  it("a minimal valid record passes", () => {
    const result = validatePlaytestSubmission(submissionCandidate(validDraft(2)));
    expect(result.ok).toBe(true);
  });

  it("names fields and translates messages for an empty record", () => {
    const draft = createPlaytestDraft(3);
    const result = validatePlaytestSubmission(submissionCandidate(draft));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const issue of result.issues) {
      expect(MATCHED_PATTERNS.some((pattern) => pattern.test(issue.message)), issue.message).toBe(true);
      const text = issueText(issue, draft, zh);
      expect(text).not.toMatch(/[A-Za-z]{4,}/);
    }
    expect(issueField("players.1.kilnId", draft, en)).toBe("Player 2 · Kiln");
    expect(issueField("rounds.2.players.0.contribution", draft, en)).toBe("Round 3 · Player 1 · Fire Contribution");
    expect(issueField("players.0.firingTechId", draft, zh)).toBe("玩家1 · 火作技艺");
    expect(issueMessage("Enter a whole number from 0 to 4.", zh)).toBe("请填写0–4之间的整数。");
    expect(issueMessage("Shared Kiln loading cannot exceed 6 ceramics.", zh)).toBe("装进共窑的器物不能超过6件。");
    expect(issueMessage("An unknown message.", zh)).toBe("An unknown message.");
  });

  it("renders every schema issue code in the reader's language (CR B3-3), the sentence staying the fallback", () => {
    const source = readFileSync(join(ROOT, "src/playtest/schema.ts"), "utf8");
    const codes = [...new Set([...source.matchAll(/"([a-z]+(?:_[a-z]+)+)"(?=\s*(?:,\s*\{|\);|,?\s*\n\s*\);))/g)].map((match) => match[1] ?? ""))];
    expect(codes.length).toBeGreaterThan(25);
    for (const code of codes) if (code !== "starting_tech") expect(RENDERED_ISSUE_CODES, code).toContain(code);
    const zh = createTranslator("zh-CN", { strict: true });
    const en = createTranslator("en", { strict: true });
    const issue = { path: "rounds.0.kilnDie", message: "Enter a whole number from 1 to 3.", code: "integer_range" as const, params: { min: 1, max: 3 } };
    expect(issueMessageOf(issue, en)).toBe(issueMessage(issue.message, en));
    expect(issueMessageOf(issue, zh)).toBe(issueMessage(issue.message, zh));
    expect(issueMessageOf({ path: "x", message: "A new sentence." }, zh)).toBe("A new sentence.");
    const result = validatePlaytestSubmission({});
    expect(result.ok).toBe(false);
    if (!result.ok) for (const found of result.issues) expect(found.code, found.message).toBeDefined();
  });

  it("matches every message the schema can produce", () => {
    const source = readFileSync(join(ROOT, "src/playtest/schema.ts"), "utf8");
    const literals = [...source.matchAll(/(["`])((?:(?!\1)[^\\]|\\.)*?)\1/g)]
      .map((match) => match[2] ?? "")
      .filter((text) => /^[A-Z].*\.$/.test(text) && !text.includes("V1.6.2 has no Starting Techs"));
    expect(literals.length).toBeGreaterThan(25);
    const samples = literals.map((text) => text.replace(/\$\{[^}]+\}/g, "4"));
    for (const sample of samples) {
      expect(MATCHED_PATTERNS.some((pattern) => pattern.test(sample)), sample).toBe(true);
    }
  });
});
