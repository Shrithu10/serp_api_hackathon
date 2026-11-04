'use strict';
/**
 * Windows data source: ONE long-lived PowerShell process that prints a JSON line every tick.
 * No native modules, nothing installed. Reads only: foreground window (process + title),
 * the process table (names, CPU time, memory) and battery state. No keyboard/mouse hooks.
 */
const { spawn } = require('child_process');

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class PMWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$descCache = @{}
function Desc($p) {
  try { $path = $p.Path; if (-not $path) { return @{ path = ''; desc = $p.ProcessName } }
    if (-not $descCache.ContainsKey($path)) { $d = $p.MainModule.FileVersionInfo.FileDescription; if (-not $d) { $d = $p.ProcessName }; $descCache[$path] = $d }
    return @{ path = $path; desc = $descCache[$path] } } catch { return @{ path = ''; desc = $p.ProcessName } }
}
$tick = 0
while ($true) {
  $h = [PMWin]::GetForegroundWindow(); $fgPid = 0
  [void][PMWin]::GetWindowThreadProcessId($h, [ref]$fgPid)
  $sb = New-Object System.Text.StringBuilder 512; [void][PMWin]::GetWindowText($h, $sb, 512)
  $fg = $null
  if ($fgPid -gt 0) { $p = Get-Process -Id $fgPid; if ($p) { $dd = Desc $p; $fg = @{ pid = $fgPid; name = $p.ProcessName; exe = $dd.path; desc = $dd.desc; title = $sb.ToString() } } }
  [Console]::Out.WriteLine('F' + ($fg | ConvertTo-Json -Compress -Depth 3)); 
  if ($tick % 3 -eq 0) {
    $list = @(); foreach ($p in (Get-Process)) { if ($p.Id -le 4) { continue }
      $win = ($p.MainWindowHandle -ne 0 -and $p.MainWindowTitle)
      $row = @{ pid = $p.Id; name = $p.ProcessName; cpu = [math]::Round($p.TotalProcessorTime.TotalSeconds, 2); ws = $p.WorkingSet64; win = [bool]$win }
      if ($win) { $dd = Desc $p; $row.exe = $dd.path; $row.desc = $dd.desc; $row.title = $p.MainWindowTitle }
      $list += $row }
    [Console]::Out.WriteLine('P' + (ConvertTo-Json -Compress -Depth 3 -InputObject $list))
  }
  if ($tick % 10 -eq 0) {
    $ps = [System.Windows.Forms.SystemInformation]::PowerStatus
    $present = -not ($ps.BatteryChargeStatus -band 128)
    $b = @{ present = $present; pct = [int]([math]::Round($ps.BatteryLifePercent * 100)); charging = ($ps.PowerLineStatus -eq 'Online'); remainSec = $ps.BatteryLifeRemaining }
    [Console]::Out.WriteLine('B' + ($b | ConvertTo-Json -Compress))
  }
  $tick++; Start-Sleep -Milliseconds 1500
}
`;

class WindowsProvider {
  constructor() { this.child = null; this.buf = ''; this.onEvent = () => {}; this.stopped = false; }

  start(onEvent) {
    this.onEvent = onEvent; this.stopped = false; this._spawn();
  }
  _spawn() {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    this.child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buf += chunk; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) { const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (line) this._line(line); }
    });
    this.child.on('exit', () => { this.child = null; if (!this.stopped) setTimeout(() => !this.stopped && this._spawn(), 3000); });
  }
  _line(line) {
    const kind = line[0]; let data;
    try { data = JSON.parse(line.slice(1) || 'null'); } catch { return; }
    if (kind === 'F') this.onEvent({ type: 'fg', fg: data && { pid: data.pid, name: data.name, exe: data.exe || '', desc: data.desc || data.name, title: data.title || '' } });
    else if (kind === 'P') {
      const arr = Array.isArray(data) ? data : data ? [data] : [];
      this.onEvent({ type: 'procs', list: arr.map((p) => ({ pid: p.pid, name: p.name, cpuSec: p.cpu || 0, ws: p.ws || 0, hasWindow: !!p.win, exe: p.exe || '', desc: p.desc || p.name, title: p.title || '' })) });
    } else if (kind === 'B') this.onEvent({ type: 'battery', present: !!data.present, pct: data.pct, charging: !!data.charging, remainSec: data.remainSec });
  }
  stop() { this.stopped = true; try { this.child && this.child.kill(); } catch { /* */ } }
}

module.exports = { WindowsProvider };
