/**
 * CardBack (pieces; wireframe `.cardback`, `.backs`): face-down cards, for hand counts and decks.
 * Up to four backs are drawn; the count is given in words (`label`, default "3 cards, face
 * down") and, with `showCount`, as a visible number. Never shows a card's face.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { num } from "../i18n/format.ts";
import "./CardBack.css";

export interface CardBackProps {
  count: number;
  /** Words for the count (e.g. `t("common.piece.ordersInHand", { n })`). */
  label?: string;
  showCount?: boolean;
  /** Most backs drawn (default 4). */
  maxDrawn?: number;
  className?: string;
}

export function CardBack({ count, label, showCount = false, maxDrawn = 4, className }: CardBackProps) {
  const t = useT();
  const drawn = Math.max(0, Math.min(count, maxDrawn));
  return (
    <span className={["backs", className ?? ""].filter((part) => part !== "").join(" ")} data-count={count}>
      <span className="backs-cards" aria-hidden="true">
        {Array.from({ length: Math.max(drawn, 1) }, (_, index) => (
          <span key={index} className={["cardback", drawn === 0 ? "cardback--none" : ""].filter((part) => part !== "").join(" ")} />
        ))}
      </span>
      {showCount ? <span className="backs-count num" aria-hidden="true">{num(count)}</span> : null}
      <span className="sr-only">{label ?? t("common.piece.cardBacks", { n: count })}</span>
    </span>
  );
}
