/**
 * OrderRow (B2): one row of Order cards with its header line (wireframe `.ordwrap`, `.orow-h`,
 * `.odisp`), shared by the Main Order display, the viewer's private look and the viewer's hand.
 * The display is an ordered list (oldest to newest); the others are plain lists.
 */
import { useId } from "react";
import type { ReactNode } from "react";
import "./OrderRow.css";

export interface OrderRowProps {
  title: ReactNode;
  /** Header details after the title (chips, counts). */
  meta?: ReactNode;
  ordered?: boolean;
  /** `<li>` items. */
  children?: ReactNode;
  className?: string;
}

export function OrderRow({ title, meta, ordered = false, children, className }: OrderRowProps) {
  const id = useId();
  const List = ordered ? "ol" : "ul";
  return (
    <div className={["ordwrap", className ?? ""].filter((part) => part !== "").join(" ")}>
      <div className="orow-h">
        <h3 id={`${id}-title`} className="orow-title">{title}</h3>
        {meta}
      </div>
      <List className="odisp" aria-labelledby={`${id}-title`}>{children}</List>
    </div>
  );
}
