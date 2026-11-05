# Changelog

All notable changes to DotaScope are recorded here. The public release lives at
[github.com/theclintoris/DotaScope/releases](https://github.com/theclintoris/DotaScope/releases).

## [Unreleased]

### Added

- **Immortal lens** — a fourth population driven by Spectral's weekly
  `imm_ranked_meta_last_7` report. Immortal hero pick/win rates and
  hero-vs-hero matchup edges are available across the global lens, Draft lab
  and Meta escape, with source attribution and no medal-bracket split.
- **Off-meta builds** — a nested Meta escape board for unusual but winning
  final-item choices on the current meta heroes, plus the heroes with the
  strongest matchup edges against those meta picks. Based on a 90-day parsed
  final-inventory sample.
- **OpenDota API key** — optional device-local key for higher rate limits and
  replay-parse requests. Keys are stored in `localStorage`, sent only to
  OpenDota, never logged, and can be removed from the key dialog.
- **Vision & Utility** — parsed matches expose observer/sentry wards, dewards,
  camps stacked, runes, stuns, smoke and gem purchases per player. Unparsed
  matches offer a replay-parse request when a key is configured.
- **Ranked performance review** — OpenDota hero-benchmark percentiles and review
  flags use only ranked standard games.
- **Turbo form benchmark** — a personal-baseline Turbo benchmark comparing your
  latest five parsed Turbo games with earlier Turbo history. It uses all locally
  available parsed Turbo games, not OpenDota's 20-game cap, and states that
  OpenDota has no global Turbo benchmark split.
- **Persistent Turbo history** — locally parsed Turbo games are stored in
  `worker/data/turbo-history.json`; player, hero and My matches views merge them
  with OpenDota's latest-20 feed, so history can grow one finished game at a
  time instead of stopping at 20. OpenDota has no public Turbo career endpoint.
- **Hero and match-history grades** — S–D current-meta grades plus a +/−
  expectation flag comparing the player's hero win rate with their rank
  bracket's baseline.
- **Global Ranked/Turbo switch** — a top-bar lens now drives the player
  dossier, hero pool, performance review, player hero history, and the new
  **My matches** tab as well as the existing meta pages. Turbo uses OpenDota's
  latest-20 sample plus locally parsed Turbo history; the UI labels the source
  rather than inventing career totals.
- **My matches** — the pinned profile's own ranked or Turbo games in the
  Matches explorer, with result, hero, KDA, GPM where available, mode and
  duration. Ranked loads the latest 500 profile matches; Turbo loads the
  latest-20 feed plus locally parsed Turbo history.
- **Parser lab** — local OpenDota replay parser plus replay shelf, Turbo
  download/decompression, parsed scoreboard and utility stats. Runs entirely
  on the local machine; see the README setup.
- **Turbo backfill queue** — load the recent Turbo sample or paste match IDs;
  the worker downloads available Valve replays through OpenDota and parses them
  newest-first, extending `worker/data/turbo-history.json` without the 20-match
  cap. Validation is explicit: OpenDota only lists the latest 20 Turbo matches,
  and older replays may be expired. The queue processes sequentially and is
  designed to run while DotaScope and the local worker stay open.
- **Removed Live suggestions** — the GSI cockpit UI was removed as unnecessary.
  The loopback GSI bridge and post-game watcher remain because auto-parse needs
  them; setup now lives under Ranked and Turbo auto-parse in the README.
- **Automatic Ranked and Turbo parsing** — while DotaScope is open on Windows,
  the post-game GSI state triggers a background parse of the finished Ranked
  standard or Turbo match when the local worker is running, with a progress
  toast and Parser lab link.
- **Local Ranked history** — parsed Ranked standard games are persisted in
  `worker/data/ranked-history.json` and merged into the Records performance
  cards alongside parsed Turbo history. Replays are parsed locally without an
  OpenDota API key; missing/expired Valve replays still need Dota's manual
  Download Replay.
- **Personal record books** — the Records page now surfaces the pinned
  profile's best kills, deaths, assists, KDA, longest game, longest win streak,
  and (for parsed Ranked or Turbo games) GPM/XPM/last hits/hero damage. The book
  follows the global Ranked/Turbo lens and can be filtered to a single hero;
  ranked records page through the account's available ranked history, while
  Turbo combines the latest-20 sample with local parsed history.

### Changed

- Meta escape's item cards now attribute matchup edges to the carrier hero;
  the off-meta build card label names the meta hero in its matchup line.
- README documents Immortal, replay parsing, API key security, the local
  parser worker, auto-parse prerequisites, and the Source/attribution for
  Spectral. The public match feed is described honestly as ranked/standard only;
  Turbo history is OpenDota's latest-20 sample extended by local parses.

### Fixed

- The local Java parser now uses a writable temp directory under `worker/data/java-tmp`, avoiding Windows temp-directory permission failures when loading Snappy or unpacking the replay. Ranked standard replays and Turbo replays share the same local parsing path.
- The Windows launcher is now single-instance. Launching DotaScope again — including
  from the Steam shortcut — focuses the running window instead of starting a second
  WebView2 host against an in-use profile, which previously surfaced a misleading
  `0x8007139F` "requires WebView2" error.
- The Windows launcher now owns the local parser worker lifecycle: it starts
  `worker/parser-worker.mjs` when the worker checkout is available and stops the
  worker it started when DotaScope exits. An externally started worker is reused
  and left running. The standalone single-file build does not bundle Node, Java,
  7-Zip, the parser jar or the worker sources.

## [1.0.0] — 2026-11-05

The first public release of DotaScope: a Dota 2 statistics cockpit for Windows,
Android and the web, built on the OpenDota public API.

### Added

- **Thirteen data surfaces** — Overview, Heroes, Hero dossier, Draft lab, Meta
  escape, Matches, Match detail, Players, Player profile, Pro scene, Records,
  Data Lab and a custom 404.
- **Global meta lens** — ranked pubs / pro / turbo and Herald–Divine brackets,
  shared by every page and persisted locally.
- **Hero intelligence** — sortable and filterable hero index, CSV export,
  matchups, duration profile, item phases, bracket spread, pro presence, daily
  pick history and base stats. Every hero carries an S–D current-meta grade
  based on blended win and pick strength.
- **Match intelligence** — latest pro and public feeds, direct match-ID lookup,
  gold/XP advantage graph, ten-player scoreboards, item slots, KDA, economy and
  draft boards.
- **Player intelligence** — global player search, pro directory, career record,
  ranked medal, estimated MMR, form log, hero pool, lane mix and attribute mix.
  Hero-pool and match-log rows compare the player's win rate with their
  rank-bracket baseline and mark over/under-performance with a +/− flag.
- **Player hero dossier** — per-hero win rate, recent form, KDA, final-item
  telemetry, sampled builds and a full paginated match archive reached by
  clicking a hero in any player dossier.
- **Squad performance** — public peer history showing frequent teammates, games
  together, duo win rate, last queued and average GPM. This is OpenDota's public
  peer data, not Steam's private friends list.
- **Performance review** — hero-benchmarked percentiles for farm, experience,
  last hits, hero impact, teamfight and survival across the latest ranked
  standard games. Linked review flags surface repeated farm/impact, death and
  long-game patterns; Turbo and unranked games are excluded and the benchmark
  source is disclosed.
- **Personal draft weighting** — signed-in players can blend their own hero
  pool, sample size and win rate into Draft Lab suggestions, with a toggle and
  visible personal fit on every shortlisted hero.
- **Draft lab** — a 5v5 counter-pick board. Set both line-ups, filter suggestions
  by role, and score candidates against the enemy draft. The MMR bracket control
  reweights heroes with bracket-specific win/pick rates and penalises poor
  low-bracket win rates; counter matchups themselves use OpenDota's global
  parsed sample, which is disclosed in the UI.
- **Meta escape** — a scouting board for underplayed heroes and underbought
  items. It finds below-median heroes with winning matchup samples against the
  current top five, then maps expensive low-purchase-rate items to the escape
  heroes who actually buy them. Item cards attribute counter edges to the
  carrier, not the item, and the page explains the 30-day purchase sample.
- **Pinned profile** — save a public Dota profile locally. The pinned dossier
  appears above the Players directory and as a compact strip on Overview.
- **Steam account connection** — the Windows app reads the active Steam account
  from the local Steam client and pins the matching Dota profile automatically
  on launch. The web app offers Steam OpenID plus manual profile linking. The
  Android app uses manual profile linking.
- **Data Lab** — read-only OpenDota SQL explorer with a schema browser, example
  queries, CSV export and a hard 100-row cap.
- **PWA shell** — install metadata, offline app shell, cached API responses,
  install prompt, command palette (`Ctrl/⌘ K`) and safe-area mobile navigation.
- **Native Android app** — Capacitor 8 / Android 7+ APK, adaptive launcher icon
  and splash art, signed local release build.
- **Native Windows app** — .NET 8 WinForms + WebView2 host, embedded web
  payload, automatic active-Steam-account detection and a portable launcher.
- **Steam library kit** — custom portrait, header, hero, transparent logo,
  icon and multi-size `.ico` using Ancient Apparition's *Shattered Sanity*
  Immortal set from the Trove of Terror. A setup script installs the non-Steam
  shortcut and library art.

### Fixed

- **Daily trend calculation** — OpenDota's final trend bucket is the current
  partial UTC day. DotaScope now excludes a partial bucket that is less than
  35% of the median complete day, so the UI no longer reports every hero as
  down ~98% for the week. Labels now describe the daily window accurately.
- **Hero duration profile** — OpenDota duration bins are seconds; the chart now
  converts them to minutes and uses compact bare-number labels (5, 10, … 110)
  with a “Duration in minutes” footnote.
- **Page scrolling after dialogs** — replaced overlapping body scroll locks
  with a reference-counted lock. Closing a profile or install dialog no longer
  leaves tall hero pages unscrollable.
- **Steam Play launch** — the portable `.NET Framework` launcher extracts the
  bundled app and sets its own extraction/data paths, so launching DotaScope
  from Steam no longer depends on `%TEMP%` or a pre-set environment variable.

### Verification notes

- The signed APK was verified with `apksigner` and `aapt`; it was not run on a
  physical Android device or emulator in this environment.
- The Windows build was smoke-tested through Steam and WebView2 CDP, including
  player search for account `295731192`, profile auto-pinning and page
  scrolling. The `.exe` is unsigned, so Windows SmartScreen may warn.
- The web Steam OpenID flow is a public-profile identity flow, not a secure
  authenticated session; the static app has no backend to verify the assertion.
  Windows local Steam detection does not read passwords or private data.

## Development path

- **Data layer** — mapped OpenDota heroes, match, player, pro, records, item and
  Explorer endpoints; added caching, stale fallback and rate-limit handling.
- **Interface** — built the responsive dark “meta intelligence” design system,
  global meta lens, hero/match/player dossiers, pro and records views.
- **PWA** — added service worker, offline shell, install metadata, icons and
  mobile navigation.
- **Native wrappers** — packaged the same web build for Android (Capacitor) and
  Windows (WebView2), added signing and a portable launcher.
- **Personalisation** — added pinned profiles, Steam profile detection and a
  Steam-ready Windows launch path.
- **Stability** — fixed trend-bucket semantics, duration units, scroll locking
  and the Windows bootstrap path after real desktop testing.
- **Release** — published the repository, signed APK, Windows EXE and web ZIP
  on GitHub.

## Maintaining this log

Add new entries under an `Unreleased` heading, then rename that heading to the
version and date at release time. Link the release tag and keep verification
notes and known limitations with the entry that introduced them.
