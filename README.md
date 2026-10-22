# ΦMapper369 · First Light (R1)

> Turn any surface into a living canvas.

**PhiMapper369** is an MIT-licensed, browser-based projection mapping studio. R1 is a focused working slice: four-corner perspective warping, calibration patterns, user-supplied images and video, animated procedural geometry, JSON projects, and a clean projector window.

[**Open the studio on GitHub Pages**](https://michaelwave369.github.io/PhiMapper369/) · [Repository](https://github.com/MichaelWave369/PhiMapper369)

## R1 features

- Perspective-correct **projective homography** (not a CSS skew or two-triangle approximation), computed from four draggable normalized corners and rendered through a WebGL shader.
- Procedural **Φ Engine** visual: animated concentric rings, gears, bubbles and color.
- **Calibration** grid, centered crosshairs, contrasting checkerboard and draggable numbered corner handles.
- Import an **image or video**, displayed within the warped surface. Projector output is muted by default; editor video audio can be toggled.
- Optional **reference photo overlay** to assist alignment.
- A separate **projector output window**, updated over `BroadcastChannel` with each edit, including media selected in the editor.
- Output presets for 1280×720, 1920×1080, 1024×768 and 3840×2160. These control **stage aspect ratio and mapping coordinates**; actual WebGL framebuffer size follows the browser window and display pixel ratio.
- Save and load `.phimap.json` geometry and session settings. Latest project settings are also cached in browser local storage.
- Keyboard-accessible controls: focus a corner and press arrow keys (Shift+arrows for bigger adjustments).

## Try it with a projector

1. Set your operating system to **Extend display** rather than Duplicate, and connect an external projector.
2. Open the studio in a modern desktop browser supporting WebGL.
3. Choose **Calibration**, then **Open Projector Output**. Allow the popup if the browser blocks it.
4. Drag the output window to the projector display and press **F** (or the Fullscreen button) to enter fullscreen.
5. While looking at the physical projection, drag the four numbered handles in the editor to align the corners with a rectangular target surface. Keep corner order top-left, top-right, bottom-right, bottom-left around the target.
6. Switch to **Φ Engine**, **Checker**, or load your own image or video. Export the project JSON to save your alignment.

You can explore the full app without a projector. The editor preview and a second browser window are enough to see the mapping output.

## Development

Requirements: Node.js 22+.

```sh
npm install
npm run dev
npm run test
npm run build
npm run preview
```

The GitHub Pages build uses Vite's relative asset paths so the projector query URL (`?projector=1`) loads from a repository subpath too.

## Project file format

```json
{
  "version": 1,
  "name": "My wall",
  "corners": [
    {"x": 0.12, "y": 0.14},
    {"x": 0.88, "y": 0.14},
    {"x": 0.88, "y": 0.86},
    {"x": 0.12, "y": 0.86}
  ],
  "mode": "grid",
  "opacity": 1,
  "width": 1920,
  "height": 1080,
  "muted": true,
  "mediaName": ""
}
```

Coordinates are normalized to each projector output window: `(0,0)` is top-left and `(1,1)` is bottom-right. Photos/videos are **not embedded** in JSON or persisted across reloads. Reattach your source file after importing a project.

## Limitations and safety

- R1 supports **one independently warped surface and one projector output**, not multi-projector alignment, edge blending, or automated camera calibration.
- Browser fullscreen and window positioning require user interaction and depend on the browser. `BroadcastChannel` sync needs both windows on the same origin and browser storage partition. Open output from the editor.
- Actual pixel resolution depends on the display/browser, not the dropdown alone. A mismatched projector aspect ratio can stretch calibration; choose a matching preset and match your display resolution.
- Very twisted, collapsed, or self-intersecting quadrilaterals are not physically meaningful. The renderer preserves the last valid warp when math becomes singular.
- WebGL and local video decoding depend on browser/GPU/video codec support. Imported video may require interaction to play with audio.
- **Never aim a projector into anyone's eyes.** Be considerate with intense flashes, bright patterns, and public projection permissions.
- The app does not upload source media, require an account, or make network API calls. External GitHub links are optional.

## Next releases

**R2:** multipolygon surfaces, layers, masks, reset/undo, source-fitting modes, visual presets.

**R3:** audio-reactive Auralith scenes, Domistika shader packs, FramefieldStudio/ParaCut interchange, NBG physical simulation scenes.

**R4:** optional camera-assisted calibration with printed fiducials and explicit permissions.

**R5:** independent multi-projector outputs, synchronization, edge blending, and desktop deployment experiments.

## License

MIT © 2026 Michael Hughes. See [LICENSE](LICENSE).
