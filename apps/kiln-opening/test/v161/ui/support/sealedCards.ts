/**
 * The secrecy check of a sealed Contribution (v1.6.2 L518, change 26; AGENTS.md hidden
 * information): which card a player sealed stays secret until every eligible contributor has
 * chosen. Every player's Contribution cards are public (Fuel Ledger's 2 included), so a plain
 * text search for a card ID no longer proves anything; this walks the whole snapshot instead.
 */
import { CONTRIBUTION_CARD_IDS } from "../../../../src/game/index.ts";

const CARD_IDS: ReadonlySet<string> = new Set(CONTRIBUTION_CARD_IDS);

/**
 * Every place a Contribution card ID appears in `snapshot`, as a string value or an object key,
 * outside the lists that are public: each player's `contributionCards` and a
 * `CONTRIBUTION_CARDS_GAINED` event's `cards`. Returns their JSON paths; [] when nothing could
 * reveal a sealed card, in any shape (a per-player map, a pending record keyed differently, …).
 */
export function contributionCardLeaks(snapshot: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (CARD_IDS.has(value)) found.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${String(index)}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const gained = record["type"] === "CONTRIBUTION_CARDS_GAINED";
    for (const [key, child] of Object.entries(record)) {
      if (CARD_IDS.has(key)) found.push(`${path}.${key} (key)`);
      if (key === "contributionCards" || (gained && key === "cards")) continue;
      walk(child, `${path}.${key}`);
    }
  };
  walk(JSON.parse(JSON.stringify(snapshot)) as unknown, "$");
  return found;
}
