# Responsive game UI

The table uses a shared layout scale so the board, public Orders and Techs,
Recognition and Turn Order tracks, player summaries, and personal workshop resize together.
Game state and rules do not depend on layout dimensions.

## Wide layout

`ResponsiveTabletop` places the table in an 1800 px reference scene when its
available width is at least 960 px. The scene scale follows available width,
with enlargement capped at 2, for a maximum table width of 3600 px. Window
height does not reduce the scale: shorter windows keep the same piece sizes
and scroll vertically. The personal workshop remains in the document's
vertical flow; its contents do not force the whole table to shrink.

The outer wrapper reserves the scene's scaled height. The scene's layout stays
fixed while it scales, and the reference surface is centered when spare width
remains beyond the maximum width. `ResizeObserver` tracks changes to the
wrapper width and scene height. The pure calculation is in
`src/ui/tabletopLayout.ts`.

`ResponsiveGameBoard` scales the board's own coordinates in compact mode. In
wide mode it participates directly in the shared CSS grid, which stretches the
board and sidebar to the same height. Neither side measures the other's
stretched height; this prevents a larger height being retained after resizing.

The shared area assigns two thirds of its width to the board and one third to
the Techs and public tracks. Tech tiles divide their column equally and stay
square. The remaining sidebar height is split evenly between Recognition and
Turn Order, keeping the two sides aligned without stretching the Tech tiles.
Recognition shows milestone names and markers; its Rewards button opens the
complete reward descriptions. Turn Order uses three rows: Order Phase ←,
coloured player markers, and Work Phase →. Both phase bars span the track and
have left-aligned labels; there is no separate title. The marker sequence is always Work
order from left to right, starting with the First Player; Orders follow it in
reverse. The current-player ring and First Player badge remain visible.
The illustrated board uses the full width of its frame, with no turn strip.

The six face-up Orders and draw pile form one tightly spaced row. At the
reference size, each card is 160 × 224 px; the deck follows the measured card
height. The row stays shallow instead of enlarging cards to fill spare width.

## Compact layout

Below 960 px, the surrounding UI uses normal document flow without a scene
transform. Public Orders wrap into a grid, the board and public sidebar stack,
and personal areas reflow. The two public tracks remain stacked beneath Techs,
with Turn Order horizontal and both panels sized to their content. Techs remain
equal squares. Pieces use a shared zoom
of `clamp(0.8, availableWidth / 430, 1)`; this smaller adjustment does not shrink
the surrounding controls and reading text.

The same flowing layout applies when the root text size exceeds 125% of the
16 px baseline, even on a wide screen. Order and Tech grids then fit fewer
columns as the larger pieces require, preserving the player's enlarged text
instead of leaving a narrow board beside oversized fixed columns.

Public and personal pieces share their dimensions. Order measurements use
`offsetWidth` and `offsetHeight`, rather than transformed screen dimensions,
to avoid applying the table scale twice. Techs use the same size variable in
the market, personal area, selection panel, and inspector. A wide scene resets
the inherited piece scale to 1 because its outer transform already scales it.

## Dialogs and interaction

Action panels, inspectors, and preview portals remain outside the transformed
scene. Their dimensions follow the viewport, with a bounded, scrollable body
and accessible close and submit controls. Piece faces keep the shared size;
full rule descriptions retain reading size. Narrow screens preserve touch
targets rather than scaling the entire interface down to fit on one screen.

## Resize verification

Check both English and Simplified Chinese with four players, the longest Order
requirements, a full six-Tech display, and populated personal areas. Resize in
both directions without reloading, including while scrolled and with a dialog
open. Also check the 960 px layout boundary.

| Viewport | Expected layout | Focus |
| --- | --- | --- |
| 320 × 568 | Compact phone | Two pieces per public row, no page overflow, reachable dialog controls |
| 390 × 844 | Compact phone | Equal public/personal pieces and complete rewards and reminders |
| 768 × 1024 | Compact tablet | Wrapped Orders, three Tech disciplines, stacked board/sidebar |
| 844 × 390 | Compact landscape | Scrollable decisions with close and submit controls reachable |
| 1024 × 768 | Scaled wide table | Stable reference layout and complete board actions |
| 1366 × 768 | Scaled wide table | Table fills available width and scrolls vertically |
| 1920 × 1080 | Enlarged wide table | Proportional growth across the browser width |
| 3440 × 1440 | Enlarged wide table | Table continues filling the available width |
| 3840 × 2160 | Maximum wide table | Reference scene stops growing at 3600 px and is centered |

At every size, verify that all eight board locations are reachable, Order
rewards remain within their card, Tech descriptions are complete, and clicking
a piece opens its full rules. Check that switching layouts does not leave
stale dimensions, duplicate scaling, or blank scroll space below the workshop.
