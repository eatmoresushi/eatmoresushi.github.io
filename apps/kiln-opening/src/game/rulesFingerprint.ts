import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import firingJson from "../../data/firing.json" with { type: "json" };
import gameConfigJson from "../../data/game_config.json" with { type: "json" };
import imperialProgressJson from "../../data/imperial_progress.json" with { type: "json" };
import kilnsJson from "../../data/kilns.json" with { type: "json" };
import ordersJson from "../../data/orders.json" with { type: "json" };
import techniquesJson from "../../data/techniques.json" with { type: "json" };

/**
 * A fingerprint of the rules a game is actually being played under.
 *
 * `rules_version` alone cannot do this job. Twice now a rules change has shipped inside an
 * unchanged version string -- Guan's Order hand limit, then Ding's extra-vessel cost and
 * Jun's activation price -- which leaves the version gate unable to tell a room created
 * before the change from one created after. Both read "1.1.5", so an in-progress game is
 * silently reinterpreted under rules its players never agreed to, and nothing errors.
 *
 * The fingerprint has two halves, because no single mechanism covers both kinds of change:
 *
 * 1. **Content** -- hashed automatically from `data/*.json`. Catches any change to an Order's
 *    VP, an action capacity, a Technique cost, the Fire deck, the Quality table and so on.
 * 2. **Behaviour** -- `RULES_BEHAVIOUR_REVISION`, bumped by hand. Catches changes that live
 *    in engine logic with no data field behind them. Ding's extra vessel is the worked
 *    example: whether it is free or paid is decided by which array `applyFormCeramics`
 *    iterates, and no amount of hashing `data/` would ever see it.
 *
 * This is drift detection, not security. The hash is a plain FNV-1a; it is not a defence
 * against a crafted collision, and nothing here should be treated as one.
 */

/**
 * Bump this whenever engine semantics change without a corresponding change in `data/`.
 *
 * Revision history:
 *   1 -- v1.1.5 as first promoted online.
 *   2 -- Ding's extra vessel pays the normal Clay cost; Jun's activation costs 2 Wood.
 */
export const RULES_BEHAVIOUR_REVISION = 2;

/**
 * Display-only keys, excluded so that a typo fix or a translation improvement does not
 * invalidate every game in progress. Anything mechanical stays in.
 */
const PROSE_KEYS: ReadonlySet<string> = new Set([
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
]);

/** Deterministic serialisation: keys sorted, prose dropped, no incidental whitespace. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !PROSE_KEYS.has(key))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** FNV-1a, 64-bit. Chosen for being short, dependency-free and identical in every runtime. */
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

/** The content half, in file order so a reordering of this list changes the result. */
const CONTENT_SOURCES: ReadonlyArray<readonly [string, unknown]> = [
  ["action_locations", actionLocationsJson],
  ["firing", firingJson],
  ["game_config", gameConfigJson],
  ["imperial_progress", imperialProgressJson],
  ["kilns", kilnsJson],
  ["orders", ordersJson],
  ["techniques", techniquesJson],
];

export function contentDigest(): string {
  return fnv1a64(CONTENT_SOURCES.map(([name, data]) => `${name}:${canonical(data)}`).join("|"));
}

/**
 * The value stored on a room and compared on every action. Shaped `r<revision>-<digest>` so
 * an operator reading the database can see at a glance which half differs.
 */
export function rulesFingerprint(): string {
  return `r${RULES_BEHAVIOUR_REVISION}-${contentDigest()}`;
}
