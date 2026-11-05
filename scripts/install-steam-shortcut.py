"""Add DotaScope to Steam as a non-Steam shortcut and install artwork.

Steam must be closed while shortcuts.vdf is edited. This script shuts Steam
down gracefully, writes a backup, adds/replaces the shortcut, installs the
grid art, then restarts Steam.
"""
from __future__ import annotations

import argparse
import re
import shutil
import struct
import subprocess
import sys
import time
import winreg
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "steam-art"
EXE = ROOT / "DotaScope-1.0.0-win-x64.exe"
APP_NAME = "DotaScope"
STEAM64_BASE = 76561197960265728


def steam_root() -> Path:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
        value, _ = winreg.QueryValueEx(key, "SteamPath")
    return Path(value)


def active_account_id(root: Path) -> str:
    login = root / "config" / "loginusers.vdf"
    text = login.read_text(encoding="utf-8", errors="replace")
    users: list[tuple[int, str, str]] = []
    for match in re.finditer(r'"(\d{17})"\s*\{(.*?)\}', text, re.S):
        steamid = match.group(1)
        block = match.group(2)

        def field(name: str) -> str:
            found = re.search(rf'"{re.escape(name)}"\s*"([^"]*)"', block)
            return found.group(1) if found else ""

        timestamp = int(field("Timestamp") or 0)
        autologin = field("AutoLogin")
        users.append((timestamp, autologin, steamid))
    if not users:
        raise RuntimeError("could not find any Steam users in config/loginusers.vdf")
    autologin_users = [u for u in users if u[1] == "1"]
    steamid = max(autologin_users or users, key=lambda u: u[0])[2]
    return str(int(steamid) - STEAM64_BASE)


def cstr(value: str) -> bytes:
    return value.encode("utf-8") + b"\x00"


def enc_int(value: int) -> bytes:
    if value > 0x7FFFFFFF:
        value -= 0x100000000
    return struct.pack("<i", value)


def enc_field(key: str, value) -> bytes:
    if isinstance(value, dict):
        return b"\x00" + cstr(key) + b"".join(enc_field(k, v) for k, v in value.items()) + b"\x08"
    if isinstance(value, str):
        return b"\x01" + cstr(key) + cstr(value)
    if isinstance(value, bool):
        return b"\x02" + cstr(key) + enc_int(1 if value else 0)
    if isinstance(value, int):
        return b"\x02" + cstr(key) + enc_int(value)
    raise TypeError(f"cannot encode {key}: {type(value)}")


class VdfReader:
    def __init__(self, data: bytes):
        self.data = data
        self.i = 0

    def string(self) -> str:
        end = self.data.index(b"\x00", self.i)
        value = self.data[self.i:end].decode("utf-8", errors="replace")
        self.i = end + 1
        return value

    def object(self) -> dict:
        out = {}
        while self.i < len(self.data):
            kind = self.data[self.i]
            self.i += 1
            if kind == 0x08:
                return out
            if kind == 0x00:
                key = self.string()
                out[key] = self.object()
            elif kind == 0x01:
                key = self.string()
                out[key] = self.string()
            elif kind == 0x02:
                key = self.string()
                out[key] = struct.unpack("<i", self.data[self.i:self.i + 4])[0]
                self.i += 4
            elif kind == 0x07:
                key = self.string()
                out[key] = struct.unpack("<q", self.data[self.i:self.i + 8])[0]
                self.i += 8
            else:
                raise ValueError(f"unsupported VDF type 0x{kind:02x} at 0x{self.i - 1:x}")
        raise ValueError("unterminated VDF object")


def read_shortcuts(path: Path) -> dict:
    data = path.read_bytes()
    if not data.startswith(b"\x00shortcuts\x00"):
        raise ValueError("unexpected shortcuts.vdf header")
    reader = VdfReader(data)
    reader.i = len(b"\x00shortcuts\x00")
    return reader.object()


def write_shortcuts(path: Path, shortcuts: dict) -> None:
    data = bytearray(b"\x00shortcuts\x00")
    for key, entry in shortcuts.items():
        data += b"\x00" + cstr(key)
        for field, value in entry.items():
            data += enc_field(field, value)
        data += b"\x08"
    data += b"\x08\x08"
    temp = path.with_suffix(".vdf.dota-tmp")
    temp.write_bytes(bytes(data))
    # Validate round-trip before replacing Steam's file.
    check = VdfReader(bytes(data))
    check.i = len(b"\x00shortcuts\x00")
    reparsed = check.object()
    if reparsed != shortcuts:
        raise RuntimeError("VDF round-trip validation failed")
    temp.replace(path)


def shortcut_entry(exe: Path, appid: int, icon: Path) -> dict:
    return {
        "appid": appid,
        "AppName": APP_NAME,
        "Exe": f'"{exe}"',
        "StartDir": f'"{exe.parent}"',
        "icon": str(icon),
        "ShortcutPath": "",
        "LaunchOptions": "",
        "IsHidden": 0,
        "AllowDesktopConfig": 1,
        "AllowOverlay": 1,
        "OpenVR": 0,
        "Devkit": 0,
        "DevkitGameID": "",
        "DevkitOverrideAppID": 0,
        "LastPlayTime": 0,
        "FlatpakAppID": "",
        "sortas": APP_NAME,
        "tags": {},
    }


def process_running() -> bool:
    result = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq steam.exe", "/NH"],
        capture_output=True,
        text=True,
        check=False,
    )
    return "steam.exe" in result.stdout.lower()


def stop_steam(steam_exe: Path) -> None:
    if not process_running():
        return
    print("closing Steam...")
    subprocess.run([str(steam_exe), "-shutdown"], check=False, timeout=30)
    for _ in range(60):
        time.sleep(0.5)
        if not process_running():
            print("Steam closed.")
            return
    raise RuntimeError("Steam did not close; close it manually and retry")


def start_steam(steam_exe: Path, root: Path) -> None:
    print("starting Steam...")
    flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen([str(steam_exe)], cwd=str(root), creationflags=flags, close_fds=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-restart", action="store_true", help="leave Steam closed after writing")
    args = parser.parse_args()

    if not EXE.exists():
        raise SystemExit(f"missing executable: {EXE}")
    for name in ["steam-portrait.png", "steam-header.png", "steam-hero.png", "steam-logo.png", "steam-icon.png", "DotaScope.ico"]:
        if not (ART / name).exists():
            raise SystemExit(f"missing artwork: {ART / name}")

    root = steam_root()
    steam_exe = root / "steam.exe"
    account_id = active_account_id(root)
    config = root / "userdata" / account_id / "config"
    shortcuts_path = config / "shortcuts.vdf"
    grid = config / "grid"
    if not shortcuts_path.exists():
        raise SystemExit(f"missing shortcuts file: {shortcuts_path}")

    appid = (zlib.crc32(f"{EXE}{APP_NAME}".encode("utf-8")) & 0xFFFFFFFF) | 0x80000000
    signed_appid = appid - 2**32
    print(f"Steam root: {root}")
    print(f"account: {account_id}")
    print(f"shortcut appid: {appid} (signed {signed_appid})")
    print(f"executable: {EXE}")

    stop_steam(steam_exe)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = shortcuts_path.with_name(f"shortcuts.vdf.dota-backup-{stamp}")
    shutil.copy2(shortcuts_path, backup)
    print(f"backup: {backup}")

    shortcuts = read_shortcuts(shortcuts_path)
    entry = shortcut_entry(EXE, signed_appid, ART / "DotaScope.ico")
    # Replace an existing DotaScope entry, otherwise append after the highest slot.
    match = next((k for k, v in shortcuts.items() if v.get("AppName") == APP_NAME), None)
    if match is None:
        indices = [int(k) for k in shortcuts if k.isdigit()]
        match = str(max(indices, default=-1) + 1)
    shortcuts[match] = entry
    write_shortcuts(shortcuts_path, shortcuts)
    print(f"added shortcut slot {match}: {APP_NAME}")

    grid.mkdir(parents=True, exist_ok=True)
    art_files = {
        "steam-portrait.png": f"{appid}p.png",
        "steam-header.png": f"{appid}.png",
        "steam-hero.png": f"{appid}_hero.png",
        "steam-logo.png": f"{appid}_logo.png",
        "steam-icon.png": f"{appid}_icon.png",
    }
    for src, dst in art_files.items():
        shutil.copy2(ART / src, grid / dst)
        print(f"art -> {grid / dst}")

    # Keep a copy of the shortcut payload next to the art for easy re-import.
    (ART / "shortcut-appid.txt").write_text(
        f"appid={appid}\nsigned={signed_appid}\nslot={match}\nexe={EXE}\n", encoding="utf-8"
    )

    if not args.no_restart:
        start_steam(steam_exe, root)
        print("Steam restart requested.")
    else:
        print("Steam left closed (--no-restart).")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
