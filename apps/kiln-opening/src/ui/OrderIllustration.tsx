import { ORDER_DEFINITIONS } from "../game";
import type { OrderId, Shape } from "../game";
import bowlArtwork from "../../assets/current_v04/pieces/vessel-bowl-v1.webp";
import plateArtwork from "../../assets/current_v04/pieces/vessel-plate-v1.webp";
import washerArtwork from "../../assets/current_v04/pieces/vessel-brush-washer-v1.webp";
import vaseArtwork from "../../assets/current_v04/pieces/vessel-vase-v1.webp";
import censerArtwork from "../../assets/current_v04/pieces/vessel-censer-v1.webp";

const VESSEL_ARTWORK: Record<Shape, string> = {
  bowl: bowlArtwork,
  plate: plateArtwork,
  washer: washerArtwork,
  vase: vaseArtwork,
  censer: censerArtwork,
};

const UNRESTRICTED_SHAPE_ILLUSTRATIONS: readonly Shape[] = ["bowl", "vase", "plate", "washer", "censer"];

/** Decorative examples only; the adjacent Order text defines every requirement. */
export function OrderIllustration({ id }: { id: OrderId }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return <span className="kiln-piece-order-illustration" aria-hidden="true" data-vessel-count={order.ceramics.length}>
    {order.ceramics.map((requirement, index) => {
      const shape = requirement.shape ?? requirement.shapes?.[0]
        ?? UNRESTRICTED_SHAPE_ILLUSTRATIONS[index % UNRESTRICTED_SHAPE_ILLUSTRATIONS.length]!;
      return <img key={index} className={`is-${shape}`} data-vessel-shape={shape}
        src={VESSEL_ARTWORK[shape]} alt="" width={640} height={640} draggable={false} />;
    })}
  </span>;
}
