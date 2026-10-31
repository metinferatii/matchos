import { useCurrentFrame } from "remotion"
import { C, F, Label, Rise, Scene, Wordmark, useProgress } from "../theme"

const Big = ({ children, color = C.text }: { children: React.ReactNode; color?: string }) => (
    <div style={{ fontFamily: F.title, fontWeight: 900, fontSize: 96, lineHeight: 1.04, letterSpacing: "-0.015em", color }}>{children}</div>
)

/** Cold open: the problem in two lines. */
export function ColdOpen() {
    return (
        <Scene>
            <div style={{ position: "absolute", left: 160, top: 300, right: 160 }}>
                <Rise at={6}><Big>Every weekend, thousands of clubs play.</Big></Rise>
                <Rise at={42}><Big color={C.accent}>Most have one social media person.</Big></Rise>
                <Rise at={84} style={{ marginTop: 44, fontSize: 36, color: C.muted, maxWidth: 1200, lineHeight: 1.35 }}>
                    Their fans get no live coverage in their own language, and the club misses matchday revenue.
                </Rise>
            </div>
        </Scene>
    )
}

const Row = ({ at, text, strong }: { at: number; text: string; strong?: boolean }) => (
    <Rise at={at} style={{ padding: "26px 0", borderTop: `2px solid ${C.line}`, fontSize: 44, fontWeight: strong ? 600 : 500, color: strong ? C.text : C.muted }}>{text}</Rise>
)

/** The gap between the biggest clubs and everyone else. */
export function Gap() {
    return (
        <Scene>
            <div style={{ position: "absolute", inset: "300px 160px 180px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 120 }}>
                <div>
                    <Rise at={4}><Label>The biggest clubs</Label></Rise>
                    <div style={{ marginTop: 36 }}>
                        <Row at={14} strong text="A 20-person matchday team" />
                        <Row at={24} strong text="Live coverage in every language" />
                        <Row at={34} strong text="Merch pushed on every goal" />
                    </div>
                </div>
                <div>
                    <Rise at={70}><Label color={C.live}>Everyone else</Label></Rise>
                    <div style={{ marginTop: 36 }}>
                        <Row at={80} text="One person, maybe" />
                        <Row at={90} text="One language, if any" />
                        <Row at={100} text="No matchday revenue" />
                    </div>
                </div>
            </div>
        </Scene>
    )
}

/** The reveal: the product and its promise. */
export function Reveal() {
    return (
        <Scene style={{ background: C.deep }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
                <Rise at={4}><Wordmark size={150} /></Rise>
                <Rise at={30} style={{ fontSize: 50, color: C.muted, fontWeight: 500 }}>
                    One script tag. <span style={{ color: C.text }}>An AI-run matchday.</span>
                </Rise>
            </div>
        </Scene>
    )
}

const TAG = `<script src="https://matchday.os/embed.js"
        data-match="wc22-final"
        data-lang="sq"></script>`

/** The drop-in: the one line a club adds, typing itself out. */
export function ScriptTag() {
    const frame = useCurrentFrame()
    const typed = Math.floor(useProgress(4, 48) * TAG.length)
    const caret = frame % 30 < 16 ? C.accent : "transparent"
    return (
        <Scene>
            <div style={{ position: "absolute", left: 160, right: 160, top: 210 }}>
                <Rise at={0}><Label>The whole integration</Label></Rise>
                <Rise at={6} style={{ marginTop: 36, background: C.card, border: `2px solid ${C.line}`, borderRadius: 16, padding: "48px 52px", fontFamily: F.mono, fontSize: 38, lineHeight: 1.5, color: C.text, minHeight: 250, whiteSpace: "pre" }}>
                    <span>{TAG.slice(0, typed)}</span>
                    <span style={{ display: "inline-block", width: 18, height: 40, marginLeft: 4, verticalAlign: "-6px", background: caret }} />
                </Rise>
                <Rise at={50} style={{ marginTop: 48, fontSize: 40, color: C.muted, lineHeight: 1.4 }}>
                    Or one React Native component in the club's app. Fans get live AI commentary in their language,
                    <span style={{ color: C.text }}> predictions, answers, and flash merch on every goal.</span>
                </Rise>
            </div>
        </Scene>
    )
}

/** Trailer hook: three hard beats of big type. */
export function Hook() {
    const frame = useCurrentFrame()
    const lines: [number, string, string][] = [[0, "Every fan.", C.text], [30, "Their own AI agent.", C.accent], [66, "Live. In their language.", C.text]]
    const shown = lines.filter(([at]) => frame >= at)
    return (
        <Scene fade={6} style={{ background: C.deep }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 160, gap: 6 }}>
                {shown.map(([at, text, color]) => (
                    <Rise key={text} at={at} style={{ fontFamily: F.title, fontWeight: 900, fontSize: 132, lineHeight: 1.02, letterSpacing: "-0.02em", color }}>{text}</Rise>
                ))}
            </div>
        </Scene>
    )
}
