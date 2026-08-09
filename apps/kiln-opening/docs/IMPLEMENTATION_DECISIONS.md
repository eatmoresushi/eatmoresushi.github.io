# IMPLEMENTATION_DECISIONS.md

These are the intended digital interpretations of current V0.6.5 wording.

## Orders

- Order matching is permutation-independent. For a multi-ceramic Order, the engine must find a valid assignment of selected ceramics to requirement slots; the UI selection order does not matter.

- Shifu `take up to 2 Orders` chooses Market/Imperial and face-up/blind separately for each acquisition.
- Refill after a face-up take before choosing second; a blind draw leaves the display unchanged.
- The server resolves a blind draw from the actual deck top and accepts no client-supplied card ID.
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
- Check hand limit before each individual face-up or blind acquisition.
- Colour Samples is an explicit choice before the first acquisition. It can bottom a face-up card from either display, never a blind top card, and the target goes to its deck bottom rather than a discard pile.
- Court Patronage is a mutually exclusive Shifu main action. Eligibility is derived from authoritative completed Imperial Order history; it has no Colour Samples or Flawed-sale step.

## Guild & Academy

An Apprentice enters the buy step directly and pays printed cost. A Shifu first receives the optional one-tile, same-discipline refresh step and then pays printed cost minus 1, minimum 1. Capacity is 1/2/3 at 2/3/4 players.

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

Court Patronage reuses the milestone resolver but is validated only from spaces 0–3 and never invokes Seal claiming. Its permanent eligibility gate is derived from `completedOrders` entries whose stable Order ID begins with `I`; holdings and Market completions do not qualify.

## Technique deck edge case

If a discipline draw deck is empty, its display simply contains fewer than 2 tiles.

If Shifu refreshes a face-up tile while no other tile exists in that discipline deck, putting it on the bottom and revealing from the same deck may return the same tile. This is legal and has no useful effect. The same deterministic edge-case rule applies to Colour Samples.

## Saved-game compatibility

V0.6.5 does not add a duplicate Patronage-unlock flag: authoritative `completedOrders` history already persists and reconnects, so eligibility is derived faithfully from Imperial Order IDs. Unstarted lobbies are migrated to V0.6.5. Started pre-V0.6.5 rooms are rejected with a clear incompatibility message because an unresolved old Office/Colour Samples or Academy phase cannot be translated without changing a player's available decision.
