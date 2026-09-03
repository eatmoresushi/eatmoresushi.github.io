# GAME_RULES.md — V1.2.2 source index

The sole gameplay source of truth is [KILN_OPENING_v1.2.2_SOURCE.md](./KILN_OPENING_v1.2.2_SOURCE.md), the owner-supplied V1.2.2 rulebook.

- Original supplied title: `KILN OPENING 开窑 v1.2.2.md`
- Original supplied SHA-256: `dbd5bc5c0b54d6468d76d761bb9090fa9ff0581dca66fc3f277f032757451d0a`
- Rules version: **V1.2.2**
- Languages: English rules with English / Simplified Chinese player-facing terminology

This file is an index, not an independent transcription. If prose here, structured data, tests, UI text, historical documents, experiments, saved games or visual assets disagree with the checked-in source, the checked-in source wins.

## Recorded source rulings

The source review and owner-approved resolutions are recorded in [RULEBOOK_AUDIT_V1.2.2.md](./RULEBOOK_AUDIT_V1.2.2.md). The three implementation-bearing rulings are:

- **Imperial Priority:** Recognition 4 grants a once-per-game token. During a Kiln Yard action, spend it to load one additional ceramic into the owner's empty Imperial Kiln. The stale §8 heat-adjustment version is not used.
- **Second Firing:** resolve it immediately in its after-Quality window by revealing one extra Fire card for the selected ceramic only.
- **Guan:** the chosen ceramic ignores direct and relational Decoration requirements only; Shape, Glaze, Quality and all other requirements still apply.

Recognition 3 is titled **Imperial Gift**. Recognition 4 is titled **Imperial Priority**.

These are conflict resolutions, not balance changes.

## Machine-readable implementation

`data/*.json` and `src/game/*` are derived implementations of V1.2.2. They do not outrank the source and recorded rulings. New rooms and saves must carry the current rules version and fingerprint; older saves must be rejected rather than translated silently.
