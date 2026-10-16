/**
 * EndSessionDialog (UI_V1.6.1_ARCHITECTURE §4.2, §8.1). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `EndSessionDialog`: a destructive confirmation, host only.
 *
 * A native `<dialog>` opened with `showModal()`, which traps focus and gives Escape for free.
 * "Keep playing" (focused first) cancels; "End session for everyone" calls `endSession()` and
 * shows its progress. On success the room ends and the app switches to the ended screen; a
 * failure is shown in the dialog in words (formatted at render time).
 */
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { storedErrorText } from "../i18n/errors.ts";
import { Button } from "../kit/Button.tsx";
import type { StoredError } from "../session/gameSource.ts";
import { useSession } from "../state/hooks.ts";
import { actionHook } from "./driverHooks.ts";
import "./Lobby.css";

export interface EndSessionDialogProps {
  /** Whether the dialog is shown. */
  open: boolean;
  /** Called when it closes (cancelled or confirmed). */
  onClose: () => void;
}

export function EndSessionDialog({ open, onClose }: EndSessionDialogProps) {
  const t = useT();
  const session = useSession();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [failure, setFailure] = useState<StoredError | null>(null);
  const busy = session.status.lobbyAction === "end_session";
  const code = session.room?.code ?? "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setFailure(null);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      keepRef.current?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  const confirm = async () => {
    if (busy) return;
    const outcome = await session.endSession();
    if (outcome.ok) onClose();
    else setFailure(outcome.error);
  };

  return (
    <dialog
      ref={dialogRef}
      className="end-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onClose={() => {
        if (open) onClose();
      }}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <h2 id={`${id}-title`} className="end-dialog-title">
        {t("lobby.endDialog.title", { code })}
      </h2>
      <p id={`${id}-body`} className="end-dialog-body">
        {t("lobby.endDialog.body")}
      </p>
      {failure === null ? null : (
        <p className="lobby-error" role="alert">
          {storedErrorText(failure, t)}
        </p>
      )}
      <div className="end-dialog-actions">
        <Button ref={keepRef} variant="secondary" disabled={busy} onClick={onClose} {...actionHook("keep-playing")}>
          {t("lobby.endDialog.keep")}
        </Button>
        <Button variant="danger" busy={busy} onClick={() => void confirm()} {...actionHook("end-session")}>
          {busy ? t("lobby.endDialog.ending") : t("lobby.endDialog.confirm")}
        </Button>
      </div>
    </dialog>
  );
}
