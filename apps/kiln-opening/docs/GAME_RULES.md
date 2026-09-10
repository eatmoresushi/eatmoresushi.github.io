# GAME_RULES.md — V1.2.5 source index

The current ruleset has two owner-supplied sources with separate authority:

- [KILN_OPENING_v1.2.5_EN_SOURCE.md](./KILN_OPENING_v1.2.5_EN_SOURCE.md) is authoritative for mechanics, timing, costs, limits, setup, cards, abilities and scoring.
- [KILN_OPENING_v1.2.5_ZH_SOURCE.md](./KILN_OPENING_v1.2.5_ZH_SOURCE.md) is authoritative for Simplified Chinese terminology, labels, names and player-facing wording.

Original supplied titles:

- `KILN OPENING 开窑 v1.2.5 — Player Rulebook2.md`
- `《开窑》KILN OPENING v1.2.5 — 玩家规则书2.md`

Rules version: **V1.2.5**.

This file is an index, not an independent transcription. Source checksums, the bilingual cross-check and the owner's shared-location clarification are recorded in [RULEBOOK_AUDIT_V1.2.5.md](./RULEBOOK_AUDIT_V1.2.5.md).

## V1.2.5 implementation anchors

- All seven worker-placement locations are shared. Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy use 2 / 3 / 4 global printed spaces in 2 / 3 / 4-player games. Kiln Yard and Labour are uncapped.
- A worker may use any unoccupied printed space regardless of other workers at that location. A Shifu may be placed when a location is full, and multiple Shifu may overfill it.
- There are no private workshop worker locations, locked workshop spaces, or Tech-based location unlocks. Advanced Tech effects are not worker actions unless their text explicitly says otherwise.
- A Kiln Yard Shifu repositions after Contributions are revealed and Base Heat is determined, but before the Fire card is revealed. The move must be between neighbouring Shared-Kiln heat zones and never enters or leaves an Imperial Kiln.
- Imperial Recognition runs from 0 to 4. Imperial Gift grants the Imperial Kiln at 2, Imperial Priority is gained at 3, and Imperial Audience grants 6 VP at 4. Each Crown after reaching 4 grants 1 VP immediately.
- Imperial Priority is spent once per game before or after the owner's worker action to load one unloaded Glazed ceramic into an empty Imperial Kiln.
- Each Advanced Tech scores 1 VP at game end. Vessel cards are not a hard supply limit.

## Machine-readable implementation

`data/*.json` and `src/game/*` are derived implementations of V1.2.5. They do not outrank either adopted source. New rooms and saves carry the current rules version, save schema and rules fingerprint; incompatible older started games are rejected rather than translated silently.

The V1.2.4 source and audit remain in `docs/` as historical snapshots only.
