/**
 * ConnectionBanner (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B1 (shell, log, lobby).
 * Source: §3.6, §3.8: reconnecting / offline (`role="status"`); computer failure + Retry, unsent command + Send again (`role="alert"`).
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import { Placeholder } from "../screens/Placeholder.tsx";

export function ConnectionBanner() {
  return <Placeholder name="ConnectionBanner" />;
}
