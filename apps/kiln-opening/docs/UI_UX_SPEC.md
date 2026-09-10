# UI_UX_SPEC.md

## Design goal

The digital game should feel like a tabletop board made easier to administer, not like a spreadsheet.

Use the existing print assets for visual direction, but render gameplay text, values and most cards as HTML/CSS/SVG so they remain sharp and can change with rules.

## Primary desktop layout

Suggested structure:

```text
┌──────────────── top status: Round / Phase / active player ────────────────┐
│                                                                          │
│ action locations                  shared kiln            card displays    │
│                                                                          │
├───────────────────────────────────────────────────────────────────────────┤
│ local player workshop: resources | workers | ceramics | orders | techs   │
└───────────────────────────────────────────────────────────────────────────┘
```

Opponents may appear as compact workshop strips/cards around the top/side.

## Interaction principles

- Clicking/selecting a worker highlights legal locations.
- Selecting a location opens only the choices relevant to that action.
- Illegal choices should be disabled with a reason.
- Show cost before confirmation.
- Show each shared location's global printed capacity and remaining spaces visually. Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy scale to 2 / 3 / 4 spaces; Kiln Yard and Labour are uncapped.
- Do not group printed spaces by player. Highlight that a Shifu may overfill a full location while an Apprentice cannot.
- Shifu and Apprentice effects should be visible without opening rules.
- Always show Preferred Heat on a glazed ceramic.
- Kiln spaces show zone and modifier.
- During firing, focus UI attention on kiln and contribution workflow.
- Use clear timing banners: `Before Contributions`, `Contributions Revealed`, `After Base Heat / Before Fire`, `Before Quality`, etc.
- Keep an always-visible `EN / 中文` control. Switching language must preserve selections, reconnect identity, and authoritative game state.

## Session controls

- Only the host sees `End session` while a room is in the lobby or actively playing.
- Ending requires a destructive-action confirmation that states it affects every player and cannot be undone.
- All players receive a dedicated ended-session screen after the server confirms or broadcasts the change.
- `Leave view` keeps the saved seat and the home screen offers `Resume` and `Forget seat` separately.
- Do not present a locally hidden view as though the authoritative session has ended.

## Cards

Order cards should be components driven by `orders.json`, not static raster images. Every Crown Order displays its printed Crown reward alongside VP and Coins. Glaze & Decoration displays Plain as 1 Coin and Carved/Impressed/Crackle as 2 Coins before confirmation, including the amount saved by Shifu, Carving Knives, Seal Stamps, or Crackle Slips.

Starting and Advanced Tech cards should be components driven by `techniques.json`.

Use printable art only as inspiration for:

- parchment tone;
- teal/gold/rust discipline accents;
- borders;
- icon style.

## Player boards

Player board prominently shows:

- Kiln English + Chinese name;
- ability;
- Clay;
- Wood;
- Coins;
- all available and placed workers;
- owned Techniques;
- unfinished and finished ceramics.

The printable player-board art omits worker spaces for physical-table practicality; digital UI should still show worker status somewhere.

## Imperial Recognition

The main table always shows the shared, public five-space Imperial Recognition track from Local Workshop (0) through Imperial Audience (4).

- Render every player's marker on their current space using both colour and a text label.
- Show Imperial Grant's resource choice at 1, Imperial Gift and the Imperial Kiln at 2, Imperial Priority at 3, and Imperial Audience's immediate 6 VP at 4.
- Show the Imperial Kiln tile and Imperial Priority token on the owning player's summary after they are gained. Make Imperial Priority's legal before-or-after-worker-action window explicit.
- Show immediate +1 VP events for Crowns gained after the marker has reached 4; the marker remains on 4.
- Every player is eligible for an End-game Exhibition of up to 5 ceramics. The submission UI must separately identify the exactly-three featured collection used for Shape and Glaze diversity bonuses.
- Animate and log each server-committed Recognition step. A multi-Crown Order must visibly resolve each crossed milestone and any remaining overflow Crowns rather than appearing to skip them.

On narrow screens, keep the complete track in the document and make it horizontally scrollable. Do not remove spaces, markers, titles, rewards, or accessible labels to fit the viewport.

## Responsive behaviour

MVP should be desktop/tablet first.

Phone support can use:

- scrollable board;
- sticky local-player action bar;
- modal card inspection;
- collapsible opponent panels.

Do not shrink all text to fit an entire board on a phone.

## Accessibility

- Do not encode state only by colour.
- Provide text labels for icons.
- Use semantic buttons.
- Keyboard focus states.
- Respect reduced-motion preference.
- Maintain sufficient contrast.
- Alt text for decorative/art images can be concise; functional card info must be real text.

## Animation

Useful:

- worker placement;
- card moving into hand;
- ceramic moving into kiln;
- simultaneous Wood reveal;
- Fire card flip;
- Quality result.

After each completed firing, keep the drawn Fire card and the Base Heat + Fire = Global Heat result visible on the shared kiln panel until a later firing replaces it. Face-up Technique tiles and Technique replacement controls must show stable Technique IDs alongside their names.

Avoid slow decorative animations that extend a 90-minute game.

## Debug mode

During development, include a hidden/dev-only inspector showing:

- raw phase/timing window;
- legal actions;
- deck counts;
- RNG seed;
- event log;
- validation error details.
