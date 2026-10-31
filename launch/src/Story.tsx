import { Series } from "remotion"
import { ColdOpen, Gap, Reveal, ScriptTag } from "./scenes/Intro"
import { Close, Edge, HowItWorks } from "./scenes/Outro"
import { resolveShots } from "./story/data"
import { ShotView } from "./story/Shots"

// The story cut: the same intro and outro as Launch, with the match told through four fans and
// their personal agents. Match shots and their lengths come from public/story/timeline.json.
export const STORY_FPS = 30
const s = (seconds: number) => Math.round(seconds * STORY_FPS)

const BEFORE = [
    { name: "Cold open", frames: s(6), Component: ColdOpen },
    { name: "The gap", frames: s(7), Component: Gap },
    { name: "Reveal", frames: s(4.5), Component: Reveal },
    { name: "Script tag", frames: s(7), Component: ScriptTag },
]
const AFTER = [
    { name: "How it works", frames: s(9), Component: HowItWorks },
    { name: "Why us", frames: s(6), Component: Edge },
    { name: "Close", frames: s(6), Component: Close },
]
export const SHOTS = resolveShots(STORY_FPS)

export const STORY_DURATION = [...BEFORE, ...SHOTS, ...AFTER].reduce((n, x) => n + x.frames, 0)

export function Story() {
    return (
        <Series>
            {BEFORE.map(({ name, frames, Component }) => (
                <Series.Sequence key={name} name={name} durationInFrames={frames}><Component /></Series.Sequence>
            ))}
            {SHOTS.map((shot, i) => (
                <Series.Sequence key={i} name={`${shot.beat} · ${shot.layout.kind}`} durationInFrames={shot.frames}>
                    <ShotView layout={shot.layout} caption={shot.caption} section={shot.section} startFrame={shot.startFrame} />
                </Series.Sequence>
            ))}
            {AFTER.map(({ name, frames, Component }) => (
                <Series.Sequence key={name} name={name} durationInFrames={frames}><Component /></Series.Sequence>
            ))}
        </Series>
    )
}
