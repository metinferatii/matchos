import { Composition } from "remotion"
import { DURATION, FPS, Launch } from "./Launch"
import { STORY_DURATION, STORY_FPS, Story } from "./Story"

export const RemotionRoot = () => (
    <>
        <Composition id="Launch" component={Launch} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
        <Composition id="Story" component={Story} durationInFrames={STORY_DURATION} fps={STORY_FPS} width={1920} height={1080} />
    </>
)
