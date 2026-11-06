<p align="center">
  <img src="public/icons/icon-192.png" width="88" alt="DotaScope icon" />
</p>

<h1 align="center">DotaScope</h1>

<p align="center"><strong>Meta intelligence for Dota 2.</strong><br />
A dark, installable statistics cockpit for PC and Android, built on the OpenDota public API.</p>

DotaScope brings hero meta, matchups, professional play, player dossiers, match scoreboards, historical records and a read-only SQL lab into one responsive app. It ships as a native **Android APK**, a **standalone Windows EXE**, and a progressive web app (PWA) for any modern browser.

**[Download the latest build](https://github.com/theclintoris/DotaScope/releases/latest)** · **[Browse the source](https://github.com/theclintoris/DotaScope)** · **[Update log](CHANGELOG.md)**

## What is included

- **Meta lens** — switch between ranked pubs, pro, turbo and Immortal populations, and ranked brackets 1–7. A Ranked/Turbo switch in the top bar keeps player dossiers, hero history and the match explorer on the same lens; the choice is shared across every page and remembered locally.
- **Overview** — sample size, meta leader, win-rate extremes, pick pressure, trend chart, bracket/attribute distribution and the latest pro results.
- **Hero index** — search and filter by attribute, role, attack type and Captain's Mode eligibility; sort by win rate, pick share, picks, trend, meta grade or pro presence; export CSV. Every hero carries an S–D current-meta grade derived from win and pick strength.
- **Hero dossier** — matchups, duration profile, item phases, bracket spread, pro pick/ban presence, daily pick history and base stats.
- **Matches** — the latest pro and public feeds plus **My matches**, your own ranked or Turbo history from the pinned profile. Includes league, team, mode, lobby, rank, duration and time filters on the public feed, and mode-aware result/KDA cards for your games.
- **Match detail** — gold/XP advantage chart, both scoreboards, items, KDA, GPM/XPM, last hits/denies, damage, a pick/ban draft board and a parsed **Vision & Utility** breakdown (observer/sentry wards, dewards, camps stacked, runes and stuns). Locally parsed matches are merged from the worker's `/stats` payload and show **Parsed locally** instead of prompting for an OpenDota API key; the local parser also supplies the advantage timeline when OpenDota has no parsed data. A **ward map** plots every observer and sentry placement on the Dota map with team filters and hover timestamps. Unparsed matches can still be queued for OpenDota parsing with your own key.
- **Players** — global OpenDota player search, numeric account shortcut, and a searchable professional directory.
- **Player profile** — career W/L, rank, estimated MMR, recent form, hero pool, match log, lane mix and attribute comfort, filtered by the global Ranked/Turbo lens. Hero-pool and match-log rows show the current meta grade plus a +/− flag comparing the player's hero win rate with the OpenDota baseline for their own rank bracket. Turbo uses OpenDota's latest-20 sample plus locally parsed Turbo history; the UI labels the sample source.
- **Performance review** — OpenDota hero-benchmarked percentiles for ranked standard games, plus a Turbo form benchmark using parsed Turbo history. The Turbo panel offers three scopes: **Personal** (your latest parsed games against your earlier history), **Frequent teammates** (players you have shared at least two games with) and **My games** (every other player in your parsed Turbo matches). The recent window grows up to 20 games while keeping an earlier baseline. Each includes linked heuristic flags and a strongest-signal callout; OpenDota has no global Turbo benchmark split, so the comparisons are explicit local baselines rather than population percentiles.
- **Turbo Elo ladder** — every player found in a locally parsed Turbo match starts at 1,000 and moves through team-average Elo (K=32). The player dossier shows your current/peak rating, last change, match history and the top of the players you have shared a lobby with. This is a local DotaScope ladder, not Valve MMR.
- **Player hero dossier** — click any hero in a player's pool or match log for hero-specific win rate, form, KDA, final-item telemetry, recent builds and the full paginated match archive on that hero.
- **Draft lab** — a 5v5 counter-pick board for both line-ups, with role-filtered suggestions, matchup edges, item-independent meta blends and an MMR bracket guardrail. The bracket control reweights suggestions by that rank's win/pick rates; OpenDota does not publish bracket-split head-to-head samples, which the screen states explicitly. Signed-in players can weight suggestions by their own hero pool, with personal sample size and win rate shown on each card.
- **Parser lab** — local OpenDota replay parser for Ranked standard and Turbo games plus utility data. Runs on your PC, never uploads the replay; see the local parser setup below. The **Turbo backfill** queue loads the available recent Turbo sample or accepts pasted match IDs, downloads Valve replays through OpenDota URLs where available, and parses newest-first while the worker stays open. It is honest about the limits: OpenDota exposes only the latest 20 Turbo matches, and Valve replay retention is finite, so a full career cannot be reconstructed for expired matches.
- **Ranked and Turbo history** — auto-parses finished Ranked standard and Turbo games on Windows through the local OpenDota worker. Ranked replays are parsed when available locally or through a Valve replay URL; Turbo history also grows past OpenDota’s 20-game public cap. Parsed rows extend the relevant player, Records and benchmark samples and stay on the PC.
- **Meta escape** — underplayed and underbought options with evidence. The board surfaces below-median heroes with winning matchup samples into the current top five, plus expensive low-purchase-rate items and the escape heroes who actually buy them. Counter edges are clearly attributed to the carrier hero, not the item, because OpenDota does not publish item-specific matchups. A nested **Off-meta builds** board adds unusual final-item choices on the current meta heroes, their buy-rate lift and the heroes best positioned against them.
- **Immortal lens** — OpenDota has no usable Immortal pub aggregate. DotaScope adds an **Immortal** population using Spectral's public weekly top-ladder sample: hero pick/win rates, matchup edges, source attribution and no medal bracket split. The global Meta lens and Meta escape both use it.
- **Squad performance** — a player's most frequent public teammates, with games together, duo win rate, last queued and average GPM, sortable by games or win rate. This uses OpenDota's public peer history, not Steam's private friends list.
- **Your profile** — pin your own dossier above the Players directory and keep a compact form/record strip on Overview. The Windows app picks up the active Steam account automatically; the web app offers Steam sign-in plus a manual profile fallback.
- **Pro scene** — team Elo-style power index, active-team filters, latest series results and a pro hero draft-presence board.
- **Records** — twelve historical record books across parsed public matches, plus **personal records** for your pinned profile. Personal bests follow the Ranked/Turbo lens and can be narrowed to one hero; ranked scans all available ranked match history, while Turbo combines OpenDota’s sample with locally parsed history. Parsed Ranked and Turbo games also unlock GPM, XPM, last-hit and hero-damage record cards.
- **Data Lab** — a read-only OpenDota SQL editor with a table/schema browser, examples, CSV export and a hard 100-row cap.
- **PWA shell** — install prompt, service worker, offline shell, safe-area mobile navigation, command palette (`Ctrl/⌘ K`) and responsive layouts from 390 px upward.

## Ranked and Turbo auto-parse setup (Windows)

DotaScope reads the local game through Valve's official **Game State Integration** feed. There is no Live suggestions screen; GSI is used only to detect finished Ranked standard and Turbo games so the local parser can extend your history beyond OpenDota's public sample.

1. Copy
   [`public/integrations/gamestate_integration_dotascope.cfg`](public/integrations/gamestate_integration_dotascope.cfg) to
   `…\Steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\`.
2. Keep `-gamestateintegration` in Dota 2's Steam launch options.
3. Start DotaScope before playing. The Windows launcher starts the local parser worker automatically when it finds the worker checkout; on the web build run `node worker/parser-worker.mjs` manually. DotaScope will auto-parse each finished Ranked standard or Turbo game and append it to the local history.

The bridge listens only on `127.0.0.1:53000`. It never reads game memory or touches game files beyond loading the user-installed GSI config.

## Community parse archive (opt-in)

DotaScope can share a **parsed match result** with other DotaScope installs through the community archive at `https://dotascope-shared.dotascope.workers.dev`. This is an opt-in convenience for extending parsed Ranked/Turbo coverage without asking every player to download the same replay.

- Enable **Parser lab → Community archive → Share parsed matches**. The setting is off by default and is stored in this browser/device.
- When an automatic parse finishes, DotaScope uploads the same anonymised stats it already displays: match metadata, ten player rows, the per-minute timeline and ward positions. It **does not** upload `.dem` files, replay files, Steam credentials, OpenDota API keys or account passwords.
- Player display names and Steam IDs are removed before upload; the archive keeps the Dota account ID, hero, slot and performance numbers needed to render the match.
- Opening a match that is not available locally automatically falls back to the shared archive. The match page labels the source **Shared archive**; Ward map, timeline and scoreboard render exactly as they do for a local parse.
- Uploads are deduplicated by match ID. The Worker rejects malformed/non-Ranked-or-Turbo payloads, caps uploads at 20 per hour per hashed IP, and stores at most 1.5 MB per match.
- On the native desktop app, the pinned profile also imports recent shared Turbo rows for that account at launch. Imported rows fill gaps only, are stored locally as `shared-archive`, and rebuild the Turbo Elo ladder/benchmarks without overwriting local parses.
- There is no account/login for the archive and no public index of players; a match is fetched by its match ID.

The Worker, D1 schema and deployment steps live in [`cloudflare/README.md`](cloudflare/README.md). The current deployment uses Cloudflare Workers + D1 in the `dotascope-shared` Worker.

## Local replay parser and automatic parsing

The **Parser lab** runs the OpenDota parser locally so Ranked standard and Turbo games plus utility data that the public match feed omits can still be inspected. It is separate from the packaged WebView2 frontend and needs a one-time local worker setup.

1. Install **Node.js 26**, **Java 21**, and **7-Zip**.
2. The OpenDota parser jar and local JDK can live in `.toolchain/`; the worker starts the parser automatically.
3. The Windows launcher now starts the worker automatically when DotaScope opens and stops it when DotaScope closes. The worker must be present at `worker/parser-worker.mjs` next to the launcher, with Node, Java and 7-Zip available. If you already started a worker yourself, DotaScope leaves it running. The web build cannot manage the worker, so run `node worker/parser-worker.mjs` manually there.
4. Open **Parser lab** in DotaScope and refresh. The page lists local replays and can parse one on demand. While the worker is running it also watches the replay folder and parses any new `.dem` file automatically.

The worker uses `127.0.0.1:5601` (and starts the Java parser on `127.0.0.1:5600`). Its data stays in `worker/data/`. Replays are read from the local Dota 2 replay folder; a finished Ranked or Turbo game can be downloaded from Valve's replay URL only when OpenDota exposes one.

While DotaScope is open on Windows, **auto-parse** watches the GSI post-game state. It waits for the match to settle, verifies that it is a Ranked standard or Turbo match, downloads/decompresses the replay if needed, and parses it in the background. A toast reports progress, the result is available in Parser lab, and parsed player rows are persisted to `worker/data/ranked-history.json` or `worker/data/turbo-history.json` so the player pages are not limited to OpenDota's public sample. If you download a replay manually from Dota 2, the worker's replay-folder watcher detects the new `.dem` and parses it automatically; **Refresh match** rechecks local and shared parses without a page reload. The Windows launcher owns the worker lifecycle: it starts the worker on launch and stops the one it started on exit. A worker you started manually is reused and left alone. The cloud-free design is deliberate; see [`worker/README.md`](worker/README.md) for exact prerequisites and API details.

## Update log

Every shipped change is recorded in **[CHANGELOG.md](CHANGELOG.md)**, including
the native packaging, Steam integration and stability fixes. Add new work under
an `Unreleased` heading so the development path stays visible on GitHub.

## Run locally

Requirements: **Node.js 22+** (tested on Node 26) and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

To exercise the production bundle and service worker:

```bash
npm run build
npm run preview
```

Then open `http://localhost:4173`.

### Windows notes

This checkout's Vite config is loaded with `--configLoader native`; that flag is already baked into the npm scripts. It avoids a Windows `spawn EPERM` failure while Vite resolves real paths. If your npm cache lives outside a restricted workspace, point it back into the project:

```powershell
$env:npm_config_cache="$PWD\.npm-cache"; npm run build
```

## Install it on PC and Android

### Native releases

The native builds are bundled in this project:

| File | What it is |
| --- | --- |
| `DotaScope-1.0.0.apk` | Signed release APK for Android 7.0+ (minSdk 24, targetSdk 36) |
| `DotaScope-1.0.0-win-x64.exe` | Portable Windows x64 app (about 64 MB) for PCs that already have Node, Java and 7-Zip or only need the web app. |
| `DotaScope-1.0.0-portable-full.zip` | **Recommended for most Windows users.** Self-contained folder with the app, Node 26, Java 21, 7-Zip, parser JAR and GSI config; one-click setup. About 270 MB unpacked. |
| `DotaScope-1.0.0.zip` | Static web build for the PWA / browser fallback. |

**Windows (recommended):** download `DotaScope-1.0.0-portable-full.zip`, extract the whole folder, and run `Setup.cmd` once. Setup installs the Dota GSI config and adds `-gamestateintegration` to Dota 2's Steam launch options (close Steam when prompted). Then run `DotaScope-1.0.0-win-x64.exe`. The folder already contains Node 26, a minimal Java 21 runtime, 7-Zip, the OpenDota parser JAR, the worker and the GSI config, so Parser lab and automatic parsing work without installing developer tools. Keep the folder together; this build keeps its history in the `data` folder beside the EXE, so preserve `data` when updating the portable folder.

**Windows (minimal EXE):** `DotaScope-1.0.0-win-x64.exe` runs the web app and Steam/profile features by itself, but Parser lab and auto-parse stay offline unless `worker/parser-worker.mjs`, Node, Java and 7-Zip are provided. Use the full portable ZIP for the complete feature set. Windows SmartScreen may warn because the build is not Authenticode-signed; choose **More info → Run anyway**. The app needs the **Microsoft Edge WebView2 Runtime** (already present on current Windows 10/11 systems) and .NET Framework 4.8 (included with Windows 10/11). There is no installer and no Electron runtime.

The EXE is a portable launcher with the full WebView2 app embedded inside. It chooses a writable data directory (`%LOCALAPPDATA%\DotaScope`, then `%APPDATA%\DotaScope`, then a `data` folder beside the EXE), sets its own extraction paths, and starts the host. You do **not** need to set `DOTNET_BUNDLE_EXTRACT_BASE_DIR` manually. Launching from the installed Steam shortcut uses the same launcher and picks up the active Steam account.

The launcher also starts the local parser worker when `worker/parser-worker.mjs` is available beside it and stops that worker when DotaScope exits. In the full portable build, the worker uses the bundled `runtime/node/node.exe`, `runtime/jre`, `runtime/7z/7z.exe` and `runtime/parser/stats-0.1.0.jar`; no system installs are needed. The standalone single-file EXE does not embed those runtime files, so without the full portable folder the app still runs but Parser lab stays offline.

The Windows launcher is single-instance. If a DotaScope window is already open, launching the EXE or pressing **Play** in Steam focuses that window instead of opening a second WebView2 host against a locked profile. After installing an update, close the existing DotaScope window and launch again to load the new build. If Windows still reports a WebView2 state error, close all DotaScope/WebView2 processes and retry.

**Android:** enable installing unknown apps for your browser/file manager, open the APK, and confirm the install. It is signed with the project's local release key (CN=DotaScope); this key is not included in the repository. The APK has been signature- and manifest-verified, but was not run on a physical device or emulator in this environment.

Both native wrappers load the same bundled web build and use the public OpenDota API directly. Player search and player profiles were verified in the Windows app against account `295731192`; hero data, matches and every filter use the same packaged frontend. The service worker is disabled in both wrappers so assets always come from the bundled build.

### PWA

A PWA must be served over **HTTPS** or from **localhost**.

#### Windows / PC

1. Build and serve the app (`npm run build`, then `npm run preview`), or open your HTTPS deployment.
2. In Chrome or Edge, use the install icon in the address bar → **Install DotaScope**.
3. It opens in its own standalone window and appears in the Start menu.

The interface also runs normally in Zen and other current browsers. One-click installation on Windows currently depends on the browser's PWA support; if an install control is not exposed, keep using it as a normal tab.

#### Android

1. Deploy the contents of `dist/` to any HTTPS static host.
2. Open the URL in Chrome on Android.
3. Menu → **Install app** (or **Add to Home screen**).
4. Launch from the home screen; it runs full-screen with the mobile bottom navigation.

For LAN testing from a phone, `npm run preview -- --host 0.0.0.0` works, but HTTP origins other than localhost are not installable as PWAs.

## Steam sign-in and your pinned profile

Your selected profile is stored only on the device (`localStorage`). It appears first under **Players** and as a compact strip on **Overview**.

- **Windows app:** the WebView2 host reads the active Steam account from the local Steam client's `config/loginusers.vdf` and passes its public SteamID to the app. Launching DotaScope from Steam therefore pins your Dota dossier automatically. No password is read or requested.
- **Web / PWA:** **Sign in with Steam** opens Steam's OpenID page. After Steam redirects back, DotaScope uses the returned public SteamID to find the matching OpenDota account. Because the app is fully static and has no backend, this is a public profile link, not a verified secure session. Manual Steam-profile, SteamID64 or Dota account-ID entry is also available.
- **Android:** there is no local Steam client to read, so use manual profile entry. The APK has no account password or private Steam data access.

The app never asks for a Steam password, Steam Guard code, or private inventory data. An **optional** OpenDota API key is stored only on this device and used solely for rate limits and replay-parse requests. OpenDota profiles must be public.

## OpenDota API key (optional)

OpenDota's free tier is enough for browsing, but a personal API key raises your
rate limit and enables replay-parse requests. Open it from the key icon in the
top bar or from the mobile More sheet.

- The key is stored only in this browser's `localStorage` (`dotascope.opendotaKey.v1`).
- It is sent directly to OpenDota as an `api_key` query parameter and is never
  logged, uploaded to DotaScope, or committed to the repository.
- The match page exposes **Request replay parse** only when a key is configured.
  Parsed matches show the Vision & Utility panel for wards, dewards, stacks,
  runes and stuns.
- Use **Remove key** in the same dialog to delete it from the device.

## Steam library artwork

`steam-art/` contains a complete custom Steam library kit for the Windows app: a 600×900 library portrait, a 920×430 header, a clean 1920×620 hero, a transparent logo, a 256×256 icon, and a multi-size `.ico`. The icon and artwork use Ancient Apparition's **Shattered Sanity** Immortal set from Dota 2's Trove of Terror.

![DotaScope Steam artwork](steam-art/steam-preview.jpg)

On Windows, after building `DotaScope-1.0.0-win-x64.exe`, install the shortcut and artwork with:

```bash
python scripts/install-steam-shortcut.py
```

The script finds the active Steam account, backs up `shortcuts.vdf`, adds or updates the non-Steam DotaScope entry, copies the grid assets, and restarts Steam. Steam must be closed while the file is written; the script handles that and creates a timestamped backup. See [steam-art/SOURCE.md](steam-art/SOURCE.md) for artwork attribution.

## Build the native apps

Android packaging needs **JDK 21** and **Android SDK 36**. On this machine the local toolchain lives in `.toolchain/` (gitignored); source it before Gradle commands:

```bash
source .toolchain/env.sh
npm run android:apk
```

`npm run android:apk` builds the web bundle, syncs it into `android/`, and runs Gradle `assembleRelease`. A release signing config is read from `android/keystore.properties` (gitignored). The signed APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

For Windows, install **.NET SDK 8 or newer** and run:

```powershell
npm run windows:build
```

The script builds the web bundle, packs `dist/` into `windows/web.zip`, restores the WebView2 NuGet package using `windows/NuGet.config`, publishes the self-contained WebView2 host to `windows/DotaScope-app.exe`, then wraps it in a small .NET Framework portable launcher and writes `DotaScope-1.0.0-win-x64.exe` to the project root. The host serves the embedded `web.zip` through a virtual `https://dotascope.local` origin and renders it with WebView2. It does not use Electron. The launcher is built with the .NET Framework 4.8 `csc.exe` included with Windows; no Visual Studio install is required.

The Windows binary is unsigned. For public distribution, add an Authenticode code-signing certificate and sign the generated EXE. The Android release key in `android/` is for local sideloading/updates: keep it safe and reuse it for future versions, or replace it with your own production key before publishing.

### Static deployment

`dist/` is a static site. Netlify, Vercel, Cloudflare Pages, GitHub Pages or any HTTPS static host work. The app uses hash routing (`/#/heroes`), so no server-side rewrite rules are required. Deploy at a domain root; if you deploy under a subpath, set Vite's `base` option and rebuild. Service-worker registration is production-only.

## Data source and honest limits

DotaScope uses the [OpenDota API](https://docs.opendota.com/). The app has no backend and no DotaScope account or password system; requests go from your client directly to OpenDota, and the optional pinned profile is stored only on the device. Responses are cached in memory and `localStorage`, with stale-cache fallback when the network is unavailable.

Dotabuff does not publish a general public API. **This is not a pixel-for-pixel or data-complete clone of Dotabuff.** OpenDota exposes a large, but different and sometimes smaller, slice of Dota data. In particular:

- **Rate limits** — OpenDota's free tier is roughly 60 requests/minute per IP, with a daily cap. A first uncached visit fires several requests. When the API returns `429`, DotaScope shows a retry state; browse after a minute or use the cached data already stored locally.
- **Hero brackets** — OpenDota `/heroStats` publishes bracket aggregates 1–7 but no usable Immortal (bracket 8) sample. DotaScope's **Immortal** lens is a separate weekly Spectral sample, not an OpenDota bracket. OpenDota's overall bracket win rates can sit at exactly 50% because of how the feed is normalized; per-hero rates still vary.
- **Pro data** — the pro feed is the latest ~100 matches, not a complete circuit archive. Some fields Dotabuff shows (notably game mode for pro matches) are absent, so DotaScope does not invent them.
- **Records** — the global record books use parsed public matches; unparsed and private games are excluded. Personal ranked records scan the account’s ranked match list returned by OpenDota; personal Turbo records use the latest-20 public sample plus every local parsed Turbo game. GPM/XPM/last-hit/hero-damage personal records appear when the matching parsed Ranked or Turbo games are available locally; the row source is labelled.
- **Friends / squad** — Steam does not expose a player's private friend list to a client-only OpenDota app. DotaScope shows OpenDota's public `peers` history instead (the people you queue with most) and labels it honestly.
- **Public feed** — the latest 100 matches; direct match-ID lookup is available for older games.
- **Parsing** — some matches are unparsed, so items, drafts and economy charts can be incomplete. Bring your own OpenDota API key to request a replay parse from the match page; OpenDota handles the queue and the paid feature. Local parsed matches use the worker's scoreboard, timeline and ward data; caches created before the ward-map release can be refreshed from the match page or Parser lab. Item/ability constants come from OpenDota/Valve.
- **Immortal source** — the Immortal lens uses Spectral's public `imm_ranked_meta_last_7` weekly sample, attributed in the lens. It is a top-ladder estimate and is not medal-bracket split. Dotabuff and DotaProtracker have no official public API and are not scraped.
- **Explorer** — the Data Lab is read-only, limited to the tables OpenDota exposes, and truncates/append `LIMIT 100` where needed. Heavy queries can time out.
- **Image assets** — hero, item and team art is loaded from Valve/Steam CDNs through OpenDota URLs. The ward-map layer uses OpenDota's detailed 7.40 map asset.

DotaScope is an unofficial fan project. It is not affiliated with Valve, Dotabuff or OpenDota. Dota 2 and related assets are trademarks of Valve Corporation.

## Project map

```text
src/
  components/   app shell, profile panels/dialog, API key dialog, performance review,
                command palette, meta lens, UI primitives
  context/      global population + bracket state, local profile store
  lib/          OpenDota client, Spectral Immortal client, cache, formatters,
                meta calculations, API key storage, Steam helpers, PWA registration
  pages/        Overview, Heroes, HeroDetail, Draft, MetaEscape, Matches,
                MatchDetail, Players, PlayerDetail, PlayerHeroDetail, Pro,
                Records, DataLab, NotFound
public/
  icons/        PWA + favicon assets
  manifest.webmanifest
  sw.js         offline shell and runtime cache
windows/
  DotaScope.csproj      WinForms + WebView2 host
  Program.cs            embedded web server, data extraction, window lifecycle
  Launcher.cs           portable launcher that embeds and starts the host
  icon.ico
android/        Capacitor 8 Android project (Gradle, signing config)
cloudflare/     Workers + D1 shared parsed-match archive
assets/         Android adaptive icon + splash source art
scripts/
  build-windows.ps1     package dist + publish the Windows host + launcher
  build-launcher.ps1    embed the host in the portable EXE
  make-icons.py         regenerate the brand/PWA icons
  make-android-assets.py regenerate adaptive launcher + splash art
  qa-native.mjs         Playwright/CDP native-app smoke test
  visual-test.mjs       browser QA against system Chrome
  class-audit.cjs       audit class usage while editing CSS
```

Player pages and the general flow were smoke-tested with OpenDota account [`295731192`](https://www.dotabuff.com/players/295731192). The account is useful as a manual test fixture; it is not bundled or hard-coded into the app.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite development server |
| `npm run build` | Type-check and build the production app |
| `npm run preview` | Serve the built app locally |
| `npm run lint` | Run Oxlint on `src` |
| `npm run windows:build` | Build the Windows host and portable launcher EXE |
| `npm run android:apk` | Build and sign the release APK |
| `npm run android:sync` | Rebuild web assets and sync them into Android |
| `npm run android:open` | Open the Android project in Android Studio |
