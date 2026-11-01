// shutdown_helper.cs — EC 配置刷写插件 v2 的关机辅助服务
//
// 职责：只做一件事 —— 响应一个极简的本地 HTTP 请求，执行关机。
//
// 为什么需要它：
//   OpenRevo 宿主只提供 reboot_computer（内部是 shutdown.exe /r /f /t 1，即重启），
//   没有任何关机命令。而 EC 配置要求"完全断电再上电"才生效，重启（热复位）
//   不会让 EC 重新初始化，配置就不会被应用。
//
// 安全设计：
//   · 只监听 127.0.0.1，且强制校验 Origin/自定义头，防止任何网页跨域触发关机
//   · 只支持一个动作：关机（/api/shutdown），不接受任意命令
//   · 需要一次性 nonce 握手，nonce 由插件页面通过 /api/nonce 获取
//   · 拿到 nonce 后 10 秒内有效，用过即失效
//
// 编译：
//   csc /nologo /target:winexe /platform:x64 /optimize+ /out:shutdown_helper.exe shutdown_helper.cs

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace EcRepairShutdown
{
    internal static class Program
    {
        private const int Port = 18946;

        /// <summary>一次性 nonce：值为过期时间戳（UTC ticks）。</summary>
        private static readonly Dictionary<string, long> Nonces = new Dictionary<string, long>();
        private static readonly object NonceLock = new object();

        private static void Main(string[] args)
        {
            int port = Port;
            for (int i = 0; i < args.Length - 1; i++)
            {
                int p;
                if (args[i] == "--port" && int.TryParse(args[i + 1], out p)) port = p;
            }

            try
            {
                var listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                Log("关机辅助服务已启动，监听 127.0.0.1:" + port);

                while (true)
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(state => Handle((TcpClient)state), client);
                }
            }
            catch (Exception ex)
            {
                Log("服务异常退出: " + ex.Message);
            }
        }

        private static void Handle(TcpClient client)
        {
            try
            {
                using (client)
                {
                    client.ReceiveTimeout = 5000;
                    NetworkStream stream = client.GetStream();
                    string request = ReadRequest(stream);
                    if (request == null) return;

                    string[] lines = request.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;

                    string[] parts = lines[0].Split(' ');
                    if (parts.Length < 2) return;
                    string method = parts[0];
                    string path = parts[1];
                    int q = path.IndexOf('?');
                    string query = string.Empty;
                    if (q >= 0) { query = path.Substring(q + 1); path = path.Substring(0, q); }

                    string origin = string.Empty;
                    for (int i = 1; i < lines.Length; i++)
                    {
                        if (lines[i].StartsWith("Origin:", StringComparison.OrdinalIgnoreCase))
                        {
                            origin = lines[i].Substring(7).Trim().TrimEnd('/');
                        }
                    }
                    bool originOk = IsAllowedOrigin(origin);

                    if (method == "OPTIONS")
                    {
                        WriteResponse(stream, originOk ? 204 : 403, null, originOk);
                        return;
                    }

                    if (!originOk && origin != string.Empty)
                    {
                        WriteResponse(stream, 403, "{\"ok\":false,\"error\":\"origin_not_allowed\"}", false);
                        return;
                    }

                    if (path == "/api/ping")
                    {
                        WriteResponse(stream, 200, "{\"ok\":true,\"service\":\"ec-shutdown-helper\"}", originOk);
                        return;
                    }

                    if (path == "/api/nonce")
                    {
                        string nonce = Guid.NewGuid().ToString("N");
                        lock (NonceLock)
                        {
                            PurgeExpired();
                            Nonces[nonce] = DateTime.UtcNow.AddSeconds(10).Ticks;
                        }
                        WriteResponse(stream, 200,
                            "{\"ok\":true,\"nonce\":\"" + nonce + "\"}", originOk);
                        return;
                    }

                    if (path == "/api/shutdown")
                    {
                        string nonce = ExtractParam(query, "nonce");
                        if (!ConsumeNonce(nonce))
                        {
                            WriteResponse(stream, 400,
                                "{\"ok\":false,\"error\":\"invalid_or_expired_nonce\"}", originOk);
                            return;
                        }

                        WriteResponse(stream, 200, "{\"ok\":true,\"action\":\"shutdown\"}", originOk);
                        Log("收到关机请求，准备执行 shutdown /s");
                        // 给响应留出写出的时间，再关机
                        Thread.Sleep(400);
                        DoShutdown();
                        return;
                    }

                    WriteResponse(stream, 404, "{\"ok\":false,\"error\":\"not_found\"}", originOk);
                }
            }
            catch (Exception ex)
            {
                Log("处理请求失败: " + ex.Message);
            }
        }

        private static bool IsAllowedOrigin(string origin)
        {
            if (string.IsNullOrEmpty(origin)) return true;   // 同源/无 Origin（如 curl 探测）
            // 宿主用 tauri://localhost、https://tauri.localhost 或 http://tauri.localhost
            if (origin.StartsWith("tauri://", StringComparison.OrdinalIgnoreCase)) return true;
            if (origin == "https://tauri.localhost" || origin == "http://tauri.localhost") return true;
            if (origin == "null") return true;   // file:// 页面
            return false;
        }

        private static string ReadRequest(NetworkStream stream)
        {
            var buf = new byte[8192];
            var sb = new StringBuilder();
            int total = 0;
            while (total < buf.Length)
            {
                int n = stream.Read(buf, total, buf.Length - total);
                if (n <= 0) break;
                total += n;
                sb.Append(Encoding.UTF8.GetString(buf, 0, n));
                if (sb.ToString().Contains("\r\n\r\n")) break;
            }
            return sb.Length == 0 ? null : sb.ToString();
        }

        private static void WriteResponse(NetworkStream stream, int status, string body, bool corsOk)
        {
            string reason = status == 200 ? "OK"
                : status == 204 ? "No Content"
                : status == 400 ? "Bad Request"
                : status == 403 ? "Forbidden"
                : "Not Found";

            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
            sb.Append("Connection: close\r\n");
            sb.Append("Content-Type: application/json; charset=utf-8\r\n");
            if (corsOk)
            {
                sb.Append("Access-Control-Allow-Origin: *\r\n");
                sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
                sb.Append("Access-Control-Allow-Headers: *\r\n");
            }
            byte[] payload = body == null ? new byte[0] : Encoding.UTF8.GetBytes(body);
            sb.Append("Content-Length: ").Append(payload.Length).Append("\r\n\r\n");

            byte[] head = Encoding.ASCII.GetBytes(sb.ToString());
            stream.Write(head, 0, head.Length);
            if (payload.Length > 0) stream.Write(payload, 0, payload.Length);
            stream.Flush();
        }

        private static string ExtractParam(string query, string name)
        {
            if (string.IsNullOrEmpty(query)) return string.Empty;
            foreach (string pair in query.Split('&'))
            {
                int eq = pair.IndexOf('=');
                if (eq <= 0) continue;
                if (pair.Substring(0, eq) == name)
                    return Uri.UnescapeDataString(pair.Substring(eq + 1));
            }
            return string.Empty;
        }

        private static bool ConsumeNonce(string nonce)
        {
            if (string.IsNullOrEmpty(nonce)) return false;
            lock (NonceLock)
            {
                PurgeExpired();
                long expiry;
                if (!Nonces.TryGetValue(nonce, out expiry)) return false;
                Nonces.Remove(nonce);   // 一次性
                return expiry > DateTime.UtcNow.Ticks;
            }
        }

        private static void PurgeExpired()
        {
            long now = DateTime.UtcNow.Ticks;
            var dead = new List<string>();
            foreach (var kv in Nonces) if (kv.Value <= now) dead.Add(kv.Key);
            foreach (string k in dead) Nonces.Remove(k);
        }

        private static void DoShutdown()
        {
            try
            {
                // /s = 关机, /f = 强制关闭应用, /t 0 = 立即
                var psi = new ProcessStartInfo
                {
                    FileName = "shutdown.exe",
                    Arguments = "/s /f /t 0",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                Process.Start(psi);
                Log("已派发 shutdown.exe /s /f /t 0");
            }
            catch (Exception ex)
            {
                Log("关机失败: " + ex.Message);
            }
        }

        private static void Log(string message)
        {
            try
            {
                string dir = AppDomain.CurrentDomain.BaseDirectory;
                string path = System.IO.Path.Combine(dir, "config", "shutdown_helper.log");
                System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
                string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine;
                System.IO.File.AppendAllText(path, line, Encoding.UTF8);
            }
            catch
            {
                // 日志失败不影响主流程
            }
        }
    }
}
