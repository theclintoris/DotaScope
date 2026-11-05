using System.Net;
using System.Net.Sockets;
using System.Text;

namespace DotaScope;

/// <summary>
/// Loopback-only receiver for Dota 2 Game State Integration.
/// The game posts JSON here; the WebView2 host exposes the newest payload
/// to the local UI through https://dotascope.local/gsi/latest.
/// </summary>
internal static class GsiBridge
{
    public const int Port = 53000;
    private const int MaxBodyBytes = 4 * 1024 * 1024;
    private static readonly object Gate = new();
    private static TcpListener? _listener;
    private static string? _latestPayload;
    private static DateTimeOffset? _receivedAt;

    public static void Start()
    {
        if (_listener is not null)
        {
            return;
        }

        try
        {
            _listener = new TcpListener(IPAddress.Loopback, Port);
            _listener.Start();
            _ = Task.Run(AcceptLoopAsync);
            Program.Log($"GSI bridge listening on http://127.0.0.1:{Port}/gsi");
        }
        catch (Exception ex)
        {
            Program.Log($"GSI bridge failed to start: {ex.GetType().Name}: {ex.Message}");
        }
    }

    public static string LatestJson()
    {
        lock (Gate)
        {
            if (_latestPayload is null)
            {
                return "{\"bridge\":true,\"available\":false,\"receivedAt\":null,\"payload\":null}";
            }

            string stamp = (_receivedAt ?? DateTimeOffset.UtcNow).ToString("O");
            return "{\"bridge\":true,\"available\":true,\"receivedAt\":\""
                + stamp
                + "\",\"payload\":"
                + _latestPayload
                + "}";
        }
    }

    private static async Task AcceptLoopAsync()
    {
        while (true)
        {
            try
            {
                TcpClient client = await _listener!.AcceptTcpClientAsync().ConfigureAwait(false);
                _ = Task.Run(() => HandleClientAsync(client));
            }
            catch (Exception ex)
            {
                Program.Log($"GSI bridge accept failed: {ex.GetType().Name}: {ex.Message}");
                return;
            }
        }
    }

    private static async Task HandleClientAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 5000;
                using NetworkStream stream = client.GetStream();

                byte[] headerBuffer = new byte[16 * 1024];
                int headerBytes = 0;
                int headerEnd = -1;
                while (headerBytes < headerBuffer.Length)
                {
                    int read = await stream.ReadAsync(headerBuffer.AsMemory(headerBytes)).ConfigureAwait(false);
                    if (read == 0)
                    {
                        return;
                    }
                    headerBytes += read;
                    headerEnd = FindHeaderEnd(headerBuffer, headerBytes);
                    if (headerEnd >= 0)
                    {
                        break;
                    }
                }

                if (headerEnd < 0)
                {
                    await WriteResponseAsync(stream, 400, "{\"ok\":false}", false).ConfigureAwait(false);
                    return;
                }

                string headerText = Encoding.ASCII.GetString(headerBuffer, 0, headerEnd);
                string[] lines = headerText.Split("\r\n", StringSplitOptions.None);
                string[] requestLine = lines[0].Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (requestLine.Length < 2)
                {
                    await WriteResponseAsync(stream, 400, "{\"ok\":false}", false).ConfigureAwait(false);
                    return;
                }

                string method = requestLine[0].ToUpperInvariant();
                string path = requestLine[1].Split('?')[0];
                int contentLength = 0;
                bool expectsContinue = false;
                for (int i = 1; i < lines.Length; i++)
                {
                    int colon = lines[i].IndexOf(':');
                    if (colon <= 0)
                    {
                        continue;
                    }
                    string name = lines[i][..colon].Trim();
                    string value = lines[i][(colon + 1)..].Trim();
                    if (string.Equals(name, "Content-Length", StringComparison.OrdinalIgnoreCase))
                    {
                        int.TryParse(value, out contentLength);
                    }
                    else if (string.Equals(name, "Expect", StringComparison.OrdinalIgnoreCase) &&
                             value.Contains("100-continue", StringComparison.OrdinalIgnoreCase))
                    {
                        expectsContinue = true;
                    }
                }

                if (method == "OPTIONS")
                {
                    await WriteResponseAsync(stream, 204, string.Empty, true).ConfigureAwait(false);
                    return;
                }

                if (method == "GET" && path.Equals("/gsi/latest", StringComparison.OrdinalIgnoreCase))
                {
                    await WriteResponseAsync(stream, 200, LatestJson(), true).ConfigureAwait(false);
                    return;
                }

                if (method == "GET" && path.Equals("/health", StringComparison.OrdinalIgnoreCase))
                {
                    await WriteResponseAsync(stream, 200, "{\"ok\":true,\"service\":\"dotascope-gsi\"}", true).ConfigureAwait(false);
                    return;
                }

                if (method != "POST" || !path.Equals("/gsi", StringComparison.OrdinalIgnoreCase))
                {
                    await WriteResponseAsync(stream, 404, "{\"ok\":false}", true).ConfigureAwait(false);
                    return;
                }

                if (contentLength <= 0 || contentLength > MaxBodyBytes)
                {
                    await WriteResponseAsync(stream, 400, "{\"ok\":false,\"error\":\"invalid body size\"}", true).ConfigureAwait(false);
                    return;
                }

                if (expectsContinue)
                {
                    byte[] continueBytes = Encoding.ASCII.GetBytes("HTTP/1.1 100 Continue\r\n\r\n");
                    await stream.WriteAsync(continueBytes).ConfigureAwait(false);
                }

                byte[] body = new byte[contentLength];
                int alreadyRead = headerBytes - headerEnd - 4;
                if (alreadyRead > 0)
                {
                    int copy = Math.Min(alreadyRead, contentLength);
                    Buffer.BlockCopy(headerBuffer, headerEnd + 4, body, 0, copy);
                }

                int bodyOffset = Math.Max(0, alreadyRead);
                while (bodyOffset < contentLength)
                {
                    int read = await stream.ReadAsync(body.AsMemory(bodyOffset, contentLength - bodyOffset)).ConfigureAwait(false);
                    if (read == 0)
                    {
                        break;
                    }
                    bodyOffset += read;
                }

                if (bodyOffset < contentLength)
                {
                    await WriteResponseAsync(stream, 400, "{\"ok\":false,\"error\":\"incomplete body\"}", true).ConfigureAwait(false);
                    return;
                }

                string payload = Encoding.UTF8.GetString(body);
                if (payload.Length > 0)
                {
                    lock (Gate)
                    {
                        _latestPayload = payload;
                        _receivedAt = DateTimeOffset.UtcNow;
                    }
                }

                await WriteResponseAsync(stream, 200, "{\"ok\":true}", true).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Program.Log($"GSI request failed: {ex.GetType().Name}: {ex.Message}");
            }
        }
    }

    private static int FindHeaderEnd(byte[] buffer, int count)
    {
        for (int i = 0; i <= count - 4; i++)
        {
            if (buffer[i] == '\r' && buffer[i + 1] == '\n' &&
                buffer[i + 2] == '\r' && buffer[i + 3] == '\n')
            {
                return i;
            }
        }
        return -1;
    }

    private static async Task WriteResponseAsync(NetworkStream stream, int status, string body, bool cors)
    {
        string reason = status switch
        {
            200 => "OK",
            204 => "No Content",
            400 => "Bad Request",
            404 => "Not Found",
            _ => "OK",
        };
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        string headers = $"HTTP/1.1 {status} {reason}\r\n"
            + "Content-Type: application/json; charset=utf-8\r\n"
            + "Cache-Control: no-store\r\n"
            + "Connection: close\r\n"
            + $"Content-Length: {bytes.Length}\r\n";
        if (cors)
        {
            headers += "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: Content-Type\r\n";
        }
        headers += "\r\n";
        byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
        await stream.WriteAsync(headerBytes).ConfigureAwait(false);
        if (bytes.Length > 0)
        {
            await stream.WriteAsync(bytes).ConfigureAwait(false);
        }
    }
}
