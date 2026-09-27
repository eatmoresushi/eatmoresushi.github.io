import { ORDER_DEFINITIONS } from "../game";
import type { OrderId } from "../game";
import { CeramicArtwork } from "./CeramicArtwork";
import { orderIllustrationCeramics } from "./orderIllustrations";

/** Show one valid finish combination; adjacent rules retain every allowed alternative. */
export function OrderIllustration({ id }: { id: OrderId }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return <span className="kiln-piece-order-illustration" aria-hidden="true" data-vessel-count={order.ceramics.length}>
    {orderIllustrationCeramics(id).map((ceramic) => <CeramicArtwork key={ceramic.id}
      shape={ceramic.shape} glaze={ceramic.glaze} decoration={ceramic.decoration} />)}
  </span>;
}
