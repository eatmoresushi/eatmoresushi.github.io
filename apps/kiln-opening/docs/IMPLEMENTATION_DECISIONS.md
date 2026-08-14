# IMPLEMENTATION_DECISIONS.md

These are the intended digital interpretations of current V1.0.9 wording.

## Orders and private setup

- Multi-ceramic matching is permutation-independent; UI selection order never changes validity.
- Opening offers are private. Each player selects exactly two of their 2 Market + 2 Imperial offers. Kept Orders become public only after every player submits; returned cards are shuffled into the matching decks first.
- A normal Shifu Office action may take up to 2 Orders. Each take independently selects Market/Imperial and face-up/blind, with immediate display refill between takes.
- A blind draw always uses the authoritative deck top; clients never submit the drawn ID.
- There is no mid-round hand-limit check. Cleanup explicitly prompts players over 3 Orders, or over 4 with Guan, to discard chosen cards face up.
- When an Order draw deck empties, its discard is deterministically reshuffled with the action RNG. If neither cards nor discard remain, the draw is unavailable.
- Completing multiple Orders is sequential. Printed Imperial `progress` is applied after each completion.

## Resource actions

- Materials gains must request exactly 3 resources for an Apprentice or 4 for a Shifu. A short common supply pays only what remains.
- The Shifu Materials exchange occurs after the gain and may make any number of 1:1 Clay/Wood swaps, limited by player holdings and supply.
- Exact sales are exchange exceptions: the common supply must contain the full Coin reward.

## Forming and glazing

- Shifu Vases and Censers cost 1 Clay only for vessels formed by that action.
- Clay Substitution can replace any number of Clay payments in one action and is not exhausted.
- Ding's matching extra vessel is free and still consumes a Vessel card from supply.
- Drying Frames is selected per newly formed vessel and immediately assigns a Glaze plus Plain at no Coin cost.
- A Shifu Glaze action may process up to two ceramics and marks one selected Decoration as free; this is one merged effect, not alternate branches.

## Office

- A visit is a main action followed by the normal optional Flawed sale.
- Apprentice sale limit is 1 and Shifu limit is 2.
- Court Patronage is a mutually exclusive Shifu main action. It requires a completed Imperial Order, costs 5 Coins, draws authoritatively, and cannot advance Progress from 4 to 5.
- Colour Samples follows a normal Order take. Its top-two choice is private; the selected card enters the hand and the other moves to the bottom.
- Connoisseur Network follows the normal visit but not Court Patronage. It pays exactly 2/4/7 Coins for Standard/Fine/Masterpiece.

## Guild & Academy

An Apprentice pays printed cost. A Shifu may refresh one tile, then buys at printed cost minus 1 with minimum 0. Empty discipline decks may leave displays short; a refresh can legally reveal the same tile if it is the only card.

## Kiln Yard and repositioning

- At least one ceramic must be loaded. Apprentice loads exactly 1; Shifu loads 1 or 2.
- Gain 1 Wood per ceramic actually loaded, subject to finite supply.
- A Shifu placed here records the ceramic IDs loaded by that action. After Base Heat and before Fire reveal, the owner may move one of those ceramics to a different legal empty active space or decline.

## Secret firing information

- Wood amount and Fuel Ledger choice are one private submission. Fuel Ledger is validated before acceptance but resources are paid only in the atomic reveal transition.
- Public pending state identifies who submitted, never amount or Fuel choice. The final reveal exposes effective contributions.
- Test Pieces records the top Fire modifier in server-private state and returns it to the same top position. It is delivered only to the owning authenticated player and never to public state/events.
- The Fire discard is reshuffled only when a draw is required and the draw deck is empty.

## Heat effects

- Sagger Selection changes only the chosen ceramic's applied Fire modifier; the revealed card and public firing context remain unchanged.
- Ge changes Actual Heat to Preferred Heat, then changes Decoration to Crackle, without Coin cost or refund.
- Jun pays exactly 2 Coins and adjusts one own Actual Heat by exactly ±1.
- Protective Saggars resolves before Second Firing. A ceramic returned by Second Firing is removed from the current results and cannot count for after-firing rewards.
- Kiln Records checks final remaining results and pays up to 1 Clay and 2 Coins from the supply.

## Traditions and scoring

- Ru is checked only while delivering a ceramic. Once per round, a delivered Celadon + Plain Masterpiece grants 4 VP.
- Guan's 2-Coin Imperial-completion reward is independent from its Decoration waiver. Either can trigger without the other.
- Every owned Technique adds 1 VP to the final breakdown.
- Exhibition ceramics stay distinct from Order-delivered ceramics. Serialized action names retain legacy `presentation` wording for replay compatibility; player-facing text says End-game Exhibition / 终局展陈.

## Progress and Round 5

- Imperial Progress uses the completed card's printed +1/+2/+3 value and checks every crossed milestone. It is capped at 5.
- Court Patronage uses the same milestone resolver but cannot reach 5.
- Cleanup after Round 5 still resolves fully. Each pending Apprentice unlock becomes 3 Coins instead of adding a usable worker.

## Saved-game compatibility

New rooms use V1.0.9. Historical version tags remain readable for archived local AI evidence, but the live service rejects started rooms from older rules because their hidden offers, decks, kiln layout, firing windows, and scoring cannot be translated safely. Lobby-only rooms may be recreated under V1.0.9.
