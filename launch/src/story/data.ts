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

const MEET = "Meet the fans"
const MATCH = "The match"

export const SHOTS: Shot[] = [
    { beat: "open", section: MEET, offsetS: -0.5, minS: 4, maxS: 4, layout: { kind: "meet", who: "arta", intro: "Opens the club app on her phone." }, caption: { title: "Her agent welcomes her, in Albanian." } },
    { beat: "open", section: MEET, offsetS: -0.5, minS: 4, maxS: 4, layout: { kind: "meet", who: "diego", intro: "Opens the same club app." }, caption: { title: "His agent welcomes him, in Spanish." } },
    { beat: "open", section: MEET, offsetS: -0.5, minS: 4, maxS: 4, layout: { kind: "meet", who: "sam", intro: "Opens the club's match page at his desk." }, caption: { title: "Same match, in English, from one script tag." } },
    { beat: "picks", section: MATCH, offsetS: -1, minS: 5, maxS: 6, layout: { kind: "pair", who: ["arta", "diego"] }, caption: { title: "Arta picks Messi. Diego picks Di María.", sub: "Each pick goes to their own agent." } },
    { beat: "goal-messi", section: MATCH, offsetS: -0.5, minS: 4, maxS: 5, layout: { kind: "row", who: ["arta", "diego", "sam"] }, caption: { title: "Messi scores. Every screen, every language.", sub: "Arta's agent: “You called it.” Diego's agent writes him a different line." } },
    { beat: "goal-messi", section: MATCH, offsetS: 1.5, minS: 4, maxS: 5, layout: { kind: "close", who: "arta" }, caption: { title: "Arta picked Messi. Her agent remembers.", sub: "A personal line, then a personal offer." } },
    { beat: "agents-negotiate", section: MATCH, offsetS: -0.5, minS: 5, maxS: 6, layout: { kind: "control", crop: "agents" }, caption: { title: "Her agent asks club-ops for an offer.", sub: "Merch checks stock. The agents agree a price, in the open." } },
    { beat: "arta-buys", section: MATCH, offsetS: -1, minS: 4, maxS: 5, layout: { kind: "close", who: "arta" }, caption: { title: "Arta buys the shirt.", sub: "Her agent remembers that too." } },
    { beat: "goal-dimaria", section: MATCH, offsetS: -0.5, minS: 4, maxS: 5, layout: { kind: "close", who: "diego" }, caption: { title: "Di María scores. Now Diego called it.", sub: "His agent kept his pick from the first minute." } },
    { beat: "arta-leaves", section: MATCH, offsetS: -0.5, minS: 3, maxS: 4, layout: { kind: "close", who: "arta" }, caption: { title: "Arta closes the app.", sub: "Her agent keeps her place." } },
    { beat: "kenji-joins", section: MATCH, offsetS: -0.5, minS: 5, maxS: 6, layout: { kind: "control", crop: "agents" }, caption: { title: "Kenji opens the app in Japanese.", sub: "Nobody covers Japanese, so the producer hires a translator agent, live." } },
    { beat: "kenji-joins", section: MATCH, offsetS: 5, minS: 4, maxS: 5, layout: { kind: "meet", who: "kenji", intro: "Joins mid-match." }, caption: { title: "Seconds later, the match is in Japanese.", sub: "And Kenji has an agent of his own." } },
    { beat: "arta-returns", section: MATCH, offsetS: -0.5, minS: 5, maxS: 6, layout: { kind: "close", who: "arta" }, caption: { title: "Arta comes back.", sub: "Her agent catches her up: “While you were away…”" } },
    { beat: "kill", section: MATCH, offsetS: -0.5, minS: 4, maxS: 5, layout: { kind: "row", who: ["arta", "diego", "kenji", "sam"] }, caption: { title: "We kill the server mid-match.", sub: "Every fan's screen shows reconnecting." } },
    { beat: "resume", section: MATCH, offsetS: -0.5, minS: 5, maxS: 6, layout: { kind: "row", who: ["arta", "diego", "kenji", "sam"] }, caption: { title: "It comes back where it left off.", sub: "Every fan's agent is its own durable actor. Nothing is lost." } },
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
