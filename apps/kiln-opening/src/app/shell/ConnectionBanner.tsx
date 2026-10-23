/**
 * ConnectionBanner (UI_V1.6.1_ARCHITECTURE §3.6, §3.8, §4.1). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `App.tsx` connection notices.
 *
 * Under the top bar, full width; it takes no space when there is nothing to say.
 * - `role="status"` (polite): reconnecting; offline, with Reconnect now.
 * - `role="alert"`: a computer turn that failed or timed out (latched for that revision), with
 *   **Retry computer turn**; a command whose outcome is unknown after a transport failure, with
 *   **Send again**, which resends the same command ID and revision (§3.6).
 *
 * Both regions are always in the DOM, so a message that appears is announced.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { Button } from "../kit/Button.tsx";
import { useSession } from "../state/hooks.ts";
import "./ConnectionBanner.css";

export function ConnectionBanner() {
  const t = useT();
  const session = useSession();
  const { status } = session;
  const offline = status.connection === "offline";
  const failure = status.computerFailure;
  const unsent = status.unsent;
  const quiet = !status.reconnecting && !offline;
  const empty = quiet && failure === null && unsent === null;
  return (
    <div className="conn-banner" data-empty={empty ? "" : undefined} role="region" aria-label={t("shell.banner.label")}>
      <div className="conn-banner-status" role="status">
        {offline ? (
          <p className="conn-banner-line" data-state="offline">
            <span>{t("shell.banner.offline")}</span>
            <Button size="sm" variant="secondary" busy={status.reconnecting} onClick={() => void session.reconnect()} data-banner="reconnect">
              {t("shell.banner.reconnect")}
            </Button>
          </p>
        ) : status.reconnecting ? (
          <p className="conn-banner-line" data-state="reconnecting">
            <span>{t("shell.banner.reconnecting")}</span>
          </p>
        ) : null}
      </div>
      <div className="conn-banner-alert" role="alert">
        {failure === null ? null : (
          <p className="conn-banner-line" data-state="computer-failure">
            <span>{failure.timedOut ? t("shell.banner.computerTimedOut") : t("shell.banner.computerFailed")}</span>
            <Button size="sm" variant="primary" busy={status.advancingComputers} onClick={() => session.retryComputers()} data-banner="retry-computers">
              {t("shell.banner.retryComputer")}
            </Button>
          </p>
        )}
        {unsent === null ? null : (
          <p className="conn-banner-line" data-state="unsent">
            <span>{t("shell.banner.unsent")}</span>
            <Button size="sm" variant="primary" busy={status.sending} onClick={() => void session.resend()} data-banner="send-again">
              {t("shell.banner.sendAgain")}
            </Button>
          </p>
        )}
      </div>
    </div>
  );
}
