import type { ReactNode } from "react"
import { C, F, Label, Rise, Scene, Wordmark, useProgress } from "../theme"

const Box = ({ x, y, w, h, at, title, children, accent }: { x: number; y: number; w: number; h: number; at: number; title: string; children: ReactNode; accent?: boolean }) => (
    <Rise at={at} style={{ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box", background: C.card, border: `2px solid ${accent ? C.accent : C.line}`, borderRadius: 16, padding: "30px 32px" }}>
        <Label color={accent ? C.accent : C.muted} style={{ fontSize: 19 }}>{title}</Label>
        <div style={{ marginTop: 18, fontSize: 30, lineHeight: 1.35 }}>{children}</div>
    </Rise>
)

/** An arrow that draws itself between two points. */
function Arrow({ x1, y1, x2, y2, from, to }: { x1: number; y1: number; x2: number; y2: number; from: number; to: number }) {
    const p = useProgress(from, to)
    const len = Math.hypot(x2 - x1, y2 - y1)
    return (
        <svg style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.muted} strokeWidth={3} strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
            {p > 0.98 && <polygon points={`${x2},${y2} ${x2 - 14},${y2 - 9} ${x2 - 14},${y2 + 9}`} fill={C.muted} />}
        </svg>
    )
}

const AGENTS = ["producer", "commentator", "translator", "stats", "merch", "club-ops", "crowd", "ingest"]

/** How it works: data in, a durable actor per match, the agent newsroom, fans out. */
export function HowItWorks() {
    return (
        <Scene>
            <Rise at={0} style={{ position: "absolute", left: 120, top: 90 }}><Label color={C.text} style={{ fontSize: 26 }}>How it works</Label></Rise>
            <Box x={120} y={300} w={330} h={300} at={8} title="Match data">Live events in, e.g. StatsBomb</Box>
            <Box x={530} y={260} w={380} h={380} at={22} title="Terse durable actor">
                One per match. Score, feeds, roster and stock <span style={{ color: C.accent }}>survive any restart</span>.
            </Box>
            <Box x={990} y={250} w={480} h={400} at={36} title="AI newsroom · Agent Relay" accent>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", fontSize: 26, color: C.muted }}>
                    {AGENTS.map(a => <div key={a}>{a}</div>)}
                </div>
                <div style={{ marginTop: 22, fontSize: 26, lineHeight: 1.4 }}>Directs, drafts, rejects, negotiates, and <span style={{ color: C.accent }}>hires new agents live</span>.</div>
            </Box>
            <Box x={1550} y={300} w={300} h={300} at={50} title="Fans">Web embed and React Native, in 8 languages</Box>
            <Arrow x1={452} y1={450} x2={526} y2={450} from={18} to={30} />
            <Arrow x1={912} y1={450} x2={986} y2={450} from={32} to={44} />
            <Arrow x1={1472} y1={450} x2={1546} y2={450} from={46} to={58} />
            <Box x={990} y={700} w={860} h={130} at={66} title="Supabase">Orders, club inventory and the match archive</Box>
            <Rise at={86} style={{ position: "absolute", left: 120, top: 712, width: 780, fontSize: 34, lineHeight: 1.4, color: C.muted }}>
                One actor per match, so <span style={{ color: C.text }}>thousands of matches run side by side</span>, each on its own.
            </Rise>
        </Scene>
    )
}

/** Why this team. */
export function Edge() {
    return (
        <Scene>
            <div style={{ position: "absolute", left: 160, right: 160, top: 300 }}>
                <Rise at={0}><Label>Why us</Label></Rise>
                <Rise at={10} style={{ marginTop: 34, fontFamily: F.title, fontWeight: 800, fontSize: 70, lineHeight: 1.12 }}>
                    We build broadcasting and digital infrastructure for a top football federation.
                </Rise>
                <Rise at={40} style={{ marginTop: 34, fontSize: 40, color: C.muted, lineHeight: 1.4 }}>
                    And we run agencies that ship club apps. We know who installs this, and how.
                </Rise>
            </div>
        </Scene>
    )
}

/** Closing card. */
export function Close() {
    return (
        <Scene style={{ background: C.deep }} fade={16}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
                <Rise at={4} style={{ fontFamily: F.title, fontWeight: 800, fontSize: 64, textAlign: "center", lineHeight: 1.1 }}>
                    Stripe-style drop-in for matchday.
                </Rise>
                <Rise at={24}><Wordmark size={96} /></Rise>
                <Rise at={48} style={{ marginTop: 40, fontSize: 24, color: C.dim, textAlign: "center", lineHeight: 1.7 }}>
                    Built with Terse Durable Actors · Agent Relay · Supabase · OpenAI<br />Data: StatsBomb Open Data
                </Rise>
            </div>
        </Scene>
    )
}
