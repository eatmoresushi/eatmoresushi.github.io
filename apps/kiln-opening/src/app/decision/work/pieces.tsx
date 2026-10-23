/**
 * Small presentational pieces of B4's forms (wireframe `deltaRow`, the Order line of `decLook`).
 * They render only what they are given; nothing here decides a rule.
 */
import type { ReactNode } from "react";
import type { GameRuleError, OrderId, ResourceState } from "../../../game/index.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { useEngineView } from "../../state/hooks.ts";
import { orderRequirements, resourceName } from "../../i18n/content.ts";
import { orderQualityLine } from "../../i18n/orderText.ts";
import { RESOURCE_ORDER } from "./locations/shared.ts";
import "./pieces.css";

export interface ResourceDeltaProps {
  before: Readonly<ResourceState>;
  after: Readonly<ResourceState> | null;
}

/** "Clay 2 → 4 · Wood 1 → 1 · Coins 3 → 2", the wireframe's `deltaRow`. */
export function ResourceDelta({ before, after }: ResourceDeltaProps) {
  const t = useT();
  if (after === null) return null;
  return (
    <div className="b4-delta" role="group" aria-label={t("work.work.deltaLabel")}>
      <span className="b4-delta-title">{t("work.work.after")}</span>
      {RESOURCE_ORDER.map((kind) => {
        const change = after[kind] - before[kind];
        return (
          <span key={kind} className="b4-delta-item num" data-change={change > 0 ? "up" : change < 0 ? "down" : "none"}>
            {t("work.work.delta", { res: resourceName(kind, t.locale), from: before[kind], to: after[kind] })}
          </span>
        );
      })}
    </div>
  );
}

/** An Order's reward line: the shared rules component (B6), re-exported for B4's forms. */
export { OrderReward } from "../../rules/RulesDetail.tsx";

/** An Order's requirement and quality lines. */
export function OrderLines({ orderId }: { orderId: OrderId }) {
  const t = useT();
  return (
    <span className="b4-order-lines">
      <span>{orderRequirements(orderId, t.locale)}</span>
      <span className="b4-order-quality">{orderQualityLine(orderId, t)}</span>
    </span>
  );
}

/** A short note under a form group. */
export function FormNote({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" | "private" }) {
  return <p className={`b4-note b4-note--${tone}`}>{children}</p>;
}

/** Formats an engine rule error in the current language, with names and words for IDs (D9). */
export function useRuleErrorText(): (error: Pick<GameRuleError, "code"> & { details?: Readonly<Record<string, unknown>> }) => string {
  const t = useT();
  const { view } = useEngineView();
  const options = errorTextOptions(view, t);
  return (error) => ruleErrorText(error, t, options);
}
