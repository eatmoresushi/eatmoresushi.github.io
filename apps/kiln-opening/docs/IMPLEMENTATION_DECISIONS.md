# IMPLEMENTATION_DECISIONS.md — V1.2.7

These are digital-flow decisions and implementation notes only. `docs/KILN_OPENING_v1.2.7_EN_SOURCE.md` is authoritative for mechanics, subject to explicit owner amendments recorded in `docs/RULEBOOK_AUDIT_V1.2.7.md`. `docs/KILN_OPENING_v1.2.6_ZH_SOURCE.md` supplies established Chinese terminology; new wording is translated from V1.2.7 and those amendments. Source checksums and the owner's adopted clarifications and amendments are recorded in the audit.

## Setup and shared action locations

- Every player begins with 1 Shifu and 3 Apprentices. There is no worker-unlock mechanic.
- Clay, Wood and Coins have unlimited shared supplies. State and multiplayer snapshots track only each workshop's owned amounts; physical component quantities never cap gains or playtest reports. Players still pay costs from their own resources.
- All eight worker-placement locations are shared. Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy have one global printed capacity of 2 / 3 / 4 at 2 / 3 / 4 players. Kiln Yard, Labour and Court Patronage are uncapped.
- An Apprentice requires an unoccupied printed space. A Shifu obeys the same action-legality rules but may overfill a location after its printed spaces are occupied; multiple Shifu may overfill the same location.
- A player may visit the same location more than once with different workers while legal space remains. Occupancy by that player or an opponent at another space does not prevent placement.
- Potter's Wheel and Glaze & Decoration are not private stations. Advanced Tech acquisition never creates or unlocks a worker space.
- Starting Tech choices are public. One Starting Order and one Main Order are dealt secretly; hand counts are public.
- The Starting deck contains eight distinct cards, S01–S08, following the owner's 2026-09-20 amendment. Starting Orders remain distinct from the Main deck but are real held Orders for completion and the three-card Cleanup hand limit.
- Vessel cards are represented by stable ceramic instances. When all ten physical cards of a Shape are in use, the engine creates a same-Shape proxy instead of rejecting a legal form action.

## Orders and Advanced Tech acquisition

- The Main Order market is one six-card ordered queue, oldest on the left and newest on the right. Removing a face-up Order slides every later card left and appends the replacement at the right; it never refills in place.
- At the start of Rounds 2–5, discard the two leftmost displayed Main Orders, retain and slide the other four left, then append two new Orders at the right.
- Each Commission reservation independently takes either a face-up Order or the unseen top Main Order. Face-up removal advances the queue; a blind deck reservation leaves the display unchanged. After **each** reservation, the acting player chooses and gains 1 Clay, 1 Wood or 1 Coin. A Shifu fully resolves the first reservation and sees its updated display before choosing a second, and may stop after completing the first reservation and its advance.
- Colour Samples privately inspects the top three Main Orders. One inspected card or one face-up card may be reserved; inspected cards not taken are discarded without leaking their identities. Reserving an inspected card leaves the display unchanged; reserving a face-up card advances the queue.
- A Guild Shifu privately inspects the top two remaining Techs of one discipline. It may acquire one inspected Tech or any face-up Tech at a 1-Coin discount, minimum 0; unchosen inspected Techs go to the bottom of that discipline's deck.
- Multi-ceramic Shape, Glaze and Decoration requirements are independent unless a card explicitly prints a fixed pairing. Selection order never changes validity.
- Ge treats owned Standard-quality Crackle ceramics as Fine for Order requirements and Exhibition scoring, without changing their recorded Quality. Once per round, one Crackle ceramic used for an Order may take one virtual Decoration for all that Order's Decoration requirements; its actual Decoration remains Crackle, so the Quality treatment still applies. Firing, including Second Firing eligibility, uses actual Quality.
- In the Order Phase, opportunities proceed in reverse Work order. Each opportunity completes at most one Order or passes. Continue circuits until one complete circuit contains no completion.
- The Order panel lists only Orders for which the active player has at least one legal group of Finished ceramics. After an explicit pass, the online flow remembers the legal choices that player declined: later unchanged or impossible opportunities are skipped administratively, but a newly displayed Main Order that the player can complete prompts them again. A new legal decision is never skipped, and the phase still ends only after a full circuit without a completion.
- Completing a public Main Order removes it, slides every later displayed Order left and appends its replacement at the right. Completing a held Starting or Main Order removes it from the player's hand without moving the display.
- Cleanup enforces one combined maximum of three held Starting and reserved Main Orders.

## Techs and production effects

- A Tech effect is not a worker action and does not trigger effects requiring that worker action unless its text explicitly says so.
- The Advanced-Tech limit is two; Starting Tech does not count toward it. Every owned Advanced Tech scores 1 VP at game end.
- Once-per-round Tech use is stored independently per Tech and readied at round start.
- Tech abilities are optional unless explicitly required, and all stated costs are paid. Declining preserves the ability's availability. T01's discount and T02/T03's forming income require explicit selection; only selected income can fund White Slip or Drying Frames. Prepared Clay may also trigger selected T02/T03 rewards. Colour Samples' immediate acquisition selection remains required and does not spend its optional once-per-round Commission effect.
- After loading at least one ceramic during Kiln Yard, Kiln Tending optionally grants either 1 Clay or 1 Wood, never both. The action panel offers Clay, Wood or no use.
- Prepared Clay forms during the Materials Yard action for one more Clay than the chosen Shape's Clay cost.
- White Slip changes one vessel formed during that Potter's Wheel action to White Glaze and Plain Decoration; the player pays the Plain Decoration cost.
- Drying Frames applies any Glaze and any Decoration to one vessel just formed, paying that Decoration's cost.
- Ding's optional additional Bowl, Plate or Brush Washer is outside the worker effect's vessel count and pays its own 1 Clay after the Shifu two-vessel discount is calculated. It remains a vessel formed during the Potter's Wheel action for effects such as Standardised Moulds.
- Reworking Table changes one shaped vessel being glazed to any other Shape without an added Clay payment or refund.
- Fuel Ledger is selected as a secret upgraded contribution, not as a public post-reveal prompt: Bank −2 or Stoke +2 costs 2 Wood total.
- Second Firing resolves in the after-Quality window for one Flawed or Standard ceramic. It reveals an additional Fire card, replaces that ceramic's Quality even if worse, and permits relevant unused once-per-round firing abilities at their normal recalculation timing.

## Firing and hidden information

- Every player's undelivered ceramics and their recorded attributes remain public at every stage: Shaped, Glazed, loaded in either kiln, and Finished (including Flawed). Opponent inspection and reconnect expose the same ceramic details. Held Orders remain secret.
- If no ceramic is loaded in either the Shared Kiln or any Imperial Kiln, skip the complete Firing Phase and reveal no Fire card.
- Test Pieces resolves before Contributions. Contribution choices are private server-side until every eligible contributor submits; public state exposes submission status only.
- A Fuel Ledger submission stores the base Bank/Stoke card and extra-Wood commitment privately. The server validates ownership and 2-Wood affordability both when submitted and atomically when revealed.
- Base Heat starts at 2, applies all final Contribution modifiers, then clamps to 0–5. Global and Actual Heat are not clamped.
- A Kiln Yard Shifu with at least one owned Shared-Kiln ceramic after loading must commit exactly one such ceramic during that Work-Phase action. The target is stored in authoritative state and made public immediately. A Shifu that loads only into the Imperial Kiln while owning no Shared-Kiln ceramic stores no target.
- After Base Heat is fixed and before Fire is revealed, marked Shifu targets resolve in First Player order. The owner may replace their Shifu with a +1 or −1 Heat marker at no Wood cost, or decline. The ceramic stays in its existing Shared-Kiln space. Only that ceramic's Actual Heat changes, in addition to its applicable zone modifier; Base Heat, Global Heat and other ceramics are unaffected. An Imperial Kiln ceramic cannot be marked.
- The Shifu association clears when the player chooses or declines. Removed Shifu remain used until Cleanup. A placed Heat marker retains its chosen value throughout the firing, including Second Firing, and is removed when firing is complete.
- After all Contributions and Kiln Yard Shifu adjustments resolve, the First Player confirms the Fire-card reveal. This is a ceremonial online pacing step with no choice or rules effect; the server still draws the card and calculates all Heat and Quality results.
- The private Imperial Kiln is a one-ceramic space with no zone modifier. It participates in the shared firing and Contribution eligibility but is not a Shared-Kiln space.
- Imperial Priority is a separate once-per-game timing choice before or after its owner's worker action. It loads one unloaded Glazed ceramic into the owner's empty Imperial Kiln and is not part of Kiln Yard's normal load allowance.
- Kiln Furniture sets the chosen ceramic's zone modifier to zero for the current firing, including Second Firing. Its Shifu Heat marker, if any, still applies separately. Return the Furniture tile after firing.
- In a shared timing window, players resolve in First Player order and each player chooses the order of abilities they control.
- The Flawed salvage resolves after all after-Quality effects. Each player may discard at most one ceramic still Flawed from that firing for 2 Coins, returning a physical Vessel card to its Shape supply when applicable.

## Recognition and scoring

- Recognition advances from Crown icons on completed Orders or 4-Coin Court Patronage (only to spaces 1–3), resolves one Crown and every crossed milestone at a time, and caps at 4.
- Recognition 1, **Imperial Grant**, grants either 3 Coins or 1 Clay + 1 Wood + 1 Coin.
- Recognition 2, **Imperial Gift**, grants the Imperial Kiln tile.
- Recognition 3, **Imperial Priority**, grants the once-per-game token described above.
- Recognition 4, **Imperial Audience**, immediately grants 6 VP. Each Crown gained after reaching 4 grants 1 VP immediately, including remaining Crowns on the same multi-Crown Order.
- Guan gains 2 Coins and 1 VP once per round on completing an Order showing at least 1 Crown. It exempts no ceramic from a printed requirement.
- Exhibition accepts any number of Standard-or-better undelivered ceramics. Each +3 VP diversity bonus checks the entire collection independently.
- Leftover Coins score 1 VP per 3 Coins, capped at 5 VP. Clay and Wood do not score.

## Localization

English and Simplified Chinese UI text are presentation layers over identical stable Order, Tech, Kiln, location, milestone, action, error and event IDs. Locale changes never mutate authoritative state. Use the Chinese source's established game terms rather than independently retranslating the English text.

## Saved-game compatibility

V1.2.7 changes setup, hidden hands, Ge, Tech effects, the Main display, Court Patronage and Exhibition. New rooms use schema 4 and the V1.2.7 rules fingerprint (behaviour revision 21, including the owner's Ge, eight-card Starting Order, optional-Tech, Shifu Glaze and Shifu Heat-marker amendments). The Starting Order amendment changes the meanings of S04–S08 and removes S09–S16; revision 19 makes forming income optional and Kiln Tending a single-resource choice. Revision 20 replaces the Shifu's free Decoration with a total 1-Coin discount only when glazing two vessels; optional Decoration waivers apply first, and the total cost cannot fall below zero. Revision 21 replaces Kiln Yard Shifu movement with a fixed +1 or −1 Actual Heat marker on the ceramic marked during the Work action. The live service rejects started rooms, snapshots and commands with an older rules version, schema or fingerprint rather than reinterpreting their rules.

## V1.2.7 details

See [the adoption audit](./RULEBOOK_AUDIT_V1.2.7.md) for all mechanical changes. Glaze Palette options travel with a load command; Colour Samples acquisition uses an explicit `onAcquisition` decision flag and no resource-advance step. Public state redacts hand IDs and passed Order-choice metadata; private seat responses supply only that seat’s hand.
