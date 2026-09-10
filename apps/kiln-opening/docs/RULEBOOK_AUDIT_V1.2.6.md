# RULEBOOK_AUDIT_V1.2.6.md

## Adopted sources

The current ruleset is V1.2.6 and has two complementary authorities:

| Scope | Checked-in source | Owner-supplied filename | SHA-256 |
|---|---|---|---|
| Mechanics, timing, costs, limits, setup, cards, abilities and scoring | `KILN_OPENING_v1.2.6_EN_SOURCE.md` | `KILN OPENING 开窑 v1.2.6 — Player Rulebook.md` | `0ab4d42fb1efe66e2f98e9dd2ebec5d2c32a547360e4ad3be2d43bd3665a24e0` |
| Simplified Chinese terminology, labels, names and player-facing wording | `KILN_OPENING_v1.2.6_ZH_SOURCE.md` | `《开窑》KILN OPENING v1.2.6 — 玩家规则书.md` | `6508adbdbdaf80afde39dec1d7deca048486166a7ff6c4f06e9be9aa54484b42` |

Both checked-in files are byte-for-byte copies of the supplied files. Preserve them as immutable source snapshots.

## Authority split

- The English source wins for game behaviour.
- The Chinese source wins for Chinese terminology and player-facing wording.
- The owner-supplied V1.2.6 migration brief requires exactly one eligible Shared-Kiln ceramic to be selected during a Kiln Yard Shifu action. This resolves the English table row's optional “may place” phrasing for the online decision flow; moving that committed ceramic during firing remains optional.
- Structured data, tests, UI copy, derived specifications, historical documents and artwork never outrank these sources.

## V1.2.5 → V1.2.6 mechanical delta

- During a Kiln Yard Shifu action, after loading, a player with at least one owned ceramic in the Shared Kiln selects exactly one such ceramic and places/associates the Shifu with it.
- After Base Heat and before Fire, only that committed ceramic may move to an empty active space in a neighbouring Shared-Kiln heat zone. Multiple decisions resolve in First Player order. Kiln Furniture moves with its ceramic and retains a zero zone modifier.
- A Shifu that loads only into the Imperial Kiln while owning no Shared-Kiln ceramic receives no target or reposition opportunity. Imperial Kiln ceramics cannot be marked or moved by this effect.
- Ding's Moulded Production now pays 1 Clay for its additional matching Bowl, Plate or Brush Washer. The additional vessel is separate from the worker effect and does not count toward the Shifu's two-vessel discount or worker vessel limit.
- The Ding vessel remains a vessel formed during the Potter's Wheel action and can satisfy Standardised Moulds.
- Player-facing “normal cost” wording is removed where V1.2.6 uses “Clay cost”, “Decoration cost”, or “cost”; the underlying costs are unchanged.

All other mechanics, data values and established localisation remain unchanged unless those points require supporting state, UI, or save-boundary changes.

## Cross-language check

The English and Chinese V1.2.6 sources agree on the new Shifu commitment timing, restriction to the marked ceramic, First Player ordering, neighbouring-zone movement, Imperial Kiln exclusion, and Ding's 1-Clay payment. The Chinese source establishes the corresponding wording with `师傅所在的陶瓷` and names Ding's ability `范制成器`.

## Historical sources

The V1.2.4 and V1.2.5 source files and audits remain immutable historical snapshots. They are not current authorities and must not be used to restore the old “choose any Shared-Kiln ceramic during firing” or free Ding-vessel behaviour.
