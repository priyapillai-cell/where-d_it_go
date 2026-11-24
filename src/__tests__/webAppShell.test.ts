import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const publicDir = join(__dirname, '..', '..', 'public');
const html = readFileSync(join(publicDir, 'index.html'), 'utf8');

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(join(publicDir, file));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('web app shell', () => {
  it('extends the page under the iPhone status bar', () => {
    expect(html).toMatch(/name="viewport"[\s\S]*?viewport-fit=cover/);
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it('leaves out the deprecated iOS status bar style', () => {
    expect(html).not.toContain('apple-mobile-web-app-status-bar-style');
  });

  it('gives Add to Home Screen the app icon and name', () => {
    expect(html).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2"',
    );
    expect(html).toContain('name="apple-mobile-web-app-title" content="Where\'d It Go?"');
    expect(pngSize('apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngSize('apple-touch-icon-precomposed.png')).toEqual({ width: 180, height: 180 });
  });

  it('lists manifest icons that exist at their declared sizes', () => {
    expect(html).toContain('rel="manifest" href="/manifest.json?v=2"');
    const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.json'), 'utf8')) as {
      display: string;
      icons: { src: string; sizes: string }[];
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(icon.src.replace(/^\//, '').replace(/\?.*$/, ''))).toEqual({ width, height });
    }
  });
});
