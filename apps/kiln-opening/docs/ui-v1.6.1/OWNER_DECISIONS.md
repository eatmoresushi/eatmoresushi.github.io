# V1.6.1 UI: owner decisions

Answers given by the owner on 2026-10-15 to the wireframe sign-off questions ([wireframes](./kiln-opening-wireframes.html)). They bind the production UI built in phases 4–6 of the [implementation plan](../V1.6_IMPLEMENTATION_PLAN.md).

## Guiding principle: show only what the table shows

**The UI shows only information a player could see playing the physical board game. It adds no extra analysis.**

- No Fire-card odds or cards-left counts.
- No previews of the Quality each Fire card would give.
- No heat ladder or heat ledger analysis tables, and no "before Fire" heat predictions.
- The engine may still compute these values for the computer player, but no screen shows them.

Things the table does show, the UI shows too:

- the Kiln Die;
- the Base Heat marker after Contributions are revealed;
- the Fire card once it is turned;
- each ceramic's position, markers and modifiers;
- the Quality recorded on a fired ceramic;
- the public history in the game log.

## Decisions

| # | Question | Decision |
| --- | --- | --- |
| D1 | Where does your board live? | **All Kiln Player Boards live in one board area.** It shows your own board by default. Tabs on the board's top edge switch to each other player's board. A **Your workshop** button returns to yours. Clicking a seat in the top bar opens that player's board. |
| D2 | Opponent detail | The seat chips along the top of the screen are the public opponent strips; that level is right. Full boards are reached through D1. |
| D3 | Firing prominence | **Firing takes over the main column** during the Firing Phase. It shows the step rail, the heat equation (Kiln Die + Contributions = Base Heat; Base Heat + Fire = Global Heat), the kiln and the Fire discard, and nothing beyond the physical game's information (see the principle above). |
| D4 | Fire-card odds | **No odds.** Players can see which Fire cards have been discarded, at any time. That is all the Fire-deck information shown. |
| D5 | Phone tabs | **Table / Kiln / Workshop / Orders** is right. The **game log is a dropdown** available at every screen size, not a tab or section. |
| D6 | Chinese terms | The glossary terms are approved. |
| D7 | Second personal-action space | **No "lock" or "unlock" in any player-facing text.** The second Form & Decorate or Glaze & Load space is something you **add by learning a Tech**. Before you have it, it reads "Learn a Form & Decorate Tech to add this space" / 习得坯作技艺即添此工位. Once you have it, it reads "Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设. Internal identifiers (`unlocked`, `PERSONAL_SPACE_LOCKED`, `unlocks`) are unchanged. |
| D8 | Shared Kiln layout (2026-10-15) | **Low at the top, High at the bottom.** The fire burns at the bottom of a wood-fired kiln, so the High (+1) row sits beside the firebox at the bottom. Middle (0) is in the middle, and the two Low (−1) spaces sit centred under the dome at the top, following the kiln's shape. This is layout only: zone modifiers, space counts and covered spaces per player count are unchanged. |
| D9 | Internal IDs (2026-10-15) | **Never show internal IDs to players.** Ceramic IDs (`c4`, `c18`…), worker IDs and other engine identifiers do not appear in anything a player sees, because a physical Vessel card has no number. A ceramic is recognised by its picture (Shape, Decoration, Glaze tint, owner's colour ring, Quality badge, Crackle marker) and is described in words in labels, choices, the game log, error messages and screen-reader text, e.g. "Lin's Celadon Vase, Carved · Fine", adding where it is ("in High 2", "in your workshop") only when two would otherwise read the same. Printed card numbers such as Order S01 or O33 stay, because they are on the physical cards. |
| D10 | Full rules on demand (2026-10-15; narrowed 2026-10-17) | **Clicking, tapping or focusing a Tech tile, Kiln Player Board, location, Order or Imperial Recognition milestone opens its rules details**, the way a player at the table would check the rulebook. Beside a form option the trigger is a small **"Full rules"** button (完整规则). **The panel shows only two sections** (owner review, 2026-10-17): the **full rule** word for word from the V1.6.1 rulebook (EN or 中文), and the **clarifications** for that component, as plain text. It shows no card text and no card facts (the card already carries them), and no source labels. The clarifications leave out general rules that apply to every component alike (for example "abilities are optional") and interactions the component's owner can never meet (for example Crackle on the Ru board: only Ge makes Crackle ceramics). This is rules reference, not game analysis: no advice, odds or previews (D3/D4 still apply). |
| D11 | Tech discipline name (2026-10-15) | **The "Workshop" Tech discipline is called "Form & Decorate" in English**, matching the personal location whose second space it adds: "Form & Decorate Techs", "Learn a Form & Decorate Tech to add this space". The other disciplines keep their names (Glazing & Loading, Firing). Chinese keeps the approved 坯作 (D6). Wording only: the internal ID `workshop` is unchanged. The checked-in rulebook is updated too (amendment A2 in the audit). |
| D12 | Seat chips (2026-10-17, owner review of phase B) | **On desktop and tablet the seat chips sit in the jump bar, after the section buttons** (Table, Orders, Recognition & Techs, Kiln, Workshops); they stay on that line when they fit and take their own line otherwise. On phones they stay in the top bar. A chip shows the First Player badge, name, Kiln (nothing before Kiln selection, never "no Kiln yet"), VP, **Clay, Wood and Coins as icons with counts** (like the hand's card back), the hand count and the acting dot. There is **no "computer" pill**; a computer seat is said in the chip's accessible name only. |
| D13 | Kiln selection (2026-10-17) | The Kiln selection window **does not list the choosing order**; its prompt still says Kilns are chosen in reverse turn order, and the seat chips show who is choosing. |
| D14 | Placing workers (2026-10-17) | **Workers are placed on the action spaces themselves**: each table location card and each personal space on your board has its Place buttons. The decision pane has **no worker or location picker**; it shows the step prompt, a hint with "Go to" buttons when nothing is chosen, then the chosen placement's summary, its choices and Confirm. **At the Guild Hall** the player is taken to the Tech display, which becomes the chooser: face-up Techs (Apprentice) or "Inspect the deck" per discipline (Shifu) are toggles, and Techs the player cannot buy are greyed out with the reason. |
| D15 | Rules links (2026-10-17) | No "Full rules" button in the Kiln selection window, and **no rules-details link on any action space** (table cards or personal spaces). Tech tiles (when not a Guild Hall choice), Kiln boards, Orders and milestones keep theirs (D10). |
| D16 | Kiln section (2026-10-17) | The Shared Kiln (and the Table section's small kiln) draws **only the active spaces** for the player count, rows centred: 4 players 2/3/3, 3 players 2/2/2, 2 players 1/1/2. The "Last firing" recap is removed; the Kiln section shows **this round's Kiln Die** and a **"Fire discard" button** that lists every discarded Fire card, oldest first (no count of cards left). |
| D17 | Other players' turns (2026-10-17) | A **toast** shows what each other player did on their last turn, in the game log's words, and closes by itself **3 seconds** after it appears or last changes (hover or focus pauses it; × or Escape closes it). The viewer's own moves and hidden information never appear. |
| D18 | Hands section (2026-10-17) | The table's "Hands: counts are public, cards are not" section is removed; the seat chips show each hand count. |

D7 changes wording only, not rules. The owner's own rulebook edits of 2026-10-16 brought the printed rulebook in line: the physical "Lock tokens" are now **Cover tokens**, and a Tech "removes the Cover token" from a second personal space (see the audit, "Owner wording edits"). The digital UI has no such token.
