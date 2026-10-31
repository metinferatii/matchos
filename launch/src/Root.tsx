import { Composition } from "remotion"
import { DURATION, FPS, Launch } from "./Launch"

export const RemotionRoot = () => (
    <Composition id="Launch" component={Launch} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
)
