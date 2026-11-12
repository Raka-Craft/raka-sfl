// Chain-walker BypassPro: telusuri rantai shortener sampai tujuan akhir.
// Pola terbukti dbg5: jar segar per link, token dari XSRF FORM, session
// percobaan-1 419 lalu ULANGI LANGSUNG (tanpa setTimeout) -> 200.
const UA = 'Mozilla/5.0 (Linux; Android 13; Redmi Note 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const U64 = 'MmM2NWQzYmYxMThmZjc5NDY5NGZmYzNkZDM2OTE0MTkyZGM1ZTFiNjBiMmZjZTVjNDE3MGM1ZGFhMmIzMmJmNg==';
const FILE_HOSTS = /mediafire\.com|drive\.google\.com|mega\.nz|pixeldrain\.com|gofile\.io|github\.com|raw\.githubusercontent\.com|dropbox\.com|krakenfiles\.com|buzzheavier\.com|1fichier\.com|uptobox\.com|usersdrive\.com|send\.cm|vikingfile\.com|vik1ngfile\.site|apkadmin\.com/i;

function makeJar() {
  const jar = {};
  return {
    jar,
    store(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of sc) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; } },
    ck() { return Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '); },
  };
}
function tokFrom(raw) {
  let xsrf = raw || '';
  try { xsrf = decodeURIComponent(xsrf); } catch (e) {}
  const u = '#' + U64;
  return xsrf.slice(0, 128 - u.length) + u;
}
function extractLocHref(html) {
  const qc = String.fromCharCode(34);
  const i1 = html.indexOf('window.location.href');
  if (i1 < 0) return null;
  const q1 = html.indexOf(qc, i1), q2 = html.indexOf(qc, q1 + 1);
  if (q1 < 0 || q2 <= q1) return null;
  const u = html.slice(q1 + 1, q2).split(String.fromCharCode(92) + '/').join('/');
  return /^https?:\/\//i.test(u) ? u : null;
}
function titleOf(html) { const m = html.match(/<title[^>]*>([^<]*)<\/title>/i); return m ? m[1].trim().slice(0, 80) : '(tanpa judul)'; }

async function walk(startUrl) {
  const J = makeJar();
  const log = (...a) => console.log('  ', ...a);
  async function get(url, referer) {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Cookie': J.ck(), ...(referer ? { Referer: referer } : {}) } });
    J.store(r);
    return r;
  }
  async function postJson(url, body, referer) {
    const r = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Origin': new URL(url).origin, 'Cookie': J.ck(), Referer: referer }, body: JSON.stringify(body) });
    J.store(r);
    return { status: r.status, json: await r.json().catch(() => null) };
  }
  // GET dengan ikuti redirect HTTP, kembalikan {url, html, status}
  async function getFollow(url, referer) {
    let cur = url, html = '', status = 0;
    for (let i = 0; i < 8; i++) {
      const r = await get(cur, referer);
      status = r.status;
      const loc = r.headers.get('location');
      if (loc && [301, 302, 303, 307, 308].includes(status)) { await r.arrayBuffer().catch(() => {}); cur = new URL(loc, cur).href; continue; }
      html = await r.text();
      return { url: cur, html, status };
    }
    return { url: cur, html, status };
  }
  async function sflDance(formUrl, formHtml) {
    const fm = formHtml.match(/<form[^>]*action\s*=\s*"([^"]*redirect\.php[^"]*)"[^>]*>/i);
    if (!fm) return null;
    const action = new URL(fm[1], formUrl).href;
    const rayId = (formHtml.match(/name=["']ray_id["']\s+value=["']([^"']+)["']/i) || [])[1];
    const alias = (formHtml.match(/name=["']alias["']\s+value=["']([^"']+)["']/i) || [])[1];
    if (!rayId || !alias) return null;
    const backend = new URL(action).origin;
    const formXsrf = J.jar['XSRF-TOKEN'] || '';
    const tk = tokFrom(formXsrf);
    const submitUrl = action + (action.includes('?') ? '&' : '?') + 'ray_id=' + encodeURIComponent(rayId) + '&alias=' + encodeURIComponent(alias);
    const rs = await get(submitUrl, formUrl);
    const loc = rs.headers.get('location');
    await rs.arrayBuffer().catch(() => {});
    if (!loc) { log('SFL: submit tanpa location'); return null; }
    let articleUrl = new URL(loc, submitUrl).href;
    const ra = await get(articleUrl, formUrl); await ra.arrayBuffer().catch(() => {});
    log('SFL artikel:', articleUrl.slice(0, 90));
    for (let i = 0; i < 4; i++) {
      let { status, json: sj } = await postJson(backend + '/api/session', { _token: tk }, articleUrl);
      if (status === 419) { ({ status, json: sj } = await postJson(backend + '/api/session', { _token: tk }, articleUrl)); }
      const step = sj && sj.step;
      log('SFL session: HTTP', status, 'step=', step, sj && sj.captcha ? ('captcha=' + sj.captcha) : '');
      if (step === 2) {
        const key = Math.floor(Math.random() * 1000);
        const size = ((1920 + key) * 2) + '.' + ((1080 + key) * 2);
        let gr = await postJson(backend + '/api/go', { key, size, ado: null }, articleUrl);
        if (gr.status === 419) { gr = await postJson(backend + '/api/go', { key, size, ado: null }, articleUrl); log('SFL go RETRY'); }
        const gj = gr.json;
        const goUrl = gj && gj.url;
        if (!goUrl) { log('SFL: tanpa goUrl'); return null; }
        log('SFL goUrl:', goUrl.slice(0, 100));
        const gf = await getFollow(goUrl, articleUrl);
        const dest = extractLocHref(gf.html);
        if (dest) return dest;
        if (gf.url !== goUrl) return gf.url;
        return goUrl;
      }
      let vr = await postJson(backend + '/api/verify', { _a: 0 }, articleUrl);
      if (vr.status === 419) { vr = await postJson(backend + '/api/verify', { _a: 0 }, articleUrl); log('SFL verify RETRY'); }
      const vj = vr.json;
      log('SFL verify: HTTP', vr.status, 'body=', JSON.stringify(vj).slice(0, 200));
      const target = vj && vj.target;
      if (!target) { log('SFL: verify tanpa target'); return null; }
      if (!target.includes('redirect.php')) return target;
      const rt = await get(target, articleUrl);
      const loc2 = rt.headers.get('location');
      await rt.arrayBuffer().catch(() => {});
      if (!loc2) return null;
      articleUrl = new URL(loc2, target).href;
      const ra2 = await get(articleUrl, target); await ra2.arrayBuffer().catch(() => {});
      log('SFL artikel lanjut:', articleUrl.slice(0, 90));
    }
    return null;
  }
  async function indaDance(pageUrl, html) {
    const m = html.match(/<form[^>]*id=["']go-link["'][^>]*>/i);
    if (!m) return null;
    const csrf = (html.match(/name=["']_csrfToken["']\s+value=["']([^"']+)["']/i) || [])[1];
    const adfd = (html.match(/name=["']ad_form_data["']\s+value=["']([^"']+)["']/i) || [])[1];
    const tk2 = (html.match(/name=["']_Token\[fields\]["']\s+value=["']([^"']+)["']/i) || [])[1];
    const tk3 = (html.match(/name=["']_Token\[unlocked\]["']\s+value=["']([^"']*)["']/i) || [])[1];
    const body = new URLSearchParams({ _method: 'POST', _csrfToken: csrf || '', ad_form_data: adfd || '', '_Token[fields]': tk2 || '', '_Token[unlocked]': tk3 || '', '_Token[debug]': '' });
    const origin = new URL(pageUrl).origin;
    const r = await fetch(origin + '/links/go', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Origin': origin, 'Cookie': J.ck(), Referer: pageUrl }, body: body.toString() });
    J.store(r);
    const j = await r.json().catch(() => null);
    log('INDAPK /links/go:', r.status, JSON.stringify(j).slice(0, 120));
    return j && j.status === 'success' ? j.url : null;
  }

  console.log('\n===== ' + startUrl + ' =====');
  let cur = startUrl;
  for (let hop = 0; hop < 8; hop++) {
    if (hop > 0 && FILE_HOSTS.test(cur)) { console.log('  TUJUAN AKHIR (file host):', cur); return { ok: true, dest: cur }; }
    let page;
    try { page = await getFollow(cur, undefined); }
    catch (e) { console.log('  GAGAL fetch:', String(e).slice(0, 100)); return { ok: false, reason: 'fetch-gagal', at: cur }; }
    const host = new URL(page.url).hostname;
    console.log(`  [hop ${hop + 1}] ${host}${new URL(page.url).pathname.slice(0, 40)} | HTTP ${page.status} | ${titleOf(page.html)}`);
    if (FILE_HOSTS.test(page.url)) { console.log('  TUJUAN AKHIR (file host):', page.url); return { ok: true, dest: page.url }; }
    if (page.url.includes('/ready/go')) {
      const dest = extractLocHref(page.html);
      if (dest) { console.log('  READY ->', dest); cur = dest; continue; }
      console.log('  READY tanpa tujuan di HTML!'); return { ok: false, reason: 'ready-tanpa-tujuan', at: page.url };
    }
    if (/redirect\.php/i.test(page.html) && /ray_id/i.test(page.html)) {
      const dest = await sflDance(page.url, page.html);
      if (!dest) { console.log('  SFL DANCE GAGAL'); return { ok: false, reason: 'sfl-gagal', at: page.url }; }
      console.log('  SFL ->', dest.slice(0, 110));
      cur = dest; continue;
    }
    if (/id=["']go-link["']/i.test(page.html)) {
      const dest = await indaDance(page.url, page.html);
      if (!dest) { console.log('  INDAPK GAGAL'); return { ok: false, reason: 'indapk-gagal', at: page.url }; }
      console.log('  INDAPK ->', dest.slice(0, 110));
      cur = dest; continue;
    }
    const locHref = extractLocHref(page.html);
    if (locHref) { console.log('  JS-REDIRECT ->', locHref.slice(0, 110)); cur = locHref; continue; }
    const meta = page.html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)/i);
    if (meta) { console.log('  META-REFRESH ->', meta[1].slice(0, 110)); cur = new URL(meta[1], page.url).href; continue; }
    console.log('  HALAMAN TAK DIKENAL -- berhenti. cuplikan:', page.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
    return { ok: false, reason: 'halaman-tak-dikenal', at: page.url };
  }
  return { ok: false, reason: 'terlalu-banyak-hop', at: cur };
}
const results = [];
for (const u of process.argv.slice(2)) {
  try { results.push({ url: u, ...(await walk(u)) }); }
  catch (e) { console.log('  ERROR:', String(e).slice(0, 150)); results.push({ url: u, ok: false, reason: 'exception' }); }
}
console.log('\n===== RINGKASAN =====');
for (const r of results) console.log((r.ok ? 'BERHASIL ' : 'GAGAL   ') + r.url + (r.ok ? (' -> ' + (r.dest || '').slice(0, 80)) : (' [' + r.reason + ' @ ' + (r.at || '').slice(0, 70) + ']')));
