// Who is in the film, which recording is theirs, and the shot list for the match. Every shot's clip
// time comes from public/story/timeline.json, so re-recording only means replacing that file.
import timeline from "../../public/story/timeline.json"

export type SurfaceId = "arta" | "diego" | "sam" | "kenji" | "control"
export type Beat = { t: number; id: string; label: string; surfaces: string[] }
export const TIMELINE = timeline as { durationS: number; beats: Beat[] }

export type Persona = { name: string; city: string; device: string; language: string; pronoun: "her" | "his" }

export const SURFACES: Record<SurfaceId, { file: string; w: number; h: number; kind: "phone" | "desktop" | "control"; persona?: Persona }> = {
    arta: { file: "story/arta.mp4", w: 430, h: 932, kind: "phone", persona: { name: "Arta", city: "Tirana, Albania", device: "Phone · club app", language: "Albanian", pronoun: "her" } },
    diego: { file: "story/diego.mp4", w: 430, h: 932, kind: "phone", persona: { name: "Diego", city: "Buenos Aires, Argentina", device: "Phone · club app", language: "Spanish", pronoun: "his" } },
    sam: { file: "story/sam.mp4", w: 1440, h: 900, kind: "desktop", persona: { name: "Sam", city: "London, England", device: "Laptop · club website", language: "English", pronoun: "his" } },
    kenji: { file: "story/kenji.mp4", w: 430, h: 932, kind: "phone", persona: { name: "Kenji", city: "Tokyo, Japan", device: "Phone · club app", language: "Japanese", pronoun: "his" } },
    control: { file: "story/control.mp4", w: 1920, h: 1080, kind: "control" },
}

/** Regions of the 1920x1080 control-room recording (web/control.html at 1920 wide). */
export const CROPS = {
    agents: { x: 480, y: 96, w: 720, h: 970 }, // AI agent team: roster, fan agents, agent log
}

export type Caption = { title: string; sub?: string }
export type Layout =
    | { kind: "meet"; who: SurfaceId; intro: string }
    | { kind: "pair"; who: [SurfaceId, SurfaceId] }
    | { kind: "row"; who: SurfaceId[] }
    | { kind: "close"; who: SurfaceId }
    | { kind: "control"; crop: keyof typeof CROPS }

export type Shot = {
    beat: string
    section: string
    layout: Layout
    caption: Caption
    /** Clip time where the shot starts, relative to the beat's t. */
    offsetS: number
    minS: number
    maxS: number
}

const MATCH = "Live"

/** Footage inside each shot plays this much faster than real time. */
export const RATE = 1.6

// The trailer cut: one idea per shot, 2.5-3 s each, captions of a few words.
const shot = (beat: string, offsetS: number, seconds: number, layout: Layout, title: string): Shot =>
    ({ beat, section: MATCH, offsetS, minS: seconds, maxS: seconds, layout, caption: { title } })

export const SHOTS: Shot[] = [
    shot("open", 0, 2.6, { kind: "row", who: ["arta", "diego", "sam"] }, "Three fans. Three languages."),
    shot("picks", -0.5, 2.6, { kind: "pair", who: ["arta", "diego"] }, "Each picks a scorer."),
    shot("goal-messi", -0.3, 2.8, { kind: "row", who: ["arta", "diego", "sam"] }, "Goal. Every screen at once."),
    shot("goal-messi", 1.2, 2.8, { kind: "close", who: "arta" }, "“You called it.” Her agent."),
    shot("agents-negotiate", -0.3, 3, { kind: "control", crop: "agents" }, "Her agent cuts her a deal."),
    shot("arta-buys", -0.5, 2.4, { kind: "close", who: "arta" }, "Sold."),
    shot("goal-dimaria", 0, 2.6, { kind: "close", who: "diego" }, "Diego called this one."),
    shot("kenji-joins", 0, 3, { kind: "control", crop: "agents" }, "Japanese fan? Agent hired. Live."),
    shot("kenji-joins", 5, 2.6, { kind: "close", who: "kenji" }, "Now in Japanese."),
    shot("arta-returns", 0.5, 3, { kind: "close", who: "arta" }, "“While you were away…”"),
    shot("kill", 0.5, 2.4, { kind: "row", who: ["arta", "diego", "kenji", "sam"] }, "We kill the server."),
    shot("resume", 0, 2.8, { kind: "row", who: ["arta", "diego", "kenji", "sam"] }, "Nothing lost."),
]

/** Shots with their clip start and length resolved from the timeline; shots whose beat is missing are dropped. */
export function resolveShots(fps: number) {
    const beats = TIMELINE.beats
    return SHOTS.flatMap(shot => {
        const i = beats.findIndex(b => b.id === shot.beat)
        if (i < 0) return []
        const start = Math.max(0, beats[i].t + shot.offsetS)
        const next = beats[i + 1]?.t ?? TIMELINE.durationS
        const len = Math.min(shot.maxS, Math.max(shot.minS, next + 0.5 - start), TIMELINE.durationS - start)
        return [{ ...shot, startFrame: Math.round(start * fps), frames: Math.round(len * fps) }]
    })
}
