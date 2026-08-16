/**
 * Regenerates every Trove icon artefact from the geometry in components/Logo.tsx.
 *
 *   npm run icons
 *
 * Writes:
 *   app/icon.svg                  favicon (rounded tile)
 *   app/apple-icon.png    180px   iOS home screen — full bleed, iOS masks it itself
 *   public/icon-192.png   192px   PWA "any"
 *   public/icon-512.png   512px   PWA "any"
 *   public/icon-maskable-512.png  PWA "maskable" — full bleed, mark inside the
 *                                 80% safe circle so Android can crop to any shape
 *
 * PNGs are rasterised by headless Chrome (no image dependency to install). Set
 * CHROME_PATH if your binary isn't in the usual place.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACCENT = '#0A84FF';
const BODY_OPACITY = 0.58;

// ---- single source of truth: parse the paths out of the component ----------
function geometry() {
  const src = readFileSync(join(ROOT, 'components/Logo.tsx'), 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp(`export const ${name} = '([^']+)';`));
    if (!m) throw new Error(`generate-icons: could not find ${name} in components/Logo.tsx`);
    return m[1];
  };
  return { lid: grab('LID'), body: grab('BODY'), latch: grab('LATCH') };
}

const { lid, body, latch } = geometry();

/**
 * One tile of artwork. `scale` shrinks the mark inside the 32-unit canvas;
 * `radius` is the tile corner radius in canvas units (0 = full bleed).
 */
const tileSvg = ({ px, scale, radius }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${px}" height="${px}">
  <rect width="32" height="32" rx="${radius}" fill="${ACCENT}"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">
    <path d="${lid}" fill="#fff"/>
    <path d="${body}" fill="#fff" fill-opacity="${BODY_OPACITY}"/>
    <path d="${latch}" fill="${ACCENT}"/>
  </g>
</svg>
`;

// ---- rasterise via headless Chrome -----------------------------------------
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chromeBinary = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromeBinary) {
  console.error('generate-icons: no Chrome/Chromium found. Set CHROME_PATH and retry.');
  process.exit(1);
}

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(chromeBinary, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--disable-gpu', '--hide-scrollbars', '--user-data-dir=/tmp/trove-icon-gen', 'about:blank',
], { stdio: 'ignore' });

const rpc = (ws) => {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return (method, params = {}) => new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
};

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://localhost:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* still booting */ }
  }
  if (!target) throw new Error('Chrome did not expose a debugging target');

  const ws = await new Promise((res, rej) => {
    const s = new WebSocket(target.webSocketDebuggerUrl);
    s.addEventListener('open', () => res(s));
    s.addEventListener('error', rej);
  });
  const send = rpc(ws);
  await send('Page.enable');

  const png = async (svg, px, outPath) => {
    await send('Emulation.setDeviceMetricsOverride', { width: px, height: px, deviceScaleFactor: 1, mobile: false });
    const html = `<body style="margin:0;background:transparent">${svg}</body>`;
    await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
    await sleep(220);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`  ${px.toString().padStart(3)}px  ${outPath.replace(ROOT + '/', '')}`);
  };

  console.log('generating Trove icons…');

  // favicon: rounded tile, mark at 76%
  writeFileSync(join(ROOT, 'app/icon.svg'), tileSvg({ px: 32, scale: 0.76, radius: 7 }));
  console.log('   svg  app/icon.svg');

  // PWA "any": rounded tile
  await png(tileSvg({ px: 192, scale: 0.76, radius: 7 }), 192, join(ROOT, 'public/icon-192.png'));
  await png(tileSvg({ px: 512, scale: 0.76, radius: 7 }), 512, join(ROOT, 'public/icon-512.png'));

  // PWA "maskable": full bleed, mark well inside the 80% safe circle
  await png(tileSvg({ px: 512, scale: 0.56, radius: 0 }), 512, join(ROOT, 'public/icon-maskable-512.png'));

  // iOS home screen: full bleed, iOS applies its own squircle
  await png(tileSvg({ px: 180, scale: 0.7, radius: 0 }), 180, join(ROOT, 'app/apple-icon.png'));

  ws.close();
} finally {
  chrome.kill();
}
