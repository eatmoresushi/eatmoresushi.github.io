# RULEBOOK_AUDIT_V1.2.5.md

> Historical audit only. V1.2.6 is current; use `KILN_OPENING_v1.2.6_EN_SOURCE.md` for mechanics, `KILN_OPENING_v1.2.6_ZH_SOURCE.md` for Chinese localization, and `RULEBOOK_AUDIT_V1.2.6.md` for the adoption record.

## Historical sources

The superseded V1.2.5 ruleset had two complementary authorities:

| Scope | Checked-in source | Owner-supplied filename | Original supplied SHA-256 | Current archival SHA-256 |
|---|---|---|---|---|
| Mechanics, timing, costs, limits, setup, cards, abilities and scoring | `KILN_OPENING_v1.2.5_EN_SOURCE.md` | `KILN OPENING 开窑 v1.2.5 — Player Rulebook2.md` | `fe9cc9b5ccf95ade74fa5f04fdc111ab383d0b78e13206192fd748777099d04e` | `b5d331f5c7bf2ace56de3db5b1e96707224b0ee89765d3078e079b219aa539dd` |
| Simplified Chinese terminology, labels, names and player-facing wording | `KILN_OPENING_v1.2.5_ZH_SOURCE.md` | `《开窑》KILN OPENING v1.2.5 — 玩家规则书2.md` | `73ccf17030af6ca076b267eb344e71b677b3e08836f1563295ad90afafcc6997` | `713f2b12aabdfb16a1e0438a95bddeaa4050c18452e0e14576fbdbc29deea37f` |

The original hashes preserve the supplied artifacts' provenance. The checked-in archives now carry an explicit superseded notice, and their Main Order display passages were synchronised with the V1.2.6 ordered-queue rule so they cannot supply obsolete operational guidance. They are not current gameplay authorities; all other historical wording remains version-labelled context.

## Authority split

- The English source wins for game behaviour.
- The Chinese source wins for Chinese terminology and wording.
- Structured data, tests, UI copy, derived specifications, historical documents and artwork never outrank those sources.
- When a UI sentence has no direct Chinese equivalent, reuse the terms established by the Chinese source and write natural Simplified Chinese without creating alternate translations for established game terms.

## Owner clarification adopted with Rulebook2

The owner explicitly confirmed that V1.2.5 has **no private workshop action locations and no Tech-based workshop-space unlocks**. Every worker-placement location is shared.

The two Rulebook2 sources agree with that clarification:

- Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy have **2 / 3 / 4 global printed spaces** in 2 / 3 / 4-player games.
- Kiln Yard and Labour are uncapped.
- A worker may use any unoccupied printed space even if the same player or an opponent already occupies another space at that location.
- A Shifu follows the Apprentice placement rules but may be placed when the location's printed spaces are full; multiple Shifu may overfill the same location.
- Advanced Techs do not create worker spaces.

This clarification supersedes the private Potter's Wheel / Glaze & Decoration stations and Tech-unlock implementation from V1.2.4.

## Cross-language rule check

The English and Chinese Rulebook2 files agree on the implementation-critical V1.2.5 structure:

- 2–4 players, five rounds, 1 Shifu + 3 Apprentices, and 2 Clay / 2 Wood / 3 Coins per player;
- 5 / 6 / 7 active Shared-Kiln spaces at 2 / 3 / 4 players;
- one five-card Main Order display, a separate 16-card Starting Order deck, and the Cleanup hand limit of three;
- the seven shared action locations and their 2 / 3 / 4 or uncapped capacities;
- secret Contributions, Base Heat starting at 2 and clamping to 0–5, and the 1 / 3 / 4 / 3 / 1 Fire-card distribution;
- Kiln Yard Shifu reposition after Contributions resolve and Base Heat is known, before the Fire card is revealed, with only a one-zone Shared-Kiln move allowed;
- Imperial Recognition spaces 0–4, Imperial Gift at 2, Imperial Priority at 3, Imperial Audience at 4, and 1 immediate VP for every later Crown;
- four Starting Techs, fifteen Advanced Techs, five Kiln Traditions, sixteen Starting Orders, and forty-eight Main Orders;
- up to five Exhibition ceramics, Standard / Fine / Masterpiece worth 2 / 3 / 5 VP, and +3 VP for each featured-three diversity condition;
- 1 VP per owned Advanced Tech and 1 VP per three remaining Coins, capped at 5 VP.

The Chinese source establishes, among other names, `泥`, `柴`, `铜钱`, `泥柴场`, `陶车坊`, `釉饰坊`, `窑坊`, `瓷牙行`, `陶工行`, `杂作行`, and `御府声望`. Those forms must be reused consistently in the UI and structured content.

## Important V1.2.4 migrations

This is a source audit, not a substitute rulebook. The most implementation-sensitive migrations are recorded here to prevent old state or historical prose from being mistaken for current rules:

- Replace private Potter's Wheel and Glaze & Decoration stations with shared 2 / 3 / 4-capacity locations; remove all workshop-space unlock state.
- Move Kiln Yard Shifu reposition from the end of Work to the firing window after Base Heat and before Fire; restrict the move to an empty active space in a neighbouring heat zone.
- Award the Commission Market reservation advance after **each** reservation made by a Shifu.
- Replace the 0–5 Recognition track with 0–4 and score Crowns beyond 4 immediately.
- Gain the Imperial Kiln at Recognition 2, Imperial Priority at 3, and Imperial Audience at 4. Imperial Priority is a once-per-game load before or after a worker action, not an extra load embedded in Kiln Yard.
- Treat Vessel cards as non-limiting; use a Shape proxy when all ten physical cards of that Shape are in use.
- Score every owned Advanced Tech for 1 VP at game end.

For exact card text, costs, rewards, timing and edge cases, read the adopted sources rather than this summary.

## Earlier historical sources

`KILN_OPENING_v1.2.4_SOURCE.md` and `RULEBOOK_AUDIT_V1.2.4.md` remain checked in as superseded, version-labelled history. The original import is recoverable from its recorded hash and repository history; the checked-in archive's Main Order passages contain current queue guidance. Neither file is a current authority or a basis for restoring other V1.2.4 mechanics.
