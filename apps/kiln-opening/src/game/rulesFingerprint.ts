import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import firingJson from "../../data/firing.json" with { type: "json" };
import gameConfigJson from "../../data/game_config.json" with { type: "json" };
import imperialProgressJson from "../../data/imperial_progress.json" with { type: "json" };
import kilnsJson from "../../data/kilns.json" with { type: "json" };
import ordersJson from "../../data/orders.json" with { type: "json" };
import techniquesJson from "../../data/techniques.json" with { type: "json" };

/**
 * A fingerprint of the rules a game is actually being played under (DESIGN §6.9, P1).
 *
 * `rules_version` alone cannot do this job: rules have changed inside an unchanged version
 * string before, which leaves the version gate unable to tell a room created before the
 * change from one created after. The fingerprint has two halves:
 *
 * 1. **Content** — hashed automatically from the seven mechanical `data/*.json` files. Catches
 *    any change to an Order's VP, a capacity, a Tech cost, the Fire deck, the Quality table…
 * 2. **Behaviour** — `RULES_BEHAVIOUR_REVISION`, bumped by hand when engine semantics change
 *    with no data field behind them.
 *
 * Display prose (`PROSE_KEYS`) is excluded so that a typo fix or a translation improvement does
 * not invalidate every game in progress. Order `requirements` text stays in the digest.
 *
 * This is drift detection, not security: FNV-1a is not a defence against a crafted collision.
 * Rooms store `r<revision>-<digest>`; the V1.6.1 Supabase gate requires `^r29-[0-9a-f]{16}$`.
 */

/**
 * Bump this whenever engine semantics change without a corresponding change in `data/`.
 *
 * Revision history (1–28 are the V1.1.5–V1.4 engines, recorded in
 * `src/game-v14/rulesFingerprint.ts` and in git history):
 *  28 -- V1.4 with Ding disabled for new games (last V1.4 revision).
 *  29 -- V1.6.1 rework of V1.2.7: five central and two personal locations with absolute
 *        capacity, Kiln Die starting Base Heat, Heat markers, court-fired Imperial Kiln,
 *        rebuilt Ge Crackle, 18 Advanced Techs and no Starting Techs, held-only single-pass
 *        Order Phase with deferred display refill. All five Kilns selectable. V1.4 rooms
 *        are rejected, never migrated (audit, Digital decisions).
 */
export const RULES_BEHAVIOUR_REVISION = 29;

/**
 * Display-only keys. A key is dropped only when its value is prose (a string, or `null` for an
 * empty reward text); if one of these names ever holds a number or an object, it still reaches
 * the digest. Location `effects.apprentice` / `effects.shifu` are objects and therefore stay in.
 */
export const PROSE_KEYS: ReadonlySet<string> = new Set([
  // Kept from V1.4.
  "name",
  "nameZh",
  "ability",
  "abilityZh",
  "abilityName",
  "abilityNameZh",
  "description",
  "descriptionZh",
  "notes",
  "note",
  "text",
  "flavour",
  "flavor",
  "apprentice",
  "shifu",
  "apprenticeZh",
  "shifuZh",
  // New in V1.6.1 (DESIGN §6.9).
  "shortText",
  "shortTextZh",
  "apprenticeText",
  "apprenticeTextZh",
  "shifuText",
  "shifuTextZh",
  "title",
  "titleZh",
  "rewardText",
  "rewardTextZh",
  "summary",
  "summaryZh",
  "notesZh",
]);

/** Deterministic serialisation: keys sorted, prose dropped, no incidental whitespace. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => !(PROSE_KEYS.has(key) && (typeof item === "string" || item === null)))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** FNV-1a, 64-bit. Short, dependency-free and identical in every runtime. */
function fnv1a64(input: string): string {
  const prime = 0x1_0000_01b3n;
  const mask = 0xffff_ffff_ffff_ffffn;
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index) & 0xff);
    hash = (hash * prime) & mask;
    // Surrogate-safe: mix the high byte too rather than truncating non-ASCII to one byte.
    const high = input.charCodeAt(index) >> 8;
    if (high !== 0) {
      hash ^= BigInt(high);
      hash = (hash * prime) & mask;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** The content half: the seven mechanical files, in this order (reordering changes the digest). */
export const CONTENT_SOURCES: ReadonlyArray<readonly [string, unknown]> = [
  ["action_locations", actionLocationsJson],
  ["firing", firingJson],
  ["game_config", gameConfigJson],
  ["imperial_progress", imperialProgressJson],
  ["kilns", kilnsJson],
  ["orders", ordersJson],
  ["techniques", techniquesJson],
];

/** The digest of any list of named sources (pure; tests pass modified copies). */
export function contentDigestOf(sources: ReadonlyArray<readonly [string, unknown]>): string {
  return fnv1a64(sources.map(([name, data]) => `${name}:${canonical(data)}`).join("|"));
}

/** The digest of the checked-in content. */
export function contentDigest(): string {
  return contentDigestOf(CONTENT_SOURCES);
}

/**
 * The value stored on a room and compared on every action, shaped `r<revision>-<digest>` so an
 * operator can see at a glance which half differs.
 */
export function rulesFingerprint(): string {
  return `r${RULES_BEHAVIOUR_REVISION}-${contentDigest()}`;
}
