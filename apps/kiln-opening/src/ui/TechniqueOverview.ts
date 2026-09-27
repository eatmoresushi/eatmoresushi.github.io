import type { Locale } from "./i18n";
import { TECHNIQUE_SHORT_COPY, techniqueShortPlainText } from "./TechniqueDescription";

/** Every Tech tile uses the same owner-approved component reminder. */
export const TECHNIQUE_OVERVIEW_COPY = TECHNIQUE_SHORT_COPY;

/** Plain text for accessible descriptions and non-rich consumers. */
export function techniqueOverviewCopy(id: string, locale: Locale): string {
  return techniqueShortPlainText(id, locale);
}
