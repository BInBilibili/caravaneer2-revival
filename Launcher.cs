/* Caravaneer 2 HTML5 Launcher v3 - 多副本可共存（相对自身目录定位 site root） */
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Runtime.InteropServices;

class Launcher
{
    static HttpListener listener;
    static string root;          // 站点根目录（相对本 exe 所在目录解析）
    static string identity;      // 本副本身份：exe 目录 + 站点根目录，用于区分「同一份」与「别的副本」
    static string url;           // 本副本实际的游戏地址
    static int port = 5174;

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;

        // 1) 站点根目录：一律相对「本 exe 所在目录」找，所以整个文件夹复制到别处（备份目录）也能跑
        string[] candidates = {
            Path.Combine(exeDir, "web", "dist"),
            Path.Combine(exeDir, "..", "web", "dist"),
            Path.Combine(exeDir, "dist"),
        };
        foreach (string c in candidates)
        {
            string full = Path.GetFullPath(c);
            if (Directory.Exists(Path.Combine(full, "data")) && File.Exists(Path.Combine(full, "index.html")))
            { root = full; break; }
        }
        if (root == null)
        {
            MessageBox.Show("Not found: web/dist. Put this exe in the project root.", "Caravaneer 2");
            return;
        }

        // 2) 身份 = 本 exe 目录 + 站点根目录：同一个 exe 双击两次会复用服务器；
        //    放在别处的副本（备份目录）算出不同身份，会另起一个端口的服务器，互不干扰。
        identity = exeDir.TrimEnd(Path.DirectorySeparatorChar) + "|" + root;

        // 3) 5174 上如果已经有「本副本」的服务器，就直接开窗口（重复双击不重复起服务器）
        // 在 5174 起依次探测「本副本自己的」服务器：同副本第二次双击要复用它，不能再起一个；
        // 探测到别的副本（身份不同）或无响应则跳过，最终由下面的循环另起端口。
        int existingPort = 0;
        for (int p = 5174; p < 5180; p++)
        {
            string id = ProbeIdentity("http://localhost:" + p + "/__launcher_id", 600);
            if (id != null && id.Trim() == identity) { existingPort = p; break; }
        }
        if (existingPort > 0)
        {
            // 本副本已经有服务器在跑：只负责再开一个窗口，并把该窗口句柄托管给那个服务器进程，
            // 这样本进程立刻退出也不会留下「没人管」的孤儿窗口（托盘 Exit 时仍能被一起关掉）。
            string u = "http://localhost:" + existingPort + "/";
            List<IntPtr> seen = GameWindowHandles();
            StartBrowserProcess(u);
            IntPtr h = WaitForNewWindow(seen, 10000);
            if (h != IntPtr.Zero) AdoptByServer(existingPort, h);
            return;
        }

        // 4) 否则自己起服务器（5174 起顺延；被别的副本/vite 占着就换下一个端口）
        for (int attempt = 0; attempt < 6; attempt++)
        {
            listener = new HttpListener();
            try
            {
                listener.Prefixes.Add("http://localhost:" + (port + attempt) + "/");
                listener.Prefixes.Add("http://127.0.0.1:" + (port + attempt) + "/");
                listener.Start();
                port = port + attempt;
                break;
            }
            catch (Exception) { if (attempt == 5) { MessageBox.Show("Port busy.", "Caravaneer 2"); return; } }
        }
        url = "http://localhost:" + port + "/";

        Thread th = new Thread(ServeLoop);
        th.IsBackground = true;
        th.Start();
        List<IntPtr> existing = GameWindowHandles();
        StartBrowserProcess(url);
        TrackNewWindow(existing);

        // 5) 退出时同步关闭游戏窗口（托盘 Exit / 任何 Application.Exit 路径都会走这里）
        Application.ApplicationExit += delegate { ShutdownBrowser(); };

        // 可选参数 --quit-after=秒数：到点自动走与托盘 Exit 完全相同的退出流程（自动化测试/无人值守用）
        int quitAfter = 0;
        foreach (string arg in Environment.GetCommandLineArgs())
        {
            if (arg.StartsWith("--quit-after=", StringComparison.OrdinalIgnoreCase))
                int.TryParse(arg.Substring("--quit-after=".Length), out quitAfter);
        }
        if (quitAfter > 0)
        {
            System.Windows.Forms.Timer autoQuit = new System.Windows.Forms.Timer();
            autoQuit.Interval = quitAfter * 1000;
            autoQuit.Tick += delegate { autoQuit.Stop(); Application.Exit(); };
            autoQuit.Start();
        }

        string label = new DirectoryInfo(exeDir.TrimEnd(Path.DirectorySeparatorChar)).Name;

        using (NotifyIcon ni = new NotifyIcon())
        {
            ni.Icon = SystemIcons.Application;
            ni.Text = ("Caravaneer 2 [" + label + "] :" + port);
            ni.Visible = true;
            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem open = new ToolStripMenuItem("Open game");
            open.Click += delegate { List<IntPtr> seen = GameWindowHandles(); StartBrowserProcess(url); TrackNewWindow(seen); };
            ToolStripMenuItem quit = new ToolStripMenuItem("Exit");
            quit.Click += delegate { ni.Visible = false; Application.Exit(); };
            menu.Items.Add(open);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(quit);
            ni.ContextMenuStrip = menu;
            ni.DoubleClick += delegate { List<IntPtr> seen = GameWindowHandles(); StartBrowserProcess(url); TrackNewWindow(seen); };
            Application.Run();
        }
    }

    static void ServeLoop()
    {
        while (listener != null && listener.IsListening)
        {
            HttpListenerContext ctx = null;
            try { ctx = listener.GetContext(); }
            catch (Exception) { break; }
            try { Handle(ctx); } catch (Exception) { }
        }
    }

    static void Handle(HttpListenerContext ctx)
    {
        string path = ctx.Request.Url.AbsolutePath;

        // 身份探针：别的副本/别的服务器不会返回这个值（vite 之类的 SPA 回退会返回 index.html）
        if (path == "/__launcher_id")
        {
            byte[] idb = Encoding.UTF8.GetBytes(identity);
            ctx.Response.ContentType = "text/plain; charset=utf-8";
            ctx.Response.ContentLength64 = idb.Length;
            ctx.Response.OutputStream.Write(idb, 0, idb.Length);
            ctx.Response.Close();
            return;
        }

        // 窗口托管：复用路径的短命进程开完窗口后把句柄交给本服务器，之后托盘 Exit 能一起关掉。
        // 只接受「确实是一个游戏窗口」的句柄，防止被拿来做奇怪的事。
        if (path == "/__adopt")
        {
            long hv;
            int apid;
            if (long.TryParse(ctx.Request.QueryString["h"], out hv) && LooksLikeGameWindow(new IntPtr(hv), out apid))
            {
                lock (ownedWindows)
                {
                    if (!ownedWindows.Contains(new IntPtr(hv))) ownedWindows.Add(new IntPtr(hv));
                }
            }
            byte[] ab = Encoding.UTF8.GetBytes("ok");
            ctx.Response.ContentType = "text/plain; charset=utf-8";
            ctx.Response.ContentLength64 = ab.Length;
            ctx.Response.OutputStream.Write(ab, 0, ab.Length);
            ctx.Response.Close();
            return;
        }

        if (path == "/") path = "/index.html";
        string file = Path.Combine(root, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(file))
        {
            ctx.Response.StatusCode = 404;
            byte[] nb = Encoding.UTF8.GetBytes("404 Not Found");
            ctx.Response.OutputStream.Write(nb, 0, nb.Length);
            ctx.Response.Close();
            return;
        }
        byte[] data = File.ReadAllBytes(file);
        ctx.Response.ContentType = Mime(file);
        ctx.Response.ContentLength64 = data.Length;
        ctx.Response.OutputStream.Write(data, 0, data.Length);
        ctx.Response.Close();
    }

    static string Mime(string file)
    {
        string e = Path.GetExtension(file).ToLowerInvariant();
        switch (e)
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".svg": return "image/svg+xml";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".mp3": return "audio/mpeg";
            case ".ogg": case ".oga": return "audio/ogg";
            case ".wav": return "audio/wav";
            default: return "application/octet-stream";
        }
    }

    // 读取另一个服务器暴露的身份；失败（连不上/404/SPA 回退）返回 null
    static string ProbeIdentity(string probeUrl, int timeoutMs)
    {
        try
        {
            WebRequest req = WebRequest.Create(probeUrl);
            req.Timeout = timeoutMs;
            using (WebResponse resp = req.GetResponse())
            using (Stream s = resp.GetResponseStream())
            using (StreamReader sr = new StreamReader(s, Encoding.UTF8))
                return sr.ReadToEnd();
        }
        catch (Exception) { return null; }
    }

    // 只负责把浏览器窗口拉起来；窗口登记/托管由调用方决定（首次启动=本进程管，复用路径=托管给服务器进程）
    // 记录进程句柄：Edge 本来没运行时我们启的就是浏览器主进程，退出时可整棵收掉；
    // Edge 已在运行时它会立刻把窗口转交给现有实例并自己退出（句柄 HasExited=true），此时靠窗口句柄定位。
    static void StartBrowserProcess(string targetUrl)
    {
        string edge = FindEdge();
        if (edge != null)
        {
            try { browserProc = Process.Start(edge, "--app=" + targetUrl + " --app-window-size=1280,800"); return; }
            catch (Exception) { }
        }
        try { Process.Start(targetUrl); }
        catch (Exception) { try { Process.Start("explorer.exe", targetUrl); } catch (Exception) { } }
    }

    static string FindEdge()
    {
        string[] cands = new string[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + "/Microsoft/Edge/Application/msedge.exe",
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + "/Microsoft/Edge/Application/msedge.exe",
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + "/Microsoft/Edge/Application/msedge.exe"
        };
        foreach (string c in cands)
        {
            if (File.Exists(c)) return c;
        }
        return null;
    }

    // ================= 游戏窗口的登记与关闭 =================
    // 为什么按窗口句柄而不是直接杀进程：Edge 已在运行时，--app 窗口是由「现有」msedge 浏览器进程创建的，
    // 直接杀进程会把用户自己的 Edge 窗口一起关掉。所以只对本副本自己开出来的窗口发 WM_CLOSE
    //（等价于点窗口右上角的 X）。多副本同时跑时，各自只关自己那个窗口。
    const int WM_CLOSE = 0x0010;
    static string gameTitle = "Caravaneer 2";
    static Process browserProc = null;
    static List<IntPtr> ownedWindows = new List<IntPtr>();

    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")]
    static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    // 只认浏览器进程的窗口，避免误关文件资源管理器里同名的文件夹窗口
    static bool IsBrowserProcess(uint pid)
    {
        try
        {
            string n = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
            return n == "msedge" || n == "msedgewebview2" || n == "chrome"
                || n == "brave" || n == "vivaldi" || n == "opera" || n == "firefox";
        }
        catch (Exception) { return false; }
    }

    static string WindowTitle(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(h, sb, 512);
        return sb.ToString();
    }

    static bool LooksLikeGameWindow(IntPtr h, out int pid)
    {
        pid = 0;
        if (!IsWindowVisible(h)) return false;
        if (WindowTitle(h).IndexOf(gameTitle, StringComparison.OrdinalIgnoreCase) < 0) return false;
        uint q;
        GetWindowThreadProcessId(h, out q);
        if (!IsBrowserProcess(q)) return false;
        pid = (int)q;
        return true;
    }

    static List<IntPtr> GameWindowHandles()
    {
        List<IntPtr> list = new List<IntPtr>();
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            int pid;
            if (LooksLikeGameWindow(h, out pid)) list.Add(h);
            return true;
        }, IntPtr.Zero);
        return list;
    }

    // 同步等一个新游戏窗口出现（给「复用已有服务器」的短命进程用），超时返回 IntPtr.Zero
    static IntPtr WaitForNewWindow(List<IntPtr> before, int timeoutMs)
    {
        for (int i = 0; i < timeoutMs / 250; i++)
        {
            Thread.Sleep(250);
            foreach (IntPtr h in GameWindowHandles())
                if (!before.Contains(h)) return h;
        }
        return IntPtr.Zero;
    }

    // 把窗口句柄托管给已经在跑的那个服务器进程（本进程马上退出，窗口不能没人管）
    static void AdoptByServer(int p, IntPtr h)
    {
        try
        {
            WebRequest req = WebRequest.Create("http://localhost:" + p + "/__adopt?h=" + h.ToInt64());
            req.Timeout = 2000;
            using (WebResponse resp = req.GetResponse()) { }
        }
        catch (Exception) { }
    }

    // 后台等新窗口出现并登记（不阻塞 UI；多副本时各登各的）
    static void TrackNewWindow(List<IntPtr> before)
    {
        Thread th = new Thread(delegate()
        {
            for (int i = 0; i < 40; i++)
            {
                Thread.Sleep(250);
                foreach (IntPtr h in GameWindowHandles())
                {
                    if (before.Contains(h)) continue;
                    bool known;
                    lock (ownedWindows) { known = ownedWindows.Contains(h); if (!known) ownedWindows.Add(h); }
                    if (!known) return;
                }
            }
        });
        th.IsBackground = true;
        th.Start();
    }

    // 该进程除了游戏窗口之外还有没有别的可见窗口（有的话绝对不能杀它）
    static int CountOtherVisibleWindows(int pid)
    {
        int n = 0;
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h)) return true;
            uint p;
            GetWindowThreadProcessId(h, out p);
            if ((int)p != pid) return true;
            string t = WindowTitle(h);
            if (t.Length == 0) return true;
            if (t.IndexOf(gameTitle, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            n++;
            return true;
        }, IntPtr.Zero);
        return n;
    }

    // ApplicationExit 时执行：先关本副本登记过的游戏窗口；
    // 只有「浏览器进程是本启动器拉起来的、且它没有别的可见窗口」时才整棵收掉
    static void ShutdownBrowser()
    {
        try
        {
            List<IntPtr> targets = new List<IntPtr>();
            lock (ownedWindows) { targets.AddRange(ownedWindows); }
            if (targets.Count == 0) targets = GameWindowHandles();   // 兜底：没登记成功时退回按标题匹配

            for (int round = 0; round < 4; round++)
            {
                int sent = 0;
                foreach (IntPtr h in targets)
                {
                    if (!IsWindow(h)) continue;
                    int pid;
                    if (!LooksLikeGameWindow(h, out pid)) continue;
                    PostMessage(h, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    sent++;
                }
                if (sent == 0) break;
                Thread.Sleep(400);
            }
            Thread.Sleep(500);
            if (browserProc != null && !browserProc.HasExited && CountOtherVisibleWindows(browserProc.Id) == 0)
            {
                try { browserProc.Kill(); } catch (Exception) { }
            }
        }
        catch (Exception) { }
    }
}
