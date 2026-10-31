// Merch <-> club-ops negotiation. On a goal, merch proposes a flash offer; club-ops guards the club's
// rules (jersey stock, max discount, allowed bundles) and accepts or counters. At most two rounds,
// timeboxed; if club-ops is silent, merch uses a safe default. The agreed offer goes out in the
// existing offer shape (any bundle is in the title). Purchases decrement stock in the actor and Supabase.
import type { InventoryItem, MatchEvent, Offer } from "../shared/contract"
import { STEP_MS, room, supabase, type Member } from "./core"

const JERSEY_EUR = 89.99
const SCARF_EUR = 24.99
const LOW_STOCK = 1 // at or below this, club-ops won't sell more jerseys of that player
const SAFE_DISCOUNT = 10
export const JERSEY: Record<string, number> = { Messi: 10, "Di María": 11, Mbappé: 10, "Kolo Muani": 12, Dybala: 21, Paredes: 5, Montiel: 4 }

// Same rows as supabase/schema.sql; used to reseed on reset and if Supabase is unreachable.
export const SEED: InventoryItem[] = [
    { player: "Messi", team: "Argentina", stock: 40, maxDiscountPct: 15, bundles: ["scarf", "name print"] },
    { player: "Di María", team: "Argentina", stock: 25, maxDiscountPct: 25, bundles: ["scarf", "name print"] },
    { player: "Mbappé", team: "France", stock: 2, maxDiscountPct: 20, bundles: ["scarf", "name print"] },
    { player: "Kolo Muani", team: "France", stock: 6, maxDiscountPct: 20, bundles: ["name print"] },
    { player: "Julián Álvarez", team: "Argentina", stock: 15, maxDiscountPct: 20, bundles: ["scarf", "name print"] },
    { player: "Dybala", team: "Argentina", stock: 10, maxDiscountPct: 20, bundles: ["name print"] },
    { player: "Griezmann", team: "France", stock: 15, maxDiscountPct: 20, bundles: ["scarf", "name print"] },
]

type Row = { player: string; team: string; stock: number; max_discount_pct: number; bundles: string[] }
const toItem = (r: Row): InventoryItem => ({ player: r.player, team: r.team, stock: r.stock, maxDiscountPct: r.max_discount_pct, bundles: r.bundles ?? [] })
const toRow = (i: InventoryItem) => ({ player: i.player, team: i.team, stock: i.stock, max_discount_pct: i.maxDiscountPct, bundles: i.bundles })

// club-ops' working copy of the rules, so a goal's negotiations don't queue behind the match actor.
// The actor's persisted stock is the source of truth; this copy is refreshed from it on start and sale.
let cache: Record<string, InventoryItem> | null = null
const inventory = async () => (cache ??= await room.getInventory())

/** Loads the inventory from Supabase into the actor (the actor's cached stock wins after a restart). */
export async function loadInventory() {
    const rows = await supabase.select<Row>("inventory", "select=player,team,stock,max_discount_pct,bundles")
    cache = await room.setInventory(rows?.length ? rows.map(toItem) : SEED)
}

/** Back to the seeded stock, in the actor and in Supabase (used on replay reset). */
export async function reseedInventory() {
    cache = await room.setInventory(SEED, true)
    await supabase.upsert("inventory", SEED.map(i => ({ ...toRow(i), updated_at: new Date().toISOString() })))
}

export type Terms = { player: string; team: string; item: "jersey" | "scarf"; discountPct: number; bundle?: string }

const price = (t: Terms) => +((t.item === "scarf" ? SCARF_EUR : JERSEY_EUR) * (1 - t.discountPct / 100)).toFixed(2)
const describeTerms = (t: Terms) =>
    t.item === "scarf" ? `${t.team} scarf at ${t.discountPct}% off`
    : `${t.player} jersey at ${t.discountPct}% off${t.bundle ? ` with a free ${t.bundle}` : ""}`

function toOffer(t: Terms): Offer {
    const title = t.item === "scarf"
        ? `${t.team} scarf, ${t.player} goal special`
        : `${t.player} #${JERSEY[t.player] ?? 10} ${t.team} home jersey${t.bundle ? ` + free ${t.bundle}` : ""}`
    return {
        id: crypto.randomUUID(),
        player: t.player,
        title,
        priceEur: price(t),
        originalPriceEur: t.item === "scarf" ? SCARF_EUR : JERSEY_EUR,
        discountPct: t.discountPct,
        expiresAt: Date.now() + 10 * 60_000,
    }
}

/** club-ops: checks each proposal against the club's rules. */
export function startClubOps(clubOps: Member) {
    clubOps.on(async m => {
        // Merch, and fans' own agents negotiating personal offers.
        if (!(m.from === "merch" || m.from.startsWith("fan-")) || m.kind !== "proposal") return
        const t = m.data as Terms
        const inv = (await inventory())[t.player]
        const reply = (kind: "agreement" | "counter" | "rejection", text: string, data?: unknown) => clubOps.post(m.from, text, { kind, ref: m.ref, data })
        if (!inv) return reply("agreement", `No rules on file for ${t.player}. Approved: ${describeTerms(t)}.`, t)
        if (t.item === "jersey" && inv.stock <= LOW_STOCK) {
            if (!inv.bundles.includes("scarf")) return reply("rejection", `Stock too low on ${t.player} jerseys (${inv.stock} left). No offer.`)
            const counter: Terms = { player: t.player, team: t.team, item: "scarf", discountPct: Math.min(t.discountPct, inv.maxDiscountPct) }
            return reply("counter", `Stock too low on ${t.player} jerseys (${inv.stock} left). Counter: ${describeTerms(counter)}.`, counter)
        }
        if (t.discountPct > inv.maxDiscountPct) {
            const counter: Terms = { ...t, discountPct: inv.maxDiscountPct }
            return reply("counter", `Max discount on ${t.player} is ${inv.maxDiscountPct}%. Counter: ${describeTerms(counter)}.`, counter)
        }
        if (t.bundle && !inv.bundles.includes(t.bundle)) {
            const counter: Terms = { ...t, bundle: undefined }
            return reply("counter", `No ${t.bundle} bundle allowed for ${t.player}. Counter: ${describeTerms(counter)}.`, counter)
        }
        return reply("agreement", `Approved: ${describeTerms(t)}. ${inv.stock} in stock.`, t)
    })
}

/**
 * Proposes an offer for a goal to club-ops, handles one counter round, and falls back to a safe default.
 * Used by merch (the general offer) and by fans' own agents (a personal one, starting from `start`).
 */
export async function negotiateOffer(merch: Member, e: MatchEvent, start?: Partial<Terms>, windowMs = STEP_MS): Promise<Offer | null> {
    const deadline = Date.now() + windowMs
    let terms: Terms = { player: e.player!, team: e.team!, item: "jersey", discountPct: 20, ...start }
    for (let round = 1; round <= 2; round++) {
        const ref = `${e.id}-${merch.name}-${round}`
        const reply = merch.waitFor(x => x.from === "club-ops" && x.ref === ref, Math.max(100, deadline - Date.now()))
        await merch.post("club-ops", `${round === 1 ? "Proposal" : "Counter-proposal"}: ${describeTerms(terms)} for 10 min.`, { kind: "proposal", ref, data: terms })
        const r = await reply
        if (!r) {
            const safe: Terms = { player: e.player!, team: e.team!, item: "jersey", discountPct: SAFE_DISCOUNT }
            await merch.post("all", `club-ops didn't answer in time. Using the safe default: ${describeTerms(safe)}.`, { kind: "note" })
            return toOffer(safe)
        }
        if (r.kind === "agreement") return toOffer(r.data as Terms)
        if (r.kind === "rejection") {
            await merch.post("all", `No offer for ${e.player}: ${r.text}`, { kind: "note" })
            return null
        }
        // A counter: a smaller discount is sweetened with a bundle if the club allows one; anything else is accepted.
        const counter = r.data as Terms
        if (round === 1 && counter.item === "jersey" && counter.discountPct < terms.discountPct && !counter.bundle && !start) {
            terms = { ...counter, bundle: "scarf" }
            continue
        }
        await merch.post("club-ops", `Agreed: ${describeTerms(counter)}.`, { kind: "agreement", ref })
        return toOffer(counter)
    }
    return toOffer(terms)
}

/** After a sale: one less jersey, in the actor (durable) and Supabase. */
export async function recordSale(clubOps: Member, offer: Offer) {
    if (!/jersey/i.test(offer.title)) return
    const stock = await room.decrementStock(offer.player)
    if (stock === null) return
    if (cache?.[offer.player]) cache = { ...cache, [offer.player]: { ...cache[offer.player], stock } }
    await supabase.patch("inventory", `player=eq.${encodeURIComponent(offer.player)}`, { stock, updated_at: new Date().toISOString() })
    await clubOps.post("all", `Stock update: ${offer.player} jerseys, ${stock} left.`, { kind: "note" })
}
