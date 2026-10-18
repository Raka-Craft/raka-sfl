/* RAKA SFL — khusus SafelinkU (sfl.gl). Engine teruji + retry 3x + final hop. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const crypto = require('crypto');

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
}

function storeCookies(jar, headers) {
  let raw = [];
  try { if (typeof headers.getSetCookie === 'function') raw = headers.getSetCookie(); } catch (e) {}
  const single = headers.get('set-cookie');
  if (single && raw.length === 0) raw = [single];
  for (const c of raw) {
    const m = c.match(/^\s*([^=;]+)=([^;]*)/);
    if (m) jar[m[1].trim()] = m[2].trim();
  }
}

async function fetchT(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally { clearTimeout(t); }
}

function baseHeaders(jar) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': cookieHeader(jar),
  };
}

function hostOf(u) { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } }

function validHttpUrl(s) {
  try {
    const u = new URL(s.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch (e) { return null; }
}

function safelinkuToken(jar) {
  const fp = 'webgl:fake||audio:fake||canvas:fake||fonts:fake||system:fake||env:fake||network:fake';
  const h = crypto.createHash('sha256').update(fp).digest('hex');
  const u = '#' + Buffer.from(h).toString('base64');
  let xsrf = '';
  try { xsrf = decodeURIComponent(jar['XSRF-TOKEN'] || ''); } catch (e) { xsrf = jar['XSRF-TOKEN'] || ''; }
  if (!xsrf) return null;
  return xsrf.slice(0, 128 - u.length) + u;
}

async function safelinkuPost(url, body, referer, jar, deadline) {
  if (Date.now() > deadline - 1000) return null;
  try {
    const r = await fetchT(url, {
      method: 'POST', redirect: 'manual',
      headers: { ...baseHeaders(jar), 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Referer': referer },
      body: JSON.stringify(body),
    }, 6000);
    storeCookies(jar, r.headers);
    const j = await r.json().catch(() => null);
    try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
    return j;
  } catch (e) { return null; }
}

async function flowSafelinku(pageUrl, html, deadline, jar) {
  const dbg = [];
  try {
    // Jika kena Cloudflare challenge, pakai Google Translate sebagai proxy (IP Google dipercaya CF)
    if (!html || html.includes('Just a moment...') || html.includes('challenges.cloudflare.com')) {
      dbg.push('cf-detected');
      try {
        const u = new URL(pageUrl);
        const gtHost = u.hostname.replace(/\./g, '-') + '.translate.goog';
        const sep = u.search ? '&' : '?';
        const gtUrl = 'https://' + gtHost + u.pathname + u.search + sep + '_x_tr_sl=en&_x_tr_tl=id';
        const rg = await fetchT(gtUrl, { redirect: 'manual', headers: baseHeaders(jar) }, 8000);
        const ct = (rg.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('html')) {
          try { html = await rg.text(); } catch (e) {}
        }
        try { await rg.arrayBuffer().catch(() => {}); } catch (e) {}
        dbg.push('gt-len=' + (html || '').length);
      } catch (e) { dbg.push('gt-err'); }
    }
    // 1) form: action redirect.php + ray_id + alias
    const fm = html.match(/<form[^>]*action\s*=\s*"([^"]*redirect\.php[^"]*)"[^>]*>/i);
    if (!fm) { dbg.push('no-form'); return { _dbg: dbg }; }
    let action;
    try { action = new URL(fm[1], pageUrl).href; } catch (e) { return null; }
    const rayId = (html.match(/name=["']ray_id["']\s+value=["']([^"']+)["']/i) || [])[1];
    const alias = (html.match(/name=["']alias["']\s+value=["']([^"']+)["']/i) || [])[1];
    if (!rayId || !alias) { dbg.push("no-rayid"); return { _dbg: dbg }; }
    const backend = new URL(action).origin;

    // 2) submit form (GET) -> 302 -> artikel
    const submitUrl = action + (action.includes('?') ? '&' : '?') + 'ray_id=' + encodeURIComponent(rayId) + '&alias=' + encodeURIComponent(alias);
    let articleUrl = null;
    {
      const r = await fetchT(submitUrl, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': pageUrl } }, 6000);
      storeCookies(jar, r.headers);
      const loc = r.headers.get('location');
      try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
      if (!loc) { dbg.push("no-loc"); return { _dbg: dbg }; }
      articleUrl = new URL(loc, submitUrl).href;
      // kunjungi artikel untuk cookie sesi
      const ra = await fetchT(articleUrl, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': pageUrl } }, 6000);
      storeCookies(jar, ra.headers);
      try { await ra.arrayBuffer().catch(() => {}); } catch (e) {}
    }

    // 3) loop: session -> verify/go (maks 4x)
    for (let i = 0; i < 4; i++) {
      if (Date.now() > deadline - 2000) { dbg.push("timeout"); return { _dbg: dbg }; }
      const _token = safelinkuToken(jar);
      if (!_token) { dbg.push("no-token"); return { _dbg: dbg }; }
      const sj = await safelinkuPost(backend + '/api/session', { _token }, articleUrl, jar, deadline);
      const step = sj && sj.step;
      if (step === 2) {
        const key = Math.floor(Math.random() * 1000);
        const size = ((1920 + key) * 2) + '.' + ((1080 + key) * 2);
        const gj = await safelinkuPost(backend + '/api/go', { key, size, ado: null }, articleUrl, jar, deadline);
        const goUrl = gj && gj.url && validHttpUrl(gj.url);
        if (!goUrl) { dbg.push("no-gourl"); return { _dbg: dbg }; }
        // 4) halaman ready/go -> window.location.href = link asli
        // (pakai GT proxy kalau kena CF, karena ready/go ada di domain shortener)
        async function fetchReadyGo(goUrl) {
          let rg = await fetchT(goUrl, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': articleUrl } }, 6000);
          storeCookies(jar, rg.headers);
          let ghtml = '';
          try { ghtml = await rg.text(); } catch (e) {}
          try { await rg.arrayBuffer().catch(() => {}); } catch (e) {}
          if (ghtml.includes('Just a moment...') || ghtml.includes('challenges.cloudflare.com')) {
            try {
              const u = new URL(goUrl);
              const gtHost = u.hostname.replace(/\./g, '-') + '.translate.goog';
              const sep = u.search ? '&' : '?';
              const gtUrl = 'https://' + gtHost + u.pathname + u.search + sep + '_x_tr_sl=en&_x_tr_tl=id';
              const rg2 = await fetchT(gtUrl, { redirect: 'manual', headers: baseHeaders(jar) }, 8000);
              const ct2 = (rg2.headers.get('content-type') || '').toLowerCase();
              if (ct2.includes('html')) { try { ghtml = await rg2.text(); } catch (e) {} }
              try { await rg2.arrayBuffer().catch(() => {}); } catch (e) {}
            } catch (e) {}
          }
          return ghtml;
        }
        const ghtml = await fetchReadyGo(goUrl);
        const m = ghtml.match(/window\.location\.href\s*=\s*"([^"]+)"/);
        const dest = m && validHttpUrl(m[1].replace(/\\\//g, '/'));
        if (dest) return { destination: dest };
        dbg.push("no-dest"); return { _dbg: dbg };
      }
      // step 1 (atau lain): verify -> target redirect.php baru
      const vj = await safelinkuPost(backend + '/api/verify', { _a: 0 }, articleUrl, jar, deadline);
      const target = vj && vj.target && validHttpUrl(vj.target);
      if (!target) { dbg.push("no-target"); return { _dbg: dbg }; }
      if (!target.includes("redirect.php")) return { destination: target };
      const rt = await fetchT(target, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': articleUrl } }, 6000);
      storeCookies(jar, rt.headers);
      const loc = rt.headers.get('location');
      try { await rt.arrayBuffer().catch(() => {}); } catch (e) {}
      if (!loc) { dbg.push("no-loc"); return { _dbg: dbg }; }
      articleUrl = new URL(loc, target).href;
      const ra2 = await fetchT(articleUrl, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': target } }, 6000);
      storeCookies(jar, ra2.headers);
      try { await ra2.arrayBuffer().catch(() => {}); } catch (e) {}
    }
    dbg.push("loop-end"); return { _dbg: dbg };
  } catch (e) { dbg.push("exc:"+e.message); return { _dbg: dbg }; }
}


/* Final hop: kejar redirect sampai mentok; MediaFire -> ambil link download langsung */
async function finalHop(dest, deadline) {
  const jar = {};
  let url = dest;
  for (let i = 0; i < 6; i++) {
    if (Date.now() > deadline - 3000) break;
    const h = hostOf(url);
    if (h === 'mediafire.com' || h.endsWith('.mediafire.com')) {
      try {
        const r = await fetchT(url, { headers: baseHeaders(jar) }, 8000);
        const html = await r.text().catch(() => '');
        const m = html.match(/kNO\s*=\s*"([^"]+)"/) || html.match(/https:\/\/download\d+\.mediafire\.com\/[^"'\\\s]+/);
        if (m) { const d = validHttpUrl(m[1]); if (d) return { finalUrl: d, via: 'mediafire-direct' }; }
      } catch (e) {}
      return { finalUrl: url, via: 'mediafire-page' };
    }
    try {
      const r = await fetchT(url, { redirect: 'manual', headers: baseHeaders(jar) }, 7000);
      storeCookies(jar, r.headers);
      const loc = r.headers.get('location');
      try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
      if (!loc || (r.status >= 200 && r.status < 300)) return { finalUrl: url, via: 'final' };
      url = new URL(loc, url).href;
    } catch (e) { return { finalUrl: url, via: 'final' }; }
  }
  return { finalUrl: url, via: 'final' };
}

async function resolveSfl(raw) {
  const t0 = Date.now();
  const deadline = t0 + 22000;
  const start = validHttpUrl(raw);
  if (!start) return { ok: false, error: 'URL tidak valid. Pakai format https://...' };
  const h = hostOf(start);
  if (!['sfl.gl','safelinku.com','safelinku.net','safelinkku.com','linku.to','lokerwfh.net'].includes(h))
    return { ok: false, error: 'Khusus link SafelinkU (sfl.gl / safelinku.com).' };

  let lastErr = 'Gagal.';
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (Date.now() > deadline - 4000) break;
    const jar = {};
    const first = await (async () => {
      try {
        const r = await fetchT(start, { redirect: 'manual', headers: baseHeaders(jar) }, 8000);
        storeCookies(jar, r.headers);
        const html = await r.text().catch(() => '');
        return { html, url: start };
      } catch (e) { return { html: '', url: start }; }
    })();
    const res = await flowSafelinku(first.url, first.html, deadline, jar);
    if (res && res.destination) {
      const fin = await finalHop(res.destination, deadline);
      return { ok: true, destination: res.destination, finalUrl: fin.finalUrl,
        finalVia: fin.via, attempt, ms: Date.now() - t0 };
    }
    lastErr = (res && res._dbg) ? res._dbg.join(',') : lastErr;
    if (attempt === 1) await new Promise(r => setTimeout(r, 800));
  }
  return { ok: false, error: 'Server SafelinkU lagi sibuk / link-nya bermasalah. Coba lagi ya!', ms: Date.now() - t0 };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const raw = ((req.query && req.query.url) || '').toString().trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'Parameter ?url= wajib diisi.' });
    const out = await resolveSfl(raw);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Error server: ' + e.message });
  }
};
