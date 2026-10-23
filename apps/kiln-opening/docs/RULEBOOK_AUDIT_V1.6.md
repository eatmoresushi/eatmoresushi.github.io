# V1.6 rulebook review — open questions before implementation

> **Superseded.** The owner replaced the V1.6 draft with V1.6.1 on 2026-10-14 and approved the suggested answers below. See [RULEBOOK_AUDIT_V1.6.1.md](./RULEBOOK_AUDIT_V1.6.1.md). This file is kept as history.

Review date: 2026-10-14. Branch: `kiln-opening-next-version`, created from
`b4ae59e` (master, V1.4 + amendments, 857 tests passing).

## Status

**Draft, not yet authoritative.** The owner supplied the V1.6 Player Rulebook
(Draft) on 2026-10-14. It is a rework of V1.2.7, not of V1.4. The owner has
announced a revised V1.6 ruleset. Until it arrives, V1.4 remains the active
authority in `AGENTS.md`, and no engine, data or balance change has been made.

- Original: `/Users/luyuan/Documents/kiln board game/v1.6/KILN OPENING 开窑 v1.6 — Player Rulebook (Draft).md`
- Checked-in copy: [KILN_OPENING_v1.6_EN_SOURCE.md](./KILN_OPENING_v1.6_EN_SOURCE.md)
- SHA-256 (original = copy): `8529c0ce9b3c0950f21efeda3b1e0154fe609b8343d0d2a7d049db198ebc25ad`

## Owner instructions received so far

1. **Painted, not Crackle, is the fourth Decoration** (2026-10-14). The draft's
   Crackle-as-Decoration text must not be implemented. These parts of the draft
   depend on Crackle and await the revised ruleset:
   - the Decorations table (lines 328–337) and change 14 (line 24);
   - Ge Kiln, "Crackle Mastery" (lines 463–467, 481, 677, 744). Both the
     Heat-Difference-2 upgrade and the once-per-round Decoration flexibility
     need a new trigger.
   - Decorator's Kit (line 614);
   - S13, O13, O17, O23, O39, O40 and O46;
   - the Grey-Green role text (line 349).

   Existing art already covers Painted: `assets/current_v04/ceramics` has 5
   Shapes × Plain/Carved/Impressed/Painted, tinted by Glaze in code. A separate
   `ceramic-crackle-overlay-v1.webp` exists if Crackle survives as a marking
   rather than a Decoration (as in V1.4).

## Questions for the revised ruleset

Questions were found by six subsystem reviews and one rulebook audit. A second
reviewer then tried to refute each audit finding, which dropped 18 of 31 claims
as already answered by the text. What remains is listed here.

### A. Decisions only the owner can make

| # | Question | Draft lines | Suggested answer |
| --- | --- | --- | --- |
| A1 | Is **Ding** selectable online in V1.6? The draft has 5 Kiln boards; the 2026-10-02 amendment disabled Ding online. | 24, 71, 105, 469–471 | Owner's call. If yes, remove the Ding ban from `AGENTS.md`. |
| A2 | Are V1.6's printed values final, with the V1.4-era amendments **not** reapplied? That covers 2026-09-27 (2 Starting, 0 Main; O01–O03 at 4 VP), 2026-09-28 (Imperial Court 5 Coins; Ge virtual Glaze) and 2026-09-30 (3-Coin Starting Orders; −1 Coin on Commercial Mains). | 97–98, 222–227, 519–603 | Yes: V1.6 values as printed. |
| A3 | **S14 = 3 VP / 3 Coins and S16 = 2 VP / 3 Coins**: intended? The change list says only S10 changed, but the last 16-card deck (V1.2.6) had S14 at 2 VP and S16 at 1 VP / 4 Coins. | 515, 536, 538 | Confirm. |
| A4 | Are **Tech and Kiln abilities optional**, with declining not using the once-per-round allowance? V1.4 said so; the draft dropped the rule. Large Throwing Wheel, Decorator's Kit, Senior Apprentice, Saggars, Second Firing, Kiln Master, Setter's Mark, Ru, Guan and Tribute Ware read as mandatory. | 139, 457, 461, 613–640 | Restore V1.4's optional-abilities rule. Colour Samples' when-acquired reservation stays mandatory. |
| A5 | **Glaze & Load legality** when the only destination is an Inverted Firing stack, and when an empty space carries another player's Setter's Mark. | 63, 179–180, 627–628 | A placement is legal if a Shaped vessel has any legal destination: an unmarked empty space, own empty Imperial Kiln, or an Inverted Firing stack. |
| A6 | Does a **Canal Barge** completion trigger *every* completion effect (Tribute Ware, Ge) or only Ru and Guan as written? | 482, 629, 640, 644 | Every effect. |
| A7 | May an **unused Jun** act during a **Second Firing** recalculation? (V1.4 finding 4 said yes.) | 475, 638, 676 | Keep the V1.4 ruling. |
| A8 | **Inverted Firing + Kiln Furniture**: may the stacked ceramic be placed on one loaded earlier in the same action, and must the existing ceramic also be a Bowl, Plate or Brush Washer? | 626–627 | Any own single ceramic; only the newly loaded one must be a small Shape. |
| A9 | **Glaze & Load Shifu Heat marker**: is placing it mandatory, and may it go on any own loaded ceramic (including one loaded earlier or by Imperial Priority)? | 177, 264 | Optional; any own ceramic in either kiln. |
| A10 | **Imperial Priority**: is it free, and does it also choose the −1/0/+1 Imperial modifier? V1.4 charged 1 Coin. | 56, 286, 290 | Free; yes, choose the modifier. |
| A11 | Is the **Imperial Kiln modifier public** when chosen? | 55, 286, 506 | Public, like every ceramic attribute. |
| A12 | **Senior Apprentice**: does the chosen Shifu effect include the Materials Yard 1-Coin +1 Clay +1 Wood option? | 160, 617, 651 | Yes (the whole Shifu effect). |
| A13 | **Tribute Ware**: is its bonus Crown excluded from Guan's "showing a Crown" and from tie-breaker 2 ("printed Crowns")? | 461, 496, 640 | Excluded from both. |

### B. Clarifications to restore from the V1.4 audit

| # | Clarification | Draft lines |
| --- | --- | --- |
| B1 | **Empty Main Order supply** (V1.4 finding 2): when deck and discard are both empty, leave display positions empty. Every reservation must take an available card. Top-3 looks see "as many as remain". Rotation discards up to 2. | 125–127, 188–194, 509, 624 |
| B2 | **Guild & Academy Shifu inspection** (V1.4 finding 3): private; the acting player privately orders the untaken Techs onto the bottom. Bottom first, then refill. Say "inspected", not "revealed". | 205, 207, 712 |
| B3 | **Hidden Orders**: top-3 looks (Commission Shifu, Colour Samples) are private. The Main Order discard is face down, with only its count public. | 194, 301, 624 |

### C. Editorial fixes (no rule change)

- Line 388 still says Colour Samples can take a face-up Order; in V1.6 it takes from the deck only.
- Line 711 makes the Shifu top-3 selection read as mandatory; line 194 says "may instead".
- Malformed bold markup on lines 167 and 429.
- Components omit the Base Heat track and marker (used by lines 101 and 123).
- Line 647's bury clause can never apply: the 12-card Fire deck is never reshuffled mid-game, and at most 2 cards are drawn per round.

### D. Digital decisions (engineering, recorded for approval)

These need no rule change and will be recorded in `IMPLEMENTATION_DECISIONS.md`:

- **Versioning.** Rules version `1.6`, state schema 6, behaviour revision 29. V1.4 rooms in progress are not migrated: the fingerprint gate rejects them, and new rooms start on V1.6.
- **Stable IDs.** Keep Order IDs S01–S16 and O01–O48 behind the version gate, even though S04–S08 mean something different in V1.4. For Techs, keep T01, T05 and T10–T15 where the tile is the same idea, and give new tiles T16–T25. Retired IDs T02–T04, T06–T09 and ST01–ST04 are never reused.
- **Heat marker.** The +1/−1 face is chosen in the Heat-marker step, in First Player order, as a public sequential decision. Nothing is committed secretly at placement.
- **Test Pieces.** The peeked card is private to its owner. Paying the Wood and burying the card are public.
- **Exhibition.** Automatically exhibit every eligible ceramic. Exhibiting more never loses VP and helps tie-breaker 3.
- **Chinese text.** V1.6 has no Chinese source. New zh names and ability text are translated from English using the V1.2.6/V1.2.7 glossary and flagged for owner approval.

## Where V1.6 conflicts with `AGENTS.md`

Once the revised V1.6 is confirmed as the authority, `AGENTS.md` must be rewritten:

- **Sources of truth:** point to V1.6 and this audit.
- **Amendment paragraph:** replace the V1.4 amendment history.
- **Required-tests list:** rewrite for V1.6.

V1.6 reintroduces mechanics that `AGENTS.md` currently lists as obsolete. Each needs explicit owner approval before the list changes:

- private Potter's Workshop and Glaze & Load locations;
- Tech-based unlocks of the second personal space;
- Kiln Tending, now an Advanced Tech with a different effect;
- Ding selection (A1);
- Connoisseur's Cabinet's conditional end-game VP, which arguably falls under "direct VP printed on Techs".

Full findings, with file and line references into the current code, are kept
locally (not committed) in `output/v16-analysis/gap-analysis.json`.
