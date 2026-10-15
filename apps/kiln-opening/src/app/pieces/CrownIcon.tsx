/**
 * CrownIcon (pieces; wireframe `CROWN`, `crowns`): the Crown (御令) glyph in the current text
 * colour. With `count` it reads "2 Crowns" / "2个御令" and shows "×2" (glossary §1.3 `👑×2`);
 * without, it is decorative.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import "./CrownIcon.css";

export interface CrownIconProps {
  count?: number;
  className?: string;
}

export function CrownIcon({ count, className }: CrownIconProps) {
  const t = useT();
  const glyph = (
    <svg className="crown-glyph" width="13" height="11" viewBox="0 0 13 11" aria-hidden="true" focusable="false">
      <path d="M1 9.5h11L12 2.5 9 5.5 6.5 1 4 5.5 1 2.5z" fill="currentColor" />
    </svg>
  );
  if (count === undefined) return <span className={["crown", className ?? ""].filter((part) => part !== "").join(" ")}>{glyph}</span>;
  return (
    <span className={["crown", "crown--count", className ?? ""].filter((part) => part !== "").join(" ")}>
      {glyph}
      <span aria-hidden="true">{t("common.piece.timesN", { n: count })}</span>
      <span className="sr-only">{t("common.piece.crowns", { n: count })}</span>
    </span>
  );
}
