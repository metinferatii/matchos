// Message contract shared by the actor, the agents, the web embed and the React Native client.
// Do not change without telling the mobile dev. Matches the RN SDK (github.com/yasiridriz/matchos-rn,
// src/sdk/types.ts): `minute` is a number, `predictions` an array. `clock` and `originalPriceEur` are
// extra fields the RN SDK ignores and the web widget uses.

export type Lang = "en" | "sq" | "es" | "ar"
export const LANGS: Lang[] = ["en", "sq", "es", "ar"]

export type SocketMeta = { userId: string; lang: Lang }

export type FeedItem = {
    id: string
    minute: number // minutes played, e.g. 52 for 45+7
    clock?: string // display clock, e.g. "45+7'" or "PENS"
    lang: Lang
    kind: "commentary" | "answer" | "system"
    text: string
    personal?: true // only for this fan (answers, order confirmations); kept in their `state` feed
}

export type Offer = {
    id: string
    player: string
    title: string
    priceEur: number // final price the fan pays
    originalPriceEur?: number // before the discount, for a struck-through price
    discountPct: number
    expiresAt: number // epoch ms
}

export type Score = { home: number; away: number }

// Vote counts for "who scores next?". Reset after each goal.
export type Prediction = { player: string; votes: number }
export type Predictions = Prediction[]

// Newsroom message kinds, for styling the agent log. Optional: older messages have none.
export type AgentKind = "directive" | "draft" | "rejection" | "proposal" | "counter" | "agreement" | "hire" | "initiative" | "note"
export type AgentMsg = { from: string; to: string; text: string; ts: number; kind?: AgentKind }

export type ServerMsg =
    | { type: "state"; score: Score; minute: number; clock?: string; feed: FeedItem[]; offer: Offer | null; predictions: Predictions }
    | { type: "score"; home: number; away: number; minute: number; clock?: string }
    | { type: "feed"; item: FeedItem }
    | { type: "offer"; offer: Offer | null }
    | { type: "agent"; msg: AgentMsg }

export type ClientMsg =
    | { type: "vote"; player: string }
    | { type: "ask"; text: string }
    | { type: "buy"; offerId: string }

export type MatchEvent = {
    id: number
    minute: number // StatsBomb minute (0-based)
    second: number
    period: number
    displayMinute: number // what fans see, as a number: 23 for 23', 45 for 45+7' (never decreases); the wire `minute`
    clock: string
    type: string
    team: string | null
    player: string | null
    detail: string
    location: [number, number] | null
    score: Score
    shootout?: Score
}
