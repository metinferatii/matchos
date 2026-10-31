import { Series } from "remotion"
import { DEMO_FROM_S, DEMO_TO_S, Demo } from "./scenes/Demo"
import { ColdOpen, Gap, Reveal, ScriptTag } from "./scenes/Intro"
import { Close, Edge, HowItWorks } from "./scenes/Outro"

export const FPS = 30
const s = (seconds: number) => Math.round(seconds * FPS)

// The film, in order. Durations in seconds.
const SCENES = [
    { name: "Cold open", seconds: 6, Component: ColdOpen },
    { name: "The gap", seconds: 7, Component: Gap },
    { name: "Reveal", seconds: 4.5, Component: Reveal },
    { name: "Script tag", seconds: 7, Component: ScriptTag },
    { name: "Live demo", seconds: DEMO_TO_S - DEMO_FROM_S, Component: Demo },
    { name: "How it works", seconds: 9, Component: HowItWorks },
    { name: "Why us", seconds: 6, Component: Edge },
    { name: "Close", seconds: 6, Component: Close },
]

export const DURATION = SCENES.reduce((n, sc) => n + s(sc.seconds), 0)

export function Launch() {
    return (
        <Series>
            {SCENES.map(({ name, seconds, Component }) => (
                <Series.Sequence key={name} name={name} durationInFrames={s(seconds)}>
                    <Component />
                </Series.Sequence>
            ))}
        </Series>
    )
}
