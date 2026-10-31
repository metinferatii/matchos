import { OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { C, F, Label, Rise, Scene } from "../theme"

// The recording (demo/out/matchday-os-demo.mp4) without its own title and end cards.
export const DEMO_FROM_S = 4.5
export const DEMO_TO_S = 72.9

// Chapter starts, in seconds into the trimmed clip (from the recorder's timestamps).
const CHAPTERS: [number, string][] = [
    [0, "Kick-off"],
    [4.7, "Goal on three surfaces"],
    [11, "Agents negotiate"],
    [17.7, "The producer"],
    [28.7, "A live hire"],
    [49.5, "Kill the server"],
    [59.4, "Resume"],
]

export function Demo() {
    const frame = useCurrentFrame()
    const { fps, durationInFrames } = useVideoConfig()
    const t = frame / fps
    const current = CHAPTERS.reduce((i, [s], j) => (t >= s ? j : i), 0)
    const W = 1600, H = 900
    return (
        <Scene style={{ background: C.deep }}>
            <div style={{ position: "absolute", left: (1920 - W) / 2, top: 34, width: W, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Rise at={0}><Label color={C.text}>Live demo</Label></Rise>
                <Rise at={6} style={{ fontSize: 24, color: C.muted }}>2022 World Cup final, replayed from StatsBomb Open Data</Rise>
            </div>
            <div style={{ position: "absolute", left: (1920 - W) / 2, top: 84, width: W, height: H, borderRadius: 14, overflow: "hidden", border: `2px solid ${C.line}` }}>
                <OffthreadVideo src={staticFile("demo.mp4")} startFrom={Math.round(DEMO_FROM_S * fps)} endAt={Math.round(DEMO_TO_S * fps)} muted style={{ width: W, height: H }} />
            </div>
            <div style={{ position: "absolute", left: (1920 - W) / 2, top: 84 + H + 26, width: W, display: "flex", gap: 10 }}>
                {CHAPTERS.map(([s, name], i) => {
                    const end = CHAPTERS[i + 1]?.[0] ?? durationInFrames / fps
                    const fill = Math.min(1, Math.max(0, (t - s) / (end - s)))
                    const on = i === current
                    return (
                        <div key={name} style={{ flex: end - s }}>
                            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${fill * 100}%`, height: "100%", background: on ? C.accent : C.muted }} />
                            </div>
                            <div style={{ marginTop: 10, fontSize: 19, fontFamily: F.body, fontWeight: on ? 600 : 500, color: on ? C.text : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                        </div>
                    )
                })}
            </div>
        </Scene>
    )
}
