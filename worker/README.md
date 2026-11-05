# DotaScope replay parser worker

This is the local bridge between DotaScope and the [OpenDota parser](https://github.com/odota/parser). It reads a Dota 2 `.dem` replay, runs the OpenDota Java parser locally, and turns its line-delimited output into player stats that DotaScope can display.

It is a desktop worker: the browser build can only use it while it is running on the same machine. Android cannot access a PC filesystem.

## What it produces

The worker returns the last parser interval for each player:

- KDA, net worth, last hits/denies, GPM/XPM
- hero/tower damage, stuns, teamfight participation
- observer/sentry placements, camps/creeps stacked, runes
- account id, Steam id and player name from the parser epilogue
- match mode, duration, winner, team kills

OpenDota's public match endpoint is used for optional metadata and to cross-check the result. It is not required for a local parse.

## Prerequisites

- Node.js 22+
- Java 21
- 7-Zip (for automatic `.bz2` replay download/decompression)
- The OpenDota parser jar. This repository's development copy is at:
  `.toolchain/odota-parser/target/stats-0.1.0.jar`
- A local `.dem` file in the Dota 2 replay directory (or set `DOTA_REPLAY_DIR`).

The worker's defaults match this machine:

- Java: `.toolchain/jdk-21.0.13+9/bin/java.exe`
- Jar: `.toolchain/odota-parser/target/stats-0.1.0.jar`
- Replays: `C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\game\dota\replays`

Override with `JAVA_BIN`, `OPENDOTA_PARSER_JAR`, `DOTA_REPLAY_DIR`, `PARSER_DATA_DIR`, `SEVEN_ZIP_BIN`, or `OPENDOTA_PARSER_URL`.

## Run

```bash
node worker/parser-worker.mjs
```

The worker listens on `http://127.0.0.1:5601`. It starts the Java parser on `127.0.0.1:5600` when needed.

Check it:

```bash
curl http://127.0.0.1:5601/health
curl http://127.0.0.1:5601/replays
curl -X POST http://127.0.0.1:5601/parse \
  -H 'content-type: application/json' \
  -d '{"matchId":"8952476726"}'
```

Parsed data is stored under `worker/data/` and is gitignored. Successful Ranked standard parses append normalized player rows to `worker/data/ranked-history.json`; successful Turbo parses append to `worker/data/turbo-history.json`. DotaScope merges both local histories into the player and Records views, so Ranked performance cards and Turbo history can grow without an OpenDota paid key. These files are local and are not uploaded. The Java parser uses `worker/data/java-tmp` as its writable temp directory.

The Parser lab's **Turbo backfill** queue uses `/recent-turbo` and `/backfill`. It downloads a replay only when OpenDota returns a replay URL; otherwise the match is recorded as an error and the user must download that replay from Dota 2. Valve replay retention is finite, so older matches may no longer be recoverable.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Worker/parser status and configured directories |
| GET | `/replays` | `.dem` files in the replay directory |
| POST | `/parse` | Body `{ "matchId": "...", "force": false, "download": false, "turboOnly": false, "competitiveOnly": false }`; runs the parser, optionally downloading the replay. `competitiveOnly` accepts Ranked standard (`game_mode 22`, `lobby_type 7`) or Turbo. |
| GET | `/stats/:matchId` | Previously generated stats |
| GET | `/turbo-history?accountId=&limit=` | Parsed Turbo rows for one account, newest first |
| GET | `/ranked-history?accountId=&limit=` | Parsed Ranked standard rows for one account, newest first |
| GET | `/recent-turbo?accountId=` | OpenDota's latest-20 feed filtered to Turbo |
| POST | `/backfill` | Body `{ "matchIds": ["..."] }`; queues newest-first Turbo downloads/parses |
| GET | `/backfill` | Current/last queue progress and per-match results |
| POST | `/backfill/cancel` | Stops after the current match finishes |

## Known limitations

- This is a local-only worker; it is not bundled into the Windows launcher yet.
- Parsing is CPU-heavy and should not be exposed to the public internet.
- The parser output does not include final inventories. Item purchase logs are present in the raw output and can be added in a later pass.
- Turbo history only includes matches parsed while this worker is running (or matches whose Valve replay URL is still available). Older Turbo games are not backfillable from OpenDota's public career feed.
- The parser is mode-agnostic; `turboOnly` and `competitiveOnly` are enforced from OpenDota match metadata before parsing. Ranked standard is `game_mode 22` with `lobby_type 7`.
- Local Ranked history only includes matches parsed while the worker is running, or matches whose Valve replay URL is still available. Missing or expired replays must be downloaded from Dota 2 manually.
