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
| D7 | Second personal-action space | **No "lock" or "unlock" in any player-facing text.** The second Form & Decorate or Glaze & Load space is something you **add by learning a Tech**. Before you have it, it reads "Learn a Workshop Tech to add this space" / 习得坯作技艺即添此工位. Once you have it, it reads "Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设. Internal identifiers (`unlocked`, `PERSONAL_SPACE_LOCKED`, `unlocks`) are unchanged. |

D7 changes wording only, not rules. The checked-in V1.6.1 rulebook still names the physical component "Lock tokens", and it stays byte-identical. The digital UI has no such token.
