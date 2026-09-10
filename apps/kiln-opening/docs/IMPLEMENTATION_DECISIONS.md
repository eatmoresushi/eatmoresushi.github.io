# IMPLEMENTATION_DECISIONS.md — V1.2.5

These are digital-flow decisions and implementation notes only. `docs/KILN_OPENING_v1.2.5_EN_SOURCE.md` is authoritative for mechanics and `docs/KILN_OPENING_v1.2.5_ZH_SOURCE.md` is authoritative for Simplified Chinese. Source checksums and the owner's shared-location clarification are recorded in `docs/RULEBOOK_AUDIT_V1.2.5.md`.

## Setup and shared action locations

- Every player begins with 1 Shifu and 3 Apprentices. There is no worker-unlock mechanic.
- All seven worker-placement locations are shared. Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy have one global printed capacity of 2 / 3 / 4 at 2 / 3 / 4 players. Kiln Yard and Labour are uncapped.
- An Apprentice requires an unoccupied printed space. A Shifu obeys the same action-legality rules but may overfill a location after its printed spaces are occupied; multiple Shifu may overfill the same location.
- A player may visit the same location more than once with different workers while legal space remains. Occupancy by that player or an opponent at another space does not prevent placement.
- Potter's Wheel and Glaze & Decoration are not private stations. Advanced Tech acquisition never creates or unlocks a worker space.
- Starting Tech choices and retained Starting Orders become public after simultaneous setup choices resolve.
- Starting Orders remain distinct from the Main deck but are real held Orders for completion and the three-card Cleanup hand limit.
- Vessel cards are represented by stable ceramic instances. When all ten physical cards of a Shape are in use, the engine creates a same-Shape proxy instead of rejecting a legal form action.

## Orders and Advanced Tech acquisition

- The Main Order market is one five-card ordered display. Empty positions refill immediately without changing the relative order of cards that remain.
- At the start of Rounds 2–5, discard the three leftmost displayed Main Orders, slide the other two left, then refill to five.
- Each Commission reservation independently takes either a face-up Order with immediate refill or the unseen top Main Order. After **each** reservation, the acting player chooses and gains 1 Clay, 1 Wood or 1 Coin. A Shifu may stop after completing the first reservation and its advance.
- Colour Samples privately inspects the top three Main Orders. One inspected card or one face-up card may be reserved; inspected cards not taken are discarded without leaking their identities.
- A Guild Shifu privately inspects the top two remaining Techs of one discipline. It may acquire one inspected Tech or any face-up Tech at a 1-Coin discount, minimum 0; unchosen inspected Techs go to the bottom of that discipline's deck.
- Multi-ceramic Shape, Glaze and Decoration requirements are independent unless a card explicitly prints a fixed pairing. Selection order never changes validity.
- In the Order Phase, opportunities proceed in reverse Work order. Each opportunity completes at most one Order or passes. Continue circuits until one complete circuit contains no completion.
- Completing a public Main Order removes and immediately refills that display slot. Completing a held Starting or Main Order removes it from the player's hand.
- Cleanup enforces one combined maximum of three held Starting and reserved Main Orders.

## Techs and production effects

- A Tech effect is not a worker action and does not trigger effects requiring that worker action unless its text explicitly says so.
- The Advanced-Tech limit is two; Starting Tech does not count toward it. Every owned Advanced Tech scores 1 VP at game end.
- Once-per-round Tech use is stored independently per Tech and readied at round start.
- Prepared Clay forms during the Materials Yard action for one more Clay than the chosen Shape's normal cost.
- White Slip changes one vessel formed during that Potter's Wheel action to White Glaze and Plain Decoration; the player pays the Plain Decoration cost.
- Drying Frames applies any Glaze and any Decoration to one vessel just formed, paying that Decoration's normal cost.
- Reworking Table changes one shaped vessel being glazed to any other Shape without an added Clay payment or refund.
- Fuel Ledger is selected as a secret upgraded contribution, not as a public post-reveal prompt: Bank −2 or Stoke +2 costs 2 Wood total.
- Second Firing resolves in the after-Quality window for one Flawed or Standard ceramic. It reveals an additional Fire card, replaces that ceramic's Quality even if worse, and permits relevant unused once-per-round firing abilities at their normal recalculation timing.

## Firing and hidden information

- If no ceramic is loaded in either the Shared Kiln or any Imperial Kiln, skip the complete Firing Phase and reveal no Fire card.
- Test Pieces resolves before Contributions. Contribution choices are private server-side until every eligible contributor submits; public state exposes submission status only.
- A Fuel Ledger submission stores the base Bank/Stoke card and extra-Wood commitment privately. The server validates ownership and 2-Wood affordability both when submitted and atomically when revealed.
- Base Heat starts at 2, applies all final Contribution modifiers, then clamps to 0–5. Global and Actual Heat are not clamped.
- After Base Heat is fixed and before Fire is revealed, players who used a Kiln Yard Shifu resolve in First Player order. Each may move one owned Shared-Kiln ceramic to an empty active space in a neighbouring zone only: High ↔ Middle ↔ Low. It cannot move into or out of an Imperial Kiln.
- The private Imperial Kiln is a one-ceramic space with no zone modifier. It participates in the shared firing and Contribution eligibility but is not a Shared-Kiln space.
- Imperial Priority is a separate once-per-game timing choice before or after its owner's worker action. It loads one unloaded Glazed ceramic into the owner's empty Imperial Kiln and is not part of Kiln Yard's normal load allowance.
- Kiln Furniture's zero-zone choice stays attached to that ceramic for the current firing, follows a legal Shifu reposition, and remains applicable to an immediate Second Firing.
- In a shared timing window, players resolve in First Player order and each player chooses the order of abilities they control.
- The Flawed salvage resolves after all after-Quality effects. Each player may discard at most one ceramic still Flawed from that firing for 2 Coins, returning a physical Vessel card to its Shape supply when applicable.

## Recognition and scoring

- Recognition advances only from Crown icons on completed Orders, resolves one Crown and every crossed milestone at a time, and caps at 4.
- Recognition 1, **Imperial Grant**, grants either 3 Coins or 1 Clay + 1 Wood + 1 Coin.
- Recognition 2, **Imperial Gift**, grants the Imperial Kiln tile.
- Recognition 3, **Imperial Priority**, grants the once-per-game token described above.
- Recognition 4, **Imperial Audience**, immediately grants 6 VP. Each Crown gained after reaching 4 grants 1 VP immediately, including remaining Crowns on the same multi-Crown Order.
- Guan gains 2 Coins and 1 VP once per round on completing an Order showing at least 1 Crown. It exempts no ceramic from a printed requirement.
- Exhibition accepts up to five finished, undelivered Standard-or-better ceramics. When at least three are exhibited, exactly three are the featured collection; three different Shapes and three different Glazes each award 3 VP.
- Leftover Coins score 1 VP per 3 Coins, capped at 5 VP. Clay and Wood do not score.

## Localization

English and Simplified Chinese UI text are presentation layers over identical stable Order, Tech, Kiln, location, milestone, action, error and event IDs. Locale changes never mutate authoritative state. Use the Chinese source's established game terms rather than independently retranslating the English text.

## Saved-game compatibility

V1.2.5 changes action-location ownership and occupancy, Tech effects, Recognition, firing timing and scoring state. New rooms use the V1.2.5 save schema and rules fingerprint. The live service rejects started rooms, snapshots and commands with an older rules version, schema or fingerprint rather than attempting an unsafe translation.
