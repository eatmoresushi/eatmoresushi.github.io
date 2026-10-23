/**
 * HomeScreen (UI_V1.6.1_ARCHITECTURE §1.1, §3.9, §4.2). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `App.tsx` `HomeScreen`: create, join, resume or forget a saved seat.
 *
 * - One name field serves both actions; create makes you the host, join takes a room code.
 * - A saved seat on this device (`savedRoomCode`, never its token) offers Resume and Forget seat.
 * - A missing name or code is said inline next to its field; a service failure (room not found,
 *   room full, …) is formatted at render time from its code, so a language switch re-renders it.
 * - While a request is in flight its button shows progress and repeated presses are ignored.
 */
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import { storedErrorText } from "../i18n/errors.ts";
import { Button } from "../kit/Button.tsx";
import { useSession } from "../state/hooks.ts";
import { LobbyFrame } from "./LobbyFrame.tsx";
import { actionHook, nameHook } from "./driverHooks.ts";

type Problem = "name" | "code" | null;

export function HomeScreen() {
  const t = useT();
  const session = useSession();
  const id = useId();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const action = session.status.lobbyAction;
  const busy = action !== null;
  const error = session.status.error;
  const saved = session.savedRoomCode;
  const ids = { title: `${id}-title`, name: `${id}-name`, nameNote: `${id}-name-note`, code: `${id}-code`, codeNote: `${id}-code-note`, error: `${id}-error` };

  const clear = () => {
    setProblem(null);
    if (error !== null) session.clearError();
  };

  const needName = (): boolean => {
    if (name.trim() !== "") return false;
    setProblem("name");
    nameRef.current?.focus();
    return true;
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || needName()) return;
    void session.create(name.trim());
  };

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || needName()) return;
    if (code.trim() === "") {
      setProblem("code");
      codeRef.current?.focus();
      return;
    }
    void session.join(code.trim(), name.trim());
  };

  return (
    <LobbyFrame screen="home" labelledBy={ids.title}>
      <section className="home-hero">
        <h1 id={ids.title} className="home-title">
          {t("lobby.brand")}
        </h1>
        <p className="home-tagline">{t("lobby.home.tagline")}</p>
        <p className="home-about">{t("lobby.home.about")}</p>
        <p className="home-facts">
          {t("lobby.home.facts", { min: RULE_NUMBERS.playersMin, max: RULE_NUMBERS.playersMax, rounds: RULE_NUMBERS.rounds })}
        </p>
      </section>

      {saved === null ? null : (
        <section className="lobby-card home-saved" aria-labelledby={`${id}-saved`}>
          <h2 id={`${id}-saved`} className="lobby-card-title">
            {t("lobby.home.savedTitle")}
          </h2>
          <p className="home-saved-room">{t("lobby.home.saved", { code: saved })}</p>
          <p className="lobby-note">{t("lobby.home.savedNote")}</p>
          <div className="lobby-actions">
            <Button variant="primary" busy={action === "resume"} onClick={() => void session.resume(saved)} {...actionHook("resume")}>
              {t("lobby.home.resume")}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => session.forgetSeat(saved)} {...actionHook("forget-seat")}>
              {t("lobby.home.forget")}
            </Button>
          </div>
        </section>
      )}

      <div className="lobby-card home-entry">
        <div className="lobby-field">
          <label htmlFor={ids.name} className="lobby-label">
            {t("lobby.home.nameLabel")}
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            className="lobby-input"
            value={name}
            autoComplete="nickname"
            maxLength={40}
            aria-invalid={problem === "name" ? true : undefined}
            aria-describedby={ids.nameNote}
            onChange={(event) => {
              setName(event.target.value);
              clear();
            }}
            {...nameHook("displayName")}
          />
          <p id={ids.nameNote} className={problem === "name" ? "lobby-field-error" : "lobby-note"}>
            {problem === "name" ? t("lobby.home.nameRequired") : t("lobby.home.nameHint")}
          </p>
        </div>

        <form className="home-form" noValidate onSubmit={create} aria-labelledby={`${id}-create`}>
          <h2 id={`${id}-create`} className="lobby-card-title">
            {t("lobby.home.createTitle")}
          </h2>
          <p className="lobby-note">{t("lobby.home.createHint")}</p>
          <div className="lobby-actions">
            <Button type="submit" variant="primary" busy={action === "create"} {...actionHook("create-room")}>
              {t("lobby.home.create")}
            </Button>
          </div>
        </form>

        <form className="home-form home-join" noValidate onSubmit={join} aria-labelledby={`${id}-join`}>
          <h2 id={`${id}-join`} className="lobby-card-title">
            {t("lobby.home.joinTitle")}
          </h2>
          <div className="lobby-field">
            <label htmlFor={ids.code} className="lobby-label">
              {t("lobby.home.codeLabel")}
            </label>
            <input
              ref={codeRef}
              id={ids.code}
              className="lobby-input lobby-input--code"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              aria-invalid={problem === "code" ? true : undefined}
              aria-describedby={problem === "code" ? ids.codeNote : undefined}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                clear();
              }}
              {...nameHook("roomCode")}
            />
            {problem === "code" ? (
              <p id={ids.codeNote} className="lobby-field-error">
                {t("lobby.home.codeRequired")}
              </p>
            ) : null}
          </div>
          <div className="lobby-actions">
            <Button type="submit" variant="secondary" busy={action === "join"} {...actionHook("join-room")}>
              {t("lobby.home.join")}
            </Button>
          </div>
        </form>
      </div>

      {error === null ? null : (
        <p id={ids.error} className="lobby-error" role="alert">
          {storedErrorText(error, t)}
        </p>
      )}
      {busy ? (
        <p className="lobby-note" role="status">
          {t("lobby.busy")}
        </p>
      ) : null}
    </LobbyFrame>
  );
}
