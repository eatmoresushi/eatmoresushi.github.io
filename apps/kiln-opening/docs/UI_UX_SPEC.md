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
- Show remaining location capacity visually.
- Shifu and Apprentice effects should be visible without opening rules.
- Always show Preferred Heat on a glazed ceramic.
- Kiln spaces show zone and modifier.
- During firing, focus UI attention on kiln and contribution workflow.
- Use clear timing banners: `Before Contributions`, `Reveal`, `Before Quality`, etc.

## Cards

Order cards should be components driven by `orders.json`, not static raster images.

Craft Technique cards should be components driven by `techniques.json`.

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
- available/locked workers;
- owned Techniques;
- unfinished and finished ceramics.

The printable player-board art omits worker spaces for physical-table practicality; digital UI should still show worker status somewhere.

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

Avoid slow decorative animations that extend a 90-minute game.

## Debug mode

During development, include a hidden/dev-only inspector showing:

- raw phase/timing window;
- legal actions;
- deck counts;
- RNG seed;
- event log;
- validation error details.
