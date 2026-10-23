/**
 * LookedOrders (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `secOrders` look branch: `model.look` (own look only, "only you").
 *
 * The viewer's own private look at the top of the Main deck (the Commission Market, or Colour
 * Samples when acquired or its swap), marked "Only you can see". `model.look` is the viewer's own look only; another
 * player's look shows only as a count (`counts.pendingLook`), in the waiting pane and the live
 * region, never here. Each card is a table target keyed by its OrderId when the open window's
 * adapter offers it.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { techName } from "../i18n/content.ts";
import { Chip } from "../kit/Chip.tsx";
import { useModel } from "../state/hooks.ts";
import { OrderCard } from "./OrderCard.tsx";
import { OrderRow } from "./OrderRow.tsx";

/** Colour Samples, the Tech whose look this can also be (T10). */
const COLOUR_SAMPLES = "T10" as const;

export function LookedOrders() {
  const t = useT();
  const look = useModel((model) => model.look);
  if (look === null || look.orderIds.length === 0) return null;
  const n = look.orderIds.length;
  const title = look.kind === "commission_market"
    ? t("table.look.commission", { n })
    : t("table.look.colourSamples", { tech: techName(COLOUR_SAMPLES, t.locale), n });
  return (
    <OrderRow className="ordwrap--look" title={title} meta={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}>
      {look.orderIds.map((orderId) => (
        <li key={orderId}>
          <OrderCard orderId={orderId} own />
        </li>
      ))}
    </OrderRow>
  );
}
