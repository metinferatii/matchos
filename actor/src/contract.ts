// Message contract shared by the actor, the agents, the web embed and the React Native client.
// Do not change without telling the mobile dev. Matches the RN SDK (github.com/yasiridriz/matchos-rn,
// src/sdk/types.ts): `minute` is a number, `predictions` an array. `clock` and `originalPriceEur` are
// extra fields the RN SDK ignores and the web widget uses.

// The four languages the base translator covers (and the RN app supports).
export type Lang = "en" | "sq" | "es" | "ar"
export const LANGS: Lang[] = ["en", "sq", "es", "ar"]
// Extra fan languages: covered by translators the producer hires live; English until then.
export type ExtraLang = "ja" | "fr" | "de" | "tr"
export const EXTRA_LANGS: ExtraLang[] = ["ja", "fr", "de", "tr"]
export type FanLang = Lang | ExtraLang
export const FAN_LANGS: FanLang[] = [...LANGS, ...EXTRA_LANGS]

export type SocketMeta = { userId: string; lang: FanLang }

export type FeedItem = {
    id: string
    minute: number // minutes played, e.g. 52 for 45+7
    clock?: string // display clock, e.g. "45+7'" or "PENS"
    lang: FanLang
    kind: "commentary" | "answer" | "system"
    text: string
    personal?: true // only for this fan (answers, order confirmations); kept in their `state` feed
    agent?: string // set when the fan's own agent wrote it, e.g. "fan-sq-3f2a"
}

export type Offer = {
    id: string
    player: string
    title: string
    priceEur: number // final price the fan pays
    originalPriceEur?: number // before the discount, for a struck-through price
    discountPct: number
    expiresAt: number // epoch ms
    personal?: true // negotiated by this fan's own agent, sent only to them
}

export type Score = { home: number; away: number }

// Vote counts for "who scores next?". Reset after each goal.
export type Prediction = { player: string; votes: number }
export type Predictions = Prediction[]

// Newsroom message kinds, for styling the agent log. Optional: older messages have none.
export type AgentKind = "directive" | "draft" | "rejection" | "proposal" | "counter" | "agreement" | "hire" | "initiative" | "note"
export type AgentMsg = { from: string; to: string; text: string; ts: number; kind?: AgentKind }

// Each connected fan gets their own agent, backed by a FanAgent actor (keyed by userId) that remembers them.
export type FanAgentInfo = { userId: string; name: string; lang: FanLang; favourite?: string; status: "idle" | "working"; since: number }
export type FanMemory = {
    userId: string
    lang: FanLang
    favourite?: string // their latest "who scores next" pick
    picks: { player: string; at: string }[] // every pick, with the match clock
    questions: string[]
    purchases: { title: string; priceEur: number }[]
    lastSeenCursor: number // match events seen when they last left
    lastSeenAt: number
    notes: { clock: string; text: string }[] // what their agent told them
}

// Club ops rules for merch: jersey stock, max discount and allowed bundles per player (Supabase `inventory`).
export type InventoryItem = { player: string; team: string; stock: number; maxDiscountPct: number; bundles: string[] }

// Who is in the newsroom. Hired agents record who hired them and when; persisted in the actor.
export type RosterEntry = { name: string; role: string; lang?: FanLang; hiredBy?: string; hiredAt?: number; status: "idle" | "working" }

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
