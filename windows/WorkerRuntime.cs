using System.Diagnostics;
using System.Net.Http;

namespace DotaScope;

/// <summary>
/// Owns the optional local parser worker for the lifetime of the app.
/// The worker is deliberately best-effort: a downloaded single-file build
/// without the worker checkout must still open normally.
/// </summary>
internal static class WorkerRuntime
{
    private const string WorkerHealthUrl = "http://127.0.0.1:5601/health";
    private static readonly HttpClient HealthClient = new()
    {
        Timeout = TimeSpan.FromMilliseconds(600),
    };
    private static readonly object LogLock = new();
    private static Process? _worker;
    private static bool _ownsWorker;

    public static void Start(string dataRoot)
    {
        if (Environment.GetEnvironmentVariable("DOTASCOPE_DISABLE_WORKER") == "1")
        {
            Program.Log("parser worker auto-start disabled");
            return;
        }

        if (IsHealthy())
        {
            Program.Log("parser worker already online; leaving it alone");
            return;
        }

        string? node = FindNode();
        string? script = FindWorkerScript();
        if (node is null || script is null)
        {
            Program.Log($"parser worker auto-start skipped (node={node ?? "missing"}, script={script ?? "missing"})");
            return;
        }

        try
        {
            var start = new ProcessStartInfo
            {
                FileName = node,
                WorkingDirectory = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(script)!, "..")),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            start.ArgumentList.Add(script);

            var worker = new Process { StartInfo = start };
            worker.OutputDataReceived += (_, args) => AppendWorkerLog(dataRoot, args.Data);
            worker.ErrorDataReceived += (_, args) => AppendWorkerLog(dataRoot, args.Data);
            if (!worker.Start())
            {
                worker.Dispose();
                Program.Log("parser worker failed to start");
                return;
            }

            _worker = worker;
            _ownsWorker = true;
            worker.BeginOutputReadLine();
            worker.BeginErrorReadLine();
            Program.Log($"parser worker started: pid={worker.Id}, script={script}");

            for (int attempt = 0; attempt < 15; attempt++)
            {
                if (IsHealthy())
                {
                    Program.Log("parser worker health check passed");
                    return;
                }
                Thread.Sleep(200);
            }
            Program.Log("parser worker started but health check is not ready yet");
        }
        catch (Exception ex)
        {
            Program.Log("parser worker auto-start failed: " + ex);
        }
    }

    public static void Stop()
    {
        Process? worker = _worker;
        _worker = null;
        if (!_ownsWorker || worker is null)
        {
            _ownsWorker = false;
            return;
        }

        _ownsWorker = false;
        try
        {
            if (!worker.HasExited)
            {
                worker.Kill(entireProcessTree: true);
                worker.WaitForExit(5000);
            }
            Program.Log($"parser worker stopped: pid={worker.Id}");
        }
        catch (Exception ex)
        {
            Program.Log("parser worker stop failed: " + ex);
        }
        finally
        {
            worker.Dispose();
        }
    }

    private static bool IsHealthy()
    {
        try
        {
            using HttpResponseMessage response = HealthClient.GetAsync(WorkerHealthUrl).GetAwaiter().GetResult();
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static string? FindNode()
    {
        string? configured = Environment.GetEnvironmentVariable("DOTASCOPE_NODE");
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured))
        {
            return configured;
        }

        var candidates = new List<string>
        {
            @"C:\Program Files\nodejs\node.exe",
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "nodejs",
                "node.exe"),
        };
        string? path = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrWhiteSpace(path))
        {
            candidates.AddRange(
                path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
                    .Select(directory => Path.Combine(directory.Trim(), "node.exe")));
        }

        return candidates.FirstOrDefault(File.Exists);
    }

    private static string? FindWorkerScript()
    {
        string? configured = Environment.GetEnvironmentVariable("DOTASCOPE_WORKER");
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured))
        {
            return Path.GetFullPath(configured);
        }

        var roots = new List<string>
        {
            Environment.GetEnvironmentVariable("DOTASCOPE_LAUNCH_DIR") ?? string.Empty,
            AppContext.BaseDirectory,
            Directory.GetCurrentDirectory(),
        };

        foreach (string root in roots.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            DirectoryInfo? directory;
            try
            {
                directory = new DirectoryInfo(root);
            }
            catch
            {
                continue;
            }

            for (int depth = 0; depth < 4 && directory is not null; depth++)
            {
                string candidate = Path.Combine(directory.FullName, "worker", "parser-worker.mjs");
                if (File.Exists(candidate))
                {
                    return candidate;
                }
                directory = directory.Parent;
            }
        }

        return null;
    }

    private static void AppendWorkerLog(string dataRoot, string? line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return;
        }

        try
        {
            lock (LogLock)
            {
                File.AppendAllText(
                    Path.Combine(dataRoot, "worker.log"),
                    DateTime.Now.ToString("o") + " " + line + Environment.NewLine);
            }
        }
        catch
        {
            // Worker logging must never affect the UI.
        }
    }
}
