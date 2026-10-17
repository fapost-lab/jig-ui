import { describe, expect, it } from 'vitest';
import { browserCommand, redirectPage } from './open-browser.js';

const URL_WITH_TOKEN = 'http://127.0.0.1:4870/?token=secret';

describe('browserCommand', () => {
  it.each([
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
    ['win32', 'explorer.exe'],
  ] as const)('on %s runs %s with the file only', (platform, cmd) => {
    const command = browserCommand(platform, '/tmp/jig-ui-x/open.html');
    expect(command).toEqual({ cmd, args: ['/tmp/jig-ui-x/open.html'] });
    expect(command.args.join(' ')).not.toContain('secret');
  });
});

describe('redirectPage', () => {
  it('sends the browser on to the url', () => {
    const page = redirectPage(URL_WITH_TOKEN);
    expect(page).toContain(`content="0; url=${URL_WITH_TOKEN}"`);
    expect(page).toContain(`location.replace("${URL_WITH_TOKEN}")`);
  });

  it('escapes the url in both places', () => {
    const page = redirectPage('http://x/?a="</script>&b');
    expect(page).not.toContain('</script>&b');
    expect(page).toContain('&quot;');
  });
});
