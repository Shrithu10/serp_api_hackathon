/** Friendly names for common Windows executables. Falls back to a cleaned-up exe name. */
const KNOWN: Record<string, string> = {
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Firefox',
  'brave.exe': 'Brave',
  'opera.exe': 'Opera',
  'code.exe': 'VS Code',
  'code - insiders.exe': 'VS Code',
  'cursor.exe': 'Cursor',
  'idea64.exe': 'IntelliJ IDEA',
  'idea.exe': 'IntelliJ IDEA',
  'pycharm64.exe': 'PyCharm',
  'webstorm64.exe': 'WebStorm',
  'rider64.exe': 'Rider',
  'devenv.exe': 'Visual Studio',
  'windowsterminal.exe': 'Windows Terminal',
  'wt.exe': 'Windows Terminal',
  'cmd.exe': 'Command Prompt',
  'powershell.exe': 'PowerShell',
  'pwsh.exe': 'PowerShell',
  'conhost.exe': 'Console',
  'discord.exe': 'Discord',
  'slack.exe': 'Slack',
  'whatsapp.exe': 'WhatsApp',
  'whatsapp.root.exe': 'WhatsApp',
  'telegram.exe': 'Telegram',
  'teams.exe': 'Microsoft Teams',
  'ms-teams.exe': 'Microsoft Teams',
  'zoom.exe': 'Zoom',
  'notepad.exe': 'Notepad',
  'notepad++.exe': 'Notepad++',
  'winword.exe': 'Microsoft Word',
  'excel.exe': 'Microsoft Excel',
  'powerpnt.exe': 'Microsoft PowerPoint',
  'outlook.exe': 'Microsoft Outlook',
  'onenote.exe': 'Microsoft OneNote',
  'obsidian.exe': 'Obsidian',
  'notion.exe': 'Notion',
  'spotify.exe': 'Spotify',
  'explorer.exe': 'File Explorer',
  'figma.exe': 'Figma',
  'postman.exe': 'Postman',
  'steam.exe': 'Steam',
  'vlc.exe': 'VLC'
}

export function friendlyAppName(exe: string, title = ''): string {
  const key = exe.toLowerCase()
  if (key === 'applicationframehost.exe' && title) return title // UWP / Store apps
  if (KNOWN[key]) return KNOWN[key]
  const base = exe.replace(/\.exe$/i, '')
  if (!base) return 'Unknown'
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export const BROWSER_EXES = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe']
export const BROWSER_NAMES = ['Google Chrome', 'Microsoft Edge', 'Firefox', 'Brave', 'Opera']
export const isBrowserName = (name: string): boolean => BROWSER_NAMES.includes(name)
