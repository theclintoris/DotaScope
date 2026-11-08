# DotaScope code map

This repository is a React/Vite web app with two native hosts and a local
parser worker. Use this map as the fast orientation layer; comments in the
source explain non-obvious decisions rather than restating syntax.

## Runtime surfaces

| Area | Files | Responsibility |
| --- | --- | --- |
| Web UI | `src/App.tsx`, `src/pages/`, `src/components/` | Routes, screens, reusable visual components. |
| Shared state | `src/context/ProfileContext.tsx`, `src/context/MetaContext.tsx` | Pinned Dota profile and the global Ranked/Turbo + bracket lens. |
| OpenDota access | `src/lib/api.ts` | Cached/deduped public API calls; optional stored key is supported internally but no UI prompt exposes it. |
| Local parser worker | `worker/parser-worker.mjs` | HTTP API on `127.0.0.1:5601`; runs the Java OpenDota parser and persists parsed JSON. |
| Java parser | `.toolchain/odota-parser/`, `runtime/parser/` | Raw `.dem` replay parser; invoked only by the worker. |
| Native Windows host | `windows/Program.cs`, `windows/Launcher.cs`, `windows/WorkerRuntime.cs` | WebView2 shell, single-instance launcher, bundled runtime discovery, worker lifecycle. |
| Draft overlay | `windows/OverlayForm.cs`, `src/pages/DraftOverlay.tsx`, `src/overlay.css` | Separate click-through topmost WebView2 window and its compact draft view. |
| GSI bridge | `windows/GsiBridge.cs`, `windows/GsiSetup.cs`, `src/lib/gsi.ts` | Receives Dota 2 Game State Integration on 53000; installs config; exposes draft/own-player data. |
| Shared archive | `cloudflare/worker.js`, `cloudflare/schema.sql`, `src/lib/sharedArchive.ts` | Opt-in sanitized parsed-match upload/download; D1 storage; shared fallback. |
| Portable packaging | `windows/portable/`, `scripts/`, `runtime/` | Bundled Node/JRE/7-Zip/parser and one-click GSI/Steam setup. |
| Android | `android/`, `capacitor.config.*` | Capacitor shell for the same web bundle. |

## Data flow

1. The web UI loads OpenDota meta data through `src/lib/api.ts`.
2. In the desktop app, GSI data arrives at `127.0.0.1:53000`; the WebView
   fetches it through the native bridge. `AutoParserWatcher` queues post-game
   matches for the local worker.
3. The local worker downloads/parses a replay when one is available, writes
   `worker-data/<match>.stats.json`, and appends Turbo/Ranked history.
4. `MatchDetail` checks local stats first, then the opt-in shared archive.
5. The shared archive stores only sanitized parsed JSON (no `.dem`, names or
   Steam IDs); users opt in from Parser lab.

## Overlay flow

- `MainForm` creates the shared WebView2 environment.
- `OverlayForm` creates a second, click-through `WebView2` pointed at
  `#/overlay`. It is hidden until `Ctrl+Shift+D` (or
  `DOTASCOPE_OVERLAY_DEBUG=1` during QA).
- The route lives outside `AppShell`; `DraftOverlayPage` polls GSI, reads the
  enemy/ally picks, and computes counter suggestions from the existing meta
  metrics + matchup sample.
- Dota must run in borderless/windowed mode; the overlay does not inject into
  the game and does not interact with VAC-protected processes.

## Where to add things

- New page: add a component in `src/pages`, a route in `src/App.tsx`, and a
  navigation entry/`SECTION_META` label in `src/components/AppShell.tsx`.
- New hero metric: extend `src/lib/meta.ts` and `src/types.ts`; update cards/
  tables that render the metric.
- New worker endpoint: add the route near the bottom of
  `worker/parser-worker.mjs` and a typed client in `src/lib/`.
- New native behavior: keep platform-specific logic in `windows/`, not in
  React; pass data through the WebView2 virtual host or a loopback endpoint.

## Commenting standard

Use comments for intent, invariants and failure modes: why a workaround exists,
what a non-obvious calculation means, or what must stay true. File-level
headers explain ownership. Avoid comments that merely translate the next line
of code.
