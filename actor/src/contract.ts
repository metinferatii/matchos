// Message contract shared by the actor, the agents, the web embed and the React Native client.
// Do not change without telling the mobile dev.

export type Lang = "en" | "sq" | "es" | "ar"
export const LANGS: Lang[] = ["en", "sq", "es", "ar"]

export type SocketMeta = { userId: string; lang: Lang }

export type FeedItem = {
    id: string
    minute: string // display clock, e.g. "45+7'"
    lang: Lang
    kind: "commentary" | "answer" | "system"
    text: string
}

export type Offer = {
    id: string
    player: string
    title: string
    priceEur: number
    discountPct: number
    expiresAt: number // epoch ms
}

export type Score = { home: number; away: number }

// Vote counts per player for "who scores next?". Reset after each goal.
export type Predictions = Record<string, number>

export type AgentMsg = { from: string; to: string; text: string; ts: number }

export type ServerMsg =
    | { type: "state"; score: Score; minute: string; feed: FeedItem[]; offer: Offer | null; predictions: Predictions }
    | { type: "score"; home: number; away: number; minute: string }
    | { type: "feed"; item: FeedItem }
    | { type: "offer"; offer: Offer | null }
    | { type: "agent"; msg: AgentMsg }

export type ClientMsg =
    | { type: "vote"; player: string }
    | { type: "ask"; text: string }
    | { type: "buy"; offerId: string }

export type MatchEvent = {
    id: number
    minute: number
    second: number
    period: number
    clock: string
    type: string
    team: string | null
    player: string | null
    detail: string
    location: [number, number] | null
    score: Score
    shootout?: Score
}
