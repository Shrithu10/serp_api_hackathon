import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'

export interface WindowSample {
  exe: string // e.g. chrome.exe
  title: string
  path: string
}
export interface WindowProbe {
  readonly simulated: boolean
  sample(): Promise<WindowSample | null>
  stop(): void
}

/**
 * Reads only: the foreground window handle, its title and the owning process image name.
 * No screenshots, no input hooks, no memory reads. Runs a single long-lived PowerShell host that answers
 * one line per request, which is far lighter than spawning a process per poll.
 */
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FocusOsWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int n);
}
"@
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $out = @{ exe = ''; title = ''; path = '' }
  try {
    $h = [FocusOsWin]::GetForegroundWindow()
    if ($h -ne [IntPtr]::Zero) {
      $len = [FocusOsWin]::GetWindowTextLength($h)
      $sb = New-Object System.Text.StringBuilder ($len + 2)
      [void][FocusOsWin]::GetWindowText($h, $sb, $sb.Capacity)
      $out.title = $sb.ToString()
      $procId = [uint32]0
      [void][FocusOsWin]::GetWindowThreadProcessId($h, [ref]$procId)
      $ph = [FocusOsWin]::OpenProcess(0x1000, $false, $procId)
      if ($ph -ne [IntPtr]::Zero) {
        $pb = New-Object System.Text.StringBuilder 1024
        $n = 1024
        if ([FocusOsWin]::QueryFullProcessImageName($ph, 0, $pb, [ref]$n)) { $out.path = $pb.ToString(); $out.exe = [System.IO.Path]::GetFileName($out.path) }
        [void][FocusOsWin]::CloseHandle($ph)
      }
    }
  } catch {}
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
}
`

class WindowsProbe implements WindowProbe {
  readonly simulated = false
  private proc: ChildProcessWithoutNullStreams
  private rl: Interface
  private waiting: ((s: WindowSample | null) => void) | null = null

  constructor() {
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true })
    this.rl = createInterface({ input: this.proc.stdout })
    this.rl.on('line', (line) => {
      const w = this.waiting
      this.waiting = null
      if (!w) return
      try {
        const j = JSON.parse(line) as WindowSample
        w(j.exe || j.title ? j : null)
      } catch { w(null) }
    })
    this.proc.on('error', () => this.waiting?.(null))
    this.proc.stderr.on('data', () => undefined)
  }

  sample(): Promise<WindowSample | null> {
    return new Promise((resolve) => {
      if (this.proc.killed || this.proc.exitCode !== null) return resolve(null)
      const timer = setTimeout(() => { this.waiting = null; resolve(null) }, 4000)
      this.waiting = (s) => { clearTimeout(timer); resolve(s) }
      this.proc.stdin.write('\n')
    })
  }
  stop(): void {
    try { this.rl.close(); this.proc.stdin.end(); this.proc.kill() } catch { /* already gone */ }
  }
}

/** Development stand-in for non-Windows machines so the app is explorable. It is clearly flagged in the UI. */
class SimulatedProbe implements WindowProbe {
  readonly simulated = true
  private i = 0
  private until = 0
  private cur: WindowSample = { exe: 'Code.exe', title: 'index.ts - demo - Visual Studio Code', path: '' }
  private readonly pool: WindowSample[] = [
    { exe: 'Code.exe', title: 'index.ts - demo - Visual Studio Code', path: '' },
    { exe: 'WindowsTerminal.exe', title: 'PowerShell', path: '' },
    { exe: 'chrome.exe', title: 'Pull requests · GitHub - Google Chrome', path: '' },
    { exe: 'slack.exe', title: 'Slack | #general', path: '' },
    { exe: 'chrome.exe', title: 'YouTube - Google Chrome', path: '' },
    { exe: 'Discord.exe', title: '#chat - Discord', path: '' }
  ]
  async sample(): Promise<WindowSample | null> {
    if (Date.now() > this.until) {
      this.cur = this.pool[this.i++ % this.pool.length]
      this.until = Date.now() + 15_000 + Math.random() * 30_000
    }
    return this.cur
  }
  stop(): void { /* nothing to release */ }
}

export function createProbe(): WindowProbe {
  return process.platform === 'win32' ? new WindowsProbe() : new SimulatedProbe()
}
