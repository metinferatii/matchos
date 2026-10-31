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
export const RATE = 1.15

// One idea per shot, long enough to see it happen, with a plain sentence saying what you're looking at.
const shot = (beat: string, offsetS: number, seconds: number, layout: Layout, title: string, sub: string): Shot =>
    ({ beat, section: MATCH, offsetS, minS: seconds, maxS: seconds, layout, caption: { title, sub } })

export const SHOTS: Shot[] = [
    shot("open", 0, 4.5, { kind: "row", who: ["arta", "diego", "sam"] }, "Three fans, three languages.",
        "Arta in Tirana and Diego in Buenos Aires open the club app. Sam in London is on the club's website."),
    shot("picks", -0.5, 4.5, { kind: "pair", who: ["arta", "diego"] }, "Each one gets their own agent.",
        "It says hello in their language. Arta picks Messi to score next, Diego picks Di María."),
    shot("goal-messi", -0.3, 4.5, { kind: "row", who: ["arta", "diego", "sam"] }, "Goal. Every screen at once.",
        "Messi scores. Live commentary lands in Albanian, Spanish and English at the same moment."),
    shot("goal-messi", 1.2, 4.8, { kind: "close", who: "arta" }, "“You called it.”",
        "Arta picked Messi before the goal. Her own agent remembered, and congratulates her."),
    shot("agents-negotiate", -0.3, 5, { kind: "control", crop: "agents" }, "Her agent gets her a deal.",
        "Behind the scenes, Arta's agent asks the club's stock agent for a better price on Messi's shirt."),
    shot("arta-buys", -0.5, 4, { kind: "close", who: "arta" }, "Arta buys the shirt.",
        "A personal offer, made for her, paid in one tap."),
    shot("goal-dimaria", 0, 4.5, { kind: "close", who: "diego" }, "Now Diego called it.",
        "Di María scores. Diego's agent knew his pick and gets him his own offer."),
    shot("kenji-joins", 0, 5, { kind: "control", crop: "agents" }, "A fan joins in Japanese.",
        "No agent speaks Japanese yet, so the producer agent hires a Japanese translator on the spot."),
    shot("kenji-joins", 5, 4.5, { kind: "close", who: "kenji" }, "Kenji gets the match in Japanese.",
        "Seconds later, with an agent of his own."),
    shot("arta-returns", 0.5, 5, { kind: "close", who: "arta" }, "“While you were away…”",
        "Arta closed the app for a few minutes. When she comes back, her agent tells her what she missed."),
    shot("kill", 0.5, 4, { kind: "row", who: ["arta", "diego", "kenji", "sam"] }, "We pull the plug on the server.",
        "Every fan's screen shows it's reconnecting."),
    shot("resume", 0, 4.8, { kind: "row", who: ["arta", "diego", "kenji", "sam"] }, "Nothing is lost.",
        "Each match and each fan's agent is a durable actor. They pick up exactly where they left off."),
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
