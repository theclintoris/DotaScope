using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using Microsoft.Web.WebView2.WinForms;

namespace DotaScope;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Log("main entered");

        string dataRoot;
        try
        {
            dataRoot = ResolveDataRoot();
            ConfigureTemp(dataRoot);
            Log($"data root: {dataRoot}");
        }
        catch (Exception ex)
        {
            Log("data root failed: " + ex);
            return;
        }

        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Log("winforms initialized");
        }
        catch (Exception ex)
        {
            // Visual styles are cosmetic; keep the app usable if the host
            // blocks the activation-context temp file.
            Log("winforms styling unavailable: " + ex.GetType().Name);
        }

        Log($"startup exe={Application.ExecutablePath} local={Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}");

        TryPrepareWebView2Loader(dataRoot);
        GsiSetup.Ensure();
        GsiBridge.Start();

        string webRoot;
        try
        {
            webRoot = ExtractWebAssets(dataRoot);
        }
        catch (Exception ex)
        {
            Log("asset extraction failed: " + ex);
            MessageBox.Show(
                "DotaScope could not unpack its bundled interface.\n\n" + ex.Message,
                "DotaScope",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        Log($"web root ready: {webRoot}");
        WorkerRuntime.Start(dataRoot);
        try
        {
            Application.Run(new MainForm(webRoot, dataRoot));
        }
        finally
        {
            WorkerRuntime.Stop();
        }
    }

    private static void ConfigureTemp(string dataRoot)
    {
        string tempRoot = Path.Combine(dataRoot, "temp");
        Directory.CreateDirectory(tempRoot);
        Environment.SetEnvironmentVariable("TMP", tempRoot, EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("TEMP", tempRoot, EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("TMPDIR", tempRoot, EnvironmentVariableTarget.Process);
        Log($"temp root: {Path.GetTempPath()}");
    }

    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetDllDirectory(string path);

    private static void TryPrepareWebView2Loader(string dataRoot)
    {
        // WebView2Loader is loaded by native P/Invoke inside WebView2. A
        // single-file publish can extract it into the .NET bundle directory
        // without that directory being searched by LoadLibrary. Unpack our
        // own copy next to the app data and point the native loader at it.
        try
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            const string resourceName = "DotaScope.WebView2Loader.dll";
            using Stream? source = assembly.GetManifestResourceStream(resourceName);
            if (source is null)
            {
                Log("WebView2 loader resource missing");
                return;
            }

            string loaderPath = Path.Combine(dataRoot, "WebView2Loader.dll");
            string temporaryPath = loaderPath + ".tmp-" + Guid.NewGuid().ToString("N");
            using (FileStream destination = File.Create(temporaryPath))
            {
                source.CopyTo(destination);
            }
            File.Move(temporaryPath, loaderPath, overwrite: true);

            SetDllDirectory(dataRoot);
            NativeLibrary.Load(loaderPath);
            Log($"WebView2 loader ready: {loaderPath}");
        }
        catch (Exception ex)
        {
            // The app will still try the regular bundle search path.
            Log("WebView2 loader preparation failed: " + ex);
        }
    }

    private static string ResolveDataRoot()
    {
        string? configured = Environment.GetEnvironmentVariable("DOTASCOPE_DATA_DIR");
        var candidates = new[]
        {
            configured,
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DotaScope"),
            Path.Combine(AppContext.BaseDirectory, "data"),
        };

        foreach (string? candidate in candidates)
        {
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            try
            {
                Directory.CreateDirectory(candidate);
                string probe = Path.Combine(candidate, ".write-test-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return candidate;
            }
            catch (Exception ex)
            {
                Log($"data candidate rejected: {candidate} ({ex.GetType().Name}: {ex.Message})");
            }
        }

        throw new IOException("No writable data directory is available.");
    }

    internal static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(AppContext.BaseDirectory, "startup.log"),
                $"{DateTime.Now:O} {message}{Environment.NewLine}");
        }
        catch
        {
            // Diagnostics must never stop the app from starting.
        }
    }

    private static string ExtractWebAssets(string cacheRoot)
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        string[] resources = assembly.GetManifestResourceNames();
        Log("resources: " + string.Join(", ", resources));
        string resourceName = resources
            .FirstOrDefault(name => name.EndsWith("DotaScope.web.zip", StringComparison.Ordinal))
            ?? throw new InvalidOperationException("Bundled web assets are missing.");

        using Stream resource = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Bundled web assets could not be opened.");

        string hash;
        using (SHA256 sha = SHA256.Create())
        {
            hash = Convert.ToHexString(sha.ComputeHash(resource)).ToLowerInvariant()[..12];
        }
        resource.Position = 0;

        string webRoot = Path.Combine(cacheRoot, "web-" + hash);
        string indexFile = Path.Combine(webRoot, "index.html");
        Log($"resource={resourceName} cache={cacheRoot} hash={hash}");

        if (File.Exists(indexFile))
        {
            return webRoot;
        }

        string staging = webRoot + "-" + Guid.NewGuid().ToString("N");
        Log($"extracting to {staging}");
        Directory.CreateDirectory(staging);
        using (var archive = new ZipArchive(resource, ZipArchiveMode.Read, leaveOpen: false))
        {
            archive.ExtractToDirectory(staging, overwriteFiles: true);
        }
        Log("extraction complete");

        if (!File.Exists(Path.Combine(staging, "index.html")))
        {
            throw new InvalidDataException("The bundled interface is incomplete.");
        }

        Directory.CreateDirectory(cacheRoot);
        Log($"cache ready at {cacheRoot}");
        try
        {
            Directory.Move(staging, webRoot);
        }
        catch (IOException) when (File.Exists(indexFile))
        {
            // Another instance finished extracting first; use its copy.
            Directory.Delete(staging, recursive: true);
        }

        return webRoot;
    }

    internal static void OpenExternal(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) ||
            !Uri.TryCreate(url, UriKind.Absolute, out Uri? uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch
        {
            // A missing default browser should never take down the app.
        }
    }
}

internal sealed class MainForm : Form
{
    private readonly string _webRoot;
    private readonly WebView2 _webView;
    private readonly string _cacheRoot;

    public MainForm(string webRoot, string cacheRoot)
    {
        _webRoot = webRoot;
        _cacheRoot = cacheRoot;

        Text = "DotaScope";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1440, 960);
        MinimumSize = new Size(1024, 680);
        BackColor = Color.FromArgb(8, 11, 16);
        try
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }
        catch
        {
            // The embedded exe icon is only a cosmetic nicety.
        }

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(8, 11, 16),
        };
        Controls.Add(_webView);
        Load += OnLoaded;
    }

    private async void OnLoaded(object? sender, EventArgs e)
    {
        try
        {
            string userDataFolder = Path.Combine(_cacheRoot, "WebView2");
            Directory.CreateDirectory(userDataFolder);
            Program.Log($"creating webview env; userData={userDataFolder}");

            var options = new CoreWebView2EnvironmentOptions();
            string? debugPort = Environment.GetEnvironmentVariable("DOTASCOPE_DEBUG_PORT");
            if (!string.IsNullOrWhiteSpace(debugPort) && int.TryParse(debugPort, out int port))
            {
                options.AdditionalBrowserArguments = $"--remote-debugging-port={port}";
            }

            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder,
                options: options);

            await _webView.EnsureCoreWebView2Async(environment);
            CoreWebView2 core = _webView.CoreWebView2;

            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = true;

            core.SetVirtualHostNameToFolderMapping(
                ProgramHost,
                _webRoot,
                CoreWebView2HostResourceAccessKind.DenyCors);

            core.AddWebResourceRequestedFilter(
                $"https://{ProgramHost}/gsi/latest",
                CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, args) =>
            {
                if (!args.Request.Uri.StartsWith(
                        $"https://{ProgramHost}/gsi/latest",
                        StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                byte[] json = Encoding.UTF8.GetBytes(GsiBridge.LatestJson());
                args.Response = core.Environment.CreateWebResourceResponse(
                    new MemoryStream(json),
                    200,
                    "OK",
                    "Content-Type: application/json; charset=utf-8" + (char)13 + (char)10 + "Cache-Control: no-store");
            };

            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (IsAppUrl(args.Uri))
                {
                    core.Navigate(args.Uri);
                }
                else
                {
                    Program.OpenExternal(args.Uri);
                }
            };

            core.NavigationStarting += (_, args) =>
            {
                if (IsAppUrl(args.Uri) || args.Uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                args.Cancel = true;
                Program.OpenExternal(args.Uri);
            };

            core.PermissionRequested += (_, args) =>
            {
                args.State = CoreWebView2PermissionState.Deny;
            };

            core.DocumentTitleChanged += (_, _) =>
            {
                Text = string.IsNullOrWhiteSpace(core.DocumentTitle)
                    ? "DotaScope"
                    : core.DocumentTitle;
            };

            core.Navigate(BuildStartUrl());
        }
        catch (Exception ex)
        {
            Program.Log("webview init failed: " + ex);
            string message = ex.HResult == unchecked((int)0x8007139F)
                ? "DotaScope could not open its WebView2 window because another instance or WebView2 process is still using its profile. Close DotaScope, wait a moment, and try again.\n\n" + ex.Message
                : "DotaScope requires the Microsoft Edge WebView2 runtime.\n\n" +
                  "Install it from https://developer.microsoft.com/microsoft-edge/webview2/ and try again.\n\n" + ex.Message;
            MessageBox.Show(
                message,
                "DotaScope could not start",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private const string ProgramHost = "dotascope.local";

    private static string BuildStartUrl()
    {
        string url = "https://dotascope.local/index.html?runtime=desktop";
        try
        {
            string? steamId64 = ReadSteamId64();
            if (!string.IsNullOrWhiteSpace(steamId64))
            {
                url += "&steamid64=" + Uri.EscapeDataString(steamId64);
                Program.Log($"steam account detected: {steamId64}");
            }
        }
        catch (Exception ex)
        {
            Program.Log("steam account detection failed: " + ex.GetType().Name);
        }
        return url + "#/";
    }

    private static string? ReadSteamId64()
    {
        string? steamPath = Registry.GetValue(
            @"HKEY_CURRENT_USER\Software\Valve\Steam",
            "SteamPath",
            null) as string;
        if (string.IsNullOrWhiteSpace(steamPath))
        {
            steamPath = @"C:\Program Files (x86)\Steam";
        }

        string loginUsers = Path.Combine(steamPath, "config", "loginusers.vdf");
        if (!File.Exists(loginUsers))
        {
            Program.Log("Steam loginusers.vdf not found");
            return null;
        }

        string text = File.ReadAllText(loginUsers);
        MatchCollection blocks = Regex.Matches(
            text,
            "\"([0-9]{17})\"\\s*\\{(?<body>[^}]*)\\}",
            RegexOptions.Singleline);
        string? fallback = null;
        foreach (Match block in blocks)
        {
            fallback ??= block.Groups[1].Value;
            string body = block.Groups["body"].Value;
            if (Regex.IsMatch(body, "\"MostRecent\"\\s*\"1\""))
            {
                return block.Groups[1].Value;
            }
        }
        return fallback;
    }

    private static bool IsAppUrl(string? url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out Uri? uri) &&
               uri.Scheme == Uri.UriSchemeHttps &&
               string.Equals(uri.Host, ProgramHost, StringComparison.OrdinalIgnoreCase);
    }
}
