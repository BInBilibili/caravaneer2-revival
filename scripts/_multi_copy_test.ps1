
param([int]$AutoQuit = 28)

$root = 'D:\game\Caravaneer 2 deepseek'
$copy = Join-Path $root '_backup_copy_test'
$copyExe = Join-Path $copy 'Caravaneer2-Launcher.exe'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static string Dump() {
    var sb = new StringBuilder();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      var s = new StringBuilder(512); GetWindowText(h, s, 512);
      if (s.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      sb.AppendLine(pid + "|" + h.ToInt64() + "|" + s.ToString());
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }
  public static int CloseTitled(string needle) {
    int n = 0;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      var s = new StringBuilder(512); GetWindowText(h, s, 512);
      if (s.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) { PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); n++; }
      return true;
    }, IntPtr.Zero);
    return n;
  }
}
"@

function TestLaunchers {
  @(Get-CimInstance Win32_Process -Filter "Name='Caravaneer2-Launcher.exe'" |
    Where-Object { $_.ExecutablePath -like ('*_backup_copy_test*') } |
    ForEach-Object { $_.ProcessId })
}
function AllLaunchers { @(Get-Process -Name 'Caravaneer2-Launcher' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) }
function PortList { @(netstat -ano | Select-String 'LISTENING' | Select-String ':517[3-9] ' | ForEach-Object { ($_.Line.Trim() -split '\s+')[1] } | Sort-Object -Unique) }
function WinList {
  $out = @()
  foreach ($line in ([W]::Dump() -split "\r?\n")) {
    if (-not $line) { continue }
    $p = $line -split '\|', 3
    if ($p[2] -notmatch 'Caravaneer 2') { continue }
    $proc = try { (Get-Process -Id ([int]$p[0]) -ErrorAction Stop).ProcessName } catch { '?' }
    if ($proc -notmatch 'msedge|chrome') { continue }
    $tag = if ($p[2] -match 'BACKUP') { 'BACKUP' } else { 'MAIN' }
    $out += ($tag + " pid=" + $p[0])
  }
  $out
}
function TitleOf([int]$port) {
  try { $r = Invoke-WebRequest -Uri ("http://localhost:" + $port + "/") -UseBasicParsing -TimeoutSec 4
    return ("HTTP " + $r.StatusCode + " " + [regex]::Match($r.Content, '<title>([^<]*)</title>').Groups[1].Value) }
  catch { return "FAILED" }
}
function Report([string]$tag) {
  Write-Output ("===== " + $tag + " =====")
  Write-Output ("all launcher PIDs : " + ((AllLaunchers) -join ','))
  Write-Output ("test launcher PIDs: " + ((TestLaunchers) -join ','))
  Write-Output ("ports 517x        : " + ((PortList) -join ' '))
  Write-Output ("5174 (yours)      : " + (TitleOf 5174))
  Write-Output ("5175              : " + (TitleOf 5175))
  Write-Output ("5176              : " + (TitleOf 5176))
  Write-Output ("game windows      : " + ((WinList) -join ' | '))
}

# ---- 清掉上次实验残留 + 重建副本 ----
foreach ($p in TestLaunchers) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
[W]::CloseTitled('BACKUP COPY') | Out-Null
Start-Sleep -Seconds 2
if (Test-Path $copy) { Remove-Item -Recurse -Force $copy }
New-Item -ItemType Directory -Path (Join-Path $copy 'web') -Force | Out-Null
Copy-Item (Join-Path $root 'Caravaneer2-Launcher.new.exe') $copyExe -Force
Copy-Item (Join-Path $root 'web\dist') (Join-Path $copy 'web\dist') -Recurse -Force
$idx = Join-Path $copy 'web\dist\index.html'
$txt = [IO.File]::ReadAllText($idx)
$txt = [regex]::Replace($txt, '<title>[^<]*</title>', '<title>Caravaneer 2 BACKUP COPY - HTML5</title>', 1)
[IO.File]::WriteAllText($idx, $txt, (New-Object Text.UTF8Encoding($false)))
Report "0. before (clean)"

Start-Process -FilePath $copyExe -ArgumentList ("--quit-after=" + $AutoQuit) -WorkingDirectory $copy
Start-Sleep -Seconds 6
Report "1. backup #1 running"

Write-Output "### 2. second double-click of the SAME copy (must reuse, not start a new server)"
Start-Process -FilePath $copyExe -WorkingDirectory $copy
Start-Sleep -Seconds 4
Report "2a. +4s"
Start-Sleep -Seconds 10
Report "2b. +14s (2nd process gone, 2 windows, one server)"

Start-Sleep -Seconds ($AutoQuit + 4)
Report "3. after #1 auto-quit (both BACKUP windows must be gone, 5175 free)"
