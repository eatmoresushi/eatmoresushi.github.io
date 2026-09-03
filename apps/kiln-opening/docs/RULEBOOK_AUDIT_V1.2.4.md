# KILN OPENING V1.2.4 rulebook audit

## Authority

The sole gameplay source is [KILN_OPENING_v1.2.4_SOURCE.md](./KILN_OPENING_v1.2.4_SOURCE.md), an exact copy of the owner-supplied `KILN OPENING 开窑 v1.2.4.md` (SHA-256 `95ecf7625ab93c5ca98c32a6db61e02f071036e4c48921afda471f919a112dd9`). Nothing in V1.2.2 survives merely because it was implemented; where the two differ, V1.2.4 wins.

## Contradictions the V1.2.2 audit recorded, now resolved upstream

V1.2.4 fixes, in its own text, every internal conflict the V1.2.2 audit had to rule on:

- §8's Recognition-4 heat adjustment is gone; Imperial Priority is an extra Imperial Kiln load in §8, §9 and Appendix E alike.
- §6 no longer describes Second Firing as returning a ceramic to Glazed; Appendix B resolves it immediately.
- The Kiln Yard Shifu reposition is stated once, consistently, as an end-of-Work-Phase step in §5, Appendix D and Appendix E.
- The contents list matches the file: Appendices A–E, with no phantom Appendix F.

No owner ruling was required to implement V1.2.4.

## Terminology deviations from the supplied source

The owner's V1.2.4 brief mandates a terminology cleanup that the supplied Markdown does not yet apply to itself. Where the two disagree, the online version follows the brief and the adopted source file is left byte-identical to what was supplied:

1. **Order requirements.** Appendix A's tables head their requirement column **Commission**. The brief reserves "Commission" for the Commission Market location and requires **Requirements** for what an Order asks for. The `data/orders.json` field and every UI heading use `requirements` / `requirementsZh`.
2. **Reservation advance.** §5 calls the Clay/Wood/Coin gained from reserving an "immediate commission advance". The brief requires **reservation advance**, which is what the interface shows.

Both deviations are presentational. No number, cost, timing window or legality changes.

## Implementation notes where the source is terse

- **Kiln Yard, Apprentice — "Load 1."** Taken verbatim. "Load" is defined in §1 Key Terms as placing into an empty active Shared Kiln space or an empty gained Imperial Kiln, so the short board text is complete as printed.
- **Guild & Academy placement legality.** §5 states that placement is legal "only if you can afford at least one currently face-up Tech after the discount". This is enforced as written, even though a Shifu may later buy an inspected tile instead; affordability is judged against the display alone.
- **Colour Samples and the blind reservation.** A Commission Market reservation may take a face-up Order or the top card unseen. Colour Samples replaces one such reservation, so a reservation it modifies is neither a plain face-up take nor a blind take.
- **Vessel cards are not a limit.** §6 and §12 say to proxy when all ten of a Shape are in use. The engine holds a finite supply of 10 per Shape and reports `SUPPLY_EMPTY`; a digital table has no proxy to reach for.

## Rules changed from V1.2.2 that the engine enforces

Guan pays 2 Coins **and 1 VP** and waives no Decoration requirement; Ding's additional vessel costs **no Clay**; the Guild Shifu **inspects the top 2** of one discipline and may buy any face-up tile at −1; the Kiln Yard Shifu repositions **at the end of the Work Phase**; a reservation may take the **top Main Order unseen**; Colour Samples is **once per round** and **discards** what it did not reserve; Test Pieces is **once per round** and requires a participating ceramic; Measuring Calipers and Standardised Moulds pay **2 Coins**; the Exhibition diversity bonuses are **+3/+3**; S16 pays **4 Coins**; there are **50 Vessel cards**, ten of each Shape.

`RULES_BEHAVIOUR_REVISION` is 12. A V1.2.2 room is refused rather than reinterpreted.

Older V1.1.6 and V1.2.2 documents, experiments, assets and saved games cannot override V1.2.4.
