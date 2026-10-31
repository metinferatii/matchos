// Placeholder clips for the Story film, until the real recordings exist. Separate entry point so the
// main Root stays clean. Generate all five with: node scripts/placeholders.mjs
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig } from "remotion"
import timeline from "../../public/story/timeline.json"

type Props = { name: string; sub: string; color: string; blankUntilS: number; control: boolean }

function Placeholder({ name, sub, color, blankUntilS, control }: Props) {
    const frame = useCurrentFrame()
    const { fps, width } = useVideoConfig()
    const t = frame / fps
    if (t < blankUntilS) return <AbsoluteFill style={{ background: "#000" }} />
    const beat = [...timeline.beats].reverse().find(b => b.t <= t)
    const tc = `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`
    const base = width / 430
    const text = { fontFamily: "-apple-system, system-ui, sans-serif", color: "#f4f3f1" }
    if (control) {
        const col = (x: number, w: number, title: string, lines: string[]) => (
            <div style={{ position: "absolute", left: x, top: 112, width: w, height: 940, boxSizing: "border-box", background: "#1a1919", borderRadius: 12, padding: 24, ...text }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em" }}>{title}</div>
                {lines.map((l, i) => <div key={i} style={{ marginTop: 18, fontSize: 22, color: "#a6a3a0" }}>{l}</div>)}
            </div>
        )
        const log = Array.from({ length: 14 }, (_, i) => `${tc}  agent log line ${Math.floor(t * 2) + i}`)
        return (
            <AbsoluteFill style={{ background: "#242322" }}>
                <div style={{ position: "absolute", left: 28, top: 26, fontSize: 32, fontWeight: 800, ...text }}>CONTROL ROOM placeholder · {tc} · {beat?.id ?? "pre"}</div>
                {col(28, 440, "MATCH DATA IN", ["pitch", "events"])}
                {col(495, 690, "AI AGENT TEAM", ["roster: producer, commentator, merch, club-ops", "FAN AGENTS: arta, diego, sam, kenji", "AGENT LOG", ...log])}
                {col(1212, 680, "FANS OUT", ["club page", "phones"])}
            </AbsoluteFill>
        )
    }
    return (
        <AbsoluteFill style={{ background: color, ...text, alignItems: "center", justifyContent: "center", textAlign: "center", gap: 24 * base }}>
            <div style={{ fontSize: 56 * base, fontWeight: 800 }}>{name}</div>
            <div style={{ fontSize: 20 * base, opacity: 0.8 }}>{sub}</div>
            <div style={{ fontSize: 44 * base, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{tc}</div>
            <div style={{ fontSize: 18 * base, opacity: 0.8, maxWidth: "80%" }}>{beat ? `${beat.id}: ${beat.label}` : "pre"}</div>
        </AbsoluteFill>
    )
}

const FPS = 15
const DUR = Math.round(timeline.durationS * FPS)
const defaults: Props = { name: "", sub: "", color: "#333", blankUntilS: 0, control: false }

registerRoot(() => (
    <>
        <Composition id="phone" component={Placeholder} fps={FPS} durationInFrames={DUR} width={430} height={932} defaultProps={defaults} />
        <Composition id="desktop" component={Placeholder} fps={FPS} durationInFrames={DUR} width={1440} height={900} defaultProps={defaults} />
        <Composition id="control" component={Placeholder} fps={FPS} durationInFrames={DUR} width={1920} height={1080} defaultProps={{ ...defaults, control: true }} />
    </>
))
