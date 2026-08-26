# GAME_RULES.md — V1.1.6 source index

The sole gameplay source of truth is [KILN_OPENING_v1.1.6_SOURCE.md](./KILN_OPENING_v1.1.6_SOURCE.md), the owner-approved V1.1.6 rulebook incorporating the recorded Jun amendment:

- original supplied title: `KILN OPENING 开窑 v1.1.6.md`
- original supplied SHA-256: `57e2a14876abd83c41c27f204583ec88979345b461fa10ce6a1d3f3655c25f1e`
- current authoritative SHA-256: `0397db9c9e5c44a049587f91209f3d966fdc643751f4f253693f98baa0f5fe0b`
- rules version: V1.1.6
- languages: English rules with Simplified Chinese names and terminology

This file is an index, not an independent transcription. If prose here, structured data, tests, UI text, historical documents, experiments, or visual assets disagree with the checked-in source, the checked-in source wins.

## Recorded source errata

The supplied Markdown contains one material numerical contradiction and several editorial omissions. The review and the implementation resolutions are recorded in [RULEBOOK_AUDIT_V1.1.6.md](./RULEBOOK_AUDIT_V1.1.6.md).

Until the owner publishes a corrected source file, the online implementation uses:

- Imperial Progress end-game VP `0 / 0 / 2 / 2 / 6 / 10`, following both the Quick Reference and the explicit V1.1.6 change log rather than the older `4 / 8` values left in the main track table;
- a universal End-game Exhibition capacity of 5, following the Quick Reference and V1.1.6 change log;
- exactly three exhibited ceramics as the featured collection when at least three ceramics are exhibited; fewer than three exhibits have no featured collection and cannot earn diversity bonuses.

These are conflict resolutions, not balance changes.

## Machine-readable implementation

`data/*.json` and `src/game/*` implement the supplied source. They are derived artifacts and do not outrank it. Any intentional rules change must begin by updating or replacing the supplied source rulebook with the project owner's approval.
