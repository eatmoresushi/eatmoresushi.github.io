# IMPLEMENTATION_DECISIONS.md — V1.2.2

These are digital interpretations only. The sole rules authority is `docs/KILN_OPENING_v1.2.2_SOURCE.md`; source conflicts and owner rulings are recorded in `docs/RULEBOOK_AUDIT_V1.2.2.md`.

## Setup and private workshop

- Every player begins with 1 Shifu and 3 Apprentices. V1.2.2 has no worker-unlock mechanic.
- Each player begins with one open and one locked Potter's Wheel space and one open and one locked Glaze & Decoration space.
- Acquiring the first Advanced Tech unlocks either one of the two locked private spaces, chosen by that player. Acquiring the second unlocks the remaining space.
- Starting Tech choices and retained Starting Orders become public after simultaneous setup choices resolve.
- Starting Orders remain distinct from the Main deck but are real held Orders for completion and the three-card Cleanup hand limit.

## Orders

- The Main Order market is one five-card ordered display. Empty positions refill immediately without changing the relative order of cards that remain.
- At the start of Rounds 2–5, discard the three leftmost displayed Main Orders, slide the other two left, then refill to five.
- Commission reservations take a face-up Order. A Shifu may reserve up to two with an immediate refill between them, but the resource advance is granted only once for the action.
- Colour Samples privately inspects the top three Main Orders. Reserving one replaces a face-up reservation; unchosen cards return to the bottom in the player's chosen order without leaking their identities.
- Multi-ceramic Shape, Glaze and Decoration requirements are independent unless a card explicitly prints a fixed pairing. Selection order never changes validity.
- In the Order Phase, opportunities proceed in reverse Work order. Each opportunity completes at most one Order or passes. Continue circuits until one complete circuit contains no completion.
- Completing a public Main Order removes and immediately refills that display slot. Completing a held Starting or Main Order removes it from the player's hand.
- Cleanup enforces one combined maximum of three held Starting and reserved Main Orders.

## Workshop actions and Techs

- A Tech effect is not a worker action and does not trigger effects requiring that worker action unless its text explicitly says so.
- The Advanced-Tech limit is two; Starting Tech does not count toward it.
- Once-per-round Tech use is stored independently per Tech and readied at round start.
- Drying Frames' follow-up glaze pays the normal Plain Decoration cost.
- Reworking Table pays only added Clay when changing Shape and never refunds Clay.
- Fuel Ledger is selected as a secret upgraded contribution, not as a public post-reveal prompt: Bank −2 or Stoke +2 costs 2 Wood total.
- Second Firing resolves immediately after Quality by revealing one additional Fire card for the selected ceramic only. Its replacement Quality is final for that firing.

## Firing and hidden information

- Contribution choices are private server-side until every eligible contributor submits. Public state exposes submission status only.
- A Fuel Ledger submission stores the base Bank/Stoke card and extra-Wood commitment privately. The server validates ownership and 2-Wood affordability both when submitted and atomically when revealed.
- Base Heat starts at 2, applies all final contribution modifiers, then clamps to 0–5. Global and Actual Heat are not clamped.
- The private Imperial Kiln is a one-ceramic space with no zone modifier. It participates in the shared firing and Contribution eligibility but is not a Shared-Kiln space.
- Imperial Priority adds one load to a Kiln Yard action, and that additional ceramic must enter the owner's empty Imperial Kiln. It has no heat-adjustment effect.
- Kiln Furniture's zero-zone choice stays attached to that ceramic for the current firing, including an immediate Second Firing.
- Workshop Seconds resolves after after-Quality effects and firing resolution. Each player may discard at most one remaining Flawed ceramic for 2 Coins.

## Guan Decoration waiver

When Guan resolves on a Crown Order, the player explicitly selects at most one submitted ceramic for the waiver. That ceramic is omitted from direct and relational Decoration checks. Relational checks continue among all other submitted ceramics. Shape, Glaze, Quality, ceramic count and every non-Decoration requirement are still validated normally.

## Recognition and scoring

- Recognition advances only from Crown icons on completed Orders, resolves every crossed milestone in ascending order, and caps at 5.
- Recognition 3, **Imperial Gift**, unlocks the private Imperial Kiln.
- Recognition 4, **Imperial Priority**, grants one once-per-game token with the additional-load effect above.
- Recognition 5, **Imperial Audience**, immediately grants 6 VP. Spaces 1–4 have no separate end-game VP.
- Exhibition accepts up to five finished, undelivered Standard-or-better ceramics. When at least three are exhibited, exactly three are the featured collection for Shape and Glaze diversity.
- Leftover Coins score 1 VP per 3 Coins, capped at 5 VP.

## Localization

English and Simplified Chinese UI text are presentation layers over identical stable Order, Tech, Kiln, location, milestone, action, error and event IDs. Locale changes never mutate authoritative state.

## Saved-game compatibility

V1.2.2 introduces incompatible setup, deck, worker, Tech, Recognition, kiln and timing state. New rooms use the V1.2.2 save schema and rules fingerprint. The live service rejects started rooms, snapshots and commands with an older rules version, schema or fingerprint rather than attempting an unsafe translation.
