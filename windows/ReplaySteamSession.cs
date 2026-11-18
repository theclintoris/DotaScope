using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using QRCoder;
using SteamKit2;
using SteamKit2.Authentication;
using SteamKit2.GC;
using SteamKit2.GC.Dota.Internal;
using SteamKit2.Internal;

namespace DotaScope;

internal static class ReplaySteamSession
{
    private const uint AppId = 570;
    public static string BridgeToken { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private static string? _path;
    private static readonly SemaphoreSlim LookupGate = new(1, 1);

    private sealed record Login(string Account, string Token);

    public static void Start(string dataRoot) => _path = Path.Combine(dataRoot, "replay-steam.dpapi");
    public static bool Linked => _path != null && File.Exists(_path);
    public static void Disconnect()
    {
        if (_path != null) File.Delete(_path);
    }

    public static void ShowLinkDialog(Form owner, string? activeSteamId)
    {
        using var dialog = new Form
        {
            Text = "Steam replay access",
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(380, 375),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MinimizeBox = false,
            MaximizeBox = false,
        };
        using var label = new Label
        {
            Dock = DockStyle.Top,
            Height = 76,
            Padding = new Padding(14),
            Text = "Scan with Steam Guard on a separate Steam account that has Dota 2. Steam may interrupt a game if both sessions use the same account.",
        };
        using var qr = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.CenterImage };
        using var status = new Label { Dock = DockStyle.Bottom, Height = 44, TextAlign = ContentAlignment.MiddleCenter, Text = "Connecting to Steam…" };
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(4));
        dialog.Controls.Add(qr);
        dialog.Controls.Add(label);
        dialog.Controls.Add(status);
        dialog.FormClosed += (_, _) => cancellation.Cancel();
        dialog.Shown += async (_, _) =>
        {
            try
            {
                await WithClient(async (client, _, ct) =>
                {
                    var auth = await client.Authentication.BeginAuthSessionViaQRAsync(new AuthSessionDetails
                    {
                        DeviceFriendlyName = "DotaScope Replay Collector",
                        IsPersistentSession = true,
                    }).WaitAsync(ct);

                    void ShowCode()
                    {
                        if (dialog.IsDisposed || ct.IsCancellationRequested) return;
                        string url = auth.ChallengeURL;
                        dialog.BeginInvoke(() =>
                        {
                            if (dialog.IsDisposed || ct.IsCancellationRequested) return;
                            using var data = QRCodeGenerator.GenerateQrCode(url, QRCodeGenerator.ECCLevel.M);
                            using var image = new QRCode(data);
                            qr.Image?.Dispose();
                            qr.Image = image.GetGraphic(5);
                            status.Text = "Waiting for approval in Steam Guard…";
                        });
                    }

                    auth.ChallengeURLChanged = ShowCode;
                    ShowCode();
                    var result = await auth.PollingWaitForResultAsync(ct);
                    string token = result.RefreshToken;
                    // Steam identity is available in the signed token. Refuse the active
                    // Dota account before starting any Game Coordinator session with it.
                    if (activeSteamId != null && TokenSubject(token) == activeSteamId)
                        throw new InvalidOperationException("Use a separate Steam account for replay access.");
                    byte[] bytes = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(new Login(result.AccountName, token)), null, DataProtectionScope.CurrentUser);
                    string path = _path ?? throw new InvalidOperationException("Replay access is unavailable.");
                    File.WriteAllBytes(path + ".tmp", bytes);
                    File.Move(path + ".tmp", path, true);
                    return true;
                }, cancellation.Token);
                dialog.Close();
            }
            catch (Exception ex) when (!dialog.IsDisposed && !cancellation.IsCancellationRequested)
            {
                status.Text = ex is InvalidOperationException ? ex.Message : "Steam sign-in failed. Close this window and try again.";
                qr.Image?.Dispose();
                qr.Image = null;
            }
            catch (OperationCanceledException)
            {
                if (!dialog.IsDisposed) status.Text = "Steam sign-in timed out.";
            }
            catch (Exception) when (dialog.IsDisposed || cancellation.IsCancellationRequested) { }
        };
        dialog.ShowDialog(owner);
        qr.Image?.Dispose();
    }

    private static string? TokenSubject(string token)
    {
        string field = token.Split('.')[1].Replace('-', '+').Replace('_', '/');
        field = field.PadRight((field.Length + 3) / 4 * 4, '=');
        using var payload = JsonDocument.Parse(Convert.FromBase64String(field));
        return payload.RootElement.GetProperty("sub").GetString();
    }

    public static async Task<object> LookupAsync(ulong matchId)
    {
        if (!Linked) throw new InvalidOperationException("Connect Steam replay access in Parser lab to check Valve directly.");
        if (!await LookupGate.WaitAsync(0)) throw new InvalidOperationException("Steam is checking another replay.");
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(38));
            var bytes = ProtectedData.Unprotect(File.ReadAllBytes(_path!), null, DataProtectionScope.CurrentUser);
            var login = JsonSerializer.Deserialize<Login>(bytes)!;
            return await WithClient<object>(async (client, callbacks, ct) =>
            {
                var user = client.GetHandler<SteamUser>()!;
                var gc = client.GetHandler<SteamGameCoordinator>()!;
                var loggedOn = new TaskCompletionSource<EResult>(TaskCreationOptions.RunContinuationsAsynchronously);
                using var logon = callbacks.Subscribe<SteamUser.LoggedOnCallback>(value => loggedOn.TrySetResult(value.Result));
                var welcome = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                var details = new TaskCompletionSource<CMsgGCMatchDetailsResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
                using var messages = callbacks.Subscribe<SteamGameCoordinator.MessageCallback>(value =>
                {
                    if (value.AppID != AppId) return;
                    if (value.EMsg == (uint)EGCBaseClientMsg.k_EMsgGCClientWelcome) welcome.TrySetResult();
                    if (value.EMsg == (uint)EDOTAGCMsg.k_EMsgGCMatchDetailsResponse)
                        details.TrySetResult(new ClientGCMsgProtobuf<CMsgGCMatchDetailsResponse>(value.Message).Body);
                });

                user.LogOn(new SteamUser.LogOnDetails { Username = login.Account, AccessToken = login.Token, ShouldRememberPassword = true });
                var result = await loggedOn.Task.WaitAsync(ct);
                if (result != EResult.OK) throw new InvalidOperationException("Steam replay login returned " + result + ". Reconnect the replay account if this persists.");

                var playing = new ClientMsgProtobuf<CMsgClientGamesPlayed>(EMsg.ClientGamesPlayed);
                playing.Body.games_played.Add(new CMsgClientGamesPlayed.GamePlayed { game_id = new GameID(AppId) });
                client.Send(playing);
                var hello = new ClientGCMsgProtobuf<SteamKit2.GC.Dota.Internal.CMsgClientHello>((uint)EGCBaseClientMsg.k_EMsgGCClientHello);
                hello.Body.engine = ESourceEngine.k_ESE_Source2;
                while (!welcome.Task.IsCompleted)
                {
                    gc.Send(hello, AppId);
                    await Task.WhenAny(welcome.Task, Task.Delay(2500, ct));
                    ct.ThrowIfCancellationRequested();
                }
                var request = new ClientGCMsgProtobuf<CMsgGCMatchDetailsRequest>((uint)EDOTAGCMsg.k_EMsgGCMatchDetailsRequest);
                request.Body.match_id = matchId;
                gc.Send(request, AppId);
                var response = await details.Task.WaitAsync(ct);
                var match = response.match;
                if (match == null || match.match_id != matchId || match.replay_salt == 0 || match.cluster == 0)
                    throw new InvalidOperationException("Valve has not provided a replay for this match yet.");
                var domain = match.cluster is 413 or 415 or 417 ? "dota2.com.cn" : "valve.net";
                return new
                {
                    replay_url = $"http://replay{match.cluster}.{domain}/570/{matchId}_{match.replay_salt}.dem.bz2",
                    game_mode = (int)match.game_mode,
                    lobby_type = (int)match.lobby_type,
                    start_time = match.starttime,
                };
            }, timeout.Token);
        }
        finally { LookupGate.Release(); }
    }

    private static async Task<T> WithClient<T>(Func<SteamClient, CallbackManager, CancellationToken, Task<T>> action, CancellationToken token)
    {
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token);
        var client = new SteamClient();
        var callbacks = new CallbackManager(client);
        var connected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var connection = callbacks.Subscribe<SteamClient.ConnectedCallback>(_ => connected.TrySetResult());
        using var disconnection = callbacks.Subscribe<SteamClient.DisconnectedCallback>(_ => lifetime.Cancel());
        var pump = Task.Run(async () =>
        {
            while (!lifetime.IsCancellationRequested)
                await callbacks.RunWaitCallbackAsync(lifetime.Token);
        });
        client.Connect();
        try
        {
            await connected.Task.WaitAsync(lifetime.Token);
            return await action(client, callbacks, lifetime.Token);
        }
        finally
        {
            client.Disconnect();
            lifetime.Cancel();
            try { await pump; } catch (OperationCanceledException) { }
        }
    }
}
