// The match, told by the fans: each shot lays out one or more recordings, all cued to the same
// moment of the shared timeline so every surface stays in sync.
import type { CSSProperties, ReactNode } from "react"
import { OffthreadVideo, staticFile } from "remotion"
import { C, F, Label, Rise, Scene } from "../theme"
import { CROPS, type Caption, type Layout, type Persona, SURFACES, type SurfaceId } from "./data"

const BEZEL = 12
const BAR = 34

/** One recording, cued to `startFrame` of the shared timeline, scaled to `scale`, optionally cropped. */
function Clip({ id, startFrame, scale, crop }: { id: SurfaceId; startFrame: number; scale: number; crop?: { x: number; y: number; w: number; h: number } }) {
    const s = SURFACES[id]
    const r = crop ?? { x: 0, y: 0, w: s.w, h: s.h }
    return (
        <div style={{ width: r.w * scale, height: r.h * scale, overflow: "hidden", position: "relative", background: "#000" }}>
            <OffthreadVideo src={staticFile(s.file)} startFrom={startFrame} muted
                style={{ position: "absolute", left: -r.x * scale, top: -r.y * scale, width: s.w * scale, height: s.h * scale }} />
        </div>
    )
}

/** A surface in its device: a plain rounded phone, or a browser window with a thin bar. */
export function Device({ id, startFrame, scale }: { id: SurfaceId; startFrame: number; scale: number }) {
    const kind = SURFACES[id].kind
    if (kind === "phone") {
        return (
            <div style={{ padding: BEZEL, background: C.deep, border: `2px solid ${C.line}`, borderRadius: 54 * scale + BEZEL, width: "fit-content" }}>
                <div style={{ borderRadius: 54 * scale, overflow: "hidden" }}><Clip id={id} startFrame={startFrame} scale={scale} /></div>
            </div>
        )
    }
    return (
        <div style={{ border: `2px solid ${C.line}`, borderRadius: 14, overflow: "hidden", background: C.deep, width: "fit-content" }}>
            {kind === "desktop" && (
                <div style={{ height: BAR, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", borderBottom: `2px solid ${C.line}` }}>
                    {[0, 1, 2].map(i => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: C.line }} />)}
                    <span style={{ marginLeft: 14, fontFamily: F.mono, fontSize: 15, color: C.dim }}>ligademo.club/match</span>
                </div>
            )}
            <Clip id={id} startFrame={startFrame} scale={scale} />
        </div>
    )
}

/** Outer size of a device at a scale, for layout. */
const deviceSize = (id: SurfaceId, scale: number) => {
    const s = SURFACES[id]
    return s.kind === "phone"
        ? { w: s.w * scale + 2 * BEZEL + 4, h: s.h * scale + 2 * BEZEL + 4 }
        : { w: s.w * scale + 4, h: s.h * scale + 4 + (s.kind === "desktop" ? BAR + 2 : 0) }
}
/** The scale at which a device fits a box. */
const fit = (id: SurfaceId, w: number, h: number) => {
    const s = SURFACES[id]
    const extraW = s.kind === "phone" ? 2 * BEZEL + 4 : 4
    const extraH = s.kind === "phone" ? 2 * BEZEL + 4 : s.kind === "desktop" ? BAR + 6 : 4
    return Math.min((w - extraW) / s.w, (h - extraH) / s.h)
}

/** "Arta · Tirana · Albanian" */
export const Chip = ({ p, style }: { p: Persona; style?: CSSProperties }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: C.muted, whiteSpace: "nowrap", ...style }}>
        <span style={{ fontFamily: F.title, fontWeight: 800, color: C.text, fontSize: 26 }}>{p.name}</span>
        <span>{p.city.split(",")[0]}</span><span style={{ color: C.dim }}>·</span><span>{p.language}</span>
    </div>
)

const CaptionText = ({ caption, at = 8, size = 52 }: { caption: Caption; at?: number; size?: number }) => (
    <>
        <Rise at={at} style={{ fontFamily: F.title, fontWeight: 800, fontSize: size, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{caption.title}</Rise>
        {caption.sub && <Rise at={at + 14} style={{ marginTop: 22, fontSize: Math.max(30, size * 0.62), lineHeight: 1.4, color: C.muted }}>{caption.sub}</Rise>}
    </>
)

const Header = ({ section }: { section: string }) => (
    <div style={{ position: "absolute", left: 120, right: 120, top: 48, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Label color={C.text}>{section}</Label>
        <div style={{ fontSize: 22, color: C.dim }}>2022 World Cup final replay · Data: StatsBomb Open Data</div>
    </div>
)

const Abs = ({ children, style }: { children: ReactNode; style: CSSProperties }) => <div style={{ position: "absolute", ...style }}>{children}</div>

/** Left text column + one device on the right. Used for "meet" and "close". */
function SideBySide({ who, startFrame, text }: { who: SurfaceId; startFrame: number; text: ReactNode }) {
    const isPhone = SURFACES[who].kind === "phone"
    const boxW = isPhone ? 480 : 1000, boxH = 900
    const scale = fit(who, boxW, boxH)
    const d = deviceSize(who, scale)
    const right = isPhone ? 260 : 120
    return (
        <>
            <Abs style={{ left: 120, top: 0, bottom: 0, width: 1920 - 120 - right - d.w - 100, display: "flex", flexDirection: "column", justifyContent: "center" }}>{text}</Abs>
            <Abs style={{ right, top: 130 + (boxH - d.h) / 2 }}><Rise at={2}><Device id={who} startFrame={startFrame} scale={scale} /></Rise></Abs>
        </>
    )
}

function PersonaCard({ p, intro }: { p: Persona; intro: string }) {
    const row = (k: string, v: string, at: number) => (
        <Rise at={at} style={{ display: "flex", padding: "18px 0", borderTop: `2px solid ${C.line}`, fontSize: 30 }}>
            <span style={{ width: 200, color: C.dim }}>{k}</span><span>{v}</span>
        </Rise>
    )
    return (
        <div>
            <Rise at={4} style={{ fontFamily: F.title, fontWeight: 900, fontSize: 120, lineHeight: 1, letterSpacing: "-0.015em" }}>{p.name}</Rise>
            <Rise at={10} style={{ marginTop: 18, fontSize: 32, color: C.muted }}>{intro}</Rise>
            <div style={{ marginTop: 40, maxWidth: 680 }}>
                {row("From", p.city, 14)}
                {row("On", p.device, 18)}
                {row("Language", p.language, 22)}
            </div>
        </div>
    )
}

export function ShotView({ layout, caption, section, startFrame }: { layout: Layout; caption: Caption; section: string; startFrame: number }) {
    let body: ReactNode
    if (layout.kind === "meet") {
        const p = SURFACES[layout.who].persona!
        body = <SideBySide who={layout.who} startFrame={startFrame} text={<>
            <PersonaCard p={p} intro={layout.intro} />
            <div style={{ marginTop: 56 }}><CaptionText caption={caption} at={40} size={46} /></div>
        </>} />
    } else if (layout.kind === "close") {
        const p = SURFACES[layout.who].persona!
        body = <SideBySide who={layout.who} startFrame={startFrame} text={<>
            <Rise at={0}><Chip p={p} /></Rise>
            <div style={{ marginTop: 30 }}><CaptionText caption={caption} size={64} /></div>
        </>} />
    } else if (layout.kind === "control") {
        const r = CROPS[layout.crop]
        const scale = 880 / r.h
        body = (
            <>
                <Abs style={{ left: 120, top: 0, bottom: 0, width: 1920 - 120 - 260 - r.w * scale - 120, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <Rise at={0}><Label color={C.accent} style={{ fontSize: 20 }}>Control room · Agent Relay</Label></Rise>
                    <div style={{ marginTop: 30 }}><CaptionText caption={caption} size={60} /></div>
                </Abs>
                <Abs style={{ right: 260, top: 140 }}>
                    <Rise at={2} style={{ border: `2px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}><Clip id="control" startFrame={startFrame} scale={scale} crop={r} /></Rise>
                </Abs>
            </>
        )
    } else {
        // "pair" and "row": devices side by side with a persona chip under each, caption below.
        const who = layout.who
        const pair = layout.kind === "pair"
        const top = 130, chipH = 50
        const areaW = pair ? 900 : 1680, areaH = pair ? 860 : 680
        const gap = 40
        // Phones share one scale; a desktop takes the width that is left.
        const phones = who.filter(w => SURFACES[w].kind === "phone")
        const desk = who.find(w => SURFACES[w].kind !== "phone")
        let ps = fit("arta", 1e9, areaH - chipH)
        let ds = desk ? fit(desk, areaW - phones.length * deviceSize("arta", ps).w - gap * (who.length - 1), areaH - chipH) : 0
        if (desk && ds * SURFACES[desk].h < 0.5 * ps * 932) { ps *= 0.9; ds = fit(desk, areaW - phones.length * deviceSize("arta", ps).w - gap * (who.length - 1), areaH - chipH) }
        const devices = (
            <div style={{ display: "flex", gap, alignItems: "flex-start" }}>
                {who.map((w, i) => (
                    <Rise key={w} at={2 + i * 3} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <Device id={w} startFrame={startFrame} scale={SURFACES[w].kind === "phone" ? ps : ds} />
                        <Chip p={SURFACES[w].persona!} style={{ fontSize: 20 }} />
                    </Rise>
                ))}
            </div>
        )
        body = pair ? (
            <>
                <Abs style={{ left: 120, top: 0, bottom: 0, width: 760, display: "flex", flexDirection: "column", justifyContent: "center" }}><CaptionText caption={caption} size={64} /></Abs>
                <Abs style={{ right: 200, top }}>{devices}</Abs>
            </>
        ) : (
            <>
                <Abs style={{ left: 0, right: 0, top, display: "flex", justifyContent: "center" }}>{devices}</Abs>
                <Abs style={{ left: 120, right: 120, top: top + areaH + 40 }}><CaptionText caption={caption} size={46} /></Abs>
            </>
        )
    }
    return (
        <Scene fade={6} style={{ background: C.page }}>
            <Header section={section} />
            {body}
        </Scene>
    )
}
