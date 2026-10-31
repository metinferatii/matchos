import type { ImageSourcePropType } from "react-native";
export type Language = "en" | "sq" | "es" | "ar";
export interface ClubTheme {
  primary: string;
  secondary: string;
  logo?: string | ImageSourcePropType;
  name: string;
}
export interface FeedItem {
  id: string;
  minute: number;
  lang: Language;
  kind: "commentary" | "answer" | "system";
  text: string;
}
export interface Offer {
  id: string;
  player: string;
  title: string;
  priceEur: number;
  discountPct: number;
  expiresAt: number | string;
}
export interface Prediction {
  player: string;
  votes: number;
}
export interface MatchState {
  score: { home: number; away: number };
  minute: number;
  feed: FeedItem[];
  offer: Offer | null;
  predictions: Prediction[];
}
export type ServerMessage =
  | ({ type: "state" } & MatchState)
  | { type: "score"; home: number; away: number; minute: number }
  | { type: "feed"; item: FeedItem }
  | { type: "offer"; offer: Offer | null }
  | {
      type: "agent";
      msg: { from: string; to: string; text: string; ts: number };
    };
export type ClientMessage =
  | { type: "vote"; player: string }
  | { type: "ask"; text: string }
  | { type: "buy"; offerId: string };
export interface PurchaseOrder {
  matchId: string;
  userId: string;
  offer: Offer;
}
export interface MatchdayRoomProps {
  matchId: string;
  lang: Language;
  serverUrl: string;
  clubTheme: ClubTheme;
  onPurchase?: (order: PurchaseOrder) => void | Promise<void>;
}
