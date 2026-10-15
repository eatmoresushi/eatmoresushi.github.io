/**
 * EndSessionDialog (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `EndSessionDialog`: native `<dialog>` with `showModal()`, destructive confirmation.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import { Placeholder } from "../screens/Placeholder.tsx";

export interface EndSessionDialogProps {
  /** Whether the dialog is shown. */
  open: boolean;
  /** Called when it closes (cancelled or confirmed). */
  onClose: () => void;
}

export function EndSessionDialog(_props: EndSessionDialogProps) {
  return <Placeholder name="EndSessionDialog" />;
}
