/**
 * ResourceRow (pieces; wireframe `resRow`, `.res`): Clay, Wood and Coins as "<b>2</b> Clay" /
 * "<b>2</b>泥", in the glossary order, from one whole template (`common.piece.resourceAmount`).
 */
import type { ResourceKind, ResourceState } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { resourceName } from "../i18n/content.ts";
import "./ResourceRow.css";

const ORDER: readonly ResourceKind[] = ["clay", "wood", "coins"];

export interface ResourceRowProps {
  resources: Readonly<ResourceState>;
  /** Accessible name of the group; default "Resources". */
  label?: string;
  className?: string;
}

export function ResourceRow({ resources, label, className }: ResourceRowProps) {
  const t = useT();
  return (
    <span className={["res", className ?? ""].filter((part) => part !== "").join(" ")} role="group" aria-label={label ?? t("common.piece.resources")}>
      {ORDER.map((kind) => (
        <span key={kind} className="res-item" data-resource={kind}>
          {t.rich("common.piece.resourceAmount", { n: resources[kind], res: resourceName(kind, t.locale, resources[kind]) })}
        </span>
      ))}
    </span>
  );
}
