# PhiStage R4 | Local tabletop projection bridge

R4 connects a simulated PhiTable to the existing PhiMapper editor and projector. It is a working same-browser demonstration, not an XR spatial-anchor or cross-device network release.

## Run the demo

1. Open the PhiMapper editor from the site (or run npm install and npm run dev).
2. Select the projector surface and its calibrated corners. Open Projector Output; move it to an extended display if desired.
3. Click Open PhiTable Demo. Keep editor, output, and demo on the same origin in the same browser profile.
4. Touch or drag the demo field. The focus marker is projected through the selected surface's projective warp, in the preview and projector output.
5. Try a scene cue from PhiTable. This changes procedural visuals in the editor; the editor synchronizes the projector.
6. Try BLACKOUT from the editor. Markers disappear during blackout.

## Contract

PhiStage v1 message envelope: protocol=phistage, version=1, sender (unique client ID), seq (monotonic positive integer), sentAt (Unix milliseconds), and payload.

Payload kinds: focus {surfaceId, point:{x,y}} and cue {cue}. Cues are chamber, portal, dream and gridline.

All focus coordinates are surface-local: top-left (0,0), +X right, +Y down, 0 through 1 inclusive. Rendering uses the existing homographyFromQuad transform. Surface IDs and payloads are validated. Sequence numbers and timestamps reject replays and stale packets.

## Privacy, safety, and limitations

- No cloud service, tracker, network relay, credentials or mandatory headset.
- BroadcastChannel messages remain among same-origin windows in one browser profile. Separate devices are NOT connected.
- The mapper editor owns project settings, calibration and blackout. PhiTable can send coordinates and whitelisted scene cues.
- This demo draws one focus marker at a time; multiplayer, touch IDs, physics and game world synchronization are not implemented.
- PhiOS XR/Quest anchors, physical camera calibration, projector edge blending and multi-projector sync remain future work.
- BLACKOUT masks the focus overlay; never look directly into projector beams.

## Planned next milestone

R5 should provide an explicitly opted-in local-network PhiStage relay with room authorization, bounded event traffic, independent world simulation, audit-safe calibration receipts, and separate spectator/controller roles. XR clients then align to the same table origin via local fiducials or manual alignment, without depending on Meta's cloud.
