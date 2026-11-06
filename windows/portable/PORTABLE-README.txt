DotaScope 1.0.0 — Full portable build
=====================================

This folder contains everything needed for the local parser, automatic
replay parsing, the Parser lab, shared archives, and the normal DotaScope
web interface. You do not need to install Node.js, Java, 7-Zip, or the
OpenDota parser separately.

QUICK START
-----------
1. Extract this entire ZIP to a folder. Keep all folders together.
2. Double-click Setup.cmd once.
   - Accept the Windows permission prompt if asked.
   - If Steam is open, close it when Setup asks, then press Enter.
   - Setup installs the Dota 2 GSI config and sets the Dota 2 launch option
     to -gamestateintegration.
3. Start DotaScope-1.0.0-win-x64.exe.
4. In DotaScope, open Parser lab and confirm "WORKER ONLINE".
5. Play Dota 2 normally from Steam. Finished Ranked and Turbo matches are
   parsed automatically when a replay is available.

If automatic parsing does not start, open Dota 2, play/spectate a match,
and check Parser lab. Steam must be fully restarted after Setup changes the
launch option.

WHAT IS INCLUDED
----------------
- DotaScope Windows app and WebView2 host
- worker/parser-worker.mjs
- runtime/node/node.exe (Node.js 26)
- runtime/jre (minimal Java 21 runtime)
- runtime/7z/7z.exe
- runtime/parser/stats-0.1.0.jar
- runtime/gsi/gamestate_integration_dotascope.cfg
- Setup.cmd / Setup-DotaScope.ps1

OPTIONAL
--------
- The shared community archive is opt-in. Open Parser lab and turn on
  "Share parsed matches" only if you want to upload anonymised parse data.
- The app stores its history in the data folder beside the EXE. Keep that
  folder when updating DotaScope; replacing the whole app folder without
  keeping data will start a fresh local history.

TROUBLESHOOTING
---------------
- "WORKER OFFLINE": close DotaScope and reopen it from this folder. Make
  sure runtime/, worker/, and the EXE were not separated.
- Setup cannot write Dota 2 files: right-click Setup.cmd and choose
  "Run as administrator" (or install Dota 2 in a writable Steam library).
- Setup cannot change the launch option: close Steam completely, run
  Setup.cmd again, then start Steam and Dota 2.
- Manual fallback for the launch option:
  Steam > Library > Dota 2 > Properties > Launch Options:
  -gamestateintegration

PRIVACY
-------
Local parser data stays on this PC unless you explicitly enable sharing.
Shared parses contain anonymised player rows, timeline, and ward positions;
names and Steam IDs are removed, and replay files are never uploaded.

DotaScope is unofficial and is not affiliated with Valve. Dota 2 is a
trademark of Valve Corporation.
