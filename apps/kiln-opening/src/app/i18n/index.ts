/**
 * The i18n catalogue (UI_V1.6.1_ARCHITECTURE §6.1, §4.3 rule 4). Frozen after phase A: it
 * imports every namespace file, one per work package, and nothing else. A package fills only
 * its own namespace file; adding a namespace goes through B6.
 *
 * | Namespace        | Owner                                   |
 * | ---------------- | --------------------------------------- |
 * | `common`         | A3 (UI verbs, units, shared vocabulary) |
 * | `locationSummary`| A3 (rulebook Appendix E / glossary §4)  |
 * | `mp`             | A3 (non-rule multiplayer errors)        |
 * | `shell`, `lobby` | B1                                      |
 * | `table`, `boards`| B2                                      |
 * | `kiln`, `results`, `playtest` | B3                         |
 * | `work`           | B4                                      |
 * | `firing`, `orders` | B5                                    |
 */
import { boards } from "./catalog/boards.ts";
import { common } from "./catalog/common.ts";
import { firing } from "./catalog/firing.ts";
import { kiln } from "./catalog/kiln.ts";
import { lobby } from "./catalog/lobby.ts";
import { locationSummary } from "./catalog/locationSummary.ts";
import { mp } from "./catalog/mp.ts";
import { orders } from "./catalog/orders.ts";
import { playtest } from "./catalog/playtest.ts";
import { results } from "./catalog/results.ts";
import { shell } from "./catalog/shell.ts";
import { table } from "./catalog/table.ts";
import { work } from "./catalog/work.ts";

export const CATALOG = {
  common,
  locationSummary,
  mp,
  shell,
  lobby,
  table,
  boards,
  kiln,
  results,
  playtest,
  work,
  firing,
  orders,
} as const;

export type Catalog = typeof CATALOG;
export type NamespaceId = keyof Catalog;

/** Namespaces whose strings are sourced rule text and may contain literal numbers (§6.4). */
export const SOURCED_NAMESPACES: ReadonlySet<NamespaceId> = new Set<NamespaceId>(["locationSummary"]);
