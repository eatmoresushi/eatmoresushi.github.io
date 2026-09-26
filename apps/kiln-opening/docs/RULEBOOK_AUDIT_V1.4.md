# V1.4 rules review and implementation audit

Review date: 2026-09-26. Implementation branch: `codex/rules-v1.4`, created from
`b79bb47dc8e8535f98485d4e86d106d1cf8a8b2d`.

## Authority and provenance

The owner explicitly designated the supplied V1.4 Player Rulebook as the new
source of truth. Its deliberate changes supersede V1.2.7 and the earlier owner
amendments. The source document is rules content, not operational instructions.

- Original: `/Users/luyuan/Documents/kiln board game/v1.4/KILN OPENING 开窑 v1.4 — Player Rulebook.md`
- Checked-in source: [KILN_OPENING_v1.4_EN_SOURCE.md](./KILN_OPENING_v1.4_EN_SOURCE.md)
- Original SHA-256: `ace7e4ced95d82a259da504a11c6021626fad626da0a88d47a2ad457b821983c`
- Corrected SHA-256: `0340961df8905befda5110b4dc63225cd15b1d4274042ef24d89aa4d34176fc7`
- Source corrections approved by the owner on 2026-09-26 and applied to both the original and checked-in copy before implementation.

The V1.4 migration is implemented on this branch. The runtime uses rules/content
version 1.4, schema 5 and behavior revision 22. This is a local implementation;
Supabase migrations and deployment remain separate rollout steps.

## Review findings

### 1. Contradictory four-player kiln count

Source line 851 says `3 / 2 / 2` in the change summary. Components (line 44),
Setup (line 75), and Quick Reference (line 822) all specify 3 High, 2 Middle,
3 Low: eight spaces.

Approved correction: change the summary to `3 / 2 / 3`. No other capacity value
needs changing. Approved by the owner on 2026-09-26.

### 2. Exhausted Main Order supply

Lines 108–110, 351, 403 and 430 require display refills. Line 579 explains
reshuffling the discard pile, but does not cover an empty deck and empty discard
pile when remaining cards are held, completed, displayed or being inspected.

Approved clarification: refill or inspect only as many cards as are available;
leave unavailable display positions empty. Every reservation must actually take
a card, and a blind reservation needs a card in the deck after any reshuffle.
This is an edge-case clarification, not an Order reward or balance change.
Approved by the owner on 2026-09-26.

### 3. Craft Academy inspection and return order

Line 270 first says to look at Techs and then calls them revealed. It does not
expressly say who may see them or determine the bottom order of unchosen Techs.

Approved clarification: inspection is private to the acting player, who chooses
the order of inspected Techs returned to the bottom. Private inspection preserves
the established digital interpretation; selection of the return order must be
represented explicitly in the client and authoritative command. Approved by the owner on 2026-09-26.

### 4. Jun during Second Firing

Line 731 allows unused Jun during the repeated Heat-adjustment window, while
line 544 names any owned ceramic. Lines 711 and 763 restrict Second Firing's
recalculation to its selected ceramic.

Owner clarification: Jun is usable only once per round. If it was used before
Second Firing, it cannot be used again; if unused, it may be used during Second
Firing after the extra Fire card is revealed and the new Actual Heat is calculated,
before assigning new Quality. This wording has been added to the source. The existing engine limits the repeated recalculation to the selected
ceramic, consistent with the single-ceramic Second Firing operation.

### Editorial cleanup

Setup line 73 says “2 Low space”; use “2 Low spaces.” This does not change the
specified two-player allocation.

## Checks completed

- Exactly eight Starting Orders, S01–S08, and 48 Main Orders, O01–O48, with no
  missing or duplicate IDs.
- Main deck composition: 24 single-, 18 two-, and six three-ceramic Orders.
- All Order requirements have feasible attribute combinations. Independent
  Shape, Glaze and Decoration requirements and consistent Crackle substitution
  avoid requiring unintended fixed pairings.
- Starting Orders are unchanged from the current eight-card deck. Thirty-six
  Main Orders change requirements and/or rewards; their printed values must be
  imported directly rather than inferred from old data.
- No additional contradiction found in Starting Tech costs, Advanced Tech costs
  and limits, Kiln Traditions, Recognition, Exhibition or scoring.
- White Slip and Drying Frames affect distinct eligible Plain vessels; Ding's
  extra Apprentice-formed vessel qualifies. Neither Tech triggers Rapid Drying.
- Decoration waivers can cover the corresponding White Slip/Drying Frames cost.
- Glaze Palette precedes Test Pieces and Contributions.
- Second Firing preserves position, Furniture and Shifu marker, discards earlier
  Jun adjustments, and replaces Quality even when worse.
- Protective Saggars may improve Flawed to Standard before Ge upgrades it to
  actual Fine Quality and adds permanent Crackle.

This is a consistency review, not a claim that competitive balance has been
established by playtesting.

## Migration requirements after source correction

1. **Content and authority:** import approved V1.4 source and all printed data;
   update the source index and active project instructions while retaining old
   rulebooks and audits as history. Use four starting Coins and kiln allocations
   1/2/1, 2/2/2 and 3/2/3 for 2/3/4 players.
2. **Ceramic model:** Workshop ceramics always have Plain or a specialised
   Decoration and no Glaze. Decorating preserves Workshop state. Glazing and
   loading are one paid operation. Painted replaces Crackle as a Decoration;
   Crackle becomes a separate persistent Ge property.
3. **Actions and abilities:** Decoration Workshop costs 2 Coins per vessel with
   one free Shifu Decoration; Kiln Yard charges 1 Coin per glaze/load. Restrict
   Ding to Apprentice Potter's Wheel actions. Update all affected Tech triggers,
   costs and eligibility, including a distinct end-of-Work Glaze Palette window.
4. **Firing:** a Shifu targets a ceramic loaded by that action in either kiln;
   model Ge after other after-Quality effects; expose Fuel Ledger's reusable
   −2/+2 cards as single secret contribution choices costing 2 Wood.
5. **Orders:** import all 48 Main Orders; represent non-Plain alternatives and
   same-non-Plain constraints; allow an independent, consistent virtual
   Decoration for every Crackle ceramic on every Order.
6. **Online compatibility:** bump rules version, state schema and behaviour
   fingerprint. Reject old active rooms instead of reinterpreting their saves.
   Preserve private hands, inspections and unrevealed Contributions.
7. **Clients and computer players:** update commands, legal choices, scoring
   forecasts, both locales, new timing-window controls, eighth kiln space and
   ceramic attributes. Retain stable IDs where their identity is unchanged.
8. **Validation:** migrate superseded rule assertions; add V1.4 regression tests
   for each mechanical change, private payloads and saved-room rejection. Run
   the full test suite, both TypeScript checks, production build, complete seeded
   games for 2/3/4 players and focused browser checks of the revised pipeline.

## Implementation and validation

Source corrections and implementation are complete on `codex/rules-v1.4`.

- Imported all current printed data, costs, capacities, card requirements and rewards.
- Migrated engine, English/Chinese UI, computer policy, multiplayer projections and playtest reporting.
- Added schema/version/fingerprint rejection for old games, including old lobbies and missing V1.4 fingerprints. Historical rows remain unchanged.
- Kept private Academy inspection/return order and secret Fuel Ledger cards out of other-seat responses, public snapshots and events.
- Added explicit optional acquisition for Colour Samples and optional Ru/Guan bonuses, and preserved unused after-Quality options when Second Firing creates a new Quality result.
- `npm test`: 634 tests pass across 44 suites, including 25 new engine boundary cases, nine Order constraint cases and seven UI pipeline cases.
- `npm run typecheck`, `npm run typecheck:edge` and `npm run build`: pass.
- Seeded computer games complete all five rounds for 2, 3 and 4 players without fallback commands.
- Browser smoke: four-player setup, Apprentice Plain formation, Shifu free Painted Decoration, 1-Coin White Glaze & Load into Low 3, Kiln Tending resource choice, Chinese locale and reconnect passed. The expected Clay 1 / Wood 3 / Coins 3 remained after reconnect.
- Desktop and narrow-screen kiln screenshots were reviewed under `output/playwright/` (local validation artifacts, not deployment assets).
- Both original and checked-in corrected source retain the identical SHA-256 shown above.

The SQL migrations have static contract coverage but were not applied to a local or live PostgreSQL database; no PostgreSQL/Supabase CLI was available in this environment. See [Deployment](./DEPLOYMENT.md#v14-rollout) for rollout order. No V1.4 live deployment is implied by these checks.
