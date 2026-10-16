import { defineNamespace } from "../defineNamespace.ts";

/**
 * `boards` namespace: Kiln Player Boards, personal spaces, Tech slots. Owned by B2 (UI_V1.6.1_ARCHITECTURE §4.2).
 *
 * D7: a second personal space is *added* by learning a Tech ("Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设);
 * before that the board shows `formatRuleError(PERSONAL_SPACE_LOCKED)` ("Learn a … Tech to add
 * this space"). No string here says lock or unlock. Numbers are placeholders (§5 gap 19).
 */
export const boards = defineNamespace({
  en: {
    // D1 board area.
    "area.label": "Kiln Player Boards",
    "area.yourWorkshop": "Your workshop",
    "area.tab": "{name} · {kiln}",

    // One Kiln Player Board (wireframe `boardFull`).
    "board.firstPlayer": "First Player",
    "board.recognition": "Recognition {n}/{max}",
    "board.publicOnly": "Public information",
    "board.vp": "<b>{n}</b> VP",
    "board.resources": "Resources",
    "board.workers": "Workers",
    "board.workersLeft": "{n} left",
    "board.hand": "Hand",
    "board.handHidden": "{n} · contents hidden",
    "board.completed": "Completed",
    "board.completedOrder": "{order} · {vp}",
    "board.noKiln": "No Kiln chosen yet",

    // Kiln Tradition and the marker line (wireframe `kilnTrad`, `hmLine`).
    "kiln.tradition": "{kiln} · {ability}",
    "markers.heatFaceDownOn": "Heat marker (face down) on <b>{ceramic}</b>",
    "markers.heatValueOn": "Heat marker {value} on <b>{ceramic}</b>",
    "markers.heatSupply": "Heat marker in supply",
    "markers.kilnMasterOn": "Kiln Master marker {value} on <b>{ceramic}</b>",
    "markers.imperial": "Imperial Kiln: {state}",
    "markers.imperialEmpty": "empty this round",
    "markers.imperialNotYet": "not yet gained",

    // Personal spaces (wireframe `personalSpaces`; D7).
    "spaces.addedBy": "Added by <b>{tech}</b>",
    "spaces.empty": "Empty space",
    "spaces.pending": "Chosen in your decision",

    // Tech slots (wireframe `techSlots`).
    "techSlots.title": "Tech slots",
    "techSlots.empty": "empty",
    "techSlots.emptyLabel": "{discipline}: empty",

    // Ceramics (wireframe `ceramicsRow`).
    "ceramics.title": "Ceramics",
    "ceramics.shaped": "Shaped",
    "ceramics.inKiln": "In kiln",
    "ceramics.finished": "Finished",
    "ceramics.none": "None yet",
    "ceramics.count": { one: "{n} ceramic", other: "{n} ceramics" },

    // Workers (wireframe `workersRow`).
    "workers.at": "{worker} at {location}",
  },
  zh: {
    "area.label": "窑口板",
    "area.yourWorkshop": "你的作坊",
    "area.tab": "{name} · {kiln}",

    "board.firstPlayer": "起始玩家",
    "board.recognition": "声望{n}／{max}",
    "board.publicOnly": "公开信息",
    "board.vp": "<b>{n}</b>分",
    "board.resources": "资源",
    "board.workers": "工人",
    "board.workersLeft": "余{n}名",
    "board.hand": "手牌",
    "board.handHidden": "{n}张 · 牌面保密",
    "board.completed": "已完成",
    "board.completedOrder": "{order} · {vp}",
    "board.noKiln": "尚未选定窑口",

    "kiln.tradition": "{kiln} · {ability}",
    "markers.heatFaceDownOn": "火标（暗置）在<b>{ceramic}</b>上",
    "markers.heatValueOn": "火标{value}在<b>{ceramic}</b>上",
    "markers.heatSupply": "火标在手",
    "markers.kilnMasterOn": "窑工标{value}在<b>{ceramic}</b>上",
    "markers.imperial": "御窑：{state}",
    "markers.imperialEmpty": "本轮空着",
    "markers.imperialNotYet": "尚未获得",

    "spaces.addedBy": "由「<b>{tech}</b>」添设",
    "spaces.empty": "空工位",
    "spaces.pending": "已在决断中选定",

    "techSlots.title": "技艺位",
    "techSlots.empty": "空",
    "techSlots.emptyLabel": "{discipline}：空",

    "ceramics.title": "器物",
    "ceramics.shaped": "坯",
    "ceramics.inKiln": "入窑",
    "ceramics.finished": "成器",
    "ceramics.none": "暂无",
    "ceramics.count": "{n}件",

    "workers.at": "{worker}在{location}",
  },
});
