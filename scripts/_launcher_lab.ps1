
param([ValidateSet('List','Cleanup','Status','StartExe','CloseWindow','KillExe','Curl','FullTest')][string]$Action = 'Status',
      [int]$QuitAfter = 10)

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
  public static void CloseHwnd(long h) { PostMessage(new IntPtr(h), 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
"@

$root = 'D:\game\Caravaneer 2 deepseek'
$launcher = Join-Path $root 'Caravaneer2-Launcher.exe'

function Get-NodeList {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    $cl = [string]$_.CommandLine
    $danger = $cl -match 'dsh-sandbox|@deepseek-ai|dsh\\node_modules|11451'
    $game = ($cl -match 'vite') -or ($cl -match 'npm-cli\.js"?\s+run\s+(dev|preview)')
    [pscustomobject]@{ PID = $_.ProcessId; Game = $game; Danger = $danger; CL = $cl }
  }
}

function Get-WinRows {
  $out = @()
  foreach ($line in ([W]::Dump() -split "\r?\n")) {
    if (-not $line) { continue }
    $p = $line -split '\|', 3
    $proc = try { (Get-Process -Id ([int]$p[0]) -ErrorAction Stop).ProcessName } catch { '?' }
    $out += [pscustomobject]@{ PID = [int]$p[0]; Hwnd = $p[1]; Title = $p[2]; Proc = $proc }
  }
  $out
}

function Get-GameWindows {
  Get-WinRows | Where-Object { $_.Title -match 'Caravaneer 2' -and $_.Proc -match 'msedge|chrome|msedgewebview2' }
}

function Show-Status {
  Write-Output "----- launcher -----"
  $l = Get-Process -Name 'Caravaneer2-Launcher' -ErrorAction SilentlyContinue
  if ($l) { $l | ForEach-Object { Write-Output ("PID " + $_.Id + "  RSS=" + [math]::Round($_.WorkingSet64/1MB,1) + "MB") } } else { Write-Output "Caravaneer2-Launcher.exe : NOT RUNNING" }
  Write-Output "----- ports 5173-5179 -----"
  $c = netstat -ano | Select-String 'LISTENING' | Select-String ':517[3-9] '
  if ($c) { $c | ForEach-Object { Write-Output $_.Line.Trim() } } else { Write-Output "all free" }
  Write-Output "----- game windows (title Caravaneer 2 in a browser proc) -----"
  $g = @(Get-GameWindows)
  if ($g) { $g | ForEach-Object { Write-Output ("  hwnd=" + $_.Hwnd + " pid=" + $_.PID + " proc=" + $_.Proc + " title=" + $_.Title) } } else { Write-Output "  none" }
  Write-Output ("----- msedge procs: " + @(Get-Process msedge -ErrorAction SilentlyContinue).Count + " -----")
}

switch ($Action) {
  'List' { (Get-NodeList | Where-Object Game) | ForEach-Object { Write-Output ("PID " + $_.PID + " :: " + ($_.CL -replace '\s+',' ')) } }
  'Cleanup' {
    $t = @(Get-NodeList | Where-Object { $_.Game -and -not $_.Danger })
    Write-Output ("killing " + $t.Count + " node processes")
    foreach ($p in $t) { Stop-Process -Id $p.PID -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Write-Output ("remaining node.exe: " + (Get-NodeList).Count)
  }
  'Status' { Show-Status }
  'StartExe' { Start-Process -FilePath $launcher -WorkingDirectory $root; Start-Sleep -Seconds 4; Show-Status }
  'CloseWindow' {
    $n = 0
    foreach ($w in Get-GameWindows) { [W]::CloseHwnd([long]$w.Hwnd); $n++ }
    Write-Output ("WM_CLOSE sent to " + $n + " game window(s)")
    Start-Sleep -Seconds 3
    Show-Status
  }
  'KillExe' {
    $l = Get-Process -Name 'Caravaneer2-Launcher' -ErrorAction SilentlyContinue
    if ($l) { $l | Stop-Process -Force; Write-Output ("launcher killed: PID " + ($l.Id -join ',')) } else { Write-Output "launcher not running" }
    Start-Sleep -Seconds 2
    Show-Status
  }
  'Curl' {
    try { $r = Invoke-WebRequest -Uri 'http://localhost:5174/' -UseBasicParsing -TimeoutSec 5
      Write-Output ("HTTP " + $r.StatusCode + "  bytes=" + $r.RawContentLength) }
    catch { Write-Output ("request failed: " + $_.Exception.Message) }
  }
  'FullTest' {
    Write-Output "### 0. before"
    Show-Status
    Write-Output ("### 1. start exe with --quit-after=" + $QuitAfter)
    Start-Process -FilePath $launcher -ArgumentList ("--quit-after=" + $QuitAfter) -WorkingDirectory $root
    Start-Sleep -Seconds 4
    Write-Output "### 2. running (4s in)"
    Show-Status
    try { $r = Invoke-WebRequest -Uri 'http://localhost:5174/' -UseBasicParsing -TimeoutSec 5; Write-Output ("  curl: HTTP " + $r.StatusCode + " bytes=" + $r.RawContentLength) } catch { Write-Output ("  curl: FAILED " + $_.Exception.Message) }
    Start-Sleep -Seconds ($QuitAfter + 4)
    Write-Output "### 3. after auto-quit (same path as tray Exit)"
    Show-Status
    try { $r = Invoke-WebRequest -Uri 'http://localhost:5174/' -UseBasicParsing -TimeoutSec 5; Write-Output ("  curl: HTTP " + $r.StatusCode + " bytes=" + $r.RawContentLength) } catch { Write-Output ("  curl: FAILED (server gone)" ) }
  }
}
