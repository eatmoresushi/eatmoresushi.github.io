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
- Initial corrected SHA-256: `0340961df8905befda5110b4dc63225cd15b1d4274042ef24d89aa4d34176fc7`
- Initial source corrections approved by the owner on 2026-09-26 and applied to both the original and checked-in copy before implementation.
- Previous amended checked-in SHA-256: `09b101b96e02a59bed047176ef8fae75502c3a8f4759b34de9dedda94116c89f`
- Current amended checked-in SHA-256: `7b164a49a26049f3d95d2d8e4ca715a4b432ce140ae498c2a3e53c1488c1f1b2`
- The owner-approved Ge and after-Quality ordering amendment is recorded in finding 5 below. Finding 6 records the later setup and reward amendment. Finding 7 records the 2026-09-28 Imperial Court and Ge amendment, applied to the checked-in authority; the external original is unchanged by finding 7. The original and checked-in rulebooks have different hashes: the original still lacks several earlier approved clarifications retained in the checked-in authority. The two new changes in finding 6 were applied to both copies without replacing unrelated original text.
- Original SHA-256 immediately before finding 6: `6eb5b07357c107466db8fd4337581ac7e6e226d2342d25542ad2b0c0d354eb02`
- Original SHA-256 after finding 6: `6fee85be6b631a387a13eecf547e4ed63f164188d48b69f07cbfd122a43a8a82`

The V1.4 migration is implemented on this branch. The runtime uses rules/content
version 1.4, schema 5 and behavior revision 25. This is a local implementation;
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

### 5. Owner-chosen after-Quality ability order

After the initial migration, the owner amended Ge's description on 2026-09-26:

> Crackle from Fire · Once per round, after Quality is assigned: 1 of your Standard ceramics from this firing becomes Fine + Crackle. When completing an Order, each of your Crackle ceramics may be treated as having **any one Decoration** for that Order.

The owner also explicitly clarified that players choose the order of multiple
after-Quality effects and must check whether each effect remains valid after
every use. Ge, Protective Saggars and Second Firing therefore share the same
after-Quality window, with no mandatory Ge-last step. Players still resolve
their abilities in First Player order. Each use checks the current Quality,
targets, costs and usage limits; the earlier use of an ability does not preserve
eligibility for a later effect. For example, Saggars can change Flawed to Standard
so unused Ge can apply, but Ge's change to Fine prevents Saggars or Second Firing
from targeting that ceramic. The once-per-round limits and permanent Crackle's
Order substitution remained unchanged by this timing amendment. Finding 7 later replaces Decoration substitution with Glaze substitution; the quoted 2026-09-26 text above is retained as history.

The checked-in source, derived Kiln/round text and active timing documentation
are synchronized with this explicit owner amendment. Behavior revision 23
distinguishes it from the original V1.4 implementation.

### 6. Two Starting Orders and revised opening Main rewards

On 2026-09-27, the owner requested two Starting Orders at setup and confirmed
that this means **two Starting Orders only, with no Main Order dealt**. Hands
remain secret and contain two cards. Deal without replacement from S01–S08;
return 4, 2 or 0 undealt Starting Orders to the box for 2, 3 or 4 players.
All 48 Main Orders remain available: six begin face up and 42 remain in the
deck. Kiln selection, Starting Tech selection and the three-Order Cleanup
hand limit are unchanged.

The same amendment raises O01, O02 and O03 from 3 VP to **4 VP each**.
Their Standard+ threshold, Shape requirements, unrestricted Glaze/Decoration,
3-Coin rewards and zero Crowns are unchanged. The three cards' higher printed
VP applies to both held and face-up completions.

These changes are reflected in the checked-in source, original rulebook,
component notes, engine setup and derived Order data. Behavior revision 24 and
an additive database migration distinguish new games from older one-plus-one
opening hands and 3-VP rewards. Existing room rows retain their original
fingerprints and are not converted or silently reinterpreted.

Validation after this amendment: all 679 tests across 47 suites pass, including
2/3/4-player setup, private hands, held and face-up O01–O03 scoring, complete
seeded games and old-room rejection. Client and Edge TypeScript checks and the
production build pass. The additive SQL migration has static contract coverage;
it has not been executed against PostgreSQL or deployed.

### 7. Imperial Court cost and Ge Glaze substitution

On 2026-09-28, the owner explicitly approved both mechanical changes:

- **Imperial Court costs 5 Coins** for either worker type. It still advances
  Recognition by one only from 0, 1 or 2, with the normal milestone reward.
- **Ge Crackle substitutes any one Glaze when completing an Order**, replacing
  the previous Decoration substitution. Each marked ceramic chooses its own
  virtual Glaze and uses that choice consistently across every requirement on
  that Order. Actual Glaze, Decoration and Quality remain unchanged by the
  substitution. Crackle cannot satisfy a different Decoration requirement;
  Exhibition Glaze diversity continues to use actual Glazes.

Ge still changes one owned Standard ceramic from the current firing into Fine
and adds permanent Crackle once per round. The owner-chosen after-Quality order,
revalidation after each use, and permanent marker duration are unchanged.

The checked-in authority, current component reminders and bilingual data reflect
this amendment. The original external rulebook remains unchanged. Behavior
revision 25 and the prepared additive migration
`202609280001_v14_court_ge_amendment.sql` distinguish new games from revision 24
and earlier rooms; saved game state remains schema 5. The migration updates the
five authoritative RPC write gates. It has not been applied or deployed.

Validation: all 775 tests pass, including five-Coin payment and affordability for
both worker types, independent and consistent Crackle Glaze choices, unchanged
Exhibition attributes, computer decisions, bilingual UI and old-room rejection.
The production build and Edge TypeScript checks pass. The new SQL migration has
static contract coverage and has not been executed against PostgreSQL.

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
- Starting Orders are unchanged from the current eight-card deck. Thirty-nine
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
   resolve Ge with the other after-Quality effects in the owner's chosen order,
   rechecking eligibility after each use; expose Fuel Ledger's reusable
   −2/+2 cards as single secret contribution choices costing 2 Wood.
5. **Orders:** import all 48 Main Orders; represent non-Plain alternatives and
   same-non-Plain constraints; allow an independent, consistent virtual
   Glaze for every Crackle ceramic on every Order, as amended in finding 7.
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
- Added explicit optional acquisition for Colour Samples and optional Ru/Guan bonuses. Ge now shares the owner-ordered after-Quality window with Protective Saggars and Second Firing; after every use, all unused effects are reconsidered against current eligibility and limits.
- `npm test`: 653 tests pass across 45 suites after the owner-approved timing amendment, including 13 focused after-Quality engine regressions plus UI, computer-player and compatibility checks.
- `npm run typecheck`, `npm run typecheck:edge` and `npm run build`: pass.
- Seeded computer games complete all five rounds for 2, 3 and 4 players without fallback commands.
- Browser smoke: four-player setup, Apprentice Plain formation, Shifu free Painted Decoration, 1-Coin White Glaze & Load into Low 3, Kiln Tending resource choice, Chinese locale and reconnect passed. The expected Clay 1 / Wood 3 / Coins 3 remained after reconnect.
- Desktop and narrow-screen kiln screenshots were reviewed under `output/playwright/` (local validation artifacts, not deployment assets).
- The initial original and checked-in corrected sources had the identical initial corrected SHA-256 shown above. Finding 5 records the later owner amendment separately.

The SQL migrations have static contract coverage but were not applied to a local or live PostgreSQL database; no PostgreSQL/Supabase CLI was available in this environment. See [Deployment](./DEPLOYMENT.md#v14-rollout) for rollout order. No V1.4 live deployment is implied by these checks.

## Owner-approved component reminders — 2026-09-27

The owner supplied new on-tile wording for all 19 Techs and five Kiln Traditions.
The exact English reminders and emphasis are recorded in
[KILN_OPENING_v1.4_COMPONENT_TEXT_SOURCE.md](./KILN_OPENING_v1.4_COMPONENT_TEXT_SOURCE.md),
with corresponding Chinese UI translations. All tile contexts share these reminders;
click-through details continue to use the complete structured V1.4 abilities.

The supplied Ge reminder initially said “after your other after-Quality abilities.”
The owner confirmed that the existing player-chosen order remains in effect, so its
reminder instead says “after Quality is assigned.” Current Quality, eligibility,
costs and usage limits are rechecked after each use. This reminder update does not
change mechanics, balance values or the previously approved timing amendment.

The owner subsequently shortened the 15 Advanced Tech reminders and removed their
inline emphasis and repeated “once per round” wording. The tile footer retains
frequency; click-through details retain the full rules. This includes the workshop
restriction on Measuring Calipers and Standardised Moulds, Glaze Palette’s timing
before pre-firing abilities, and Fuel Ledger’s single-card limit and card return.
The four Starting Tech and five Kiln reminders remain as approved above.
