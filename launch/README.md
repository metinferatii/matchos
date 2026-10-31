# Matchday OS launch video (Remotion)

```bash
npm install
cp ../demo/out/matchday-os-demo.mp4 public/demo.mp4   # record it first: cd ../demo && node record.mjs
npm run studio    # preview and edit
npm run render    # → out/matchday-os-launch.mp4 (1920x1080, 30 fps)
```

Scenes and durations are in `src/Launch.tsx`; the demo's trim points and chapter times in `src/scenes/Demo.tsx`.
`remotion.config.ts` uses Playwright's headless Chrome because Remotion's bundled one crashes on this machine.

## Story cut (`Story` composition)

The match told through four fans. Recordings go in `public/story/` (all start together at t=0):
`arta.mp4`, `diego.mp4`, `kenji.mp4` (phone 430x932), `sam.mp4` (desktop 1440x900), `control.mp4` (1920x1080),
plus `timeline.json` with the beat times. Shot list, captions and crops: `src/story/data.ts`.

```bash
npm run placeholders   # placeholder clips for any recording not there yet (--force overwrites)
npm run render:story   # → out/matchday-os-story.mp4
```
