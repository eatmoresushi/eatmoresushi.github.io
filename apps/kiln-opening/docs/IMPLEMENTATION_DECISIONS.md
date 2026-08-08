# IMPLEMENTATION_DECISIONS.md

These are the intended digital interpretations of current V0.6.3 wording.

## Orders

- Order matching is permutation-independent. For a multi-ceramic Order, the engine must find a valid assignment of selected ceramics to requirement slots; the UI selection order does not matter.

- Shifu `take up to 2 Orders` may choose Market, Imperial, or one of each.
- Refill after first take before choosing second.
- Orders in hand are public because the tabletop rule defines Orders as open information.
- Player may stop after first Order.
- Completing multiple Orders in Order Phase is sequential and fully resolved one at a time.

## Passing

A player may pass with workers still unused. Passing is permanent for the phase.

## Resource actions

If common supply is short, player receives only what remains.

Office Flawed sales are an exchange exception: an accepted sale must pay exactly 1 Coin per ceramic. The server rejects a sale selection that exceeds the Coins remaining in the common supply, and the UI limits selection accordingly.

Materials Yard requires the chosen Clay/Wood amounts to total exactly 3 for an Apprentice or exactly 4 for the Shifu. If the common supply is short, the player receives only the requested resources that remain.

## Market & Imperial Office

- Resolve each visit as a main action followed by an explicit optional Flawed-sale step.
- Selling is never a standalone main action. Submitting an empty sale selection ends the visit without selling.
- Apprentice sale limit is 1; Shifu sale limit is 2, regardless of which valid main action was chosen.
- Order display refill, hand-limit checks, and Colour Samples resolve before the optional sale step.

## Kiln Yard

Kiln Yard never grants Wood. Placing a worker requires loading at least one owned Glazed ceramic into an empty kiln space. An Apprentice loads exactly 1; the Shifu loads 1 or 2.

Shifu does not reposition.

## Ding

Ding's extra vessel costs the normal Clay cost.

It can trigger from either ceramic formed by a Shifu action, but only once per round.

Clay Substitution may pay for Ding's additional vessel.

## Ge

Changing Decoration to Crackle costs no Coins and gives no refund for a previously paid Decoration.

Ge's chosen ceramic must naturally be Heat Difference 1 at the time Ge resolves.

## Jun

Jun changes Actual Heat by exactly +1 or -1, then Heat Difference is recalculated.

## Fuel Ledger

Initial selected contribution is spent on reveal.

To use Fuel Ledger, player must still own 1 additional Wood and 1 Coin.

Effective contribution can exceed 3.

Contributor count does not change.

## Test Pieces

Engine must snapshot each ceramic's **natural exact-match status** immediately after initial Actual Heat calculation and before Jun/Ge/other modifications.

Test Pieces checks that snapshot.

## Ru

Ru checks final produced ceramic state after all Quality-changing effects.

If Ge changed a ceramic's Decoration from Plain to Crackle, it no longer satisfies Ru via Plain.

## Presentation

Flawed is not eligible.

No negative VP for zero presentation.

Presentation ceramics remain separate from Order-delivered ceramics.

## Round 5 Cleanup

Perform Cleanup as written before final scoring even though Order cycling/First Player passing has no strategic effect afterward. This keeps phase flow deterministic.

## Imperial Progress

Each completed single-ceramic Imperial Order advances its owner one space; each multi-ceramic Imperial Order advances two spaces. Repeated completions in the same round remain legal. Progress advancement resolves immediately and sequentially, and the engine checks every crossed milestone so a two-space jump cannot skip the Apprentice rewards at 2/4 or the Imperial Audience and Seal at 5. Progress remains capped at 5. No per-round advancement flag is stored.

## Technique deck edge case

If a discipline draw deck is empty, its display simply contains fewer than 2 tiles.

If Shifu refreshes a face-up tile while no other tile exists in that discipline deck, putting it on the bottom and revealing from the same deck may return the same tile. This is legal and has no useful effect.
