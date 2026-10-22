# ΦMapper369 · R2 Surface Composer

> Turn any surface into a living canvas.

**PhiMapper369** is an MIT-licensed browser projection-mapping studio. The R2 Surface Composer builds on the working R1 First Light application with multiple independently mapped surfaces, reorderable layers, opacity, feathered masks, presets, and undo/redo.

**[Live studio](https://michaelwave369.github.io/PhiMapper369/)** · **[GitHub repository](https://github.com/MichaelWave369/PhiMapper369)**

## What's in R2

- **Up to six surfaces**, each with an independently editable four-corner **perspective-correct homography**.
- Per-surface **Φ Engine / Calibration / Checker / Media** visual source and visibility.
- **Layer ordering**: select, add, duplicate, delete, bring forward, send backward.
- **Quadrilateral or ellipse masking**, smooth edge feathering, per-surface opacity.
- **Dual Gallery** and **Triple Gallery** layout examples to demonstrate independent surfaces instantly.
- **Undo / redo** for geometry and settings, up to 80 project snapshots. Shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl+Y outside text inputs.
- **JSON project export/import v2**, automatically migrates R1 saved projects.
- Single-WebGL-pass compositing, plus separate, live-synchronized **projector output** window.
- Locally load an image/video shared by all surfaces set to `My media`. A reference image overlay helps manual calibration.
- GitHub Actions unit testing, TypeScript production build, and Pages deployment.

## Projector quick start

1. Connect a projector as an **extended display** from your computer.
2. Open the studio, select **Dual Gallery** or **Triple Gallery**, and choose **Calibration** on the surface you want to map.
3. Click **Open Projector Output**, move its window onto the projector screen, then press **F** to fullscreen.
4. In the main studio, select a surface and drag the numbered corner handles until the projection aligns with its physical object.
5. Repeat for other surfaces; set each surface's visual content, visibility, opacity, mask and feather.
6. Save the geometry with **Export JSON**, and **Import JSON** to restore it later.

You can test everything in two browser windows without physical projector equipment.

## Development

Node.js 22+:

```bash
npm install
npm run test
npm run build
npm run dev
```

Vite `base: './'` supports GitHub Pages repository subpaths. GitHub Pages should use **GitHub Actions** as deployment source.

## Project persistence

The R2 project JSON stores:
- project name and selected surface ID,
- ordered surface list (each has a stable ID, label, corners, mode, visibility, opacity, mask, and feather),
- output aspect preset, mute preference and media filename.

**Actual video/images are intentionally not embedded or uploaded.** Reattach media after reloading or importing a project. The editor and output windows communicate via same-origin `BroadcastChannel`.

Existing First Light R1 project files and localStorage settings are automatically migrated to a v2 project with one surface.

## Known limitations

- **Six surfaces maximum** in R2; a single media file is shared across all surfaces that use the Media mode. Independent per-layer media timelines come later.
- Projector output window placement/fullscreen is controlled by the browser and OS. Move the second window manually; a screen-resolution preset changes **layout aspect ratio**, not your actual display resolution.
- An editor window must remain open for live updates. Browsers may block a video format or autoplay.
- Invalid/collapsed/self-crossing quads are not supported physically; the last valid inverse is retained when the projective matrix becomes singular.
- One physical projector output in R2; no automatic camera calibration, edge blending across devices, 3D projection geometry, or multi-projector synchronization.
- Undo/redo covers **project settings**, not the previously selected raw media file bytes.
- Avoid aiming projectors at anyone's eyes. Be mindful of photosensitive viewers when using animated patterns.

## Roadmap

- **R3 · Living Geometry:** more procedural scene packs, independent media source slots, audio reactivity, fades/cues and bridges to ParaCut, Domistika, FramefieldStudio and Auralith.
- **R4 · Intelligent Calibration:** optional explicit-consent webcam-assisted alignment with markers; manual mode stays first-class.
- **R5 · Spatial Theater:** multiple output engines, edge blending and experimental desktop support.

## License

MIT © 2026 Michael Hughes. See [LICENSE](LICENSE).
