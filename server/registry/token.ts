import { randomBytes } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeConfigFile } from './instance.js';

/** The access token, kept across starts so that an open page keeps working after a restart. */
export const TOKEN_FILE = 'token';

/** What `randomBytes(32)` gives in base64url; anything else in the file is replaced. */
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;

async function readToken(dir: string): Promise<string | undefined> {
  try {
    const token = (await readFile(join(dir, TOKEN_FILE), 'utf8')).trim();
    return WELL_FORMED.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

/** Puts the file in place only if there is none: a hard link either lands whole or fails with EEXIST. */
async function createToken(dir: string, token: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `${TOKEN_FILE}.${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(temp, `${token}\n`, { mode: 0o600 });
  try {
    await link(temp, join(dir, TOKEN_FILE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    await rm(temp, { force: true });
  }
}

/**
 * The token in the config directory, made when there is none: of two starts at once, one creates
 * the file and both use what it holds. A file that is empty or not well formed is replaced
 * (0600, atomically).
 */
export async function loadToken(dir: string): Promise<string> {
  const kept = await readToken(dir);
  if (kept) return kept;
  const made = randomBytes(32).toString('base64url');
  await createToken(dir, made);
  const landed = await readToken(dir);
  if (landed) return landed;
  await writeConfigFile(dir, TOKEN_FILE, `${made}\n`);
  return made;
}

/** Forgets the token: the next start makes a new one, and every page that had the old one is refused. */
export async function resetToken(dir: string): Promise<void> {
  await rm(join(dir, TOKEN_FILE), { force: true });
}
