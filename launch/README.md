# Matchday OS launch video (Remotion)

```bash
npm install
cp ../demo/out/matchday-os-demo.mp4 public/demo.mp4   # record it first: cd ../demo && node record.mjs
npm run studio    # preview and edit
npm run render    # → out/matchday-os-launch.mp4 (1920x1080, 30 fps)
```

Scenes and durations are in `src/Launch.tsx`; the demo's trim points and chapter times in `src/scenes/Demo.tsx`.
`remotion.config.ts` uses Playwright's headless Chrome because Remotion's bundled one crashes on this machine.
