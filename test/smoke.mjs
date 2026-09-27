/* 上田家無双 スモークテスト
 *  - 全3ステージ × 全キャラを起動し、ページエラーが出ないこと
 *  - 戦闘 → 拠点制圧 → ボス出現 → 撃破 → リザルト表示まで進むこと
 *  - 各探索タワーの頂上（ひよこ）までジャンプで登れること
 * 実行: npm i playwright && npx playwright install chromium && node test/smoke.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' });
  r.end(fs.readFileSync(f));
}).listen(0);
const port = srv.address().port;
const exe = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('uedaMusou.v1', JSON.stringify({ quality: 1 })));
await page.goto(`http://localhost:${port}/musou.html`);
await page.waitForFunction(() => window.__MUSOU && document.querySelector('#title.on'), null, { timeout: 30000 });

let fail = 0;
const check = (ok, msg) => { console.log((ok ? '  ✔ ' : '  ✘ ') + msg); if (!ok) fail++; };

for (let st = 0; st < 3; st++) {
  const NCH = await page.evaluate(() => window.__MUSOU.CHARS.length);
  const list = st === 0 ? [...Array(NCH).keys()] : [0, 5, 10, 15].filter(v => v < NCH);
  for (const ch of list) {
    await page.evaluate(([st, ch]) => { const M = window.__MUSOU; M.G.char = M.CHARS[ch]; M.startStage(st); }, [st, ch]);
    await page.waitForFunction(() => window.__MUSOU.G.mode === 'play', null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const M = window.__MUSOU, b = M.BASES[0];
      M.P.x = b.x; M.P.z = b.z + 3; M.P.face = Math.PI;
      for (let k = 0; k < 20; k++) M.sim(1, i => { const p = i % 24; M.P.hp = M.P.maxHp; return p < 2 || (p >= 6 && p < 8) ? { KeyJ: 1 } : p >= 14 && p < 16 ? { KeyK: 1 } : {}; });
      M.P.musou = 100; M.sim(3.4, i => i < 3 ? { KeyL: 1 } : {});
      return { ko: M.G.ko, mode: M.G.mode };
    });
    check(r.mode === 'play' && r.ko > 0, `stage${st + 1} ${ch}: 戦闘 (撃破 ${r.ko})`);
  }
  /* ミッション・イベント・パワーアイテムを一通り実行 */
  const mis = await page.evaluate(() => {
    const M = window.__MUSOU, seen = [];
    let guard = 0;
    while (M.MIS.st && M.MIS.st.type !== 'boss' && guard++ < 10) {
      const st = M.MIS.st; seen.push(st.type);
      if (st.type === 'bases') M.BASES.forEach(b => { if (b.owner === 'E') M.captureBase(b); });
      if (st.type === 'gate') { M.P.x = st.x; M.P.z = st.z + 3; M.P.face = Math.PI; for (let k = 0; k < 60 && st.struct.hp > 0; k++) M.sim(.5, i => { M.P.hp = M.P.maxHp; return i % 12 < 2 ? { KeyJ: 1 } : {}; }); if (st.struct.hp > 0) st.struct.hp = 1, M.sim(.5, i => i < 2 ? { KeyJ: 1 } : {}); }
      if (st.type === 'defend' || st.type === 'carts' || st.type === 'rush') { for (let k = 0; k < 80 && M.MIS.st === st; k++) M.sim(1, i => { M.P.hp = M.P.maxHp; return i % 12 < 2 ? { KeyJ: 1 } : {}; }); }
      if (M.MIS.st === st) M.sim(.2);
      if (M.MIS.st === st) M.misFinish(true);
    }
    // イベント4種
    for (let k = 0; k < 4; k++) { M.G.evT = 0; const keep = M.MIS.st; M.MIS.st = { type: 'bases', n: 99, t: 0 }; M.sim(.1); M.MIS.st = keep; M.sim(2, i => { M.P.hp = M.P.maxHp; return i % 12 < 2 ? { KeyJ: 1 } : {}; }); }
    // パワーアイテム
    for (const t of ['kinoko', 'shoes', 'muteki', 'bomb']) { M.addItem(t, M.P.x, M.P.y + .5, M.P.z); M.sim(1.5, i => i % 12 < 2 ? { KeyJ: 1 } : {}); }
    return { seen: seen.join(','), res: M.MIS.res.map(r => r.name + (r.ok ? '○' : '×')).join(' '), step: M.MIS.st && M.MIS.st.type, mode: M.G.mode };
  });
  check(mis.step === 'boss' && mis.mode === 'play', `stage${st + 1}: ミッション進行 ${mis.seen} → ${mis.step}（${mis.res}）`);
  const boss = await page.evaluate(() => {
    const M = window.__MUSOU;
    M.sim(3);
    /* ボス固有技を一通り観察 */
    if (M.G.boss) { const b = M.G.boss; M.P.x = b.x; M.P.z = b.z + 8; for (let k = 0; k < 12; k++) M.sim(1, () => { M.P.hp = M.P.maxHp; return {}; }); b.hp = b.maxHp * .45; M.sim(3, () => { M.P.hp = M.P.maxHp; return {}; }); }
    if (!M.G.boss) return 'no boss';
    M.G.boss.hp = 5;
    for (let k = 0; k < 12 && !M.G.victory; k++) { const bo = M.G.boss; M.P.x = bo.x; M.P.z = bo.z + bo.r + 1.2; M.P.face = Math.PI; M.P.inv = 5; M.P.state = 'move'; M.sim(.5, i => i % 12 < 2 ? { KeyJ: 1 } : {}); }
    return M.G.victory ? 'ok' : 'boss alive ' + M.G.boss.hp;
  });
  check(boss === 'ok', `stage${st + 1}: 全拠点制圧 → ボス撃破 (${boss})`);
  await page.waitForFunction(() => window.__MUSOU.G.mode === 'result', null, { timeout: 30000 }).then(() => check(true, `stage${st + 1}: リザルト表示`), () => check(false, `stage${st + 1}: リザルト表示`));
  /* タワー登頂 */
  await page.evaluate(st => { const M = window.__MUSOU; M.G.char = M.CHARS[4]; M.startStage(st); }, st);
  await page.waitForFunction(() => window.__MUSOU.G.mode === 'play', null, { timeout: 20000 });
  const climb = await page.evaluate(() => {
    const M = window.__MUSOU, out = [];
    for (const e of M.EN) e.x += 200;
    for (const T of M.TOWERS) {
      const steps = M.PLATS.filter(p => p.k === 'c' && Math.abs(Math.hypot(p.x - T.x, p.z - T.z) - 3.15) < .3 && p.top < T.H).sort((a, b) => a.top - b.top);
      const seq = [...steps, { x: T.x, z: T.z, top: T.H }]; let ok = 0;
      for (let i = 0; i < seq.length; i++) {
        const to = seq[i];
        if (i) { M.P.x = seq[i - 1].x; M.P.z = seq[i - 1].z; M.P.y = seq[i - 1].top; }
        else { const a = Math.atan2(to.x - T.x, to.z - T.z); M.P.x = to.x + Math.sin(a) * 2.2; M.P.z = to.z + Math.cos(a) * 2.2; M.P.y = 0; }
        Object.assign(M.P, { vx: 0, vy: 0, vz: 0, onG: true, state: 'move', inv: 9 }); M.CAM.yaw = 0;
        M.sim(.05); let landed = false;
        for (let f = 0; f < 90 && !landed; f++) {
          const dx = to.x - M.P.x, dz = to.z - M.P.z, d = Math.hypot(dx, dz), k = {};
          if (d > .25) { if (dx > .2) k.KeyD = 1; if (dx < -.2) k.KeyA = 1; if (dz < -.2) k.KeyW = 1; if (dz > .2) k.KeyS = 1; }
          if (f >= 2 && f < 30) k.Space = 1;
          M.sim(1 / 60, () => k);
          if (M.P.onG && Math.abs(M.P.y - to.top) < .05 && d < 1.3) landed = true;
        }
        if (landed) ok++; else break;
      }
      out.push(ok === seq.length);
    }
    return out;
  });
  check(climb.every(Boolean), `stage${st + 1}: 探索タワー登頂 ${climb.map(v => v ? '○' : '×').join('')}`);
}
check(errors.length === 0, 'ページエラーなし' + (errors.length ? '\n' + errors.slice(0, 5).join('\n') : ''));
await browser.close(); srv.close();
console.log(fail ? `\n${fail} 件失敗` : '\nALL PASS');
process.exit(fail ? 1 : 0);
