/**
 * Kit gallery (dev only, UI_V1.6.1_ARCHITECTURE §4.2, §9.5): every kit control and piece, in the
 * light and the dark theme side by side, at the real type scale (12px floor; 13px for Chinese
 * body text). Discovered by `dev/gallery-main.tsx` through `import.meta.glob("./*.gallery.tsx")`:
 * the default export is the page, `gallery` its id and title.
 *
 * Interactive: every control works (selections, tabs, sheet, menu, reorder, details), so the
 * owner and Playwright can check focus, keyboard use and touch targets here.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { DECORATIONS, GLAZES, QUALITIES, SHAPES } from "../../game/index.ts";
import type { CeramicState, FireModifier } from "../../game/index.ts";
import { I18nProvider, useOptionalLocale, useT } from "../i18n/I18nProvider.tsx";
import { decorationName, glazeName, locationEffectText, locationName, qualityName, resourceName, shapeName, techName } from "../i18n/content.ts";
import { ceramicLabel } from "../i18n/ceramicLabel.ts";
import { ruleErrorText } from "../i18n/errors.ts";
import { orderQualityLine } from "../i18n/orderText.ts";
import { Button } from "../kit/Button.tsx";
import { Chip } from "../kit/Chip.tsx";
import { Disclosure } from "../kit/Disclosure.tsx";
import { LanguageToggle } from "../kit/LanguageToggle.tsx";
import { MenuButton } from "../kit/MenuButton.tsx";
import { OptionCard } from "../kit/OptionCard.tsx";
import { OptionGroup } from "../kit/OptionGroup.tsx";
import { PieceDetail } from "../kit/PieceDetail.tsx";
import { ReorderList } from "../kit/ReorderList.tsx";
import { Sheet } from "../kit/Sheet.tsx";
import type { SheetState } from "../kit/Sheet.tsx";
import { Stepper } from "../kit/Stepper.tsx";
import { Tabs } from "../kit/Tabs.tsx";
import { ThemeToggle } from "../kit/ThemeToggle.tsx";
import type { ThemeChoice } from "../kit/ThemeToggle.tsx";
import { CardBack } from "../pieces/CardBack.tsx";
import { CeramicArt } from "../pieces/CeramicArt.tsx";
import { CeramicChip } from "../pieces/CeramicChip.tsx";
import { CrownIcon } from "../pieces/CrownIcon.tsx";
import { FireCard } from "../pieces/FireCard.tsx";
import { KilnMasterMarker } from "../pieces/KilnMasterMarker.tsx";
import { KilnDie } from "../pieces/KilnDie.tsx";
import { QualityChip } from "../pieces/QualityChip.tsx";
import { ResourceRow } from "../pieces/ResourceRow.tsx";
import { WorkerPiece } from "../pieces/WorkerPiece.tsx";
import "./kit.gallery.css";

export const gallery = { id: "kit", title: "Kit and pieces" } as const;

/** A small public view for the ceramic names: two players, a few ceramics. */
const SAMPLE_CERAMICS: Record<string, CeramicState> = {
  g1: { id: "g1", ownerId: "lin", vesselInstanceId: "vase-01", shape: "vase", decoration: "carved", formedInRound: 1, formedBy: "form_decorate",
    stage: "finished", glaze: "celadon", firedInRound: 1, crackle: false, quality: "fine" },
  g2: { id: "g2", ownerId: "zhao", vesselInstanceId: "washer-01", shape: "washer", decoration: "impressed", formedInRound: 1, formedBy: "form_decorate",
    stage: "finished", glaze: "grey_green", firedInRound: 1, crackle: true, quality: "fine" },
  g3: { id: "g3", ownerId: "lin", vesselInstanceId: "bowl-01", shape: "bowl", decoration: "plain", formedInRound: 2, formedBy: "form_decorate", stage: "shaped" },
  g4: { id: "g4", ownerId: "zhao", vesselInstanceId: "plate-01", shape: "plate", decoration: "painted", formedInRound: 2, formedBy: "form_decorate",
    stage: "loaded", glaze: "white", loadedInRound: 2, loadedBy: "glaze_load", placement: { kiln: "shared", spaceId: "high_2", stacked: false },
    kilnMasterMarker: 1 },
  g5: { id: "g5", ownerId: "lin", vesselInstanceId: "censer-01", shape: "censer", decoration: "painted", formedInRound: 2, formedBy: "form_decorate",
    stage: "finished", glaze: "moon_white", firedInRound: 2, crackle: false, quality: "masterpiece" },
  g6: { id: "g6", ownerId: "zhao", vesselInstanceId: "bowl-02", shape: "bowl", decoration: "carved", formedInRound: 2, formedBy: "form_decorate",
    stage: "finished", glaze: "celadon", firedInRound: 2, crackle: false, quality: "flawed" },
};
const SAMPLE_VIEW = { viewerId: "lin", game: { players: { lin: { displayName: "Lin" }, zhao: { displayName: "Zhao" } }, ceramics: SAMPLE_CERAMICS } };
const SEAT: Record<string, number> = { lin: 0, zhao: 1 };

/**
 * Sample text for this dev page only, in both languages, so the owner's Chinese review sees no
 * English. Game words come from the catalogue and content accessors; these are filler for
 * controls whose real text belongs to other packages' namespaces.
 */
const SAMPLE_TEXT = {
  en: {
    homeTab: "Your workshop",
    boards: "Kiln Player Boards",
    boardOf: "{name}: board",
    shape: "Shape",
    chooseOne: "Choose exactly 1.",
    subEditor: "Sub-editor region (sibling of the label)",
    formFields: "Decision form fields.",
    copyCode: "Copy room code",
    leaveView: "Leave view",
    endSession: "End session",
    bottomOrder: "Return to the bottom, first to last",
    seat: "Seat {n}",
  },
  zh: {
    homeTab: "你的作坊",
    boards: "窑口板",
    boardOf: "{name}：窑口板",
    shape: "器型",
    chooseOne: "须恰选1张",
    subEditor: "子编辑区（位于标签之后）",
    formFields: "决策表单内容",
    copyCode: "复制房间代码",
    leaveView: "退出观看",
    endSession: "结束对局",
    bottomOrder: "依次放回牌库底，先放者在上",
    seat: "{n}号座",
  },
} as const;

type SampleKey = keyof typeof SAMPLE_TEXT.en;

/** Gallery-only sample text in the current language. */
function useSample(): (key: SampleKey, params?: Record<string, string | number>) => string {
  const t = useT();
  const table = t.locale === "zh-CN" ? SAMPLE_TEXT.zh : SAMPLE_TEXT.en;
  return (key, params = {}) => table[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="kg-section">
      <h3 className="kg-h" lang="en">{title}</h3>
      <div className="kg-body">{children}</div>
    </section>
  );
}

function Controls() {
  const t = useT();
  const sample = useSample();
  const [location, setLocation] = useState<string | null>("guild_hall");
  const [shape, setShape] = useState<string | null>("vase");
  const [trim, setTrim] = useState<readonly string[]>(["S01"]);
  const [clay, setClay] = useState(2);
  const [board, setBoard] = useState("home");
  const [sheet, setSheet] = useState<SheetState>("peek");
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [bottom, setBottom] = useState<Array<"T10" | "T15" | "T22">>(["T10", "T15", "T22"]);
  const boardTabs = [
    { id: "home", label: sample("homeTab"), home: true, seat: 0 },
    { id: "zhao", label: "Zhao", seat: 1 },
    { id: "su", label: "Su", seat: 2 },
    { id: "wu", label: "Wu", seat: 3 },
  ];
  return (
    <>
      <Section title="Button">
        <div className="kg-row">
          <Button variant="primary" action="confirm">{t("common.verb.confirm")}</Button>
          <Button action="alt">{t("common.verb.endTurn")}</Button>
          <Button variant="quiet">{t("common.verb.clear")}</Button>
          <Button variant="danger">{t("common.verb.discard")}</Button>
          <Button disabled>{t("common.verb.confirm")}</Button>
          <Button variant="primary" busy>{t("common.status.sending")}</Button>
          <Button size="sm" pressed>{t("common.status.ready")}</Button>
          <Button size="sm" pressed={false}>{t("common.status.usedThisRound")}</Button>
        </div>
      </Section>
      <Section title="OptionGroup · OptionCard">
        <OptionGroup legend={t("common.verb.chooseLocation")} step={2} aside="2 / 3" name={`gallery-location-${t.locale}`} value={location} onChange={(value) => setLocation(value)}>
          <OptionCard value="materials_yard" title={locationName("materials_yard", t.locale)} meta="2/4" description={t("locationSummary.materials_yard.apprentice")} />
          <OptionCard value="guild_hall" title={locationName("guild_hall", t.locale)} description={t("locationSummary.guild_hall.shifu")} controls={`gallery-sub-${t.locale}`}>
            {location === "guild_hall"
              ? <div id={`gallery-sub-${t.locale}`} className="kg-sub" role="group" aria-label={locationName("guild_hall", t.locale)}>{sample("subEditor")}</div>
              : null}
          </OptionCard>
          <OptionCard
            value="magistrates_hall"
            title={locationName("magistrates_hall", t.locale)}
            disabled
            reason={ruleErrorText({ code: "INSUFFICIENT_RESOURCES", details: { resource: "coins", needed: 4, have: 1 } }, t)}
          />
        </OptionGroup>
        <OptionGroup legend={sample("shape")} name={`gallery-shape-${t.locale}`} value={shape} onChange={(value) => setShape(value)} layout="pills">
          {SHAPES.map((value) => (
            <OptionCard
              key={value}
              variant="pill"
              value={value}
              title={shapeName(value, t.locale)}
              disabled={value === "censer"}
              {...(value === "censer" ? { reason: ruleErrorText({ code: "INSUFFICIENT_RESOURCES", details: { resource: "clay", needed: 3, have: 2 } }, t) } : {})}
            />
          ))}
        </OptionGroup>
        <OptionGroup
          legend={t("common.verb.discard")}
          type="checkbox"
          name={`gallery-trim-${t.locale}`}
          values={trim}
          onChange={(value, checked) => setTrim((current) => (checked ? [...current, value] : current.filter((id) => id !== value)))}
          layout="grid"
          description={sample("chooseOne")}
        >
          {["S01", "O12", "O33"].map((id) => <OptionCard key={id} value={id} title={id} />)}
        </OptionGroup>
      </Section>
      <Section title="Stepper · Disclosure · Chip">
        <div className="kg-row">
          <Stepper label={resourceName("clay", t.locale)} value={clay} min={0} max={4} onChange={setClay} />
          <Disclosure summary={t("common.kit.details")}>{locationEffectText("materials_yard", "shifu", t.locale)}</Disclosure>
          <Disclosure summary={t("common.unavailable")} tone="warn">{ruleErrorText({ code: "RECOGNITION_GATE", details: {} }, t)}</Disclosure>
        </div>
        <div className="kg-row">
          <Chip>{t("common.empty")}</Chip>
          <Chip tone="ok">{t("common.status.ready")}</Chip>
          <Chip tone="used">{t("common.status.usedThisRound")}</Chip>
          <Chip tone="gold" icon={<CrownIcon />}>×2</Chip>
          <Chip tone="warn">{t("common.unavailable")}</Chip>
          <Chip tone="private">{t("common.status.onlyYou")}</Chip>
          <Chip wrap>{orderQualityLine("O32", t)}</Chip>
        </div>
      </Section>
      <Section title="Tabs (D1 board tabs)">
        <Tabs
          label={sample("boards")}
          selected={board}
          onSelect={setBoard}
          tabs={boardTabs}
        >
          <div className="kg-panel">{sample("boardOf", { name: boardTabs.find((tab) => tab.id === board)?.label ?? "" })}</div>
        </Tabs>
      </Section>
      <Section title="Sheet (phone decision pane; strip below 900px)">
        <div className="kg-sheet">
          <Sheet state={sheet} onStateChange={setSheet} strip={<><b>{t("common.status.yourTurn")}</b> · {t("common.verb.placeWorker")}</>} stripAction={t("common.verb.decide")}>
            <h2 className="kg-sheet-h">{t("common.verb.placeWorker")}</h2>
            <p>{sample("formFields")}</p>
          </Sheet>
        </div>
      </Section>
      <Section title="MenuButton · LanguageToggle · ThemeToggle">
        <div className="kg-row">
          <MenuButton
            label="⋯"
            ariaLabel={t("common.kit.menu")}
            align="start"
            items={[
              ...(["light", "dark", "system"] as const).map((choice) => ({
                id: choice,
                label: t(`common.theme.${choice}`),
                checked: theme === choice,
                group: t("common.theme.label"),
                keepOpen: true,
                onSelect: () => setTheme(choice),
              })),
              { id: "copy", label: sample("copyCode"), onSelect: () => undefined },
              { id: "leave", label: sample("leaveView"), onSelect: () => undefined },
              { id: "end", label: sample("endSession"), onSelect: () => undefined, danger: true },
            ]}
          />
          <LanguageToggle />
          <ThemeToggle value={theme} onChange={setTheme} />
        </div>
      </Section>
      <Section title="ReorderList (Guild Hall bottom order)">
        <ReorderList
          label={sample("bottomOrder")}
          items={bottom.map((id) => ({ id, label: techName(id, t.locale) }))}
          onReorder={(ids) => setBottom(ids as Array<"T10" | "T15" | "T22">)}
        />
      </Section>
      <Section title="PieceDetail">
        <div className="kg-row">
          {(["g1", "g2", "g4"] as const).map((id) => {
            const ceramic = SAMPLE_CERAMICS[id];
            if (ceramic === undefined) return null;
            const quality = ceramic.stage === "finished" ? ceramic.quality : null;
            return (
              <PieceDetail
                key={id}
                label={ceramicLabel(ceramic, SAMPLE_VIEW, { locale: t })}
                trigger={<CeramicChip ceramic={{ ...ceramic, quality }} seat={SEAT[ceramic.ownerId] ?? 0} view={SAMPLE_VIEW} marker={ceramic.stage === "loaded" ? ceramic.kilnMasterMarker : null} motionKey={null} />}
              >
                <p>{shapeName(ceramic.shape, t.locale)} · {decorationName(ceramic.decoration, t.locale)}</p>
                {quality === null ? null : <p>{qualityName(quality, t.locale)}</p>}
              </PieceDetail>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function Pieces() {
  const t = useT();
  const sample = useSample();
  return (
    <>
      <Section title="CeramicArt: 20 cutouts × (4 Glazes + unglazed)">
        <div className="kg-art-grid">
          {SHAPES.flatMap((shape) => DECORATIONS.map((decoration) => (
            <div key={`${shape}-${decoration}`} className="kg-art-cell">
              {[...GLAZES, null].map((glaze) => <CeramicArt key={glaze ?? "clay"} shape={shape} decoration={decoration} glaze={glaze} size={28} />)}
              <span className="kg-caption">{shapeName(shape, t.locale)} · {decorationName(decoration, t.locale)}</span>
            </div>
          )))}
        </div>
        <div className="kg-row">
          {GLAZES.map((glaze) => (
            <span key={glaze} className="kg-inline"><CeramicArt shape="vase" decoration="carved" glaze={glaze} crackle size={44} />{glazeName(glaze, t.locale)}</span>
          ))}
        </div>
      </Section>
      <Section title="CeramicChip (no IDs; words for assistive technology)">
        <div className="kg-row kg-chips">
          {Object.values(SAMPLE_CERAMICS).map((ceramic) => (
            <CeramicChip
              key={ceramic.id}
              ceramic={{ ...ceramic, quality: ceramic.stage === "finished" ? ceramic.quality : null }}
              seat={SEAT[ceramic.ownerId] ?? 0}
              view={SAMPLE_VIEW}
              marker={ceramic.stage === "loaded" ? ceramic.kilnMasterMarker : null}
              pending={ceramic.id === "g3"}
              highlighted={ceramic.id === "g5"}
              motionKey={null}
            />
          ))}
          <CeramicChip ceramic={{ ownerId: "zhao", shape: "plate", decoration: "plain", glaze: "white", quality: "standard" }} seat={1} compactQuality motionKey={null} />
        </div>
      </Section>
      <Section title="QualityChip">
        <div className="kg-row">
          {[...QUALITIES].reverse().map((quality) => <QualityChip key={quality} quality={quality} />)}
          {[...QUALITIES].reverse().map((quality) => <QualityChip key={`${quality}-c`} quality={quality} compact />)}
        </div>
      </Section>
      <Section title="WorkerPiece">
        <div className="kg-row">
          {[0, 1, 2, 3].map((seat) => (
            <span key={seat} className="kg-inline">
              <WorkerPiece kind="shifu" seat={seat} ownerName={sample("seat", { n: seat + 1 })} />
              <WorkerPiece kind="apprentice" seat={seat} ownerName={sample("seat", { n: seat + 1 })} />
              <WorkerPiece kind="shifu" seat={seat} variant="full" ownerName={sample("seat", { n: seat + 1 })} />
              <WorkerPiece kind="apprentice" seat={seat} variant="full" ownerName={sample("seat", { n: seat + 1 })} />
            </span>
          ))}
          <WorkerPiece kind="apprentice" seat={0} own senior />
          <WorkerPiece kind="apprentice" seat={0} own dim />
        </div>
      </Section>
      <Section title="KilnMasterMarker · FireCard · KilnDie · CardBack · CrownIcon">
        <div className="kg-row">
          <KilnMasterMarker value={1} />
          <KilnMasterMarker value={-1} />
        </div>
        <div className="kg-row">
          {([-2, -1, 0, 1, 2] as FireModifier[]).map((value) => <FireCard key={value} value={value} />)}
          <FireCard value={null} />
          <FireCard value={-1} size="lg" />
          <FireCard value={null} size="lg" />
        </div>
        <div className="kg-row">
          <KilnDie value={1} />
          <KilnDie value={2} />
          <KilnDie value={3} size="lg" />
          <KilnDie value={null} />
          <CardBack count={0} />
          <CardBack count={1} />
          <CardBack count={3} showCount label={t("common.piece.ordersInHand", { n: 3 })} />
          <CrownIcon />
          <CrownIcon count={2} />
        </div>
      </Section>
      <Section title="ResourceRow">
        <ResourceRow resources={{ clay: 2, wood: 1, coins: 3 }} />
        <ResourceRow resources={{ clay: 1, wood: 0, coins: 1 }} />
      </Section>
    </>
  );
}

function ThemePane({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className="kg-pane" data-theme={theme}>
      <h2 className="kg-title" lang="en">{theme === "light" ? "Light" : "Dark"}</h2>
      <Controls />
      <Pieces />
    </div>
  );
}

function Page() {
  return (
    <main className="kg">
      <h1 className="kg-page-title" lang="en">{gallery.title}</h1>
      <div className="kg-panes">
        <ThemePane theme="light" />
        <ThemePane theme="dark" />
      </div>
    </main>
  );
}

export default function KitGallery() {
  const locale = useOptionalLocale();
  return locale === null ? <I18nProvider><Page /></I18nProvider> : <Page />;
}
