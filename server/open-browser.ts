import { execFile } from 'node:child_process';
import { OPEN_FILE, writeConfigFile } from './registry/instance.js';

/** The system command that opens a file in the default browser. */
export function browserCommand(platform: NodeJS.Platform, file: string): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [file] };
  if (platform === 'win32') return { cmd: 'explorer.exe', args: [file] };
  return { cmd: 'xdg-open', args: [file] };
}

/** A page that sends the browser on to `url`; the token travels in the file, not in a process's arguments. */
export function redirectPage(url: string): string {
  const json = JSON.stringify(url).replace(/</g, '\\u003c');
  const attr = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${attr}" />
    <title>Jig UI</title>
    <script>location.replace(${json});</script>
  </head>
  <body><a href="${attr}">Open Jig UI</a></body>
</html>
`;
}

/**
 * Opens `url` in the default browser through a redirect file, because `ps` shows every user the
 * arguments of a process, and the url carries the token. The file lives in the config directory
 * and is not removed here: a second start exits at once, maybe before the browser read it; the
 * instance removes it when it stops. Resolves false when no browser could be started; the caller
 * prints the link instead.
 */
export async function openBrowser(url: string, dir: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  let file: string;
  try {
    file = await writeConfigFile(dir, OPEN_FILE, redirectPage(url));
  } catch {
    return false;
  }
  const { cmd, args } = browserCommand(platform, file);
  return new Promise((resolve) => {
    // explorer.exe exits with 1 even when it opened the file, so on Windows only a spawn error counts.
    execFile(cmd, args, (error) => resolve(!error || (platform === 'win32' && typeof error.code === 'number')));
  });
}
