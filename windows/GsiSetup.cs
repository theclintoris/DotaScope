using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace DotaScope;

/// <summary>
/// Best-effort installation of the bundled GSI config into the local Dota 2
/// folder. The portable build includes the config; if the game directory is
/// writable this removes the manual copy step for non-technical users.
/// </summary>
internal static class GsiSetup
{
    private const string ConfigName = "gamestate_integration_dotascope.cfg";

    public static void Ensure()
    {
        try
        {
            string? source = FindConfigSource();
            if (source is null)
            {
                Program.Log("GSI config source not found");
                return;
            }

            string? destinationDirectory = FindDotaCfgDirectory();
            if (destinationDirectory is null)
            {
                Program.Log("GSI install skipped (Dota 2 cfg directory not found)");
                return;
            }

            string integrationDirectory = Path.Combine(destinationDirectory, "gamestate_integration");
            string destination = Path.Combine(integrationDirectory, ConfigName);
            string sourceText = File.ReadAllText(source);
            if (File.Exists(destination) && File.ReadAllText(destination) == sourceText)
            {
                Program.Log("GSI config already installed: " + destination);
                return;
            }

            Directory.CreateDirectory(integrationDirectory);
            File.WriteAllText(destination, sourceText);
            Program.Log("GSI config installed: " + destination);
        }
        catch (UnauthorizedAccessException)
        {
            Program.Log("GSI config install needs administrator permission");
        }
        catch (Exception ex)
        {
            Program.Log("GSI config install failed: " + ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static string PortableRoot()
    {
        string? launchDir = Environment.GetEnvironmentVariable("DOTASCOPE_LAUNCH_DIR");
        return string.IsNullOrWhiteSpace(launchDir)
            ? AppContext.BaseDirectory
            : Path.GetFullPath(launchDir);
    }

    private static string? FindConfigSource()
    {
        string[] candidates =
        {
            Path.Combine(PortableRoot(), "runtime", "gsi", ConfigName),
            Path.Combine(PortableRoot(), "public", "integrations", ConfigName),
            Path.Combine(PortableRoot(), "dist", "integrations", ConfigName),
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private static string? FindDotaCfgDirectory()
    {
        string? configured = Environment.GetEnvironmentVariable("DOTASCOPE_DOTA_CFG");
        if (!string.IsNullOrWhiteSpace(configured) && Directory.Exists(configured))
        {
            return configured;
        }

        foreach (string library in SteamLibraries())
        {
            string candidate = Path.Combine(
                library,
                "steamapps",
                "common",
                "dota 2 beta",
                "game",
                "dota",
                "cfg");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        foreach (string drive in DriveInfo.GetDrives()
                     .Where(drive => drive.DriveType == DriveType.Fixed)
                     .Select(drive => drive.RootDirectory.FullName))
        {
            string candidate = Path.Combine(
                drive,
                "Steam",
                "steamapps",
                "common",
                "dota 2 beta",
                "game",
                "dota",
                "cfg");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static IEnumerable<string> SteamLibraries()
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddSteamRoot(roots, ReadRegistry(@"Software\Valve\Steam", "SteamPath"));
        AddSteamRoot(roots, ReadRegistry(@"Software\WOW6432Node\Valve\Steam", "InstallPath"));
        AddSteamRoot(roots, @"C:\Program Files (x86)\Steam");
        AddSteamRoot(roots, @"C:\Program Files\Steam");

        foreach (string root in roots)
        {
            yield return root;
            string folders = Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(folders))
            {
                continue;
            }

            string text;
            try
            {
                text = File.ReadAllText(folders);
            }
            catch
            {
                continue;
            }

            foreach (Match match in Regex.Matches(text, "\"path\"\\s+\"([^\"]+)\""))
            {
                string path = match.Groups[1].Value.Replace("\\\\", "\\");
                if (Directory.Exists(path))
                {
                    yield return path;
                }
            }
        }
    }

    private static void AddSteamRoot(ISet<string> roots, string? path)
    {
        if (!string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
        {
            roots.Add(path);
        }
    }

    private static string? ReadRegistry(string key, string value)
    {
        try
        {
            using RegistryKey? registry = Registry.CurrentUser.OpenSubKey(key)
                ?? Registry.LocalMachine.OpenSubKey(key);
            return registry?.GetValue(value) as string;
        }
        catch
        {
            return null;
        }
    }
}
