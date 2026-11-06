# DotaScope shared parse archive

The shared archive is an optional Cloudflare Worker backed by D1. It stores the
**parsed result** of a Ranked or Turbo match so another DotaScope installation
can render the scoreboard, timeline and ward map without a local `.dem` replay.
It is not a replay file host.

- Worker: `https://dotascope-shared.dotascope.workers.dev`
- Worker name: `dotascope-shared`
- D1 database: `dotascope-shared`
- D1 database ID: `8e1ccbea-cf72-46c0-9267-06360ca64950`
- D1 region: OC

The client opt-in is local-only (`localStorage`), defaults to off, and is
managed from **Parser lab → Community archive**. Uploads happen only after a
successful automatic parse when the toggle is enabled.

## Privacy

The Worker stores the same match payload the local Parser lab renders, except
that player display names and Steam IDs are stripped. The payload includes:

- match ID, start time, duration, game mode and winner;
- ten anonymised player rows: slot, account ID, hero, team, result, KDA, GPM,
  XPM, last hits/denies, hero/tower damage, healing, wards, camps and runes;
- the per-minute advantage timeline and observer/sentry ward placements.

It does **not** store `.dem` or replay files, passwords, Steam credentials,
OpenDota API keys, player names or Steam IDs. There is no login and no public
player index; a match is fetched by its match ID.

## D1 schema

`cloudflare/schema.sql` creates:

- `matches` — match metadata plus the compressed JSON payload;
- `players` — one indexed row per player for future account/hero queries;
- `upload_events` — hashed-IP upload timestamps used by the anonymous rate
  limiter.

Apply it to the remote database:

```powershell
cd cloudflare
npx wrangler login
npx wrangler d1 execute dotascope-shared --remote --file=schema.sql
```

To create a fresh database instead of reusing the bundled one:

```powershell
npx wrangler d1 create dotascope-shared
# copy the returned database_id into wrangler.toml
npx wrangler d1 execute dotascope-shared --remote --file=schema.sql
```

## Deploy

```powershell
cd cloudflare
npx wrangler deploy
```

The Worker exposes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | `{ ok, matches }` archive count |
| `POST` | `/v1/matches` | upload `{ match: stats }` or a raw stats object |
| `GET` | `/v1/matches/:matchId` | fetch `{ ok, sharedAt, payload }` |
| `GET` | `/v1/recent?limit=N` | recent match summaries |

`POST /v1/matches` accepts only Ranked standard (`game_mode=22`) or Turbo
(`game_mode=23`) matches with exactly ten players and a duration of at least
60 seconds. It sanitises player names/Steam IDs server-side, deduplicates by
match ID, caps the body at 1.5 MB and limits anonymous uploads to 20/hour per
hashed IP. Dota Dire player slots 128–132 are normalised to 5–9 before the
duplicate-slot check.

## Test the deployment

```powershell
curl.exe https://dotascope-shared.dotascope.workers.dev/health
```

Expected shape:

```json
{"ok":true,"matches":1}
```

Upload and round-trip a local parse:

```powershell
$stats = Get-Content worker/data/9077789924.stats.json -Raw | ConvertFrom-Json
$body = @{ match = $stats } | ConvertTo-Json -Depth 20
curl.exe -X POST https://dotascope-shared.dotascope.workers.dev/v1/matches `
  -H "content-type: application/json" --data-binary $body
curl.exe https://dotascope-shared.dotascope.workers.dev/v1/matches/9077789924
```

The second upload of the same match should return `duplicate: true`.

## Client fallback

`src/lib/sharedArchive.ts` owns the client endpoint, opt-in setting, payload
sanitisation and upload/fetch calls. `useArchiveMatchStats` in
`src/lib/localMatchStats.ts` tries the local worker first, then the shared
archive, and `MatchDetail` labels the source as **Parsed locally** or
**Shared archive**. `AutoParserWatcher` uploads only when the local opt-in is
enabled.
