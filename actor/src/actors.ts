import { Actor, Persisted, type ActorSocket } from "terse-sdk/actor"
import match from "./match.json" with { type: "json" }
import { templateLine } from "./templates.js"
import type { AgentMsg, ClientMsg, FeedItem, Lang, MatchEvent, Offer, Predictions, Score, ServerMsg, SocketMeta } from "./contract.js"

const EVENTS = match.events as MatchEvent[]
const LANGS: Lang[] = ["en", "sq", "es", "ar"]
const FEED_MAX = 80
const LOG_MAX = 150
// Sockets opened by the agents process use this userId and get internal messages too.
const AGENTS_USER = "__agents__"

type LangFeeds = { en: FeedItem[]; sq: FeedItem[]; es: FeedItem[]; ar: FeedItem[] }
export type LangLines = { en?: string; sq?: string; es?: string; ar?: string }

export type Question = { id: string; userId: string; lang: Lang; text: string; ts: number }
export type Order = { id: string; userId: string; offer: Offer; ts: number }

// Internal messages for the agents process, on top of the public contract.
export type AgentOut =
    | { type: "event"; event: MatchEvent; cursor: number; total: number }
    | { type: "question"; question: Question }
    | { type: "order"; order: Order }
    | { type: "control"; running: boolean; cursor: number }

// Terse reserves the "state" message type, so the actor sends "room_state" and the gateway
// renames it to the contract's "state" on the way to clients.
type RoomStateMsg = Omit<Extract<ServerMsg, { type: "state" }>, "type"> & { type: "room_state" }
type Outgoing = Exclude<ServerMsg, { type: "state" }> | RoomStateMsg | AgentOut
type Socket = ActorSocket<SocketMeta, Outgoing>

export type RoomState = {
    matchId: string
    running: boolean
    tickMs: number
    cursor: number
    total: number
    score: Score
    shootout: Score | null
    minute: string
    offer: Offer | null
    predictions: Predictions
    lastEvent: MatchEvent | null
    agentLog: AgentMsg[]
    feed: LangFeeds
    orders: number
}

/** One live match. The replay clock is the actor alarm; every field survives a restart. */
export class MatchRoom extends Actor<SocketMeta, ClientMsg, Outgoing> {
    @Persisted running = false
    @Persisted tickMs = 3000
    @Persisted cursor = 0
    @Persisted score: Score = { home: 0, away: 0 }
    @Persisted minute = "0'"
    @Persisted feed: LangFeeds = { en: [], sq: [], es: [], ar: [] }
    @Persisted agentLog: AgentMsg[] = []
    @Persisted offer: Offer | null = null
    @Persisted votes: Record<string, string> = {}
    @Persisted predictions: Predictions = {}
    @Persisted commentedThrough = -1
    @Persisted orders: Order[] = []

    // ---- Replay control ----

    async start(tickMs?: number): Promise<RoomState> {
        if (tickMs) this.tickMs = Math.max(500, tickMs)
        this.running = true
        this.alarm.set(Date.now() + 300)
        await this.toAgents({ type: "control", running: true, cursor: this.cursor })
        return this.getState()
    }

    async pause(): Promise<RoomState> {
        this.running = false
        this.alarm.delete()
        await this.toAgents({ type: "control", running: false, cursor: this.cursor })
        return this.getState()
    }

    async setSpeed(tickMs: number): Promise<RoomState> {
        this.tickMs = Math.max(500, tickMs)
        if (this.running) this.alarm.set(Date.now() + this.tickMs)
        return this.getState()
    }

    /** Clears everything back to before kick-off. */
    async reset(): Promise<RoomState> {
        this.alarm.delete()
        this.running = false
        this.cursor = 0
        this.score = { home: 0, away: 0 }
        this.minute = "0'"
        this.feed = { en: [], sq: [], es: [], ar: [] }
        this.agentLog = []
        this.offer = null
        this.votes = {}
        this.predictions = {}
        this.commentedThrough = -1
        this.orders = []
        await this.sendStateToAll()
        return this.getState()
    }

    /** Jumps the replay so the next event revealed is `index` (demo shortcut to the big moments). */
    async jumpTo(index: number): Promise<RoomState> {
        const i = Math.max(0, Math.min(EVENTS.length, index))
        this.cursor = i
        this.commentedThrough = i - 1
        const prev = EVENTS[i - 1]
        this.score = prev ? { ...prev.score } : { home: 0, away: 0 }
        this.minute = prev ? prev.clock : "0'"
        this.offer = null
        this.broadcast({ type: "offer", offer: null })
        this.broadcast({ type: "score", ...this.score, minute: this.minute })
        return this.getState()
    }

    /**
     * Re-arms the replay clock if it should be running but no alarm is pending, e.g. right after
     * the actor server restarts. The gateway calls this every couple of seconds as a watchdog.
     */
    async ensureTicking(): Promise<{ rearmed: boolean; alarm: number | null }> {
        const alarm = this.alarm.get()
        if (!this.running || this.cursor >= EVENTS.length) return { rearmed: false, alarm }
        if (alarm === null || alarm < Date.now() - 1500) {
            this.alarm.set(Date.now() + 200)
            return { rearmed: true, alarm }
        }
        return { rearmed: false, alarm }
    }

    async onAlarm(): Promise<void> {
        if (!this.running) return
        await this.fallbackCommentary()
        if (this.offer && this.offer.expiresAt < Date.now()) await this.setOfferNow(null)
        if (this.cursor >= EVENTS.length) {
            this.running = false
            return
        }
        const event = EVENTS[this.cursor]
        this.cursor += 1
        this.minute = event.clock
        this.score = { ...event.score }
        this.broadcast({ type: "score", home: event.score.home, away: event.score.away, minute: event.clock })
        if (event.type === "goal" && event.player) {
            await this.settlePredictions(event.player)
            await this.sendStateToAll()
        }
        await this.toAgents({ type: "event", event, cursor: this.cursor, total: EVENTS.length })
        if (this.cursor < EVENTS.length) this.alarm.set(Date.now() + this.tickMs)
        else this.running = false
    }

    // ---- Agent write API (called by the agents process) ----

    async postCommentary(eventId: number, lines: LangLines): Promise<void> {
        // The fallback may already have covered this event if the agents were slow, and lines still
        // in flight from before a reset or backwards jump are for events the replay hasn't reached.
        if (eventId <= this.commentedThrough || eventId >= this.cursor) return
        const event = EVENTS[eventId]
        for (const lang of LANGS) {
            const text = lines[lang] || (event ? templateLine(event, lang) : "")
            if (text) await this.pushFeed(lang, "commentary", text, event?.clock)
        }
        this.commentedThrough = Math.max(this.commentedThrough, eventId)
    }

    async postAgentMsg(from: string, to: string, text: string): Promise<void> {
        const msg: AgentMsg = { from, to, text: text.slice(0, 400), ts: Date.now() }
        this.agentLog = [...this.agentLog, msg].slice(-LOG_MAX)
        this.broadcast({ type: "agent", msg })
    }

    async setOffer(offer: Offer | null): Promise<void> {
        await this.setOfferNow(offer)
    }

    async postAnswer(userId: string, lang: Lang, text: string): Promise<void> {
        const item: FeedItem = { id: crypto.randomUUID(), minute: this.minute, lang, kind: "answer", text }
        for (const s of await this.getConnections()) if (s.metadata.userId === userId) s.send({ type: "feed", item })
    }

    async confirmOrder(orderId: string, paidEur: number): Promise<void> {
        const order = this.orders.find(o => o.id === orderId)
        if (!order) return
        const price = `€${paidEur.toFixed(2)}`
        const text: Record<Lang, string> = {
            en: `✅ Order confirmed: ${order.offer.title}, ${price}`,
            sq: `✅ Porosia u konfirmua: ${order.offer.title}, ${price}`,
            es: `✅ Pedido confirmado: ${order.offer.title}, ${price}`,
            ar: `✅ تم تأكيد الطلب: ${order.offer.title}، ${price}`,
        }
        for (const s of await this.getConnections())
            if (s.metadata.userId === order.userId) {
                const lang = LANGS.includes(s.metadata.lang) ? s.metadata.lang : "en"
                s.send({ type: "feed", item: { id: crypto.randomUUID(), minute: this.minute, lang, kind: "system", text: text[lang] } })
            }
    }

    // ---- Reads ----

    async getState(): Promise<RoomState> {
        return {
            matchId: this.id,
            running: this.running,
            tickMs: this.tickMs,
            cursor: this.cursor,
            total: EVENTS.length,
            score: this.score,
            shootout: EVENTS[this.cursor - 1]?.shootout ?? null,
            minute: this.minute,
            offer: this.offer,
            predictions: this.predictions,
            lastEvent: EVENTS[this.cursor - 1] ?? null,
            agentLog: this.agentLog,
            feed: this.feed,
            orders: this.orders.length,
        }
    }

    /** Revealed events so far, e.g. for the stats agent or the archive. */
    async getTimeline(): Promise<MatchEvent[]> {
        return EVENTS.slice(0, this.cursor)
    }

    async getOrders(): Promise<Order[]> {
        return this.orders
    }

    // ---- Sockets ----

    async onConnect(socket: Socket): Promise<void> {
        const { userId, lang } = socket.metadata
        socket.setTags(userId === AGENTS_USER ? "agents" : "fan", `lang:${LANGS.includes(lang) ? lang : "en"}`)
        socket.send(await this.stateMsg(lang))
    }

    async onMessage(socket: Socket, message: ClientMsg): Promise<void> {
        const { userId, lang } = socket.metadata
        if (message.type === "vote" && typeof message.player === "string") {
            this.votes = { ...this.votes, [userId]: message.player.slice(0, 60) }
            this.predictions = tally(this.votes)
            await this.sendStateToAll()
        } else if (message.type === "ask" && typeof message.text === "string" && message.text.trim()) {
            const question: Question = { id: crypto.randomUUID(), userId, lang, text: message.text.slice(0, 300), ts: Date.now() }
            await this.toAgents({ type: "question", question })
        } else if (message.type === "buy") {
            if (!this.offer || this.offer.id !== message.offerId || this.offer.expiresAt < Date.now()) {
                socket.send({ type: "feed", item: { id: crypto.randomUUID(), minute: this.minute, lang, kind: "system", text: "⏱ This offer has expired." } })
                return
            }
            const order: Order = { id: crypto.randomUUID(), userId, offer: this.offer, ts: Date.now() }
            this.orders = [...this.orders, order]
            await this.toAgents({ type: "order", order })
        }
    }

    // ---- Helpers ----

    private async stateMsg(lang: Lang): Promise<RoomStateMsg> {
        return { type: "room_state", score: this.score, minute: this.minute, feed: this.feed[lang] ?? this.feed.en, offer: this.offer, predictions: this.predictions }
    }

    private async sendStateToAll(): Promise<void> {
        for (const s of await this.getConnections()) s.send(await this.stateMsg(s.metadata.lang))
    }

    private async toAgents(msg: AgentOut): Promise<void> {
        this.broadcast(msg, { tags: ["agents"] })
    }

    private async pushFeed(lang: Lang, kind: FeedItem["kind"], text: string, minute = this.minute): Promise<void> {
        const item: FeedItem = { id: crypto.randomUUID(), minute, lang, kind, text }
        this.feed = { ...this.feed, [lang]: [...this.feed[lang], item].slice(-FEED_MAX) }
        this.broadcast({ type: "feed", item }, { tags: [`lang:${lang}`] })
    }

    private async setOfferNow(offer: Offer | null): Promise<void> {
        this.offer = offer
        this.broadcast({ type: "offer", offer })
    }

    /** If the agents missed an event (slow LLM or agents process down), fill in canned lines. */
    private async fallbackCommentary(): Promise<void> {
        for (let i = this.commentedThrough + 1; i < this.cursor; i++) {
            const e = EVENTS[i]
            for (const lang of LANGS) await this.pushFeed(lang, "commentary", templateLine(e, lang), e.clock)
        }
        this.commentedThrough = Math.max(this.commentedThrough, this.cursor - 1)
    }

    private async settlePredictions(scorer: string): Promise<void> {
        const right = Object.values(this.votes).filter(p => p === scorer).length
        if (right > 0) {
            const lines: Record<Lang, string> = {
                en: `🎯 ${right} fan${right > 1 ? "s" : ""} called it: ${scorer}!`,
                sq: `🎯 ${right} tifoz e parashikuan: ${scorer}!`,
                es: `🎯 ¡${right} aficionado${right > 1 ? "s" : ""} lo predijo: ${scorer}!`,
                ar: `🎯 ${right} من المشجعين توقعوا: ${scorer}!`,
            }
            for (const lang of LANGS) await this.pushFeed(lang, "system", lines[lang])
        }
        this.votes = {}
        this.predictions = {}
    }
}

function tally(votes: Record<string, string>): Predictions {
    const out: Predictions = {}
    for (const p of Object.values(votes)) out[p] = (out[p] ?? 0) + 1
    return out
}
