/**
 * Section and phone-tab names (wireframe `sectionHtml` titles, `tabBar` labels). Owner: B1.
 * Shared by `WorldSections`, `JumpNav` and `PhoneNav`; the order itself comes from
 * `sectionOrder` and `SECTION_TAB` in `state/uiStore.ts`.
 */
import type { MessageKey } from "../i18n/translator.ts";
import type { PhoneSection, WorldSectionId } from "../state/uiStore.ts";

export const SECTION_TITLE = {
  firing: "shell.section.firing",
  results: "shell.section.results",
  table: "shell.section.table",
  orders: "shell.section.orders",
  progress: "shell.section.progress",
  kiln: "shell.section.kiln",
  workshops: "shell.section.workshops",
} as const satisfies Readonly<Record<WorldSectionId, MessageKey>>;

export const TAB_LABEL = {
  table: "shell.nav.table",
  kiln: "shell.nav.kiln",
  workshop: "shell.nav.workshop",
  orders: "shell.nav.orders",
} as const satisfies Readonly<Record<PhoneSection, MessageKey>>;

/** The element id of a section (the `jumpTo` scroll target) and of its heading. */
export const sectionId = (id: WorldSectionId): string => `sec-${id}`;
export const sectionHeadingId = (id: WorldSectionId): string => `sec-${id}-h`;
