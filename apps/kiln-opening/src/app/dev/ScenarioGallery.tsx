/**
 * The scenario gallery (UI_V1.6.1_ARCHITECTURE §9.5). Dev only: `gallery/index.html` →
 * `dev/gallery-main.tsx` → this page. Served by the dev server; never a build input.
 *
 * It lists every scripted scenario and played moment of `test/v161/ui/fixtures/*.json`, the shell
 * states (home, lobby, reconnecting, offline, computer failure, unsent command, ended), and every
 * `dev/*.gallery.tsx` page. A fixture renders the **full `GameScreen`** on a `FixtureGameSource`;
 * Confirm shows "Would send …" after the same local check ConfirmBar runs. An entry with a
 * `draftCommand` opens with that command's draft seeded into the open window (`fromCommand`), so
 * the form shows its choices made.
 *
 * The URL hash selects the view: `#<id>?lang=zh-CN&theme=dark&board=p2`. `&bare=1` drops the
 * gallery chrome (index, bar), so the entry fills the viewport exactly as the app would: the
 * Playwright gallery spec and screenshots use it. The layout mode follows the real viewport
 * (`browserLayoutSource`), so phone behaviours (the sheet, section switches) work as in the app.
 *
 * Owners and Playwright review the windows the wireframe did not design and every table state
 * here; phase B agents check their components before the real game reaches them. The gallery's
 * own chrome is English developer text.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import type { AuthoritativeCommand, PlayerId } from "../../game/index.ts";
import type { PublicRoom, PublicSeat, StoredRulesVersion } from "../../multiplayer/types.ts";
import { WINDOWS } from "../decision/windows.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { isLocale } from "../i18n/translator.ts";
import type { Locale } from "../i18n/translator.ts";
import { EndedScreen } from "../lobby/EndedScreen.tsx";
import { HomeScreen } from "../lobby/HomeScreen.tsx";
import { LobbyScreen } from "../lobby/LobbyScreen.tsx";
import { GameScreen } from "../screens/GameScreen.tsx";
import { FixtureGameSource } from "../session/fixtureSource.ts";
import type { FixtureEntry, FixtureSourceOptions } from "../session/fixtureSource.ts";
import { EMPTY_SNAPSHOT } from "../session/gameSource.ts";
import type { GameSnapshot, GameSource, SubmitOutcome } from "../session/gameSource.ts";
import { decisionWindow, windowDraftKey } from "../state/decisionWindow.ts";
import { DraftStore } from "../state/draftStore.ts";
import { GameProvider } from "../state/hooks.ts";
import { buildGameModel, engineViewOf } from "../state/model.ts";
import { browserLayoutSource } from "../state/layoutMode.ts";
import { BROWSER_UI_EFFECTS, UiStore } from "../state/uiStore.ts";
import { applyTheme, isThemeChoice } from "../theme.ts";
import type { ThemeChoice } from "../theme.ts";
import "./ScenarioGallery.css";

// ── Inputs ────────────────────────────────────────────────────────────────────────────────

/** A `dev/*.gallery.tsx` module: the default export is the page, `gallery` its id and title. */
export interface GalleryPageModule {
  default: ComponentType;
  gallery: { id: string; title: string };
}

/** A fixture file (`scenarios.json`, `moments.json`). */
export interface FixtureFile {
  entries: readonly (FixtureEntry & { description?: string; kind?: string })[];
}

export interface ScenarioGalleryProps {
  pages: readonly GalleryPageModule[];
  /** Loads the fixture files (lazily, through `import.meta.glob`). */
  loadFixtures: () => Promise<readonly FixtureFile[]>;
}

// ── Entries ───────────────────────────────────────────────────────────────────────────────

type ScreenKind = "home" | "lobby" | "ended" | "game";

export interface GameEntry {
  id: string;
  group: "Windows" | "Table states" | "Moments" | "Shell states";
  title: string;
  description: string;
  screen: ScreenKind;
  makeSource: () => GameSource;
  players: readonly { playerId: PlayerId; name: string }[];
  /** The fixture's seeded draft (`FixtureEntry.draftCommand`), if any. */
  draftCommand?: AuthoritativeCommand;
}

export interface PageEntry {
  id: string;
  group: "Pages";
  title: string;
  description: string;
  Page: ComponentType;
}

export type Entry = GameEntry | PageEntry;

/** A source with one fixed snapshot (the shell states without a game). */
class StaticGameSource implements GameSource {
  constructor(private readonly snapshot: GameSnapshot) {}
  getSnapshot = (): GameSnapshot => this.snapshot;
  getServerSnapshot = (): GameSnapshot => this.snapshot;
  subscribe = (): (() => void) => () => undefined;
  async submit(): Promise<SubmitOutcome> {
    return { kind: "ignored" };
  }
  async resend(): Promise<SubmitOutcome> {
    return { kind: "ignored" };
  }
  async reconnect(): Promise<void> {}
  retryComputers(): void {}
}

function playersOf(entry: FixtureEntry): GameEntry["players"] {
  const game = entry.playerView.game;
  return game.playerOrder.map((playerId) => ({ playerId, name: game.players[playerId]?.displayName ?? playerId }));
}

function lobbySnapshot(base: FixtureEntry, viewerSeat: number): GameSnapshot {
  const players = playersOf(base);
  const roomId = "gallery-room";
  const seats: PublicSeat[] = players.map((player, seatIndex) => ({
    seatId: `gallery-seat-${seatIndex}`,
    roomId,
    playerId: player.playerId,
    seatIndex,
    displayName: player.name,
    colour: "",
    isHost: seatIndex === 0,
    isComputer: seatIndex > 1,
    aiPolicyVersion: null,
  }));
  const room: PublicRoom = {
    id: roomId,
    code: "KILN",
    status: "lobby",
    hostSeatId: "gallery-seat-0",
    rulesVersion: base.playerView.game.rulesVersion as StoredRulesVersion,
    latestRevision: 0,
    endedAt: null,
    endedByPlayerId: null,
  };
  return { ...EMPTY_SNAPSHOT, room, seats, seat: seats[viewerSeat] ?? null };
}

function shellEntries(base: FixtureEntry): GameEntry[] {
  const players = playersOf(base);
  const fixture = (options: FixtureSourceOptions) => () => new FixtureGameSource(base, options);
  const pending: AuthoritativeCommand = { type: "END_TURN" };
  const lobbyHost = lobbySnapshot(base, 0);
  const lobbyGuest = lobbySnapshot(base, 1);
  const ended: GameSnapshot = {
    ...lobbyHost,
    room: lobbyHost.room === null ? null : { ...lobbyHost.room, status: "abandoned", endedAt: "2026-10-15T12:00:00.000Z", endedByPlayerId: players[0]?.playerId ?? null },
  };
  const shell = (id: string, title: string, description: string, screen: ScreenKind, makeSource: () => GameSource): GameEntry => ({
    id,
    group: "Shell states",
    title,
    description,
    screen,
    makeSource,
    players,
  });
  return [
    shell("shell-home", "Home", "No saved seat.", "home", () => new StaticGameSource(EMPTY_SNAPSHOT)),
    shell("shell-home-saved", "Home with a saved seat", "Resume or forget the saved seat.", "home", () => new StaticGameSource({ ...EMPTY_SNAPSHOT, savedRoomCode: "KILN" })),
    shell("shell-lobby-host", "Lobby (host)", "Two computer seats; the host may start.", "lobby", () => new StaticGameSource(lobbyHost)),
    shell("shell-lobby-guest", "Lobby (guest)", "Waiting for the host.", "lobby", () => new StaticGameSource(lobbyGuest)),
    shell("shell-reconnecting", "Reconnecting", `${base.id} while reconnecting.`, "game", fixture({ status: { reconnecting: true } })),
    shell("shell-offline", "Offline", `${base.id} offline.`, "game", fixture({ status: { connection: "offline" } })),
    shell(
      "shell-computer-failure",
      "Computer turn failed",
      `${base.id} with a latched computer failure.`,
      "game",
      fixture({ status: { computerFailure: { revision: base.playerView.game.revision, error: { kind: "mp", code: "COMPUTER_TURN_FAILED" }, timedOut: false } } }),
    ),
    shell(
      "shell-unsent",
      "Unsent command",
      `${base.id} with a command whose outcome is unknown (Send again).`,
      "game",
      fixture({ status: { unsent: { commandId: "gallery-command", expectedRevision: base.playerView.game.revision, command: pending }, error: { kind: "mp", code: "SERVICE_UNAVAILABLE" } } }),
    ),
    shell("shell-ended", "Session ended", "The host ended the session.", "ended", () => new StaticGameSource(ended)),
  ];
}

function fixtureEntries(file: FixtureFile, group: (entry: FixtureFile["entries"][number]) => GameEntry["group"]): GameEntry[] {
  return file.entries.map((entry) => ({
    id: entry.id,
    group: group(entry),
    title: entry.name ?? entry.title ?? entry.id,
    description: entry.description ?? "",
    screen: "game",
    makeSource: () => new FixtureGameSource(entry),
    players: playersOf(entry),
    ...(entry.draftCommand === undefined ? {} : { draftCommand: entry.draftCommand }),
  }));
}

/**
 * Every gallery entry (§9.5): the `dev/*.gallery.tsx` pages, then — once the fixtures are
 * loaded — the shell states, every scripted scenario (windows and table states) and every played
 * moment. Pure; exported for tests.
 */
export function galleryEntries(pages: readonly GalleryPageModule[], files: readonly FixtureFile[] | null): Entry[] {
  const list: Entry[] = pages.map((page) => ({ id: page.gallery.id, group: "Pages", title: page.gallery.title, description: "", Page: page.default }));
  if (files === null) return list;
  const [scenarios, moments] = files;
  const firstMoment = moments?.entries[0];
  if (firstMoment !== undefined) list.push(...shellEntries(firstMoment));
  if (scenarios !== undefined) list.push(...fixtureEntries(scenarios, (entry) => (entry.kind === "table" ? "Table states" : "Windows")));
  if (moments !== undefined) list.push(...fixtureEntries(moments, () => "Moments"));
  return list;
}

// ── Hash ──────────────────────────────────────────────────────────────────────────────────

export interface GalleryLocation {
  id: string | null;
  lang: Locale;
  theme: ThemeChoice;
  board: PlayerId | null;
  /** No gallery chrome: the entry alone, as the app shows it. */
  bare: boolean;
}

/** Parses `#<id>?lang=zh-CN&theme=dark&board=p2&bare=1`. */
export function parseGalleryHash(hash: string): GalleryLocation {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const [idPart = "", query = ""] = raw.split("?", 2);
  const params = new URLSearchParams(query);
  const lang = params.get("lang");
  const theme = params.get("theme");
  const board = params.get("board");
  return {
    id: idPart === "" ? null : decodeURIComponent(idPart),
    lang: isLocale(lang) ? lang : "en",
    theme: isThemeChoice(theme) ? theme : "light",
    board: board === null || board === "" ? null : board,
    bare: params.get("bare") === "1",
  };
}

export function galleryHash(location: GalleryLocation): string {
  const params = new URLSearchParams();
  if (location.lang !== "en") params.set("lang", location.lang);
  if (location.theme !== "light") params.set("theme", location.theme);
  if (location.board !== null) params.set("board", location.board);
  if (location.bare) params.set("bare", "1");
  const query = params.toString();
  return `#${encodeURIComponent(location.id ?? "")}${query === "" ? "" : `?${query}`}`;
}

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function subscribeHash(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

// ── Rendering ─────────────────────────────────────────────────────────────────────────────

function Submissions({ source }: { source: GameSource }) {
  useSyncExternalStore(source.subscribe, source.getSnapshot, source.getServerSnapshot);
  if (!(source instanceof FixtureGameSource)) return null;
  const last = source.submissions().at(-1);
  if (last === undefined) return <p className="gallery-sent">Confirm shows the command here (nothing is sent).</p>;
  return (
    <p className="gallery-sent" data-would-send="">
      {last.error === null ? "Would send " : `Rejected (${last.error.code}): `}
      <code>{JSON.stringify(last.command)}</code>
    </p>
  );
}

/**
 * A draft store with the entry's `draftCommand` seeded as the open window's draft (the window's
 * own `fromCommand`), or an empty one. The draft is revalidated against the first model it is
 * read with, so a command the form cannot express simply leaves the window as it opens.
 */
export function seededDrafts(entry: GameEntry, source: GameSource): DraftStore {
  const drafts = new DraftStore();
  const command = entry.draftCommand;
  const snapshot = source.getSnapshot();
  const view = snapshot.view;
  if (command === undefined || view === null) return drafts;
  const model = buildGameModel(view, snapshot.seats);
  const engine = engineViewOf(view);
  const window = decisionWindow(view);
  const draft = WINDOWS[window.kind].draft.fromCommand(command, model, engine);
  if (draft !== null) drafts.seed(windowDraftKey(window), draft);
  return drafts;
}

function GameEntryView({ entry, location }: { entry: GameEntry; location: GalleryLocation }) {
  const source = useMemo(() => entry.makeSource(), [entry]);
  const drafts = useMemo(() => seededDrafts(entry, source), [entry, source]);
  const layout = useMemo(() => browserLayoutSource(), []);
  const ui = useMemo(
    () => new UiStore({ layout, effects: BROWSER_UI_EFFECTS, theme: location.theme, initial: location.board === null ? {} : { boardShown: location.board } }),
    [layout, location.board, location.theme],
  );
  const Screen = entry.screen === "home" ? HomeScreen : entry.screen === "lobby" ? LobbyScreen : entry.screen === "ended" ? EndedScreen : GameScreen;
  const stage = (
    <div className="gallery-stage" data-gallery-entry={entry.id}>
      <GameProvider source={source} registry={WINDOWS} drafts={drafts} ui={ui} layout={layout} devTools={false}>
        <Screen />
      </GameProvider>
    </div>
  );
  if (location.bare) {
    return (
      <>
        {stage}
        <Submissions source={source} />
      </>
    );
  }
  return (
    <>
      <Submissions source={source} />
      {stage}
    </>
  );
}

export function ScenarioGallery({ pages, loadFixtures }: ScenarioGalleryProps) {
  const hash = useSyncExternalStore(subscribeHash, currentHash, () => "");
  const location = parseGalleryHash(hash);
  const [files, setFiles] = useState<readonly FixtureFile[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadFixtures().then(
      (loaded) => {
        if (live) setFiles(loaded);
      },
      (error: unknown) => {
        if (live) setFailure(String(error));
      },
    );
    return () => {
      live = false;
    };
  }, [loadFixtures]);

  useEffect(() => {
    applyTheme(location.theme);
  }, [location.theme]);

  const entries = useMemo<Entry[]>(() => galleryEntries(pages, files), [pages, files]);

  const selected = entries.find((entry) => entry.id === location.id) ?? entries.find((entry) => entry.group === "Windows") ?? entries[0] ?? null;
  const go = (patch: Partial<GalleryLocation>) => {
    window.location.hash = galleryHash({ ...location, id: selected?.id ?? null, ...patch });
  };
  const groups = ["Pages", "Shell states", "Windows", "Table states", "Moments"] as const;

  if (location.bare) {
    return (
      <I18nProvider locale={location.lang}>
        <div className="gallery-bare" data-gallery-ready={files === null ? undefined : ""}>
          {failure === null ? null : <p className="gallery-error">Fixtures failed to load: {failure}</p>}
          {selected === null ? null : selected.group === "Pages" ? (
            <selected.Page />
          ) : (
            <GameEntryView key={`${selected.id}|${location.board ?? ""}|${location.theme}`} entry={selected} location={location} />
          )}
        </div>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider locale={location.lang}>
      <div className="gallery" lang="en" data-gallery-ready={files === null ? undefined : ""}>
        <nav className="gallery-index" aria-label="Gallery entries">
          <h1 className="gallery-title">Kiln Opening · gallery</h1>
          {failure === null ? null : <p className="gallery-error">Fixtures failed to load: {failure}</p>}
          {files === null && failure === null ? <p>Loading fixtures…</p> : null}
          {groups.map((group) => {
            const inGroup = entries.filter((entry) => entry.group === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} className="gallery-group">
                <h2>{group}</h2>
                <ul>
                  {inGroup.map((entry) => (
                    <li key={entry.id}>
                      <a href={galleryHash({ ...location, id: entry.id, board: null })} aria-current={entry.id === selected?.id ? "page" : undefined}>
                        {entry.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
        <div className="gallery-main">
          {selected === null ? null : (
            <header className="gallery-bar">
              <div>
                <strong>{selected.title}</strong> <code>{selected.id}</code>
                {selected.description === "" ? null : <p>{selected.description}</p>}
              </div>
              <div className="gallery-controls" role="group" aria-label="View">
                {(["en", "zh-CN"] as const).map((lang) => (
                  <button key={lang} type="button" lang={lang === "en" ? "en" : "zh-Hans"} aria-pressed={location.lang === lang} onClick={() => go({ lang })}>
                    {lang === "en" ? "EN" : "中文"}
                  </button>
                ))}
                {(["light", "dark", "system"] as const).map((theme) => (
                  <button key={theme} type="button" aria-pressed={location.theme === theme} onClick={() => go({ theme })}>
                    {theme}
                  </button>
                ))}
                {selected.group === "Pages" ? null : (
                  <label>
                    Board{" "}
                    <select value={location.board ?? ""} onChange={(event) => go({ board: event.target.value === "" ? null : event.target.value })}>
                      <option value="">viewer</option>
                      {selected.players.map((player) => (
                        <option key={player.playerId} value={player.playerId}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </header>
          )}
          <div lang={location.lang === "zh-CN" ? "zh-Hans" : "en"}>
            {selected === null ? null : selected.group === "Pages" ? (
              <selected.Page />
            ) : (
              <GameEntryView key={`${selected.id}|${location.board ?? ""}|${location.theme}`} entry={selected} location={location} />
            )}
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}

