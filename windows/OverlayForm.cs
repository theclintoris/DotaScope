using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DotaScope;

/// <summary>
/// A small, display-only draft companion that sits above Dota 2.
/// It never injects into the game: the web page is a normal WebView2
/// document fed by the same local GSI bridge as the main window.
/// </summary>
internal sealed class OverlayForm : Form
{
    private const string AppHost = "dotascope.local";
    private const int HotkeyId = 0x4453; // "DS"
    private const int WmHotkey = 0x0312;
    private const uint ModControl = 0x0002;
    private const uint ModShift = 0x0004;
    private const int WsExTransparent = 0x00000020;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExTopmost = 0x00000008;
    private const int WsExNoActivate = 0x08000000;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private readonly CoreWebView2Environment _environment;
    private readonly string _webRoot;
    private readonly WebView2 _webView;
    private bool _initialized;
    private bool _hotkeyRegistered;

    public OverlayForm(CoreWebView2Environment environment, string webRoot)
    {
        _environment = environment;
        _webRoot = webRoot;

        Text = "DotaScope Draft Overlay";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        ClientSize = new Size(420, 560);
        BackColor = Color.FromArgb(8, 11, 16);
        DoubleBuffered = true;

        // The overlay is intentionally click-through. The hotkey is the
        // only control surface, so it cannot steal focus from Dota 2.
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(8, 11, 16),
        };
        Controls.Add(_webView);

        HandleCreated += (_, _) => RegisterOverlayHotkey();
        Load += OnLoaded;
        FormClosing += (_, _) => UnregisterOverlayHotkey();

        // Force the native handle now so the global hotkey works while
        // the overlay is hidden at startup.
        _ = Handle;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= WsExTransparent | WsExToolWindow | WsExTopmost | WsExNoActivate;
            return cp;
        }
    }

    public void ShowOverlay()
    {
        if (!Visible)
        {
            PositionOverlay();
            Show();
        }
        TopMost = true;
        BringToFront();
    }

    private void ToggleOverlay()
    {
        if (Visible)
        {
            Hide();
        }
        else
        {
            ShowOverlay();
        }
    }

    private void RegisterOverlayHotkey()
    {
        if (_hotkeyRegistered)
        {
            return;
        }

        _hotkeyRegistered = RegisterHotKey(
            Handle,
            HotkeyId,
            ModControl | ModShift,
            (uint)Keys.D);
        Program.Log(_hotkeyRegistered
            ? "draft overlay hotkey registered: Ctrl+Shift+D"
            : "draft overlay hotkey registration failed");
    }

    private void UnregisterOverlayHotkey()
    {
        if (!_hotkeyRegistered)
        {
            return;
        }

        _hotkeyRegistered = false;
        UnregisterHotKey(Handle, HotkeyId);
    }

    private void PositionOverlay()
    {
        Rectangle area = Screen.PrimaryScreen?.WorkingArea ?? Screen.GetWorkingArea(this);
        Location = new Point(
            Math.Max(area.Left, area.Right - Width - 24),
            area.Top + 96);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WmHotkey && message.WParam.ToInt32() == HotkeyId)
        {
            ToggleOverlay();
            return;
        }
        base.WndProc(ref message);
    }

    private async void OnLoaded(object? sender, EventArgs e)
    {
        if (_initialized)
        {
            return;
        }

        try
        {
            await _webView.EnsureCoreWebView2Async(_environment);
            CoreWebView2 core = _webView.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;

            core.SetVirtualHostNameToFolderMapping(
                AppHost,
                _webRoot,
                CoreWebView2HostResourceAccessKind.DenyCors);

            core.AddWebResourceRequestedFilter(
                $"https://{AppHost}/gsi/latest",
                CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnWebResourceRequested;
            core.NavigationStarting += (_, args) =>
            {
                if (!IsAppUrl(args.Uri) && !args.Uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
                {
                    args.Cancel = true;
                }
            };
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.PermissionRequested += (_, args) => args.State = CoreWebView2PermissionState.Deny;

            core.Navigate(BuildOverlayUrl());
            _initialized = true;
            Program.Log("draft overlay webview initialized");
        }
        catch (Exception ex)
        {
            Program.Log("draft overlay initialization failed: " + ex);
            Hide();
        }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (!args.Request.Uri.StartsWith($"https://{AppHost}/gsi/latest", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        byte[] json = System.Text.Encoding.UTF8.GetBytes(GsiBridge.LatestJson());
        args.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
            new MemoryStream(json),
            200,
            "OK",
            "Content-Type: application/json; charset=utf-8" + (char)13 + (char)10 + "Cache-Control: no-store");
    }

    private static string BuildOverlayUrl()
    {
        return "https://dotascope.local/index.html?runtime=desktop&overlay=1#/overlay";
    }

    private static bool IsAppUrl(string? url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out Uri? uri) &&
               uri.Scheme == Uri.UriSchemeHttps &&
               string.Equals(uri.Host, AppHost, StringComparison.OrdinalIgnoreCase);
    }
}
