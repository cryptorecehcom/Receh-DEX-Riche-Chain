import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('app.js');
const reown = read('js/reown.js');
const html = read('index.html');
const sw = read('public/sw.js');
const manifest = JSON.parse(read('public/pwa/manifest.webmanifest'));
const fail = (m) => { console.error(`QA FAIL: ${m}`); process.exit(1); };

if (!/id:\s*132026/.test(app)) fail('Riche Chain ID missing');
if (!/CHAIN_CONFIG/.test(app)) fail('single-chain configuration missing');
if (!/132026/.test(`${app}\n${reown}`)) fail('Riche Chain configuration missing');
if (/activeChainKey|switchActiveChain|CHAINS\s*=|chainDropdown|chainSelector|chainTrigger|chainEpoch/.test(app + '\n' + html)) fail('legacy multichain state remains');
if (/analytics\s*:\s*true/.test(reown)) fail('Reown analytics must be disabled');
if (!/networks:\s*\[riche\]/.test(reown)) fail('Reown is not Riche-only');
if (!/window\.navTo\s*=\s*navTo/.test(app)) fail('navTo is not globally available');
if (!/window\.connectWallet\s*=\s*connectWallet/.test(app)) fail('connectWallet is not globally available');
if (!/CACHE_VERSION = 'receh-dex-shell-v14'/.test(sw)) fail('service-worker version not updated');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail('PWA icons missing');
for (const icon of manifest.icons) if (!fs.existsSync(path.join(root,'public',icon.src.replace(/^\/dex\//,'')))) fail(`missing PWA icon: ${icon.src}`);
const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const dup=ids.filter((id,i)=>ids.indexOf(id)!==i);
if (dup.length) fail(`duplicate HTML ids: ${[...new Set(dup)].join(', ')}`);
if (/console\.log\s*\(/.test(app)) fail('production console.log remains');
if (/\bdebugger\b|TODO|FIXME/.test(`${app}\n${reown}\n${sw}`)) fail('debug/TODO marker remains');
console.log('RECEH DEX static QA: PASS');
