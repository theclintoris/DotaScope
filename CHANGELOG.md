# Changelog

All notable changes to DotaScope are recorded here. The public release lives at
[github.com/theclintoris/DotaScope/releases](https://github.com/theclintoris/DotaScope/releases).

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
  pick history and base stats.
- **Match intelligence** — latest pro and public feeds, direct match-ID lookup,
  gold/XP advantage graph, ten-player scoreboards, item slots, KDA, economy and
  draft boards.
- **Player intelligence** — global player search, pro directory, career record,
  ranked medal, estimated MMR, form log, hero pool, lane mix and attribute mix.
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
