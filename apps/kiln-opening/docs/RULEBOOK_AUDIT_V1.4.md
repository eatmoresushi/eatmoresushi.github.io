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
- Current status: unchanged source snapshot; proposed corrections below await owner approval.

The runtime still implements V1.2.7. Do not treat this review or the new source
snapshot as evidence that the migration has been completed.

## Review findings

### 1. Contradictory four-player kiln count

Source line 851 says `3 / 2 / 2` in the change summary. Components (line 44),
Setup (line 75), and Quick Reference (line 822) all specify 3 High, 2 Middle,
3 Low: eight spaces.

Proposed correction: change the summary to `3 / 2 / 3`. No other capacity value
needs changing. Owner approval is pending.

### 2. Exhausted Main Order supply

Lines 108–110, 351, 403 and 430 require display refills. Line 579 explains
reshuffling the discard pile, but does not cover an empty deck and empty discard
pile when remaining cards are held, completed, displayed or being inspected.

Proposed clarification: refill or inspect only as many cards as are available;
leave unavailable display positions empty. Every reservation must actually take
a card, and a blind reservation needs a card in the deck after any reshuffle.
This is an edge-case clarification, not an Order reward or balance change.
Owner approval is pending.

### 3. Craft Academy inspection and return order

Line 270 first says to look at Techs and then calls them revealed. It does not
expressly say who may see them or determine the bottom order of unchosen Techs.

Proposed clarification: inspection is private to the acting player, who chooses
the order of inspected Techs returned to the bottom. Private inspection preserves
the established digital interpretation; selection of the return order must be
represented explicitly if approved. Owner approval is pending.

### 4. Jun during Second Firing

Line 731 allows unused Jun during the repeated Heat-adjustment window, while
line 544 names any owned ceramic. Lines 711 and 763 restrict Second Firing's
recalculation to its selected ceramic.

Proposed clarification: during Second Firing, Jun may affect only the ceramic
being recalculated. The current engine already enforces this interpretation.
Owner approval is pending.

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

Implementation is on hold until the owner answers the source-correction questions.
