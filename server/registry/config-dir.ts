import { posix, win32 } from 'node:path';

/**
 * Jig UI's config directory, following each system's convention: `%APPDATA%\jig-ui` on Windows,
 * else `$XDG_CONFIG_HOME/jig-ui`, else `~/.config/jig-ui`. Pure: the caller passes the environment.
 */
export function configDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  if (platform === 'win32') return win32.join(env.APPDATA || win32.join(home, 'AppData', 'Roaming'), 'jig-ui');
  return posix.join(env.XDG_CONFIG_HOME || posix.join(home, '.config'), 'jig-ui');
}
