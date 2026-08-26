# IMPLEMENTATION_DECISIONS.md — V1.1.6

These are digital interpretations only. The sole rules authority is `docs/KILN_OPENING_v1.1.6_SOURCE.md`; the source-audit resolutions are in `docs/RULEBOOK_AUDIT_V1.1.6.md`.

## Orders and private setup

- Multi-ceramic matching is permutation-independent; UI selection order never changes validity.
- Opening offers are private. Each player chooses exactly two of their 2 Market + 2 Imperial offers. Kept Orders become public only after every player submits; returned cards are shuffled into their matching decks first.
- A normal Shifu Office action may take up to 2 Orders. Each take independently selects Market/Imperial and face-up/blind, with immediate display refill between takes.
- A blind draw always uses the authoritative deck top; clients never submit the drawn ID.
- There is no mid-round hand-limit check. Cleanup prompts players over 3 Orders to discard chosen cards face up. The limit is 3 for every Tradition.
- Completing multiple Orders is sequential. Imperial Progress equals the completed Imperial Order's required ceramic count.

## Resources, forming, and glazing

- Material gains request exactly 3 resources for an Apprentice or 4 for a Shifu. The Shifu may then exchange Clay and Wood 1:1.
- Clay Substitution is a free once-per-round command on the owner's Work turn. It does not consume a worker or end the turn. The same effect has an explicit pre-Contribution firing window.
- Large Throwing Wheel reduces one selected Vase/Censer's action cost to zero before payment; it is not implemented as a supply refund.
- Measuring Calipers tracks distinct Shapes formed across the whole round and resolves automatically when the second different Shape is formed.
- Ding's extra matching Bowl/Plate/Washer does not count against the action limit but pays its normal Clay cost.
- Drying Frames records the creation round and refuses loading until the following round. A later Glaze Workshop action can change only that ceramic's Decoration; its Glaze remains fixed.
- Carving Knives and Seal Stamps waive every matching Decoration cost as passive effects, even after their separate once-per-round re-decoration effect has been used.

## Office and Court Patronage

- A normal Office visit is followed by the optional Flawed sale: Apprentice 0–1 and Shifu 0–2, at 2 Coins each.
- Court Patronage is its own uncapped Shifu-only worker location, not an Office mode. It requires a completed Imperial Order, costs 4 Coins, advances Progress by exactly 1 only from spaces 0–3, and grants neither Colour Samples nor a Flawed sale.
- Colour Samples' two looked-at cards are private. The player may instead take a face-up card from either display; every unchosen looked-at card goes to the bottom, and its ID is omitted from public events. If a Shifu skips the Technique before the first acquisition, it is offered again before the second.
- Connoisseur Network follows a normal Office action, including one whose Flawed-sale step sold nothing. It pays exactly 3/6/10 Coins for Standard/Fine/Masterpiece and cannot follow Court Patronage.

## Firing and hidden information

- Contribution cards are private server-side until all eligible contributors submit. Browser state and public events expose only submission status before reveal.
- Only players with a loaded ceramic contribute, but pre-Contribution Clay Substitution and Test Pieces windows are available to any owner of the relevant ready Technique.
- Fuel Ledger is offered after Contribution reveal only to an owner who revealed Stoke and can pay the additional 1 Wood.
- Kiln Yard grants no Wood. A Shifu placed there may reposition one owned loaded ceramic after Base Heat is known and before the Fire card is revealed. Kiln Setting remains the separate pre-Contribution effect that can move any number one at a time.
- Sagger Selection changes the chosen ceramic's Fire modifier by one step toward zero; the public revealed card remains unchanged.
- Ge costs 1 Wood and accepts Heat Difference 1 or 2. Jun costs 2 Wood. Protective Saggars costs 1 Wood.
- Test Pieces data remains private to its authenticated owner. Kiln Records triggers after resolution if any ceramic owned by that player participated in the firing and gains 1 Wood.

## Progress, Round 5, and scoring

- The track is capped at 5. Apprentice milestones at spaces 1 and 3 queue unlocks for Cleanup. There are no Progress Coin stipends.
- A pending Apprentice unlock in Round 5 Cleanup becomes exactly 1 VP and awards no Coins.
- Every player may exhibit up to 5 Finished, undelivered Standard-or-better ceramics.
- A submission of at least three ceramics must identify exactly three of them as the featured collection. Only those three are checked for the +2 three-Shape and +2 three-Glaze bonuses. Submissions of zero, one, or two have no featured collection.
- Serialized score/action fields retain legacy `presentation` names for replay compatibility; player-facing text says End-game Exhibition / 终局展陈.

## Saved-game compatibility

New rooms use V1.1.6 and rules fingerprint revision 10. Historical version tags remain readable for archived evidence, but the live service rejects started rooms whose version or fingerprint differs because their hidden offers, rule windows, and scoring cannot be translated safely.
