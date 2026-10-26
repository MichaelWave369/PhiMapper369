# PhiStage R5: modular local-network relay

PhiCore can now host the same PhiMapper369 browser app for several devices. This is a private LAN prototype and **not** Internet-facing, cloud, or shared XR-anchor software.

## Launch on the PhiCore mini PC

Use Node.js 22+ on a trusted computer connected to your private Wi-Fi/Ethernet network.

```bash
npm install
npm run test
npm run build
# For local-only testing:
npm run stage:serve
# For devices on a trusted private LAN only:
PHISTAGE_HOST=0.0.0.0 npm run stage:serve
```

The relay listens on port 3690 by default. It serves the compiled site and a WebSocket endpoint `/stage` from the **same origin**. Starting it generates three ephemeral, distinct 192-bit role keys in the terminal. Keep them private; keys regenerate at every restart unless explicitly supplied using `PHISTAGE_OPERATOR_TOKEN`, `PHISTAGE_CONTROLLER_TOKEN`, and `PHISTAGE_DISPLAY_TOKEN` (all >=24 characters and mutually different). Change port via `PHISTAGE_PORT`.

**Windows PowerShell LAN example:** `$env:PHISTAGE_HOST='0.0.0.0'; npm run stage:serve`. Linux/macOS use the inline environment assignment above.

### Join the shared table room

Browse to `http://<PhiCore-LAN-IP>:3690/` on the PhiCore or another local device. Use `http://<PhiCore-LAN-IP>:3690/?table=1` for the touch table, and `http://<PhiCore-LAN-IP>:3690/?display=1` for the remote projector. All roles connect to `ws://<PhiCore-LAN-IP>:3690/stage` using room `table-1`, but their own **role-specific key** printed in the terminal.

1. In the editor, locate **ΦCore LAN Relay · operator**. Enter the operator key and connect. The editor publishes its current project, calibration, scene settings and blackout.
2. On the table device, use `?table=1`. Enter controller key and connect. Select a surface; touching it sends normalized coordinates. Cue buttons switch the editor's procedural scene.
3. On the projector device, use `?display=1`. Connect with display key. The projector receives the latest editor snapshot and focus events. Click Fullscreen output to hide control panels.
4. Local R4 mode (`?projector=1` and `?table=1` on one browser) continues to work without a relay. A LAN relay is **opt-in**.

## Security model and limitations

- Default bind is **127.0.0.1**. LAN binding requires explicit `PHISTAGE_HOST=0.0.0.0` or another local interface.
- Three different role keys: operator controls project snapshots, controller sends touch events/cues, display only receives. One operator per room. Up to eight rooms, 16 sockets per room.
- Frame cap 64 KiB, messages rate-limited, room IDs validated, malformed and stale events discarded. No file-writing API, stored credentials, remote execution, telemetry, account or cloud dependency.
- The server currently speaks **plain HTTP and WebSockets**, so clients/tokens are visible to anyone able to intercept LAN traffic. Use only your trusted, isolated home LAN. Never port-forward; no public DNS or exposure to the Internet. For untrusted networks use an HTTPS/WSS reverse proxy with a trusted certificate (not configured by R5).
- The browser application keeps the entered secret in memory and clears its input after connecting. Tokens are not written to URL parameters or local storage. The server logs generated keys to its terminal: protect terminal and log access.
- Operator project snapshots are RAM-only. Room state disappears when every participant disconnects. Clients joining late receive the current project snapshot.
- Uploaded image/video blobs are **not transferred** across the network. Remote projectors can render procedurals, grids and checker modes, not local media files.
- This is a focus/cue relay, not physics synchronization, multi-touch per-player state, projector auto-calibration, remote audio transport, or headset tracking. PhiOS XR spatial anchors are still future work.
- Editor/projector/reader all must use one **locally served site origin**. GitHub Pages HTTPS cannot connect directly to an unencrypted `ws://` LAN endpoint because of browser mixed-content restrictions.

## Network protocol

1. After WebSocket connect, send `{"type":"join","room":"table-1","role":"controller","token":"<role key>"}`. No authentication details in the URL.
2. Server replies `{"type":"welcome","room":"table-1","role":"controller","clientId":"lan-..."}`.
3. Operator can broadcast `{"type":"snapshot","project":{...R3 exported project...},"blackout":false,"audioLevel":0}`.
4. Operator/controller can send `{"type":"event","packet":{...PhiStage v1 event...}}`. Relay sanitizes the sender and broadcasts only within that room.
5. New joiners receive latest snapshot after `welcome`. R4 normalized 2D surface-local x/y coordinates still map through the original homography on displays.

## Next: R6 integration

Share a versioned world state with time/sequence receipts, simultaneous multi-user input IDs, optional local fiducial alignment for Quest 3, and per-projector calibrated coordinate frames. Any headset bridge must stay optional, and never mandate a Meta cloud spatial anchor.