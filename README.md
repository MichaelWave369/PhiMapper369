# ΦMapper369 · R3 Living Geometry

> Turn any surface into a living canvas.

**PhiMapper369** is a local-first MIT-licensed browser projection-mapping studio. **R3: Living Geometry** expands the R2 Surface Composer with multiple original generative shader scenes, audio-reactive projection, a live cue deck and an emergency blackout toggle.

**[Launch Studio](https://michaelwave369.github.io/PhiMapper369/)** · **[GitHub](https://github.com/MichaelWave369/PhiMapper369)**

## What you can do

- Warp up to **six independent projection surfaces** with four-corner projective homography.
- Layer and reorder surfaces; independently set opacity, visibility, ellipse/quad masks and feather.
- Choose image, video, grid, checker, or **Living Geometry** on each surface.
- Procedural scene library:
  - **Nested Gear**: original animated concentric bubble and gear motif.
  - **Infinity Tunnel**: receding tunnel with rotating spokes and rings.
  - **Bubble Field**: drifting illuminated bubbles.
  - **Light Lattice**: rotating luminous geometric mesh.
- Adjust **animation speed** and **audio response** independently for each procedural surface.
- Press **Enable mic** to explicitly grant microphone access for live RMS-based audio animation. The microphone stream is processed locally via Web Audio and never uploaded. A **Tap pulse** button gives an offline, permission-free demonstration.
- Use the **Live Cue Deck** to switch all procedural surfaces between four performances while preserving warps, layers, calibration, and media-only surfaces.
- Hit **BLACKOUT** to instantly blank the output shader; **RESTORE LIGHT** resumes the show without changing the project.
- Export/import versioned project JSON; **R1 and R2 projects are migrated automatically**. Undo/redo still works for project settings.
- Open a synchronized projector output window. Place it on your extended screen and press **F** to fullscreen.

## Run locally

Node.js 22+:

```bash
npm install
npm run test
npm run build
npm run dev
```

GitHub Pages uses the relative Vite base path configured in `vite.config.ts`. Set GitHub Pages deployment source to **GitHub Actions**.

## Audio privacy and performance

The optional audio-input feature uses `navigator.mediaDevices.getUserMedia({audio:true})` only when its button is pressed. On startup there is no microphone permission request. The app creates a local `AudioContext`, reads an `AnalyserNode`, computes smoothed RMS amplitude, and transmits only a normalized level (not audio samples) to the already-open same-origin projector window via `BroadcastChannel`. Press **Stop audio input** to release the stream; closing the editor also releases the tracks. Mic access requires a secure context and browser permission.

Video loaded from disk is **not** analyzed as a soundtrack in R3. To react to music from speakers, use a microphone or manually tap pulse. No files/audio are uploaded by PhiMapper369.

## Project format

R3 JSON contains `version: 3` and up to six ordered `surfaces`. Each surface stores `id`, `name`, normalized `corners`, `mode`, `scene`, `speed`, `reactivity`, `opacity`, `visible`, `mask`, and `feather`. Project-wide settings include the output aspect preset and the selected surface. The R1 and R2 importers preserve calibration. Media bytes and reference images are intentionally **not** stored or embedded: reattach media after reload.

## Show workflow

1. Connect projector as an **extended display** (not mirrored).
2. Launch the editor. Set output aspect ratio and use grid calibration per surface.
3. Open the projector window, drag it to the extended display, press **F**.
4. Select a procedural surface, choose its scene, speed, and reactivity.
5. Start microphone input explicitly or hit **Tap pulse** to demonstrate response.
6. Fire cue buttons to change the procedural scene set; turn on **BLACKOUT** when needed.
7. Export project JSON to save alignments.

## Limits and next steps

- One projector output window, no automatic camera calibration, no true edge blending or multi-machine sync.
- R3 has four original procedural shaders and one shared uploaded media file. Multiple independent media slots, beat detection, BPM sync, and audio-source routing are **not** implemented yet.
- Audio reactivity is an amplitude envelope, not musical tempo or note recognition.
- The per-surface speed controls apply to procedural visuals only; test grids and uploaded clips play normally.
- The actual output framebuffer follows the window/display size and pixel ratio, not the selected aspect preset.
- Collapse or self-intersection of calibration corners can produce undefined mapping; avoid invalid surface geometry.
- Projectors can be dangerously bright. Never aim into eyes. Animated high-contrast patterns may trigger photosensitive responses; use appropriate care.

**Future:** R4 optional camera calibration; R5 multi-projector theater, synchronized playback and blending; later creative format bridges to Domistika, ParaCut, FramefieldStudio and Auralith.

## License

MIT © 2026 Michael Hughes. See [LICENSE](LICENSE).
