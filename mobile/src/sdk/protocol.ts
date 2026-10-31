import type { MatchState, ServerMessage } from "./types";
export const initialState: MatchState = {
  score: { home: 0, away: 0 },
  minute: 0,
  feed: [],
  offer: null,
  predictions: [],
};
export function socketUrl(
  serverUrl: string,
  matchId: string,
  userId: string,
  lang: string,
) {
  const url = new URL(
    serverUrl.replace("{matchId}", encodeURIComponent(matchId)),
  );
  if (!["ws:", "wss:"].includes(url.protocol))
    throw new Error("Use a ws:// or wss:// server URL");
  url.searchParams.set("matchId", matchId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("lang", lang);
  return url.toString();
}
export function applyMessage(
  state: MatchState,
  msg: ServerMessage,
): MatchState {
  switch (msg.type) {
    case "state":
      return {
        score: msg.score,
        minute: msg.minute,
        feed: [...msg.feed].sort((a, b) => b.minute - a.minute).slice(0, 200),
        offer: msg.offer,
        predictions: msg.predictions,
      };
    case "score":
      return {
        ...state,
        score: { home: msg.home, away: msg.away },
        minute: msg.minute,
      };
    case "feed":
      return {
        ...state,
        minute: Math.max(state.minute, msg.item.minute),
        feed: [
          msg.item,
          ...state.feed.filter((i) => i.id !== msg.item.id),
        ].slice(0, 200),
      };
    case "offer":
      return { ...state, offer: msg.offer };
    default:
      return state;
  }
}
export function parseMessage(raw: string): ServerMessage | null {
  try {
    const m = JSON.parse(raw);
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0;
    const item = (v: any) =>
      v &&
      typeof v.id === "string" &&
      num(v.minute) &&
      ["en", "sq", "es", "ar"].includes(v.lang) &&
      ["commentary", "answer", "system"].includes(v.kind) &&
      typeof v.text === "string";
    const offer = (v: any) =>
      v === null ||
      (v &&
        typeof v.id === "string" &&
        typeof v.player === "string" &&
        typeof v.title === "string" &&
        num(v.priceEur) &&
        num(v.discountPct) &&
        Number.isFinite(expiry(v.expiresAt)));
    if (
      m.type === "state" &&
      m.score &&
      num(m.score.home) &&
      num(m.score.away) &&
      num(m.minute) &&
      Array.isArray(m.feed) &&
      m.feed.every(item) &&
      offer(m.offer) &&
      Array.isArray(m.predictions) &&
      m.predictions.every(
        (p: any) => typeof p.player === "string" && num(p.votes),
      )
    )
      return m;
    if (m.type === "score" && num(m.home) && num(m.away) && num(m.minute))
      return m;
    if (m.type === "feed" && item(m.item)) return m;
    if (m.type === "offer" && offer(m.offer)) return m;
    return null;
  } catch {
    return null;
  }
}
export function expiry(value: number | string): number {
  return typeof value === "number"
    ? value < 1e12
      ? value * 1000
      : value
    : Date.parse(value);
}
