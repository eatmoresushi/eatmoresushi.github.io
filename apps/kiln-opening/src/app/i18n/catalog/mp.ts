import { defineNamespace } from "../defineNamespace.ts";

/**
 * Multiplayer (non-rule) error messages, one key per `MultiplayerErrorCode` that is not a
 * `GameRuleErrorCode` (UI_V1.6.1_ARCHITECTURE §6.2). Owned by A3. Rule errors are formatted by
 * `formatRuleError`; `i18n/errors.ts` routes each code and checks this table is exhaustive.
 * Chinese follows glossary §7: result first, then the cause; no exclamation marks.
 */
export const mp = defineNamespace({
  en: {
    INVALID_REQUEST: "That request was not valid. Check what you entered and try again.",
    ROOM_NOT_FOUND: "There is no room with that code.",
    ROOM_CODE_CONFLICT: "That room code is already in use. Please create the room again.",
    ROOM_FULL: "That room is full.",
    GAME_ALREADY_STARTED: "This game has already started.",
    GAME_NOT_STARTED: "This game has not started yet.",
    AUTHENTICATION_FAILED: "This seat could not be confirmed. Rejoin with your saved seat.",
    HOST_ONLY: "Only the host can do that.",
    NOT_ENOUGH_PLAYERS: "At least {min} players are needed to start.",
    STALE_REVISION: "The game has moved on; your choice was not sent. Please check and choose again.",
    DUPLICATE_COMMAND: "That action has already been sent.",
    PERSISTENCE_CONFLICT: "Another move was saved at the same time. Please try again.",
    SESSION_ENDED: "This game session has ended.",
    UNSUPPORTED_RULES_VERSION: "This room uses a rules version this app cannot play.",
    RULES_FINGERPRINT_MISMATCH: "This room was created with different rules content and cannot be played here.",
    COMPUTER_TURN_FAILED: "The computer player could not finish its turn.",
    SERVER_CONFIGURATION_ERROR: "The online service is not configured correctly.",
    INTERNAL_SERVER_ERROR: "The online service had an internal error. Please try again.",
    METHOD_NOT_ALLOWED: "The online service refused that kind of request.",
    SERVICE_UNAVAILABLE: "The online service cannot be reached. Please try again shortly.",
    unknown: "That action could not be completed ({code}).",
  },
  zh: {
    INVALID_REQUEST: "请求无效，请检查输入后重试",
    ROOM_NOT_FOUND: "找不到这个房间码",
    ROOM_CODE_CONFLICT: "房间码已被占用，请重新创建房间",
    ROOM_FULL: "房间已满",
    GAME_ALREADY_STARTED: "本局已经开始",
    GAME_NOT_STARTED: "本局尚未开始",
    AUTHENTICATION_FAILED: "座位验证失败，请用已保存的座位重新加入",
    HOST_ONLY: "只有房主可以这样做",
    NOT_ENOUGH_PLAYERS: "开局至少需要{min}名玩家",
    STALE_REVISION: "局面已更新，你的选择未发送，请查看后重新选择",
    DUPLICATE_COMMAND: "此操作已经发送",
    PERSISTENCE_CONFLICT: "同时有另一步被保存，请重试",
    SESSION_ENDED: "本局会话已结束",
    UNSUPPORTED_RULES_VERSION: "此房间的规则版本无法在本应用中进行",
    RULES_FINGERPRINT_MISMATCH: "此房间用不同的规则内容创建，无法在这里进行",
    COMPUTER_TURN_FAILED: "电脑玩家未能完成回合",
    SERVER_CONFIGURATION_ERROR: "联机服务配置有误",
    INTERNAL_SERVER_ERROR: "联机服务内部出错，请重试",
    METHOD_NOT_ALLOWED: "联机服务拒绝了此类请求",
    SERVICE_UNAVAILABLE: "无法连接联机服务，请稍后重试",
    unknown: "操作未能完成（{code}）",
  },
});
