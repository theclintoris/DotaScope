using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("DotaScope")]
[assembly: AssemblyProduct("DotaScope")]
[assembly: AssemblyCompany("DotaScope")]
[assembly: AssemblyDescription("DotaScope launcher")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace DotaScopeLauncher
{
    internal static class Program
    {
        private const string ResourceName = "DotaScope.App";
        private const string InstanceMutexName = @"Local\DotaScope.SingleInstance";
        private const int SwRestore = 9;
        private const int JobObjectExtendedLimitInformation = 9;
        private const uint JobObjectLimitKillOnJobClose = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        private struct JobBasicLimitInformation
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobIoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobExtendedLimitInformation
        {
            public JobBasicLimitInformation BasicLimitInformation;
            public JobIoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr window);

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr window, int command);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(
            IntPtr job,
            int informationClass,
            ref JobExtendedLimitInformation information,
            uint informationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [STAThread]
        private static int Main(string[] args)
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, InstanceMutexName, out createdNew))
            {
                if (!createdNew)
                {
                    FocusRunningInstance();
                    return 0;
                }

                return Run(args);
            }
        }

        private static int Run(string[] args)
        {
            try
            {
                string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string root = FindWritableRoot(Path.Combine(local, "DotaScope"));
                string bundle = Path.Combine(root, "bundle");
                Directory.CreateDirectory(bundle);
                Environment.SetEnvironmentVariable("DOTASCOPE_DATA_DIR", root);
                Environment.SetEnvironmentVariable(
                    "DOTASCOPE_LAUNCH_DIR",
                    AppDomain.CurrentDomain.BaseDirectory);
                Log(root, "launcher started");

                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream resource = assembly.GetManifestResourceStream(ResourceName))
                {
                    if (resource == null)
                    {
                        throw new InvalidOperationException("The bundled DotaScope runtime is missing.");
                    }

                    string hash;
                    using (SHA256 sha = SHA256.Create())
                    {
                        byte[] digest = sha.ComputeHash(resource);
                        hash = BitConverter.ToString(digest).Replace("-", "").Substring(0, 16).ToLowerInvariant();
                    }
                    resource.Position = 0;

                    string runtimeDir = Path.Combine(root, "runtime", hash);
                    Directory.CreateDirectory(runtimeDir);
                    string appPath = Path.Combine(runtimeDir, "DotaScope-app.exe");

                    if (!File.Exists(appPath) || new FileInfo(appPath).Length != resource.Length)
                    {
                        string temporary = appPath + ".tmp";
                        using (FileStream output = File.Create(temporary))
                        {
                            resource.CopyTo(output);
                        }
                        if (File.Exists(appPath))
                        {
                            File.Delete(appPath);
                        }
                        File.Move(temporary, appPath);
                    }

                    Environment.SetEnvironmentVariable("DOTNET_BUNDLE_EXTRACT_BASE_DIR", bundle);

                    ProcessStartInfo start = new ProcessStartInfo
                    {
                        FileName = appPath,
                        WorkingDirectory = runtimeDir,
                        UseShellExecute = false,
                    };
                    if (args != null && args.Length > 0)
                    {
                        start.Arguments = JoinArguments(args);
                    }

                    IntPtr job = IntPtr.Zero;
                    using (Process child = Process.Start(start))
                    {
                        if (child == null)
                        {
                            throw new InvalidOperationException("DotaScope did not start.");
                        }

                        // Keep the child, WebView2, worker, and Java parser inside one
                        // kill-on-close job so Steam Stop cannot orphan them.
                        job = CreateJobObject(IntPtr.Zero, null);
                        if (job != IntPtr.Zero)
                        {
                            JobExtendedLimitInformation limits = new JobExtendedLimitInformation();
                            limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
                            if (!SetInformationJobObject(
                                    job,
                                    JobObjectExtendedLimitInformation,
                                    ref limits,
                                    (uint)Marshal.SizeOf(typeof(JobExtendedLimitInformation)))
                                || !AssignProcessToJobObject(job, child.Handle))
                            {
                                Log(root, "launcher job setup failed: " + Marshal.GetLastWin32Error());
                                CloseHandle(job);
                                job = IntPtr.Zero;
                            }
                        }

                        try
                        {
                            child.WaitForExit();
                            return child.ExitCode;
                        }
                        finally
                        {
                            if (job != IntPtr.Zero)
                            {
                                CloseHandle(job);
                            }
                        }
                    }
                }
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "DotaScope could not start.\n\n" + error.Message,
                    "DotaScope",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
        }

        private static void FocusRunningInstance()
        {
            for (int attempt = 0; attempt < 20; attempt++)
            {
                Process[] processes = Process.GetProcessesByName("DotaScope-app");
                foreach (Process process in processes)
                {
                    try
                    {
                        IntPtr window = process.MainWindowHandle;
                        if (window != IntPtr.Zero)
                        {
                            ShowWindowAsync(window, SwRestore);
                            SetForegroundWindow(window);
                            return;
                        }
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }

                Thread.Sleep(150);
            }

            MessageBox.Show(
                "DotaScope is already running. Close the existing window before starting another instance.",
                "DotaScope",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        private static string FindWritableRoot(string preferred)
        {
            string[] candidates =
            {
                preferred,
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "DotaScope"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "data"),
            };

            foreach (string candidate in candidates)
            {
                try
                {
                    Directory.CreateDirectory(candidate);
                    string probe = Path.Combine(candidate, ".write-probe");
                    File.WriteAllText(probe, "ok");
                    File.Delete(probe);
                    return candidate;
                }
                catch (Exception)
                {
                    // Try the next location. Sandboxed hosts can deny LocalAppData.
                }
            }

            throw new IOException("No writable application data directory was available.");
        }

        private static void Log(string root, string message)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(root, "launcher.log"),
                    DateTime.Now.ToString("o") + " " + message + Environment.NewLine);
            }
            catch (Exception)
            {
                // Logging is best effort.
            }
        }

        private static string JoinArguments(string[] args)
        {
            string[] quoted = new string[args.Length];
            for (int index = 0; index < args.Length; index++)
            {
                quoted[index] = "\"" + args[index].Replace("\"", "\\\"") + "\"";
            }
            return string.Join(" ", quoted);
        }
    }
}
