// Shared look for the launch video: the product's own tokens (web/tokens.css), so the film and the
// product read as one thing. Motion is short and purposeful: rise-in, fade, and a typed line.
import type { CSSProperties, ReactNode } from "react"
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { loadFont } from "@remotion/google-fonts/Archivo"

const { fontFamily: archivo } = loadFont("normal", { weights: ["600", "800", "900"], subsets: ["latin"] })

export const C = {
    page: "#242322",
    deep: "#161515",
    card: "#1a1919",
    raise: "#2c2b2a",
    line: "#343231",
    text: "#f4f3f1",
    muted: "#a6a3a0",
    dim: "#6f6c69",
    accent: "#c1d991",
    onAccent: "#14170f",
    live: "#e0484f",
}
export const F = {
    title: `${archivo}, -apple-system, system-ui, sans-serif`,
    body: `-apple-system, "SF Pro Text", system-ui, "Segoe UI", sans-serif`,
    mono: `"SF Mono", ui-monospace, Menlo, monospace`,
}

/** A scene's background, fading in and out at its edges so scenes cut softly. */
export function Scene({ children, fade = 12, style }: { children: ReactNode; fade?: number; style?: CSSProperties }) {
    const frame = useCurrentFrame()
    const { durationInFrames } = useVideoConfig()
    const opacity = interpolate(frame, [0, fade, durationInFrames - fade, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    return (
        <AbsoluteFill style={{ background: C.page, color: C.text, fontFamily: F.body, opacity, ...style }}>
            {children}
        </AbsoluteFill>
    )
}

/** Rises 24px and fades in, starting at `at` frames. */
export function Rise({ at = 0, children, style }: { at?: number; children: ReactNode; style?: CSSProperties }) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const p = spring({ frame: frame - at, fps, config: { damping: 200, mass: 0.6 } })
    return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)`, ...style }}>{children}</div>
}

/** 0..1 progress between two frames, eased. */
export function useProgress(from: number, to: number) {
    const frame = useCurrentFrame()
    return interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0, 0, 1) })
}

/** The small uppercase label used across the product's cards. */
export const Label = ({ children, color = C.muted, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => (
    <div style={{ fontFamily: F.title, fontWeight: 800, fontSize: 22, letterSpacing: "0.12em", textTransform: "uppercase", color, ...style }}>{children}</div>
)

export const Wordmark = ({ size = 120 }: { size?: number }) => (
    <div style={{ fontFamily: F.title, fontWeight: 900, fontSize: size, letterSpacing: "-0.01em", lineHeight: 1, display: "flex", alignItems: "center", gap: size * 0.22 }}>
        <span style={{ width: size * 0.16, height: size * 0.16, borderRadius: "50%", background: C.live, display: "inline-block" }} />
        MATCHDAY OS
    </div>
)
