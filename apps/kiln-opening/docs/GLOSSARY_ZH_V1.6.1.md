# 《开窑》V1.6.1 简体中文术语与配件文字（定稿用词表）

Status: binding Simplified Chinese terminology for V1.6.1 (AGENTS.md source 8).
Mechanical authority remains [KILN_OPENING_v1.6.1_EN_SOURCE.md](./KILN_OPENING_v1.6.1_EN_SOURCE.md)
plus the rulings in [RULEBOOK_AUDIT_V1.6.1.md](./RULEBOOK_AUDIT_V1.6.1.md). If this glossary and
the English source ever disagree on a number, cost, timing, condition or limit, the English
source wins and this file must be corrected; the Chinese wording never changes a rule.

Owner instruction (2026-10-14): the Chinese edition is **not** a literal translation. It uses the
register of a Song-dynasty kiln workshop, while staying instantly readable for modern Chinese
board-game players. Every term below is fixed: use it in i18n strings, `*Zh` data fields, tile
art, logs and help text, and do not coin synonyms. Each English term maps to exactly one Chinese
term; where two Chinese forms exist (e.g. 装窑 and 施釉入窑), each answers a different English
wording, as listed in §2.

Revision 2 (2026-10-14) applies the terminology review; see §10.
Owner decision D7 (2026-10-15) retires every lock/unlock term for the second personal space; see §10.

---

## 1. 文风规范 Style guide

### 1.1 语体

- **宋时窑坊口吻，现代桌游清晰度。** 名称取宋代匠作、窑务、市井与官署用语（坯、釉、匣钵、
  覆烧、火照、牙行、漕运、州衙、御窑、贡瓷），规则句子用简洁的现代书面语，可略带文言节奏
  （“每轮一次”“定品后”“付1柴”），但不用生僻字、不用整句文言，不用明清器物或制度名（如博古架、多宝格）。
- **名词短，动词实。** 地点、技艺、阶段名以 2–4 字为宜；动作用单音或双音动词：派工、制坯、
  饰纹、施釉、装窑、承接、完成（委托）、交付、习得、翻、亮、弃、收。
- **机制先于意境。** 每个数字、费用、时机、条件、上限都必须保留；有歧义时宁可多写半句。
- **可选与强制（R4）：** 技艺与窑口能力除明写“须”者外一律可选；放弃不消耗“每轮一次”。
  - 凡需玩家作选择、付费或可能不利的效果，文字中必写“可”或“你可以”。
  - 强制效果写“须”。V1.6.1 中唯一强制的技艺效果是色样簿“习得时”的承接（只要至少能看1张）。
  - 纯收益型效果（放弃毫无所得）以陈述句书写，不写“可”：看火、大陶车与饰坯匣的减免、汝窑、官窑、
    贡瓷、清玩斋、色样簿的持续上限、终局陈列与计分。这只是写法；规则上它们依 R4 仍属可选。
    数字版自动结算看火已由审计记录，其余是否自动结算由 IMPLEMENTATION_DECISIONS 记录（见第9节）。
  - 不得把“既无‘可’也无‘须’”理解为强制。
- **地点名与动作词分开：** “制坯饰纹”“施釉装窑”只作地点名；指在该地点的工人行动时写
  “制坯饰纹行动”“施釉装窑行动”。泛指动作时，form 写“制坯”，load 写“装窑”，glaze and load 写
  “施釉入窑”（或“为其施釉并装窑”）；泛指句中不得连写“施釉装窑”四字，以免读作限于该行动。
- **量词：** 器物与坯用“件”（1件坯，不写“1坯”）；工人用“名”；委托、技艺牌、窑火牌、控火牌用“张”；
  拥有的技艺与作为费用项的纹饰用“项”（“至多3项技艺”“1项纹饰少付1铜钱”）；标记、御令用“个”。

### 1.2 标点与数字

- 使用全角中文标点：，。；：（）「」“”、。并列选项在紧凑文字中用全角斜线“／”。
- 数字一律用半角阿拉伯数字，数字与单位之间**不加空格**：`2泥`、`3铜钱`、`4分`、`1件`、`第3轮`。
- 正负修正用 `+1`、`−1`（U+2212 减号，与英文源一致），范围用短横 `0–5`，张数用 `×`：`−2×1`。
- 计算式用半角 `=` `+`，两侧留空格：`实际火候 = 全窑火候 + 温区修正 + 火标`。不用全角“＋”；
  紧凑文字中的“并且”写“并”或“，”。
- 委托要求：单件委托各项以 ` · ` 分隔；多件委托各维度以全角“；”分隔；同一维度内的并列器型
  用 ` + `（指定器型组合）或“、……或”（任选其一）。
- 品质高低在界面图例中一律按 `臻品 > 上品 > 良品 > 瑕品` 排列显示。

### 1.3 费用、分数与御令的写法

| 内容 | 紧凑写法（牌面／按钮） | 完整写法（规则正文） |
| --- | --- | --- |
| 费用 | `付2铜钱`、`付1泥1柴` | `支付2铜钱`、`支付1泥和1铜钱` |
| 获得资源 | `得1泥1柴` | `获得1泥和1柴` |
| 胜利分 VP | `+4分`、`4分` | `获得4分`（中文正文不写“VP”，统一用“分”） |
| 御令 Crown | 图标 `👑`，数量写 `👑×2` | `2个御令`；“印有至少1个御令的委托” |
| 品质门槛 | `上品以上` | `上品或臻品` |
| 折扣 | `−1铜钱`、`泥总费−2（最低0）` | `少付1铜钱`、`泥总费用减少2，最低为0` |

### 1.4 时机用语（固定写法）

时机标签在提示文字中可用「」括起；完整规则中直接作句首状语。短提示统一写作
`每轮一次，〈时机〉：〈效果〉`；无特定时机时写 `每轮一次：〈效果〉`。

| EN timing | 固定中文 | 对应步骤 |
| --- | --- | --- |
| Once per round | 每轮一次 | 开工时重置 |
| Once per game | 每局一次 | — |
| When acquired | 习得时 | 于陶工行习得时立即结算 |
| Ongoing | 持续 | — |
| Before or after your worker action | 你的工人行动之前或之后 | 派工阶段，自己回合内 |
| At the start of the Work Phase | 派工阶段开始时 | 按起始玩家顺序 |
| When Contributions are chosen | 选控火时 | 烧窑步骤1 |
| After Base Heat is determined, before Heat markers are set | 基础火候定后、翻火标前 | 烧窑步骤4 |
| In the Heat marker step | 火标步骤中 | 烧窑步骤5 |
| After Actual Heat is calculated, before Quality is assigned | 实际火候算出后、定品前 | 烧窑步骤8 |
| After Quality is assigned | 定品后 | 烧窑步骤10 |
| While completing an Order | 完成委托时 | 交货阶段或漕船 |
| At game end | 终局时 | 终局计分 |

### 1.5 禁用与慎用词

| 不要写 | 原因 | 改用 |
| --- | --- | --- |
| 陶车坊、纹饰坊、釉饰坊、窑坊、杂作行、朝廷赞助 | V1.4／V1.2.7 旧地点，已废除或改名 | 制坯饰纹、施釉装窑、漕运码头、州衙 |
| 开片（作为纹饰）、开片釉 | V1.6.1 中开片只由哥窑在窑中产生 | 画花（第4种纹饰）；开片器、开片标 |
| 彩绘、绘花 | 已定为“画花”（见第6节） | 画花 |
| 博古架、多宝格 | 清代家具名，时代不符 | 清玩斋 |
| 起始技艺、进阶技艺 | V1.6.1 没有起始技艺，“进阶”已无区分意义 | 技艺 |
| 超容量、超放、师傅可挤入 | V1.6.1 容量绝对，无师傅超放 | — |
| 已施釉（未装窑）状态 | 施釉与装窑是同一动作 | 坯 → 入窑 |
| 窑坊师傅调位、移窑 | 旧机制 | 火标 |
| VP、胜利点、积分（正文中） | 统一用“分” | 分 |
| 御印、御玺 | 易与已废除的 Imperial Seal 混淆 | 御令（👑） |
| 回合（指一轮） | “回合”专指某位玩家的一次行动机会 | 轮 |
| 展览、展示（终局） | 统一 | 陈列 |
| 公开委托区、展示区 | 统一 | 委托榜 |
| 交货（指完成某张委托的动作） | “交货”只用于阶段名“交货阶段” | 完成委托；器物状态用“交付／已交付” |
| 跳过、弃权（指派工阶段不派工） | “跳过”是界面按钮（放弃可选步骤） | 停派（不允许） |
| 暗注、强压火、猛添柴 | “暗注”有赌博意味；后两者是英文源没有的自造牌名，易被当作额外控火牌 | 柴簿加柴；压火−2／添柴+2 |
| 泛指句中的“施釉装窑”“制坯饰纹” | 会被读作限于该地点行动 | 施釉入窑；制坯（见1.1） |
| 封条、启封、封存、上锁、解锁（指第二工位） | D7：数字版没有“锁”的概念，第二工位是习得技艺后添设的 | 第二工位；添设；“习得…技艺即添此工位”；“由「…」添设” |

---

## 2. 术语表 Term tables

### 2.1 游戏名称

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Kiln Opening | 《开窑》 | 沿用。开窑即烧成后启窑取器，正是全局高潮。 |
| Build the workshop. Share the kiln. Master the craft. | 立作坊，共窑火，精匠艺。 | 三字对句，替代旧“经营作坊，共用一窑，精进技艺”。 |
| A medium-weight worker-placement game about Song Dynasty ceramic workshops | 一款以宋代窑场作坊为题的中度派工策略游戏 | “派工”即工人放置，见 2.2。 |
| 2–4 players · 90–120 minutes · Ages 12+ | 2–4人 · 90–120分钟 · 12岁以上 | — |
| Round (game lasts 5 rounds) | 轮（共5轮） | 一轮 = 开工至收工。 |
| Turn | 回合 | 某位玩家的一次行动机会，如“轮到你的回合”。 |
| First Player / First Player marker | 起始玩家／起始玩家标 | 沿用通行桌游用语，清晰优先。 |
| in First Player order | 按起始玩家顺序 | 从起始玩家起顺时针。 |
| clockwise | 顺时针 | — |
| VP | 分 | 见 1.3。 |

### 2.2 工人

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Worker | 工人 | 沿用。 |
| Shifu | 师傅 | 沿用。每人1名。 |
| Apprentice | 学徒 | 沿用。每人3名。 |
| Apprentice effect / Shifu effect | 学徒效果／师傅效果 | — |
| place a worker | 派工；派1名工人至… | 动词固定为“派”。 |
| available worker | 可派工人 | — |
| pass (Work Phase) | 停派（不允许） | “派工阶段不得停派”。“跳过”只作界面按钮。 |
| worker action | 工人行动 | 技艺效果与御烧优先**不是**工人行动。 |
| Tech effect | 技艺效果 | — |
| main action | 主行动 | “至少须能执行1次主行动方可派工”。 |
| up to 2 | 至多2（即1或2，不能为0） | 不带量词；按所指对象补量词：“至多2件坯”“至多2张主委托”。 |

### 2.3 资源

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Clay | 泥 | 沿用，单字便于图标与算式。 |
| Wood | 柴 | 沿用；兼作窑柴（控火燃料）。 |
| Coins | 铜钱 | 沿用；正文中不简写为“钱”。 |
| resources (Clay/Wood) | 泥／柴 | “获得3份泥／柴，任意组合”。 |
| general supply | 公共供应 | 无限，可用代用物。 |
| substitute component | 代用物 | — |

### 2.4 地点

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Central Action Board | 中央行动板 | — |
| Central location | 中央地点 | — |
| Personal location | 坊内地点 | 位于自己的窑口板上，“坊内”点明私用。 |
| space (of a location) | 工位 | 沿用。 |
| Materials Yard | 泥柴场 | 沿用。 |
| Commission Market | 瓷牙行 | 沿用。宋代居间说合买卖者称牙人、牙侩，“牙行”一名虽多见于明清，但最为玩家熟知；此处“行”作“铺行”解，与陶工行的“行会”之“行”不同（见第6节）。 |
| Guild Hall | 陶工行 | 沿用旧名（原 Guild & Academy）。宋代“行”即行会，名实相符，无需改动。 |
| Canal Wharf | 漕运码头 | 新名（原“杂作行”）。漕运是宋代命脉；与技艺“漕船”呼应。 |
| Magistrate's Hall | 州衙 | 新名（原“朝廷赞助”）。宋代窑口多以州名（汝州、定州），由州衙荐举入御府，符合“付钱升声望”的含义。 |
| Form & Decorate | 制坯饰纹 | 新名。坊内地点；“制坯”涵盖拉坯与模印，“饰纹”即施加纹饰。只作地点名；其工人行动写“制坯饰纹行动”。 |
| Glaze & Load | 施釉装窑 | 新名。与“制坯饰纹”四字对仗。只作地点名；其工人行动写“施釉装窑行动”。 |
| capacity | 容量 | 绝对上限，无超放。 |
| uncapped | 不限 | — |
| occupied / unoccupied | 已占／空 | — |

### 2.5 玩家板与配件

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Kiln Player Board | 窑口板 | 原“窑口玩家板”，简化。 |
| Kiln Tradition | 窑口传承 | 沿用。 |
| second (personal) space | 第二工位 | 制坯饰纹、施釉装窑各有第二工位，习得相应门类技艺后添设（D7）。界面与文字不说“锁”“封”。 |
| add (a second space, by learning a Tech) | 添设 | 未有时写“习得坯作技艺即添此工位”（施釉装窑写“习得釉作技艺即添此工位”）；已有时写“由「⟨技艺⟩」添设”。 |
| second-space cover (physical prototype only) | 第二工位盖片 | 实体原型盖住尚未添设的第二工位；数字版无此配件（D7）。 |
| Tech slot | 技艺位 | 每板3个。 |
| Imperial Kiln area | 御窑区 | — |
| Shared Kiln Board | 共窑板 | 8个窑位：高温区3、中温区3、低温区2。按人数盖住部分窑位（停用）：4人不盖（3-3-2）；3人盖1高1中（2-2-2）；2人盖1高2中1低（2-1-1）。2–3人另盖州衙第二工位。 |
| Vessel card | 器型卡 | 沿用；非硬性上限。 |
| Ceramic | 器物 | 任一状态下的器型卡。规则正文统一用“器物”，不用“陶瓷件”。 |
| Main Order card / Starting Order card | 主委托卡／起始委托卡 | — |
| Advanced Tech tile | 技艺牌 | 计数用“张”。 |
| Fire card | 窑火牌 | 沿用。 |
| Kiln Contribution card | 控火牌 | 沿用。 |
| Imperial Recognition marker | 声望标 | — |
| Imperial Kiln tile | 御窑板块 | 沿用。 |
| Imperial Priority token | 御烧优先标 | — |
| Heat marker | 火标 | 新名，见 2.10。 |
| Kiln Master marker | 窑工标 | 随“窑工”技艺附带。 |
| Crackle marker | 开片标 | 哥窑专用。 |
| Round marker | 轮次标 | — |
| Kiln Die | 窑骰 | 新配件。点数1、1、2、2、3、3。 |
| VP marker / score track | 计分标／计分轨 | 每色1个计分标。 |
| Score pad | 计分纸 | 可代替计分轨。 |

### 2.6 器型 Shapes

| EN | 简体中文 | 泥费 |
| --- | --- | --- |
| Bowl | 碗 | 1泥 |
| Plate | 盘 | 1泥 |
| Brush Washer | 笔洗 | 1泥 |
| Vase | 瓶 | 2泥 |
| Censer | 香炉 | 2泥 |
| Shape | 器型 | 沿用。 |
| any Shape | 任意器型 | — |
| proxy | 代用物 | — |

### 2.7 纹饰 Decorations（制坯时选定并付费，每种2铜钱）

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Decoration | 纹饰 | 沿用。 |
| Plain | 素面 | 沿用。V1.6.1 中同样要付2铜钱。 |
| Carved | 刻花 | 沿用。 |
| Impressed | 印花 | 沿用。 |
| Painted | 画花 | **改名**（旧“彩绘”）。“刻花／划花／印花／画花”是宋瓷装饰的通行称谓，画花即磁州窑白地黑花一类笔绘；“彩”易让人联想明清五彩。划花不是游戏术语，不致混淆。 |
| decorate | 饰纹 | 动词。 |

### 2.8 釉 Glazes（装窑时选定）

| EN | 简体中文 | 适烧火候 |
| --- | --- | --- |
| Glaze | 釉 | 沿用。 |
| White | 白釉 | 1 |
| Celadon | 青釉 | 2 |
| Grey-Green | 灰青釉 | 3（灰青为官、哥窑常见釉色，沿用） |
| Moon White | 月白釉 | 4 |
| glaze (verb) | 施釉 | — |
| any Glaze | 任意釉 | — |

### 2.9 品质与器物状态

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Quality | 品质 | 沿用。高低：臻品 > 上品 > 良品 > 瑕品。 |
| Masterpiece | 臻品 | 火候差0。沿用。 |
| Fine | 上品 | 火候差1。排第二（臻品之下），界面图例须显示完整排序。 |
| Standard | 良品 | 火候差2。 |
| Flawed | 瑕品 | 火候差3或以上；不能用于完成委托，不能陈列。 |
| Standard+ | 良品以上 | 良品、上品或臻品。 |
| Fine+ | 上品以上 | 上品或臻品。 |
| assign Quality | 定品 | — |
| Shaped (state) / Shaped vessel | 坯（状态）／坯 | 新用词，取代“已成型器物”。记录器型与纹饰，存于作坊。计数写“1件坯”。 |
| Loaded | 入窑 | 另记录釉；在共窑或御窑中待烧。 |
| Fired | 成器 | 另记录品质；移入成器区。 |
| Finished Ceramics area | 成器区 | — |
| finished, undelivered ceramic | 成器（未交付） | — |
| deliver / Delivered | 交付／已交付 | 压在已完成委托下，不能再用。 |
| form (verb) | 制坯 | “制1件坯”。泛指，含练泥与定窑所制；限于地点行动时写“制坯饰纹行动”。 |
| load (verb) | 装窑 | 给坯施釉并放入空的启用窑位或自己空置的御窑。 |
| glaze and load (generic) | 施釉入窑 | 泛指任何方式的施釉装窑（含御烧优先）；限于地点行动时写“施釉装窑行动”。 |
| workshop (your own area) | 作坊 | — |

### 2.10 烧窑用语

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Shared Kiln | 共窑 | 沿用。 |
| kiln space | 窑位 | 沿用。 |
| active space | 启用窑位 | — |
| covered space (by player count) | 停用窑位 | 不称“封”。停用窑位不算空位，也不可使用。 |
| zone High / Middle / Low | 高温区（+1）／中温区（0）／低温区（−1） | 沿用。4人3-3-2，3人2-2-2，2人2-1-1（高-中-低）。 |
| zone modifier | 温区修正 | — |
| Kiln Die result | 窑骰点数 | 每轮开工时公开掷出。 |
| Base Heat | 基础火候 | 沿用。= 窑骰点数 + 控火修正之和，限定0–5。 |
| Global Heat | 全窑火候 | 沿用。= 基础火候 + 窑火修正，不设上下限。 |
| Actual Heat | 实际火候 | 沿用。单件器物所有。 |
| Preferred Heat | 适烧火候 | 沿用。 |
| Heat Difference | 火候差 | 沿用。 |
| Heat marker | 火标 | 新名（旧“师傅火候标记”）。两面+1／−1；暗置后在火标步骤翻定或收回。 |
| face-down | 暗置 | — |
| turn to +1 or −1 / return | 翻为+1或−1／收回 | — |
| Kiln Master marker | 窑工标 | 一切规则中视为火标。 |
| Crackle marker / Crackle ceramic | 开片标／开片器 | — |
| Imperial modifier (−1/0/+1, chosen at loading) | 御窑修正 | 装入御窑时公开选定并记录（R10、R11）。 |
| court-fired | 御匠代烧 | 御窑器物由宫中窑匠代烧，不受控火影响。见 4.8。 |
| Fire card / Fire deck / Fire discard pile | 窑火牌／窑火牌堆／窑火弃牌堆 | 弃牌堆正面朝上、公开；牌堆用尽时才洗混。 |
| Fire modifier | 窑火修正 | −2×1、−1×3、0×4、+1×3、+2×1。 |
| Contribution(s) | 控火 | 沿用。 |
| Contribution participant | 控火者 | 须在共窑中至少有1件器物；御窑器物不算。 |
| Bank the Fire | 压火 | 1柴，−1。沿用。 |
| Tend the Fire | 守火 | 0柴，0。沿用；永远付得起。 |
| Stoke the Fire | 添柴 | 1柴，+1。沿用。 |
| Fuel Ledger commitment | 柴簿加柴 | 选压火或添柴时随控火牌暗附1柴，与控火牌同时亮出；修正改为压火−2或添柴+2，共付2柴。不是另一张控火牌。 |
| reveal | 亮牌 | — |
| clamp to 0–5 | 限定在0–5 | — |
| salvage a Flawed ceramic | 折卖瑕品 | 弃1件本次烧成中仍为瑕品的器物，得2铜钱。 |
| firing (one event) | 本次烧成；一窑（短提示可写“本窑”） | “本次烧成中的器物”。 |
| Kiln Furniture modifier | 窑具修正 | 支烧窑具选定的−1、0或+1。 |

### 2.11 阶段与步骤

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Phase 1 Start of Round | 开工 | 新名（旧“回合开始”）。掷窑骰；第2–5轮轮换委托榜；重置“每轮一次”。 |
| Phase 2 Work Phase | 派工阶段 | 新名（旧“作业阶段”）。不得停派，直到每人4名工人全部派出。 |
| Phase 3 Firing Phase | 烧窑阶段 | 新名（旧“烧成阶段”）。 |
| Phase 4 Order Phase | 交货阶段 | 新名（旧“委托阶段”）。按起始玩家顺序单轮完成在手委托。“交货”只用于此阶段名。 |
| Phase 5 Cleanup | 收工 | 新名（旧“整理阶段”）。收回工人与标记；削减委托至上限；传起始玩家标。 |
| Final scoring | 终局计分 | — |
| Firing step 1 Choose Contributions | 一、暗选控火 | 控火者暗选压火／守火／添柴，有柴簿者可加柴。 |
| step 2 Reveal and pay | 二、亮牌付柴 | 同时亮牌，然后支付全部柴。 |
| step 3 Determine Base Heat | 三、定基础火候 | 窑骰点数 + 控火修正，限定0–5。 |
| step 4 Test Pieces | 四、火照 | 按起始玩家顺序。 |
| step 5 Heat markers | 五、翻火标 | 按起始玩家顺序；窑工标于此放置。 |
| step 6 Reveal Fire | 六、翻窑火 | 翻窑火牌，得全窑火候。 |
| step 7 Calculate Actual Heat | 七、算实际火候 | 共窑：全窑火候 + 温区修正（或窑具修正）+ 火标。御窑：窑骰点数 + 窑火修正 + 御窑修正 + 火标。 |
| step 8 Heat-adjustment abilities | 八、调火 | 钧窑等。 |
| step 9 Assign Quality | 九、定品 | — |
| step 10 After-Quality abilities | 十、定品后结算 | 匣钵护烧、复烧、哥窑开片等，按起始玩家顺序，各人自定己方顺序。 |
| step 11 Salvage a Flawed ceramic | 十一、折卖瑕品 | 可选。 |
| step 12 Finish firing | 十二、开窑取器 | 成器移入成器区；清空共窑与御窑；收回火标、窑工标、支烧窑具；窑火牌正面弃置；收回控火牌。与游戏名呼应。 |
| skip the Firing Phase | 本轮不烧窑 | 共窑与所有御窑皆空时，不翻窑火牌。 |

### 2.12 委托

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Order | 委托 | 沿用。 |
| Starting Order (16) | 起始委托 | 无御令；弃置时放回盒中。 |
| Main Order (48) | 主委托 | — |
| Commercial Order | 商贾委托 | 新名（旧“商业委托”），更有市井气息。不印御令。 |
| Crown Order | 御令委托 | 沿用。印有至少1个御令。 |
| Crown (icon) | 御令（👑） | 图标沿用 Crown 美术；文字一律称“御令”。 |
| Main Order deck / discard pile | 主委托牌堆／主委托弃牌堆 | 弃牌堆**面朝下**，只公开张数（B3）。 |
| display (6 face-up Main Orders) | 委托榜 | 新名（旧“公开展示区”）。最左最旧，最右最新。 |
| reserve | 承接 | 沿用。 |
| blind reservation | 盲接 | 不看牌面，承接牌堆顶1张；委托榜不动。 |
| top-3 selection | 看三取一 | 查看牌堆顶3张，承接1张，其余弃置（私密）。 |
| hold / held Order | 持有／在手委托 | 秘密；张数公开。 |
| hand | 委托手牌 | — |
| hand limit | 委托上限 | 4张（有色样簿则5张），仅在收工时检查。 |
| complete an Order | 完成委托 | 只能完成在手委托；榜上委托不能完成。所用器物随之“交付”。 |
| requirement | 要求 | — |
| independent requirements | 各项独立 | 除非卡面直接写明配对。 |
| slide left / refill | 左移／补榜 | 被承接的榜位留空至承接者回合结束，再左移补榜。 |
| round-start rotation | 轮换委托榜 | 弃最左2张，余4张左移，翻2张补至6张。 |

### 2.13 御府声望

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Imperial Recognition (track) | 御府声望（声望轨） | 沿用。0–4。 |
| advance Recognition | 声望+1；提升御府声望 | 每个御令或每次州衙行动推进1格，逐格结算。 |
| milestone | 声望奖励 | 首次到达时获得，每项一次。完整文字见 4.8。 |
| 0 Local Workshop | 民间作坊 | 沿用。 |
| 1 Imperial Grant | 御赐 | 沿用。获得1泥、1柴和1铜钱（固定，无三选项）。 |
| 2 Imperial Gift (Imperial Kiln) | 赐御窑 | 沿用。获得御窑板块。 |
| Imperial Kiln | 御窑 | 私人单格；每次烧成容纳1件；御匠代烧。“官窑”已是窑口名，故称御窑（不指明清景德镇御窑厂）。 |
| 3 Imperial Priority | 御烧优先 | 沿用。取得御烧优先标：每局一次，于你的工人行动之前或之后，免费为1件坯施釉并装入你空置的御窑，公开选定御窑修正。令牌效果，不是施釉装窑行动。 |
| 4 Imperial Audience | 御前召见 | 沿用。获得6分。 |
| Crown beyond Recognition 4 | 声望满后每个御令+1分 | 立即得分。 |

### 2.14 终局陈列与计分

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| End-game Exhibition | 终局陈列 | 沿用。数量不限，自动陈列所有良品以上未交付成器。 |
| exhibit | 陈列 | — |
| Standard 2 / Fine 3 / Masterpiece 5 | 良品2分／上品3分／臻品5分 | — |
| diversity bonus: 3 different Shapes | 器备三形 +3分 | 陈列中至少3种不同器型（共5种）。 |
| diversity bonus: 3 different Glazes | 釉备三色 +3分 | 陈列中至少3种不同釉（共4种）。 |
| Coin VP | 余钱折分 | 每3铜钱1分，至多5分。 |
| Tech VP | 技艺分 | 每习得1项技艺，立即得1分（A1）；终局不再另计，计分时单列一行。 |
| tie-breakers | 平局判定 | 见下。 |

平局判定：①御府声望更高；②已完成委托上**印有**的御令总数更多（贡瓷额外御令不计）；
③已交付或陈列的臻品更多；④仍平则共享胜利。

### 2.15 技艺

| EN | 简体中文 | 说明 |
| --- | --- | --- |
| Advanced Tech | 技艺 | 改称（旧“进阶技艺”）：V1.6.1 无起始技艺。牌用“张”，拥有用“项”。 |
| discipline | 门类 | — |
| Form & Decorate (discipline) | 坯作 | 英文名原为 Workshop，已改为 Form & Decorate（业主决定 D11、规则修订 A2）；内部 ID 仍为 `workshop`。新名。宋代官府匠作分“某作”（如文思院诸作）；习得即添设制坯饰纹第二工位。 |
| Glazing & Loading (discipline) | 釉作 | 新名。习得即添设施釉装窑第二工位。 |
| Firing (discipline) | 火作 | 新名。不添设任何工位。 |
| acquire / buy a Tech | 习得技艺 | 付牌面铜钱费用；唯一途径是陶工行。习得时立即得1分（A1）。 |
| printed cost | 牌面费用 | — |
| limit: 3 total, 1 per discipline | 至多3项，每门类1项 | — |
| refill the discipline display to 2 | 补至每门类2张 | 无牌可补则留空。 |

### 2.16 界面常用动词与按钮

| EN | 简体中文 |
| --- | --- |
| Place worker | 派工 |
| Choose a location | 选择地点 |
| Confirm | 确认 |
| Cancel | 取消 |
| Decline (an optional ability) | 不使用 |
| Skip (an optional step; never the Work Phase) | 跳过 |
| End turn | 结束回合 |
| Done | 完成 |
| Form | 制坯 |
| Decorate | 饰纹 |
| Glaze | 施釉 |
| Load | 装窑 |
| Load into Imperial Kiln | 装入御窑 |
| Use Imperial Priority | 用御烧优先 |
| Reserve | 承接 |
| Blind reserve | 盲接牌堆顶 |
| Look at top 3 | 看三取一 |
| Complete Order | 完成委托 |
| Buy (Tech) | 习得 |
| Gain | 获得 |
| Pay | 支付 |
| Discard | 弃置 |
| Roll Kiln Die | 掷窑骰 |
| Choose Contribution (secret) | 暗选控火 |
| Reveal | 亮牌 |
| Turn Heat marker to +1 / −1 | 翻为+1／翻为−1 |
| Return Heat marker | 收回火标 |
| Salvage (2 Coins) | 折卖（得2铜钱） |
| Use ability | 使用 |
| Waiting for {name}… | 等候{name}…… |
| Waiting for other workshops… | 等候其他作坊…… |
| Your turn | 轮到你了 |
| Used this round | 本轮已用 |
| Ready | 可用 |
| Private (only you can see) | 仅你可见 |
| Hidden until all submit | 全员提交前保密 |

---

## 3. 配件文字：技艺牌（18）与窑口传承（5）

短提示为牌面文字，逐字取自[配件文字](./KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md)（2026-10-15），
数据字段 `shortTextZh`：一行纯文字，**不超过48字**（牌面两行，每行约24字；标点、数字、符号各计1字），
格式为“时机：费用→效果”。界面加粗第一个“：”之前的时机，以及其后的“持续：”“完成委托时：”标签。

完整文字逐字取自[中文规则书](./KILN_OPENING_v1.6.1_ZH.md)（附录B“效果”栏；“窑口传承能力”各节），与英文规则书
逐句对应，数据字段 `abilityZh`。原先嵌在完整文字中的裁定与说明（R4、R6、R7、R12、R13、B1、B3 等）
已移入[配件澄清](./KILN_OPENING_v1.6.1_CLARIFICATIONS.md)（业主决定 D10），在规则详情中逐条标明出处。

除色样簿习得时承接（须）外，所有技艺与窑口能力均为可选（R4），放弃不消耗“每轮一次”；
须足额支付费用，折扣在支付前计算。完整文字照规则书原文，未写“可”者依 R4 仍属可选。
每项技艺于习得时立即得1分（A1，2026-10-15起；终局不再另计）。通则见第8节。

### 3.1 坯作 Form & Decorate（6）

| EN | 中文名 | 费用 | 短提示 |
| --- | --- | --- | --- |
| Large Throwing Wheel | 大陶车 | 2 | 每轮一次，制坯饰纹行动含至少1件瓶或香炉时：该行动泥总费−2，最低为0。 |
| Decorator's Kit | 饰坯匣 | 2 | 每轮一次：你施加的1项刻花、印花或画花少付1铜钱；可与师傅纹饰减免叠加。 |
| Reworking Table | 改坯案 | 2 | 每轮一次，为1件坯施釉入窑时：可先将其器型改为任意其他器型；不付泥，纹饰不变。 |
| Prepared Clay | 练泥 | 3 | 每轮一次，泥柴场行动得料后：可付器型泥费+1泥与纹饰费→制1件坯并饰纹。 |
| Senior Apprentice | 高徒 | 2 | 每轮一次：你派往泥柴场或瓷牙行的1名学徒可改按师傅效果结算。 |
| Connoisseur's Cabinet | 清玩斋 | 3 | 终局时：你陈列中每件上品或臻品+1分，至多+5分。 |

（ID 由数据层按审计“Stable IDs”规则分配，本表不定 ID。）

**大陶车**（坯作，2铜钱）
每轮一次，在一次制坯饰纹行动中，若你至少制成1件瓶或香炉，该行动的泥总费用减少2，最低为0。

**饰坯匣**（坯作，2铜钱）
每轮一次，你施加的1项刻花、印花或画花纹饰少付1铜钱。可与师傅的纹饰减免作用于同一纹饰。

**改坯案**（坯作，2铜钱）
每轮一次，每当你为1件坯施釉入窑时，可先将其器型改为任意其他器型：退回原器型卡，换取新器型卡。不付泥，纹饰不变。

**练泥**（坯作，3铜钱）
每轮一次，在一次泥柴场行动中获得资源后，你可以制1件坯：支付其泥费用+1，并选择1种纹饰支付纹饰费用。这是技艺效果，不算制坯饰纹行动。

**高徒**（坯作，2铜钱）
每轮一次，你派往泥柴场或瓷牙行的1名学徒改为结算该地点的师傅效果，而非学徒效果。

**清玩斋**（坯作，3铜钱）（改名，旧“博古架”）
终局时，你的终局陈列中每件上品或臻品额外+1分，至多+5分。

### 3.2 釉作 Glazing & Loading（6）

| EN | 中文名 | 费用 | 短提示 |
| --- | --- | --- | --- |
| Colour Samples | 色样簿 | 2 | 习得时：私看主委托牌堆顶3张→须承接1张，其余弃置。持续：你的委托上限为5张。 |
| Kiln Tending | 看火 | 2 | 每轮一次，至少装窑1件的施釉装窑行动后：得1泥1柴。 |
| Kiln Furniture | 支烧窑具 | 2 | 每轮一次，将1件器物装入共窑时：可将本牌垫于其下→本次烧成中该件温区修正由你定为−1、0或+1。 |
| Inverted Firing | 覆烧 | 2 | 每轮一次，将1件碗、盘或笔洗装入共窑时：可放入恰有1件己方器物的启用窑位，两件同用该窑位修正。 |
| Setter's Mark | 窑位签 | 2 | 每轮一次，派工阶段开始时：可将本牌置于共窑1个空的启用窑位上→本轮仅你可在此装窑。 |
| Canal Barge | 漕船 | 2 | 每轮一次，你的工人行动之前或之后：可完成1张在手委托。 |

**色样簿**（釉作，2铜钱）
习得时：查看主委托牌堆顶3张，承接其中1张，其余弃置。此为技艺效果，不算瓷牙行行动，不获得资源。持续：你的委托上限为5张。

**看火**（釉作，2铜钱）
每轮一次，在一次至少装窑1件的施釉装窑行动之后，获得1泥和1柴。

**支烧窑具**（釉作，2铜钱）
每轮一次，当你将1件器物装入共窑时，可将本牌垫于其下，并为本次烧成选定该器物的温区修正：−1、0或+1。烧成后收回本牌。

**覆烧**（釉作，2铜钱）
每轮一次，当你将1件碗、盘或笔洗装入共窑时，可将其放入一个恰有1件你的器物的启用窑位。两件器物都使用该窑位的温区修正（若该窑位有支烧窑具，则用窑具修正）。

**窑位签**（釉作，2铜钱）
每轮一次，派工阶段开始时（按起始玩家顺序），将本牌放在共窑一个空的启用窑位上。本轮只有你能在此装窑。你在此装窑时，或收工时，收回本牌。

**漕船**（釉作，2铜钱）
每轮一次，在你的一次工人行动之前或之后，你可以完成1张在手委托，遵守完成委托的全部规则。此举对汝窑与官窑而言视为完成委托。

### 3.3 火作 Firing（6）

| EN | 中文名 | 费用 | 短提示 |
| --- | --- | --- | --- |
| Protective Saggars | 匣钵护烧 | 2 | 每轮一次，定品后：可付1柴→己方本窑1件瑕品升良品，或良品升上品。 |
| Fuel Ledger | 柴簿 | 3 | 选控火时：若选压火或添柴，可随控火牌暗附1柴→控火修正改为压火−2或添柴+2。 |
| Test Pieces | 火照 | 3 | 每轮一次，基础火候定后、翻火标前，若本窑有己方器物：可付1柴→私看窑火牌堆顶1张，可置于牌堆底。 |
| Second Firing | 复烧 | 2 | 每轮一次，定品后：可选己方本窑1件瑕品／良品→另翻1张窑火牌代原牌重算，不计钧窑调整；更差亦算。 |
| Kiln Master | 窑工 | 2 | 每轮一次，火标步骤中：可将窑工标（+1或−1）放在己方本窑1件未带火标的器物上。 |
| Tribute Ware | 贡瓷 | 4 | 每轮一次，完成御令委托时：额外得1个御令。 |

**匣钵护烧**（火作，2铜钱）
每轮一次，定品后，你可以支付1柴，将你本次烧成中的1件瑕品或良品提升一级：瑕品→良品，或良品→上品。不能由此成为臻品。

**柴簿**（火作，3铜钱）
选控火时，若你选择压火或添柴，可随控火牌暗附1柴，与控火牌同时亮出。若如此做，你的控火修正改为−2（压火）或+2（添柴）。

**火照**（火作，3铜钱）
每轮一次，基础火候定后、翻火标前，若你有至少1件器物在本次烧成中，可支付1柴，私下查看窑火牌堆顶1张。然后你可以将其置于牌堆底。不得展示该牌。

**复烧**（火作，2铜钱）
每轮一次，定品后，你可以选择你本次烧成中的1件瑕品或良品，额外翻1张窑火牌，以相同的基础火候、温区修正、窑具修正与火标配合新的窑火修正，重新计算该器物的实际火候与品质。首次计算时的钧窑调整不保留。新品质取代旧品质，即使更差。结算后弃置这张额外窑火牌。

**窑工**（火作，2铜钱）
每轮一次，在火标步骤中，将窑工标（+1或−1面朝上）放在你本次烧成中1件未带火标的器物上。在一切规则中视为火标。

**贡瓷**（火作，4铜钱）
每轮一次，当你完成一张印有至少1个御令的委托时，额外获得1个御令。

### 3.4 窑口传承（5，均可选用；R1：定窑可选）

| EN | 中文 | 传承名 | 短提示 |
| --- | --- | --- | --- |
| Ru Kiln — Quiet Perfection | 汝窑 | 天青无瑕 | 每轮一次，以臻品青釉素面器完成委托时：得4分。 |
| Guan Kiln — Imperial Patronage | 官窑 | 内府恩眷 | 每轮一次，完成御令委托时：得2铜钱1分。 |
| Ge Kiln — Crackle Mastery | 哥窑 | 金丝铁线 | 每轮一次，定品后：可令己方本窑1件良品开片升上品。完成委托时：开片器可作任意1种纹饰；永非臻品。 |
| Ding Kiln — Moulded Production | 定窑 | 范制成器 | 每轮一次，制坯饰纹行动中制碗、盘或笔洗后：可付1泥1铜钱→该行动多制1件同型坯，任选纹饰无减免。 |
| Jun Kiln — Kiln Transformation | 钧窑 | 窑变天成 | 每轮一次，实际火候算出后、定品前：可付1柴→己方1件器物的实际火候+1或−1。 |

**汝窑 · 天青无瑕**
每轮一次，当你完成委托时，若所交付器物中有1件为臻品、青釉、素面，获得4分。委托本身不必要求臻品、青釉或素面；只看实际交付器物的属性。

**官窑 · 内府恩眷**
每轮一次，当你完成一张印有至少1个御令的委托时，获得2铜钱和1分。

**哥窑 · 金丝铁线**（改名，旧“窑火开片”）
每轮一次，定品后，选择你本次烧成中1件当时为良品的器物：其开片，品质变为上品。在其上放置开片标；该器物保留此标。
完成委托时，你的每件开片器可视为具有任意一种纹饰，以满足该委托的纹饰要求；其原纹饰不变。开片器永不是臻品，不能满足臻品要求。

**定窑 · 范制成器**
每轮一次，在结算制坯饰纹行动时，你制成1件碗、盘或笔洗后，可支付1泥和1铜钱，再制1件同器型的坯，并任选1种纹饰；该纹饰费用即为这1铜钱。此额外坯不计入该行动的件数上限，也不是师傅纹饰减免所指的“2件”之一；对提及“该行动所制坯”的效果，视为该行动所制。

**钧窑 · 窑变天成**
每轮一次，实际火候算出后、定品前，你可以支付1柴，将你1件器物的实际火候调整+1或−1。

---

## 4. 地点行动文字

### 4.1 泥柴场（中央；容量2／3／4）

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 得3泥／柴 | 获得共3份泥和柴，任意组合。 |
| 师傅 | 得4泥／柴；可付1铜钱再得1泥1柴 | 获得共4份泥和柴，任意组合。然后可支付1铜钱，额外获得1泥和1柴。 |

### 4.2 制坯饰纹（坊内；1个工位，习得坯作技艺即添第二工位；每个工位每轮一次）

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 制1件坯并饰纹 | 制1件坯：支付其泥费用，选择1种纹饰并支付纹饰费用（2铜钱）。 |
| 师傅 | 制至多2件坯并饰纹；制2件时1项纹饰−1铜钱 | 制1或2件坯，每件各选纹饰并付费。若制2件，其中1项纹饰少付1铜钱。 |

- 须至少能为1件坯支付泥费用和纹饰费用，方可派工。
- 坯记录器型与纹饰，留在作坊中等待装窑。

### 4.3 施釉装窑（坊内；1个工位，习得釉作技艺即添第二工位；每个工位每轮一次）

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 1件坯施釉入窑 | 选择你的1件坯，为其选釉并装窑。 |
| 师傅 | 至多2件坯施釉入窑；可暗置火标 | 为你的1或2件坯施釉并装窑。然后你可以将火标暗置于你在共窑或御窑中1件未带火标的器物上（R9，含本轮先前装入或经御烧优先装入者）。师傅留在此工位。 |

- 装窑：放入一个空的启用窑位；若你已有御窑且其为空，本次行动所装器物中可有1件改放入御窑，
  并公开选定御窑修正−1、0或+1。
- 可派工条件（R5）：你至少有1件坯拥有合法去处——空的启用窑位（非他人窑位签所占）、
  你空置的御窑，或（覆烧本轮未用时，碗／盘／笔洗）恰有1件你的器物的启用窑位。
- 停用窑位不算空位，也不可使用。御窑每次烧成容纳1件。每件器物至多1个火标。

### 4.4 瓷牙行（中央；容量2／3／4）

每次承接，任选其一：
- 承接委托榜上1张主委托，收入手中；其榜位**留空至你回合结束**，再将右侧委托左移并翻牌补至6张；
- 盲接：不看牌面，将主委托牌堆顶1张直接收入手中，委托榜不动。

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 承接1张，并得1泥／柴／铜钱 | 承接1张主委托，然后获得1泥、1柴或1铜钱。 |
| 师傅 | 承接至多2张（1次可看三取一）；每张后得1泥／柴／铜钱 | 承接1或2张主委托，逐次结算。其中1次可改为：私下查看主委托牌堆顶3张，承接1张，其余弃置。每承接1张后，获得1泥、1柴或1铜钱。 |

- 师傅至少须承接1张，可在第1张后停止；因回合结束前不补榜，第二次只能从仍在榜上的委托中选。
- 一轮中无委托上限；收工时弃至4张（有色样簿5张）。手中委托保密，张数公开。

### 4.5 陶工行（中央；容量2／3／4）

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 按价习得1张公开技艺 | 支付牌面铜钱费用，习得1张公开技艺。 |
| 师傅 | 看1门类顶2张；习得其一或任一公开技艺，−1铜钱 | 选择1个门类，私下查看该牌堆顶2张（不足则看余数）。然后习得任一门类的1张公开技艺或所看的1张，少付1铜钱，最低为0。未取的所看技艺按你自定的顺序（保密）置于该牌堆底。 |

- 习得后，先将所看之牌置底，再为该门类补至2张；无牌则留空。
- 每人至多3项技艺，每门类至多1项。习得坯作技艺即添设制坯饰纹第二工位；习得釉作技艺即添设施釉装窑
  第二工位；火作技艺不添设工位。新添设的工位本轮稍后即可使用。
- 派学徒须付得起1张你尚无其门类的公开技艺；派师傅须在减免后付得起这样一张。师傅可查看任何门类（B2）。
- “习得时”效果立即结算；技艺时机允许即可于本轮使用。

### 4.6 漕运码头（中央；不限人数）

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 得2铜钱 | 获得2铜钱。 |
| 师傅 | 得4铜钱 | 获得4铜钱。 |

- 无容量、无费用，永远可以派工。派工阶段不得停派。

### 4.7 州衙（中央；2人1、3人1、4人2个工位）

| 工人 | 短 | 完整 |
| --- | --- | --- |
| 学徒 | 付4铜钱，声望+1（限0–2） | 支付4铜钱，御府声望推进1格，并照常获得所到格的奖励。 |
| 师傅 | 付3铜钱，声望+1（限0–2） | 支付3铜钱，御府声望推进1格，并照常获得所到格的奖励。 |

- 无御令要求：可由0→1、1→2或2→3。不能推进至4，故声望3或4时不可使用。
- 两个工位都空时，同一玩家可在一轮中都使用。

### 4.8 御府声望奖励

声望每推进1格即结算所到格的奖励；每项奖励每局只得一次。御令须逐个结算，一张委托可连跨数格。

| 声望 | 名称 | 短 | 完整 |
| --- | --- | --- | --- |
| 0 | 民间作坊 | — | — |
| 1 | 御赐 | 得1泥1柴1铜钱 | 获得1泥、1柴和1铜钱。 |
| 2 | 赐御窑 | 得御窑：御匠代烧，单件 | 获得御窑板块，放入你的御窑区（见下）。 |
| 3 | 御烧优先 | 取御烧优先标（每局一次） | 从声望轨第3格取回你颜色的御烧优先标（见下）。 |
| 4 | 御前召见 | 得6分 | 获得6分。此后每获得1个御令，立即得1分。 |

**御窑**（赐御窑所得）
私人单格窑，每次烧成容纳1件，不占共窑窑位。只有两种方式能装入：施釉装窑行动中所装器物之一，
或御烧优先；任何技艺效果都不能装入御窑。装入时公开选定御窑修正−1、0或+1并记录在该器物上（R10、R11）。
御窑器物由御匠代烧：实际火候 = 窑骰点数 + 窑火修正 + 御窑修正 + 火标，不论控火如何；仍于共同的
烧窑阶段烧成。御窑器物不使你成为控火者，但对你的技艺与窑口能力而言，算作本次烧成中的器物
（火照、匣钵护烧、复烧、钧窑、哥窑、窑工皆可）。烧成后照常定品，移入成器区。支烧窑具、覆烧与
窑位签只用于共窑。

**御烧优先**（声望3所得令牌）
每局一次，在你的工人行动之前或之后，你可以交出御烧优先标，为你的1件坯施釉并装入你空置的御窑，
同时公开选定御窑修正−1、0或+1。免费（R10）。这是令牌效果，不是施釉装窑行动，也不是工人行动，
不触发需要施釉装窑行动的效果（如看火）。之后施釉装窑行动的师傅可将火标暗置于这件器物上（R9）。
与漕船同在“工人行动之前或之后”时，二者先后由你自定；在此时机中刚获得的令牌或御窑即可使用。

---

## 5. 委托要求写法

### 5.1 句式对照

| EN | 中文 |
| --- | --- |
| `Bowl · Celadon · any Decoration` + `Fine+` | `碗 · 青釉 · 任意纹饰`，品质栏 `上品以上`；单行写作 `碗 · 青釉 · 任意纹饰 · 上品以上` |
| any Shape / any Glaze / any Decoration | 任意器型／任意釉／任意纹饰 |
| any Glazes / any Decorations（多件） | 任意釉／任意纹饰 |
| Bowl, Plate or Brush Washer | 碗、盘或笔洗 |
| Vase or Censer | 瓶或香炉 |
| Bowl + Plate | 碗 + 盘 |
| 2 different Shapes / 3 different Shapes | 2种不同器型／3种不同器型 |
| 2 ceramics of the same Shape | 2件同器型 |
| same Glaze | 釉相同 |
| different Glazes（2件） | 釉不同 |
| 3 different Glazes | 3种不同釉 |
| both Celadon | 均为青釉 |
| one White, one Moon White | 白釉、月白釉各1件 |
| one White, one Celadon, one Grey-Green | 白釉、青釉、灰青釉各1件 |
| same Decoration / different Decorations | 纹饰相同／纹饰不同 |
| 3 different Decorations | 3种不同纹饰 |
| both Carved | 均为刻花 |
| one Plain, one Painted | 素面、画花各1件 |
| at least one Plain, other Decoration any | 至少1件素面，另1件纹饰任意 |
| at least 2 different Decorations | 至少2种不同纹饰 |
| Standard+ / Standard+ each / Standard+ all | 良品以上／均良品以上／均良品以上 |
| Fine+ / Fine+ each / Fine+ all | 上品以上／均上品以上／均上品以上 |
| Masterpiece | 臻品 |
| Fine+ each; ≥1 Masterpiece | 均上品以上，至少1件臻品 |
| Fine+ all; ≥2 Masterpieces | 均上品以上，至少2件臻品 |
| fixed pairing: `Bowl: White + Plain; Brush Washer: Moon White + Impressed` | `碗：白釉 + 素面；笔洗：月白釉 + 印花` |
| rewards: 9 VP, 5 Coins, 2 Crowns | `9分 · 5铜钱 · 👑×2`；正文“9分、5铜钱、2个御令” |

说明：
- 多件委托中各项要求**彼此独立**，可任意分配到各件器物上；只有卡面直接写出“器型：釉 + 纹饰”时才是固定配对。
- 开片器在每张委托中可各自声明为任意一种纹饰（如“均为刻花”“纹饰不同”）；但永不满足“臻品”。
- 一件器物只能用于一张已完成的委托。

### 5.2 示例

| ID | 要求 | 品质 | 奖励 |
| --- | --- | --- | --- |
| S01 | 碗 · 任意釉 · 任意纹饰 | 良品以上 | 2分 · 4铜钱 |
| S13 | 任意器型 · 任意釉 · 画花 | 良品以上 | 4分 · 4铜钱 |
| O14 | 碗、盘或笔洗 · 任意釉 · 任意纹饰 | 上品以上 | 5分 · 4铜钱 |
| O31 | 盘 + 瓶；均为青釉；至少1件素面，另1件纹饰任意 | 均上品以上 | 12分 · 5铜钱 |
| O39 | 瓶 + 香炉；青釉、月白釉各1件；素面、画花各1件 | 均上品以上 | 14分 · 1铜钱 · 👑×2 |
| O47 | 3种不同器型；3种不同釉；3种不同纹饰 | 均上品以上，至少2件臻品 | 22分 · 0铜钱 · 👑×3 |

---

## 6. 相对旧中文用词的改动与理由

| 旧词 | 新词 | 理由 |
| --- | --- | --- |
| 彩绘（及本表初稿的“绘花”） | 画花 | 宋瓷装饰通称刻花、划花、印花、画花；画花多为单色笔绘，与刻花、印花构词一致。 |
| 博古架（本表初稿） | 清玩斋 | 博古架（多宝格）是清代家具；“清玩”是宋人赏鉴器物的用语（赵希鹄《洞天清禄集》），“斋”为宋人书斋名。 |
| 柴簿暗注、强压火、猛添柴（本表初稿） | 柴簿加柴；压火−2／添柴+2 | 去掉赌博意味与英文源没有的自造牌名。 |
| 三形俱全、三釉俱全（本表初稿） | 器备三形、釉备三色 | “俱全”暗示集齐全部，实为至少3种。 |
| 品后、出窑（本表初稿步骤名） | 定品后结算、开窑取器 | “品后”不成词；“开窑取器”呼应游戏名。 |
| 窑火开片（哥窑） | 金丝铁线 | 哥窑开片的经典称谓，辨识度高；V1.6.1 哥窑已非纹饰而是窑中开片。 |
| 进阶技艺 | 技艺 | 已无起始技艺。 |
| 成型／施釉与纹饰／烧成（门类） | 坯作／釉作／火作 | 宋代“某作”的匠作分工；与新坊内地点对应。 |
| 已成型器物 | 坯 | 窑业本词，短而准确。 |
| 已烧成／已烧成陶瓷区 | 成器／成器区 | 与“坯”相对。 |
| 陶瓷、陶瓷件 | 器物 | 统一通称。 |
| 师傅火候标记 | 火标 | V1.6.1 中火标为玩家自有配件，并非师傅本身。 |
| 杂作行 | 漕运码头 | 对应 Canal Wharf 改名；呼应“漕船”。 |
| 朝廷赞助 | 州衙 | 对应 Magistrate's Hall；宋代窑口以州为名。 |
| 公开展示区 | 委托榜 | 张榜招揽，宋代市井意味。 |
| 商业委托 | 商贾委托 | 与“御令委托”对举。 |
| 👑（无文字） | 御令 | 需要可读的名词；避开“御印”。 |
| 回合开始／作业阶段／烧成阶段／委托阶段／整理阶段 | 开工／派工阶段／烧窑阶段／交货阶段／收工 | 一日窑务的节奏，阶段名即动作。 |
| 处理瑕品 | 折卖瑕品 | 点明“弃置换钱”。 |
| 窑口玩家板 | 窑口板 | 简化。 |
| 封条／启封／封存工位（本表初稿） | 第二工位／添设 | D7：玩家所见文字不说“锁”“封”；第二工位是习得技艺后添设的。 |
| — | 窑骰 | 新配件 Kiln Die。 |
| VP（正文） | 分 | 统一中文。 |

保留不变（已足够贴切）：开窑、师傅、学徒、泥、柴、铜钱、泥柴场、瓷牙行、陶工行、汝窑／官窑／哥窑／
定窑／钧窑、天青无瑕、内府恩眷、范制成器、窑变天成、碗／盘／笔洗／瓶／香炉、素面／刻花／印花、
白釉／青釉／灰青釉／月白釉、臻品／上品／良品／瑕品、共窑、窑位、高／中／低温区、基础火候、全窑火候、
实际火候、适烧火候、火候差、窑火牌、控火牌、压火／守火／添柴、柴簿、火照、覆烧、
复烧、匣钵护烧、支烧窑具、大陶车、改坯案、练泥、色样簿、看火、漕船、窑工、贡瓷、御府声望、民间作坊、
御赐、赐御窑、御窑、御烧优先、御前召见、终局陈列、起始玩家、委托、承接。火候类术语保留现代写法，
因为它们是需要精确计算的数值概念。

保留但加注：
- **瓷牙行**：宋代居间者称牙人、牙侩，“牙行”作为官许商行多见于明清；因其易懂且已沿用，保留。
  “行”在此作“铺行”解，与“陶工行”的“行会”之“行”不同，界面不需区分。
- **御窑**：“官窑”已是窑口名，故称御窑；指御府代烧的私人窑位，不指明清景德镇御窑厂。
- **上品**：古义多指最上等，此处排第二（臻品之上无更高）。界面品质图例一律显示 `臻品 > 上品 > 良品 > 瑕品`。

---

## 7. 规则提示与报错句式

引擎返回带类型的 `GameRuleError`（代码见 `src/game/types.ts`）；界面按代码与 `details` 本地化。
句式：先说结果，再说原因或所缺，不用感叹号，不提及任何隐藏信息（他人手牌、暗选控火、私看之牌）。
占位符：`{location}` 地点名，`{n}` 数目，`{resource}` 泥／柴／铜钱，`{limit}` 上限，`{name}` 玩家名，
`{tech}` 技艺名，`{order}` 委托编号，`{phase}` 阶段名，`{worker}` 师傅／学徒，`{discipline}` 门类名，`{have}` 现有数，`{stage}` 器物状态（坯／入窑／成器／已交付），`{reason}` 原因短语（见表后）。

| 代码 | 情形 | 中文 |
| --- | --- | --- |
| `WRONG_PHASE` | 不在该阶段 | 现在不是{phase}，不能这样做 |
| `NOT_YOUR_DECISION` | 未轮到你 | 尚未轮到你，请等候{name} |
| `GAME_FINISHED` | 已终局 | 本局已结束 |
| `STALE_CHOICE` | 局面已变 | 局面已更新，请重新选择 |
| `MALFORMED_ACTION` / `INVALID_CHOICE` | 选项无效 | 此选项不可用 |
| `KILN_UNAVAILABLE` | 窑口已被选 | 此窑口已被他人选走 |
| `WORKER_UNAVAILABLE` | 无可派工人 | 你没有可派的{worker} |
| `WORKER_ACTION_REQUIRED` | 试图停派 | 派工阶段不得停派，请派1名工人（漕运码头永远可派） |
| `WORKER_ACTION_ALREADY_TAKEN` | 本回合已派工 | 本回合你已派过工 |
| `LOCATION_FULL` | 地点已满 | {location}已满 |
| `PERSONAL_SPACE_LOCKED` | 尚无第二工位 | 习得{discipline}技艺即添此工位 |
| `PERSONAL_SPACE_USED` | 工位本轮已用 | 此工位本轮已用 |
| `NO_MAIN_ACTION_POSSIBLE` | 无法执行主行动 | 你无法在{location}执行至少1次主行动，不能派工 |
| `SENIOR_APPRENTICE_NOT_APPLICABLE` | 高徒不适用 | 高徒只适用于泥柴场或瓷牙行的学徒 |
| `INSUFFICIENT_RESOURCES` | 资源不足 | {resource}不足：需{n}，现有{have} |
| `TOO_MANY_VESSELS` | 件数超限 | 此行动至多{limit}件 |
| `CERAMIC_NOT_FOUND` / `CERAMIC_NOT_OWNED` | 器物无效 | 找不到这件器物，或它不属于你 |
| `ILLEGAL_CERAMIC_STAGE` | 器物状态不符 | 这件器物现在是{stage}，不能这样使用 |
| `DUPLICATE_CERAMIC` | 重复选用 | 同一件器物不能重复选用 |
| `KILN_SPACE_UNAVAILABLE` | 无合法去处 | 没有可装窑的去处：共窑无空的启用窑位，你的御窑也不可用 |
| `KILN_SPACE_MARKED` | 窑位签所占 | 此窑位本轮已由{name}的窑位签占用 |
| `IMPERIAL_KILN_UNAVAILABLE` | 御窑不可用 | 你尚无御窑，或御窑本次烧成已有器物 |
| `INVERTED_FIRING_INVALID` | 覆烧不合法 | 覆烧只能将碗、盘或笔洗叠入恰有1件你的器物的启用窑位 |
| `HEAT_MARKER_INVALID` | 火标不合法 | 一件器物至多带1个火标 |
| `ORDER_NOT_AVAILABLE` | 委托不在榜上 | 这张委托已不在委托榜上 |
| `ORDER_NOT_HELD` | 非在手委托 | 只能完成在手委托 |
| `ORDER_SUPPLY_EMPTY` | 主委托用尽 | 主委托牌堆与弃牌堆皆空，无可承接 |
| `RESERVATION_LIMIT` | 承接次数已满 | 此行动已承接{limit}张 |
| `ORDER_REQUIREMENTS_NOT_MET` | 要求未满足 | 所选器物不满足委托{order}的要求：{reason} |
| `INVALID_CRACKLE_DECLARATION` | 开片声明无效 | 开片声明无效：{reason} |
| `HAND_LIMIT_DISCARD_COUNT` | 收工弃牌数不符 | 收工须弃至{limit}张委托：请再弃{n}张 |
| `TECH_NOT_AVAILABLE` | 技艺不可取 | 这张技艺牌不在可取之列 |
| `TECH_LIMIT` | 技艺已满3项 | 你已拥有3项技艺 |
| `TECH_DISCIPLINE_OWNED` | 门类已有 | 你已拥有一项{discipline}技艺 |
| `TECH_NOT_OWNED` / `KILN_ABILITY_NOT_OWNED` | 未拥有 | 你没有{tech} |
| `TECH_ALREADY_USED` / `ABILITY_ALREADY_USED` | 本轮已用 | {tech}本轮已用 |
| `INVALID_BOTTOM_ORDER` | 置底顺序无效 | 请为每张未取的技艺牌排定置底顺序 |
| `INVALID_TARGET` | 目标不合法 | 此目标不合法：{reason} |
| `RECOGNITION_GATE` | 州衙声望限制 | 州衙只能在声望0–2时使用，不能推进至4 |
| `IMPERIAL_PRIORITY_UNAVAILABLE` | 御烧优先不可用 | 你没有御烧优先标，或御窑不空，或没有坯 |
| `NOT_CONTRIBUTOR` | 非控火者 | 你在共窑中没有器物，本轮不参与控火 |
| `CONTRIBUTION_ALREADY_SUBMITTED` | 已提交控火 | 你已提交控火，等候其他作坊 |
| `INVALID_CONTRIBUTION` | 控火不合法 | 柴不足，无法打出此控火牌（守火永远可选） |

`{reason}` 常用短语：器型不符、釉不符、纹饰不符、品质不足、需臻品、器物已交付、瑕品不能完成委托、
开片器不是臻品、本次烧成之外的器物、声明的器物不在所选之列、只有开片器可声明纹饰、同一开片器只能声明一次、所作声明不满足委托，换一种声明可满足。

---

## 8. 技艺通则（Tech Clarifications 中文版）

- **练泥、漕船、御烧优先**是技艺或令牌效果，不是工人行动；不算制坯饰纹行动、施釉装窑行动或交货阶段
  的完成委托，也不触发需要这些行动的效果，除非文字写明（漕船触发汝窑与官窑）。
- **支烧窑具、覆烧、窑位签**只用于共窑。御窑只容1件，用其自己的御窑修正。
- **火标：**一件器物至多带1个火标；窑工标与你自己的火标不可同在一件器物上。钧窑调整叠加于二者之上。
  复烧重算时火标留在原处。
- **火照**按起始玩家顺序、在任何火标翻定之前结算。置底之牌留在牌堆底。可谈论所见，不可展示。
- **色样簿：**习得时的承接取自牌堆，委托榜不补。拥有期间每次收工上限皆为5张。
- **匣钵护烧与复烧**只作用于你本次烧成中（共窑或御窑）符合条件的器物，不作用于先前各轮烧成者；
  复烧的额外窑火牌不影响其他器物。
- **折扣：**师傅纹饰减免、饰坯匣、定窑1铜钱额外坯是三项各自独立的减免。前两项可作用于同一纹饰
  （刻花0铜钱）；定窑额外坯两者皆不适用。大陶车只减泥；定窑额外坯不是瓶或香炉。
- **高徒**在瓷牙行：该学徒获得师傅的2次承接、其中1次可看三取一，以及每次承接后的1份资源。
- **哥窑开片**是定品后效果，可在匣钵护烧之后作用于同一器物（瑕品→良品→上品，每轮一次）。开片器
  永不为臻品，不能满足任何臻品要求（含画花臻品委托）。

---

## 9. 待裁定问题（不得自行定规则）

以下问题英文源与审计均未裁定。中文文字暂按英文原样保持泛指，不写定答案；待业主裁定并记入
RULEBOOK_AUDIT_V1.6.1.md 后，再在相应条目补一句。

1. **（已记录，2026-10-15）复烧作用于御窑器物：**审计“Interpretations”已记录：沿用同一窑骰点数、御窑修正与火标，配合新窑火修正重算；已列入复烧的配件澄清（INT Imperial Second Firing）。原问题：英文写“相同的基础火候、温区修正、窑具修正与火标”，但御窑器物的实际火候
   由窑骰点数与御窑修正构成，不用基础火候与温区修正（EN L640、L651、L678）。沿用哪些数值未定。
   裁定后可补：“（御窑器物：窑骰点数与御窑修正不变）”之类括注。
2. **（暂定默认 P1）改坯案与御烧优先：**审计 P1 暂定为可以，并消耗改坯案的每轮一次；业主可推翻。原问题：改坯案写“每当你为1件坯施釉入窑时”（泛指，不限施釉装窑行动）；御烧优先也是
   为坯施釉装入御窑的令牌效果。改坯案能否用于御烧优先装窑，审计未裁定（EN L617、L292、L646）。
3. **纯收益型效果的数字化处理：**依 R4，大陶车、饰坯匣、汝窑、官窑、贡瓷仍属可选；审计只记录看火自动结算。
   数字版是否也自动结算其余各项（放弃毫无所得），由 IMPLEMENTATION_DECISIONS 记录；本表文字不受影响。

---

## 10. 审阅处理记录 Review dispositions

Terminology review of revision 1, applied in revision 2 (2026-10-14).

**Adopted**
- B1 §1.1 / §3: optional-by-default rule (R4) restated; only Colour Samples' reservation is 须; pure-gain
  effects are written declaratively and explicitly stated to remain optional under R4.
- B2/B3: 可 added to 高徒, 匣钵护烧, 复烧, 窑工, 哥窑 (full and short texts); also to the shorts of 支烧窑具,
  窑位签, 漕船, 火照, 定窑, 钧窑, which had lost it.
- M1: §4.8 御府声望奖励 added (Grant, Imperial Kiln, Imperial Priority, Audience); §2.13 Imperial Priority row
  expanded.
- M2: 制坯饰纹／施釉装窑 reserved for locations (“…行动” for the action); generic glaze-and-load is 施釉入窑.
  改坯案, 大陶车, 定窑 and the §4.3 shorts reworded; 改坯案 × Imperial Priority listed as open question 2.
- Second Firing on an Imperial ceramic listed as open question 1, with no rule text invented.
- Short reminders: qualifiers restored (练泥 timing inside the action, 己方 on 钧窑／窑工, 完成委托时 on 哥窑,
  覆烧 wording); every line ≤24 characters; format `每轮一次，〈时机〉：〈效果〉`; two-line reminders allowed.
- 画花 for Painted; 清玩斋 for Connoisseur's Cabinet; 十、定品后结算; 十二、开窑取器; 柴簿加柴 and 压火−2／添柴+2;
  器备三形／釉备三色; “（按实际釉）” removed.
- One mapping per term: 完成委托 (complete), 交付／已交付 (deliver), 交货 only in 交货阶段; 张／项／件 rule in §1.1;
  1件坯 everywhere; “至多2” without a measure word.
- pass → 停派 (not allowed); 跳过 kept for the UI Skip button only. §1.4 “习得时” now names the Guild Hall.
- 停用窑位不算空位，也不可使用; the fullwidth ＋ removed.
- Coverage: §7 error templates keyed to `GameRuleErrorCode`, §8 Tech Clarifications, 计分标／计分轨, and the
  covering note on 共窑板 in §2.5.

**Not adopted (with reason)**
- 瓷牙行 → 瓷市牙人／牙人铺: kept 瓷牙行 for readability and continuity; a register note was added in §6.
- 上品 → 精品: 精品 reads as modern retail language. 上品 is kept, and the UI always shows the full order.
- 鉴古斋: 清玩斋 was chosen instead because the cabinet scores the player's own new wares, not antiquities.
- 弃派: 停派 was chosen because it reads as “stop placing” rather than “discard a placement”.
- The reviewer's sample short for 练泥 (25 characters) and its sample shorts for 支烧窑具, 哥窑 and 定窑 were
  restructured as two-line reminders to stay within 24 characters per line.
- The reviewer's §1.1 list put 大陶车／饰坯匣／汝窑／官窑 under “automatic”. This revision says only that
  they are written without 可, and leaves digital auto-resolution to IMPLEMENTATION_DECISIONS (open question 3),
  because the audit records it only for Kiln Tending.

**Owner amendment A1 (2026-10-15)**
- Tech VP is scored when the Tech is gained, no longer at game end (audit, “Owner amendments”). §2.14 技艺分,
  §2.15 习得技艺 and the §3 preamble now say 立即得1分 on gaining a Tech and 终局不再另计. The fixed timing label
  终局时 (§1.4) remains in use for 清玩斋 and the other end-game items.

**Owner decision D7 (2026-10-15)**
- No player-facing text says lock or unlock ([OWNER_DECISIONS.md](./ui-v1.6.1/OWNER_DECISIONS.md) D7). 封条／启封／封存工位
  are retired: §2.5 now lists 第二工位, 添设 and the physical-prototype-only 第二工位盖片; §2.15, §4.2, §4.3, §4.5 say
  习得…技艺即添设; §6 records the change and §7 `PERSONAL_SPACE_LOCKED` reads 习得{discipline}技艺即添此工位, the same sentence as the board label.
  Board labels: 习得坯作技艺即添此工位（施釉装窑：习得釉作技艺即添此工位）before, 由「⟨技艺⟩」添设 after. Internal
  identifiers (`unlocked`, `PERSONAL_SPACE_LOCKED`, `unlocks`) are unchanged, and the English rulebook's “Lock tokens”
  stays byte-identical; this is wording only, not a rule change.

**Component text and rules details (2026-10-15)**
- §3 short reminders now come word for word from the V1.6.1 component text (`shortTextZh`), one plain line of
  at most 48 characters in the format “时机：费用→效果”; the earlier ≤24-per-line, `<br>`-split reminders are retired.
- §3 full texts now mirror the Chinese rulebook edition (`docs/KILN_OPENING_v1.6.1_ZH.md`) exactly, matching the
  English rulebook sentence for sentence. The rulings they used to embed live in the component clarifications
  (owner decision D10), each with its source tag, so no ruling was dropped.
- D11: the §2.15 row is keyed “Form & Decorate (discipline)” and §3.1 is headed 坯作 Form & Decorate.
