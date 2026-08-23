import { describe, expect, it } from "vitest";
import { RULES_BEHAVIOUR_REVISION, contentDigest, rulesFingerprint } from "../src/game";

/**
 * The pinned fingerprint of the shipped ruleset.
 *
 * If this test fails, the rules changed. That is not automatically wrong -- it is a prompt
 * to answer two questions deliberately:
 *
 *   1. Was the change intended? If not, something drifted; fix it rather than updating this.
 *   2. Does it change how a game *plays*? If so, in-progress online games would be silently
 *      reinterpreted, so bump `RULES_BEHAVIOUR_REVISION` as well, which makes the server
 *      reject those rooms with a clear error instead of quietly changing the rules under
 *      their players.
 *
 * Then update the constant below to the value the failure reports.
 */
const PINNED_FINGERPRINT = "r2-26ba8805cb914307";

describe("rules fingerprint", () => {
  it("matches the pinned value for the shipped ruleset", () => {
    expect(
      rulesFingerprint(),
      "The authoritative rules changed. Confirm the change was intended; bump "
        + "RULES_BEHAVIOUR_REVISION if it alters how a game plays; then update "
        + "PINNED_FINGERPRINT in this test to the actual value.",
    ).toBe(PINNED_FINGERPRINT);
  });

  it("is stable across calls and carries both halves", () => {
    expect(rulesFingerprint()).toBe(rulesFingerprint());
    expect(rulesFingerprint()).toBe(`r${RULES_BEHAVIOUR_REVISION}-${contentDigest()}`);
    expect(contentDigest()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when a mechanical value changes", async () => {
    // Prove the digest actually reads the content rather than returning a constant: rebuild
    // it over a mutated copy of an Order and require a different result.
    const { MARKET_ORDERS } = await import("../src/game");
    const original = MARKET_ORDERS[0]!;
    const before = contentDigest();
    const restore = original.vp;
    (original as { vp: number }).vp = restore + 1;
    const after = contentDigest();
    (original as { vp: number }).vp = restore;

    expect(after).not.toBe(before);
    expect(contentDigest()).toBe(before);
  });

  it("ignores display-only prose so a typo fix does not invalidate live games", async () => {
    const kilns = (await import("../data/kilns.json", { with: { type: "json" } }))
      .default as unknown as Array<Record<string, unknown>>;
    const target = kilns[0]!;
    const before = contentDigest();
    const restore = target["ability"];
    target["ability"] = `${String(restore)} (typo fixed)`;
    expect(contentDigest()).toBe(before);
    target["ability"] = restore;
  });
});
