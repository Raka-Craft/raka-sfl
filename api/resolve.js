/* SUBSAFE BYPASS — multi-provider (AdFly, Ouo, Linkvertise, SafelinkU, ShrinkMe, Shortener, dst) — serverless link resolver. Tanpa batas, tanpa login. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PROVIDERS = [
  { hosts: ['adf.ly', 'adfoc.us', 'j.gs', 'q.gs', 'bc.vc'], name: 'AdFly', fn: 'adfly' },
  { hosts: ['ouo.io', 'ouo.press'], name: 'Ouo.io', fn: 'ouo' },
  { hosts: ['exe.io', 'exeo.app'], name: 'Exe.io', fn: 'ouoLike' },
  { hosts: ['linkvertise.com', 'linkvertise.net'], name: 'Linkvertise', fn: 'linkvertise' },
  { hosts: ['sfl.gl', 'safelinku.com'], name: 'SafelinkU', fn: 'safelinku' },
  { hosts: ['sub4unlock.com', 'sub2unlock.com'], name: 'Sub4Unlock', fn: 'generic' },
  { hosts: ['clk.sh','oko.sh','oii.la','clksz.com'], name: 'Clk.sh', fn: 'manual', reason: 'Clk.sh wajib verifikasi CAPTCHA (Cloudflare Turnstile) yang cuma bisa diselesaikan manusia.' },
  { hosts: ['bit.ly','bitly.is','j.mp','amzn.to'], name: 'Bitly', fn: 'generic' },
  { hosts: ['shrinkme.click','shrinkme.io'], name: 'ShrinkMe', fn: 'shrinkme' },
  { hosts: ['tpi.li','tii.la','oei.la','iir.la','tvi.la','lnbz.la','srnky.com'], name: 'Tpi.li', fn: 'manual', reason: 'Tpi.li wajib verifikasi CAPTCHA (Cloudflare Turnstile) yang cuma bisa diselesaikan manusia.' },
  { hosts: ['move2link.co','move2link.com'], name: 'Move2Link', fn: 'manual', reason: 'Move2Link dilindungi Cloudflare, selesaikan verifikasinya manual di browser.' },
  { hosts: ['shorte.st', 'sh.st'], name: 'Shorte.st', fn: 'generic' },
  { hosts: ['bit.ly', 'tinyurl.com', 't.co', 's.id', 't.ly', 'cutt.ly', 'is.gd', 'tiny.cc', 'rb.gy', 'v.gd', 'clck.ru', 'gg.gg', 'shorturl.at', 'bl.ink', 'rebrand.ly', 'cutt.ly'], name: 'Shortener', fn: 'redirect' },
];

function detectProvider(hostname) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  for (const p of PROVIDERS) {
    if (p.hosts.some(x => h === x || h.endsWith('.' + x))) return p;
  }
  return { hosts: [], name: 'Otomatis', fn: 'generic' };
}

/* ---------- util ---------- */
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

/* Ikuti redirect manual, catat rantai */
async function fetchChain(startUrl, deadline, jar) {
  jar = jar || {};
  const chain = [startUrl];
  let url = startUrl, html = null, error = null;
  for (let i = 0; i < 10; i++) {
    if (Date.now() > deadline - 800) { error = 'waktu habis'; break; }
    let r;
    try {
      r = await fetchT(url, { redirect: 'manual', headers: baseHeaders(jar) }, 5000);
    } catch (e) { error = 'gagal fetch: ' + (e.name === 'AbortError' ? 'timeout' : e.message); break; }
    storeCookies(jar, r.headers);
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location');
      if (!loc) break;
      try { url = new URL(loc, url).href; } catch (e) { break; }
      chain.push(url);
      try { await r.arrayBuffer(); } catch (e) {}
      continue;
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('html') || ct.includes('text')) {
      try { html = await r.text(); } catch (e) { html = null; }
    } else {
      try { await r.arrayBuffer(); } catch (e) {}
    }
    break;
  }
  return { chain, url, html, error, jar };
}

function hostOf(u) { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } }
function validHttpUrl(s) {
  try {
    const u = new URL(s.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch (e) { return null; }
}

/* ---------- decoder ---------- */
// AdFly: ysmm -> interleave split -> xor digit -> base64 -> slice(2)
function decodeAdfly(ysmm) {
  let A = '', B = '';
  for (let i = 0; i < ysmm.length; i++) {
    if (i % 2 === 0) A += ysmm.charAt(i);
    else B = ysmm.charAt(i) + B;
  }
  const C = (A + B).split('');
  for (let i = 0; i < C.length; i++) {
    if (/\d/.test(C[i])) {
      for (let j = i + 1; j < C.length; j++) {
        if (/\d/.test(C[j])) {
          const k = parseInt(C[i], 10) ^ parseInt(C[j], 10);
          if (k < 10) C[i] = String(k);
          break;
        }
      }
    }
  }
  try {
    const dec = Buffer.from(C.join(''), 'base64').toString('binary');
    const url = dec.substring(2);
    return validHttpUrl(url);
  } catch (e) { return null; }
}

function metaRefresh(html) {
  const m = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>\s]+)/i)
    || html.match(/<meta[^>]+content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>\s]+)[^>]*http-equiv\s*=\s*["']?refresh/i);
  return m ? validHttpUrl(m[1]) : null;
}

function jsRedirects(html) {
  const out = [];
  const pats = [
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
    /location\.replace\(\s*["']([^"']+)["']\s*\)/gi,
    /top\.location\s*=\s*["']([^"']+)["']/gi,
    /window\.open\(\s*["']([^"']+)["']/gi,
  ];
  for (const p of pats) {
    let m;
    while ((m = p.exec(html)) !== null) {
      const u = validHttpUrl(m[1]);
      if (u && !/^(javascript|data|about|#)/i.test(m[1])) out.push(u);
    }
  }
  return out;
}

function base64Candidates(html) {
  const out = [];
  const re = /["']([A-Za-z0-9+/]{60,}={0,2})["']/g;
  let m, n = 0;
  while ((m = re.exec(html)) !== null && n < 200) {
    n++;
    if (m[1].length % 4 !== 0) continue;
    try {
      const dec = Buffer.from(m[1], 'base64').toString('utf8');
      const u = validHttpUrl(dec.trim());
      if (u) out.push(u);
    } catch (e) {}
  }
  return out;
}

const AD_DOMAINS = ['google', 'facebook', 'doubleclick', 'googlesyndication', 'analytics', 'adsystem', 'adservice', 'taboola', 'outbrain', 'mgid', 'revcontent', 'popads', 'popcash', 'adcash', 'propeller', 'exoclick', 'adnxs', 'criteo', 'hotjar', 'cloudflare', 'hcaptcha', 'recaptcha', 'gstatic', 'schema.org', 'w3.org', 'youtube.com', 'youtu.be'];

const FILE_HOSTS=['mediafire.com','apkadmin.com','drive.google.com','github.com'];

/* Domain iklan/popunder sering pakai nama acak panjang (3+ kata digabung), mis. balconypomegranateluckily.com */
function isSuspiciousAdHost(host) {
  const h = (host || '').toLowerCase();
  if (AD_DOMAINS.some(d => h.includes(d))) return true;
  const label = h.split('.')[0] || '';
  if (label.length > 22 && !label.includes('-')) return true;
  return false;
}
function genericCandidates(html, selfHost) {
  const found = new Map();
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m, n = 0;
  while ((m = re.exec(html)) !== null && n < 800) {
    n++;
    let u = m[0].replace(/[.,;:!?)\]]+$/, '');
    const v = validHttpUrl(u);
    if (!v) continue;
    const h = hostOf(v);
    if (!h || h === selfHost) continue;
    if (isSuspiciousAdHost(h)) continue;
    if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf)(\?|$)/i.test(v)) continue;
    found.set(v, (found.get(v) || 0) + 1);
  }
  const ranked=[...found.entries()].sort((x,y)=>{const xh=hostOf(x[0]),yh=hostOf(y[0]);const xf=FILE_HOSTS.some(f=>xh===f||xh.endsWith('.'+f))?1:0;const yf=FILE_HOSTS.some(f=>yh===f||yh.endsWith('.'+f))?1:0;if(xf!==yf)return yf-xf;return y[1]-x[1];});return ranked.map(e=>e[0]);
}

/* ---------- provider flows ---------- */
async function flowOuo(pageUrl, html, deadline, jar) {
  // cari form go-link
  const fm = html.match(/<form[^>]*id\s*=\s*["']go-link["'][^>]*>/i)
    || html.match(/<form[^>]*action\s*=\s*["']([^"']*go[^"']*)["'][^>]*>/i);
  if (!fm) return null;
  const formTag = fm[0];
  let action = (formTag.match(/action\s*=\s*["']([^"']+)["']/i) || [])[1];
  if (!action) return null;
  try { action = new URL(action, pageUrl).href; } catch (e) { return null; }
  const inputs = {};
  const ire = /<input[^>]*name\s*=\s*["']([^"']+)["'][^>]*value\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let im;
  while ((im = ire.exec(formTag + html.slice(html.indexOf(formTag), html.indexOf(formTag) + 4000))) !== null) {
    inputs[im[1]] = im[2];
  }
  // fallback: cari hidden input di seluruh halaman dekat form
  if (Object.keys(inputs).length === 0) {
    const hre = /<input[^>]*type\s*=\s*["']hidden["'][^>]*>/gi;
    while ((im = hre.exec(html)) !== null) {
      const nm = (im[0].match(/name\s*=\s*["']([^"']+)["']/i) || [])[1];
      const vl = (im[0].match(/value\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (nm) inputs[nm] = vl || '';
    }
  }
  const body = new URLSearchParams(inputs).toString();
  let r;
  try {
    r = await fetchT(action, {
      method: 'POST', redirect: 'manual',
      headers: { ...baseHeaders(jar), 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': pageUrl },
      body,
    }, 6000);
  } catch (e) { return null; }
  storeCookies(jar, r.headers);
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    const loc = r.headers.get('location');
    try { await r.arrayBuffer(); } catch (e) {}
    if (loc) {
      const dest = new URL(loc, action).href;
      if (hostOf(dest) !== hostOf(pageUrl)) return { destination: dest };
    }
  }
  try { await r.arrayBuffer(); } catch (e) {}
  return null;
}

async function flowLinkvertise(pageUrl, deadline) {
  try {
    const u = new URL(pageUrl);
    const parts = u.pathname.split('/').filter(Boolean).slice(0, 2);
    if (parts.length < 1) return null;
    const path = '/' + parts.join('/');
    const h = { 'User-Agent': UA, 'Accept': 'application/json' };
    const r1 = await fetchT('https://publisher.linkvertise.com/api/v1/redirect/link/static' + path, { headers: h }, 6000);
    const j1 = await r1.json().catch(() => null);
    try { await r1.arrayBuffer().catch(() => {}); } catch (e) {}
    const linkId = j1 && j1.data && j1.data.link && j1.data.link.id;
    if (!linkId) return null;
    const serial = Buffer.from(JSON.stringify({ timestamp: Date.now(), random: '6548307', link_id: linkId })).toString('base64');
    const r2 = await fetchT('https://publisher.linkvertise.com/api/v1/redirect/link' + path + '/target?serial=' + encodeURIComponent(serial), { method: 'POST', headers: h }, 6000);
    const j2 = await r2.json().catch(() => null);
    try { await r2.arrayBuffer().catch(() => {}); } catch (e) {}
    const target = j2 && j2.data && (j2.data.target || (j2.data.link && j2.data.link.url));
    const v = target && validHttpUrl(target);
    return v ? { destination: v } : null;
  } catch (e) { return null; }
}

/* SafelinkU (sfl.gl & sejenisnya): form ray_id -> redirect.php -> artikel -> /api/session -> /api/verify -> /api/go */
const crypto = require('crypto');
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
/* ShrinkMe (shrinkme.click) — alur: cookie ref -> halaman mrproblogger -> tunggu counter -> POST /links/go.
   Best-effort: Cloudflare sering blokir IP datacenter. */
async function flowShrinkme(pageUrl, html, deadline, jar) {
  try {
    const u = new URL(pageUrl);
    const alias = u.pathname.replace(/\//g, '');
    if (!alias) return null;
    // 1) tanam cookie via shrinkme.click
    const r1 = await fetchT('https://shrinkme.click/' + alias, { headers: baseHeaders(jar) }, 8000);
    storeCookies(jar, r1.headers);
    try { await r1.text(); } catch (e) {}
    // 2) halaman form (butuh Referer khusus)
    const r2 = await fetchT('https://en.mrproblogger.com/' + alias, {
      headers: { ...baseHeaders(jar), 'Referer': 'https://themezon.net/' },
    }, 8000);
    storeCookies(jar, r2.headers);
    const h2 = await r2.text().catch(() => '');
    if (!h2 || h2.includes('Just a moment')) return null;
    // 3) parse form#go-link
    const fm = h2.match(/<form[^>]*id=["']go-link["'][^>]*>/i);
    if (!fm) return null;
    const action = (fm[0].match(/action=["']([^"']+)["']/i) || [])[1] || '/links/go';
    const postUrl = new URL(action, 'https://en.mrproblogger.com/').href;
    const inputs = {};
    const re = /<input[^>]*name=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(h2)) !== null) {
      const vm = m[0].match(/value=["']([^"']*)["']/i);
      inputs[m[1]] = vm ? vm[1] : '';
    }
    // 4) tunggu counter (server menolak kalau terlalu cepat)
    const cm = h2.match(/counter_value\s*[=:]\s*["']?(\d+)/i);
    const waitS = Math.min(parseInt(cm ? cm[1] : '11', 10) || 11, 15);
    await new Promise(r => setTimeout(r, waitS * 1000));
    if (Date.now() > deadline - 3000) return null;
    // 5) POST
    const body = new URLSearchParams(inputs).toString();
    const r3 = await fetchT(postUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders(jar),
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        'Origin': 'https://en.mrproblogger.com',
        'Referer': 'https://en.mrproblogger.com/' + alias,
      },
      body,
    }, 8000);
    const j = await r3.json().catch(() => null);
    if (j && j.url && validHttpUrl(j.url)) return { destination: j.url };
    return null;
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

/* ---------- main ---------- */
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

async function resolveUrl(raw, deadline, isManualContinue) {
  const t0 = Date.now();
  const start = validHttpUrl(raw);
  if (!start) return { ok: false, error: 'URL tidak valid. Pakai format https://...' };

  // Mode lanjut manual: kalau user sudah menempel link file asli (hasil kerja manualnya),
  // langsung terima tanpa perlu di-resolve lagi.
  if (isManualContinue) {
    const sh = hostOf(start);
    if (FILE_HOSTS.some(f => sh === f || sh.endsWith('.' + f))) {
      return { ok: true, provider: 'Manual', destination: start, chain: [start], ms: Date.now() - t0, method: 'manual-langsung' };
    }
  }

  const provider = detectProvider(hostOf(start));
  const jar = {};
  const first = await fetchChain(start, deadline, jar);

  // 1) redirect murni ke host lain = selesai (kecuali provider manual: redirectnya hanya antar-muka CAPTCHA)
  if (provider.fn !== 'manual' && first.chain.length > 1) {
    const dest = first.chain[first.chain.length - 1];
    if (hostOf(dest) !== hostOf(start)) {
      return { ok: true, provider: provider.name, destination: dest, chain: first.chain, ms: Date.now() - t0, method: 'redirect' };
    }
  }
  if (first.error && !first.html) {
    return { ok: false, provider: provider.name, error: first.error, chain: first.chain, ms: Date.now() - t0 };
  }

  // 1b) provider yang butuh CAPTCHA manual -> serahkan ke user
  if (provider.fn === 'manual') {
    return { ok: false, needManual: true, provider: provider.name, manualUrl: first.url,
      reason: provider.reason || 'Link ini butuh verifikasi CAPTCHA manual.',
      chain: first.chain, ms: Date.now() - t0 };
  }

  let html = first.html || '';
  let pageUrl = first.url;
  let selfHost = hostOf(pageUrl);
  let chain = first.chain;

  // 2b) flow khusus provider (stateless, hanya halaman pertama)
  if (provider.fn === 'adfly') {
    const m = html.match(/ysmm\s*=\s*['"]([^'"]+)['"]/);
    if (m) {
      const d = decodeAdfly(m[1]);
      if (d) return { ok: true, provider: provider.name, destination: d, chain, ms: Date.now() - t0, method: 'adfly-ysmm' };
    }
  }
  if (provider.fn === 'ouo' || provider.fn === 'ouoLike') {
    const r = await flowOuo(pageUrl, html, deadline, jar);
    if (r) return { ok: true, provider: provider.name, destination: r.destination, chain: [...chain, r.destination], ms: Date.now() - t0, method: 'form-post' };
  }
  if (provider.fn === 'safelinku') {
    const r = await flowSafelinku(pageUrl, html, deadline, jar);
    if (r && r.destination) return { ok: true, provider: provider.name, destination: r.destination, chain: [...chain, r.destination], ms: Date.now() - t0, method: 'safelinku' };
  }
  if (provider.fn === 'shrinkme') {
    const r = await flowShrinkme(pageUrl, html, deadline, jar);
    if (r && r.destination) return { ok: true, provider: provider.name, destination: r.destination, chain: [...chain, r.destination], ms: Date.now() - t0, method: 'form-post' };
    return { ok: false, needManual: true, provider: provider.name, manualUrl: pageUrl,
      reason: 'ShrinkMe diblokir Cloudflare dari server. Selesaikan manual di browser kamu.',
      chain, ms: Date.now() - t0 };
  }
  if (provider.fn === 'linkvertise') {
    const r = await flowLinkvertise(pageUrl, deadline);
    if (r) return { ok: true, provider: provider.name, destination: r.destination, chain: [...chain, r.destination], ms: Date.now() - t0, method: 'api' };
  }

  // 3-6) loop: ikuti redirect JS satu-host (mis. sub4unlock S -> LP.php), lalu ekstraksi
  for (let hop = 0; hop < 3; hop++) {
    if (Date.now() > deadline - 2000) break;

    // 3) meta refresh
    const mr = metaRefresh(html);
    if (mr) {
      if (hostOf(mr) !== selfHost) {
        return { ok: true, provider: provider.name, destination: mr, chain: [...chain, mr], ms: Date.now() - t0, method: 'meta-refresh' };
      }
      // same-host: ikuti
      const nxt = await fetchChain(mr, deadline, jar);
      if (nxt.html) { html = nxt.html; pageUrl = nxt.url; selfHost = hostOf(pageUrl); chain = [...chain, ...nxt.chain.slice(1)]; continue; }
    }

    // 4) JS redirect — bedakan host lain (tujuan) vs host sama (langkah lanjutan, ikuti)
    // Filter URL iklan/popunder dulu biar tidak kepilih sebagai "tujuan"
    const allJsr = jsRedirects(html).filter(u => !isSuspiciousAdHost(hostOf(u)) && u.indexOf('+') < 0 && !/[?=]$/.test(u));
    const extJsr = allJsr.filter(u => hostOf(u) !== selfHost);
    if (extJsr.length > 0) {
      return { ok: true, provider: provider.name, destination: extJsr[0], chain: [...chain, extJsr[0]], ms: Date.now() - t0, method: 'js-redirect', candidates: extJsr.slice(1, 6) };
    }
    const sameJsr = allJsr.filter(u => hostOf(u) === selfHost);
    if (sameJsr.length > 0) {
      const nxt = await fetchChain(sameJsr[0], deadline, jar);
      if (nxt.html) { html = nxt.html; pageUrl = nxt.url; selfHost = hostOf(pageUrl); chain = [...chain, ...nxt.chain.slice(1)]; continue; }
    }

    // 5) base64
    const b64 = base64Candidates(html).filter(u => hostOf(u) !== selfHost);
    if (b64.length > 0) {
      return { ok: true, provider: provider.name, destination: b64[0], chain: [...chain, b64[0]], ms: Date.now() - t0, method: 'base64', candidates: b64.slice(1, 6) };
    }

    // 6) kandidat generik — user pilih sendiri
    const cands = genericCandidates(html, selfHost).slice(0, 8);
    if (cands.length > 0) {
      return { ok: true, provider: provider.name, destination: cands[0], chain, ms: Date.now() - t0, method: 'tebak', candidates: cands.slice(1), note: 'Link tidak terdeteksi otomatis — ini tebakan terbaik, cek daftar kandidat.' };
    }
    break;
  }

  return { ok: false, provider: provider.name, error: 'Tidak bisa menemukan link asli. Situs ini mungkin butuh JavaScript/browser.', chain, ms: Date.now() - t0 };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const raw = ((req.query && req.query.url) || '').toString().trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'Parameter ?url= wajib diisi.' });
    const deadline = Date.now() + 26000;
    const out = await resolveUrl(raw, deadline, req.query.manual === '1');
    // v10: kejar final hop untuk dapat link download langsung (MediaFire dsb)
    if (out && out.ok && out.destination) {
      try {
        const fin = await finalHop(out.destination, deadline);
        if (fin && fin.finalUrl) {
          out.finalUrl = fin.finalUrl;
          out.finalVia = fin.via;
        }
      } catch (e) {}
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Error server: ' + e.message });
  }
};
