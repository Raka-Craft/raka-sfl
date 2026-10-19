/* SUBSAFE BYPASS — multi-provider (AdFly, Ouo, Linkvertise, SafelinkU, ShrinkMe, Shortener, dst) — serverless link resolver. Tanpa batas, tanpa login. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PROVIDERS = [
 { hosts: ['adf.ly', 'adfoc.us', 'j.gs', 'q.gs', 'bc.vc'], name: 'AdFly', fn: 'adfly' },
 { hosts: ['ouo.io', 'ouo.press'], name: 'Ouo.io', fn: 'ouo' },
 { hosts: ['exe.io', 'exeo.app'], name: 'Exe.io', fn: 'ouoLike' },
 { hosts: ['linkvertise.com', 'linkvertise.net'], name: 'Linkvertise', fn: 'linkvertise' },
 { hosts: ['sfl.gl', 'safelinku.com'], name: 'SafelinkU', fn: 'safelinku' },
 { hosts: ['sub4unlock.com', 'sub4unlock.co', 'sub4unlock.io', 'sub2unlock.com', 'unlocksubs.com'], name: 'SubUnlock', fn: 'subunlock' },
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
const MEDIAFIRE_FIRST = true;

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
 const score = (url) => {
 const h = hostOf(url);
 // v10: MediaFire skor tertinggi
 if (h === 'mediafire.com' || h.endsWith('.mediafire.com')) return 100;
 if (FILE_HOSTS.some(f => h === f || h.endsWith('.' + f))) return 50;
 // URL dengan ekstensi file download
 if (/\.(zip|rar|7z|apk|xapk|pdf|mp4|mkv|mp3)$/i.test(url)) return 30;
 return 0;
 };
 const ranked=[...found.entries()].sort((x,y)=>{
 const sx = score(x[0]), sy = score(y[0]);
 if (sx !== sy) return sy - sx;
 return y[1] - x[1];
 });
 return ranked.map(e=>e[0]);
}


const learnedPatterns = {}; // domain -> { method, pattern }

function learnPattern(domain, method, detail) {
 learnedPatterns[domain] = { method, detail, learnedAt: Date.now() };
}

function getLearnedPattern(domain) {
 return learnedPatterns[domain] || null;
}

function findContinueLinks(html, selfHost) {
 const results = [];
 // <a> dengan teks continue/skip/lanjut
 const re1 = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{0,80})<\/a>/gi;
 let m;
 while ((m = re1.exec(html)) !== null) {
 const text = (m[2] || '').toLowerCase();
 if (/continue|skip|lanjut|lewati|proceed|klik|click here|download/i.test(text)) {
 const u = validHttpUrl(m[1]);
 if (u && hostOf(u) !== selfHost) results.push({ url: u, method: 'continue-button', text: m[2].trim().slice(0, 40) });
 }
 }
 return results;
}

function findFormActions(html, pageUrl, selfHost) {
 const results = [];
 const re = /<form[^>]+action=["']([^"']+)["'][^>]*>/gi;
 let m;
 while ((m = re.exec(html)) !== null) {
 try {
 const u = new URL(m[1], pageUrl).href;
 if (hostOf(u) !== selfHost || m[1].includes('download')) {
 results.push({ url: validHttpUrl(u), method: 'form-submit' });
 }
 } catch (e) {}
 }
 return results.filter(r => r.url);
}

function findTimerReveals(html) {
 const results = [];
 const patterns = [
 /setTimeout\s*\(\s*function\s*\(\)\s*\{[^}]*?(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
 /setTimeout\s*\(\s*["'](?:window\.)?location(?:\.href)?\s*=\s*['"]?([^"';]+)/gi,
 /countdown[^}]{0,200}?(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
 ];
 for (const re of patterns) {
 let m;
 while ((m = re.exec(html)) !== null) {
 const u = validHttpUrl(m[1]);
 if (u) results.push({ url: u, method: 'timer-reveal' });
 }
 }
 return results;
}

function findDirectDownloads(html, selfHost) {
 const results = [];
 const re = /https?:\/\/[^\s"'<>\\]+\.(zip|rar|7z|apk|xapk|pdf|mp4|mkv|mp3|exe|dmg)(\?[^\s"'<>]*)?/gi;
 let m;
 while ((m = re.exec(html)) !== null) {
 const u = validHttpUrl(m[0]);
 if (u) results.push({ url: u, method: 'direct-download' });
 }
 return results;
}

function findDataUrls(html) {
 const results = [];
 const re = /data-(?:url|href|link|download)=["']([^"']+)["']/gi;
 let m;
 while ((m = re.exec(html)) !== null) {
 const u = validHttpUrl(m[1]);
 if (u) results.push({ url: u, method: 'data-attribute' });
 }
 return results;
}

async function autoLearnBypass(pageUrl, html, deadline, jar) {
 const domain = hostOf(pageUrl);
 const selfHost = domain;

 const learned = getLearnedPattern(domain);
 if (learned) {
 // Coba pola yang sudah dipelajari dulu
 const retry = await tryLearnedPattern(pageUrl, html, learned, deadline, jar);
 if (retry) return { ...retry, learned: true, pattern: learned.method };
 }

 // Urutan pola dari yang paling mungkin berhasil
 const strategies = [
 { name: 'direct-download', fn: () => findDirectDownloads(html, selfHost) },
 { name: 'continue-button', fn: () => findContinueLinks(html, selfHost) },
 { name: 'timer-reveal', fn: () => findTimerReveals(html) },
 { name: 'form-submit', fn: () => findFormActions(html, pageUrl, selfHost) },
 { name: 'data-attribute', fn: () => findDataUrls(html) },
 ];

 for (const strat of strategies) {
 if (Date.now() > deadline - 3000) break;
 try {
 const candidates = strat.fn();
 for (const cand of candidates.slice(0, 3)) {
 if (Date.now() > deadline - 2000) break;
 // Verifikasi: coba fetch URL kandidat
 try {
 const test = await fetchT(cand.url, { redirect: 'manual', headers: baseHeaders(jar) }, 5000);
 const loc = test.headers.get('location');
 try { await test.arrayBuffer().catch(() => {}); } catch (e) {}
 const finalUrl = loc ? new URL(loc, cand.url).href : cand.url;
 const fh = hostOf(finalUrl);
 const isFile = FILE_HOSTS.some(f => fh === f || fh.endsWith('.' + f)) ||
 /\.(zip|rar|7z|apk|xapk|pdf|mp4|mkv|mp3)$/i.test(finalUrl);
 if (isFile || test.status === 200) {
 // PELAJARI: ingat pola ini untuk domain ini
 learnPattern(domain, strat.name, cand.method);
 return {
 destination: finalUrl,
 method: 'auto-learned:' + strat.name,
 learned: true,
 pattern: strat.name,
 detail: cand.text || cand.method,
 };
 }
 } catch (e) { /* lanjut ke kandidat berikutnya */ }
 }
 } catch (e) { /* lanjut ke strategi berikutnya */ }
 }
 return null;
}

async function tryLearnedPattern(pageUrl, html, learned, deadline, jar) {
 const selfHost = hostOf(pageUrl);
 const strategies = {
 'direct-download': () => findDirectDownloads(html, selfHost),
 'continue-button': () => findContinueLinks(html, selfHost),
 'timer-reveal': () => findTimerReveals(html),
 'form-submit': () => findFormActions(html, pageUrl, selfHost),
 'data-attribute': () => findDataUrls(html),
 };
 const fn = strategies[learned.method];
 if (!fn) return null;
 const candidates = fn();
 if (candidates.length > 0) {
 return { destination: candidates[0].url, method: 'learned:' + learned.method };
 }
 return null;
}


/* ============================================================
 v11 CAPTCHA SOLVER + RETRY AGRESIF
 - Selesaikan CAPTCHA sederhana (matematika, teks) otomatis
 - Kalau gagal sekali, COBA TERUS sampai berhasil atau deadline
 - Kecuali Cloudflare (Turnstile) -> tetap mode manual
 ============================================================ */

function isCloudflare(html) {
 if (!html) return false;
 return html.includes('challenges.cloudflare.com') ||
 html.includes('Just a moment...') ||
 html.includes('cf-challenge') ||
 html.includes('turnstile');
}

function solveMathCaptcha(html) {
 const patterns = [
 /(\d+)\s*\+\s*(\d+)\s*=\s*\?/,
 /(\d+)\s*-\s*(\d+)\s*=\s*\?/,
 /(\d+)\s*[x×]\s*(\d+)\s*=\s*\?/,
 /berapa\s+(\d+)\s*\+\s*(\d+)/i,
 /berapa\s+(\d+)\s*-\s*(\d+)/i,
 /what\s+is\s+(\d+)\s*\+\s*(\d+)/i,
 ];
 for (const re of patterns) {
 const m = html.match(re);
 if (m) {
 const a = parseInt(m[1]), b = parseInt(m[2]);
 const op = m[0];
 if (op.includes('+')) return String(a + b);
 if (op.includes('-')) return String(a - b);
 if (/[x×]/.test(op)) return String(a * b);
 }
 }
 return null;
}

function findCaptchaForm(html, pageUrl) {
 // Cari input captcha
 const hasCaptcha = /captcha/i.test(html);
 if (!hasCaptcha) return null;

 const answer = solveMathCaptcha(html);
 // Cari form action
 const fm = html.match(/<form[^>]*action=["']([^"']*)["'][^>]*>/i);
 const action = fm ? fm[1] : pageUrl;
 // Cari nama field input
 const fieldM = html.match(/<input[^>]*name=["']([^"']*captcha[^"']*)["']/i) ||
 html.match(/<input[^>]*name=["']([^"']+)["'][^>]*placeholder=["'][^"']*captcha/i);
 const fieldName = fieldM ? fieldM[1] : 'captcha';

 return { action, fieldName, answer, hasCaptcha: true };
}

async function trySolveCaptcha(pageUrl, html, deadline, jar) {
 // Kecuali Cloudflare!
 if (isCloudflare(html)) return { cloudflare: true };

 const captcha = findCaptchaForm(html, pageUrl);
 if (!captcha || !captcha.answer) return null;

 try {
 const actionUrl = new URL(captcha.action, pageUrl).href;
 // Ambil semua hidden input
 const hidden = {};
 const re = /<input[^>]*type=["']hidden["'][^>]*>/gi;
 let m;
 while ((m = re.exec(html)) !== null) {
 const nm = m[0].match(/name=["']([^"']+)["']/i);
 const vl = m[0].match(/value=["']([^"']*)["']/i);
 if (nm) hidden[nm[1]] = vl ? vl[1] : '';
 }
 hidden[captcha.fieldName] = captcha.answer;

 const body = new URLSearchParams(hidden).toString();
 const r = await fetchT(actionUrl, {
 method: 'POST', redirect: 'manual',
 headers: { ...baseHeaders(jar), 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': pageUrl },
 body,
 }, 8000);
 storeCookies(jar, r.headers);
 const loc = r.headers.get('location');
 const newHtml = await r.text().catch(() => '');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}

 if (loc) {
 const dest = new URL(loc, actionUrl).href;
 return { solved: true, destination: dest, method: 'captcha-solved' };
 }
 if (!/captcha/i.test(newHtml) || newHtml.length > html.length) {
 return { solved: true, html: newHtml, url: actionUrl, method: 'captcha-solved' };
 }
 return { solved: false };
 } catch (e) {
 return { solved: false, error: e.message };
 }
}

async function aggressiveRetry(resolveFn, maxAttempts, deadline) {
 let lastError = null;
 for (let i = 1; i <= maxAttempts; i++) {
 if (Date.now() > deadline - 3000) break;
 try {
 const result = await resolveFn(i);
 if (result && result.ok) {
 if (i > 1) result.retries = i - 1;
 return result;
 }
 lastError = result;
 // Jangan retry kalau butuh manual (Cloudflare)
 if (result && result.needManual) return result;
 } catch (e) {
 lastError = { ok: false, error: e.message };
 }
 // v12: backoff cepat, gas terus!
 if (i < maxAttempts && Date.now() < deadline - 3000) {
 await new Promise(r => setTimeout(r, Math.min(300 * i, 1200)));
 }
 }
 if (lastError && typeof lastError === 'object') {
 lastError.retriesExhausted = true;
 return lastError;
 }
 return { ok: false, error: 'Gagal setelah beberapa kali percobaan.' };
}


/* ============================================================
 v13 IMAGE CAPTCHA SOLVER - "akalin semua cara!"
 Trik yang dicoba (berurutan):
 1. Cari jawaban di source HTML/JS (kadang jawabannya ada di kode!)
 2. Audio CAPTCHA fallback (fitur aksesibilitas reCAPTCHA)
 3. Tebak pola umum (beberapa CAPTCHA sederhana bisa ditebak)
 4. Cari API backend yang tidak validasi CAPTCHA dengan benar
 ============================================================ */

function findLeakedCaptchaAnswer(html) {
 const patterns = [
 // Jawaban dalam variabel JS
 /(?:captcha[_-]?answer|captcha[_-]?solution|captcha[_-]?key)\s*[=:]\s*["']([^"']+)["']/i,
 // Data attribute
 /data-captcha-answer=["']([^"']+)["']/i,
 // Komentar HTML (kadang developer lupa hapus)
 /<!--[^-]*captcha[^:]*:\s*([^\s-]+)\s*-->/i,
 // Hidden input dengan jawaban
 /<input[^>]*name=["'](?:captcha_answer|solution)["'][^>]*value=["']([^"']+)["']/i,
 ];
 for (const re of patterns) {
 const m = html.match(re);
 if (m && m[1] && m[1].length < 50) return m[1];
 }
 return null;
}

function detectRecaptcha(html) {
 return html.includes('google.com/recaptcha') ||
 html.includes('g-recaptcha') ||
 html.includes('recaptcha/api');
}

function getRecaptchaSitekey(html) {
 const m = html.match(/data-sitekey=["']([^"']+)["']/i) ||
 html.match(/sitekey["']?\s*:\s*["']([^"']+)["']/i);
 return m ? m[1] : null;
}

function findBypassEndpoints(html, pageUrl) {
 const endpoints = [];
 const patterns = [
 /["'](\/api\/(?:verify|check|validate|bypass|go|continue)[^"']*)["']/gi,
 /["']((?:https?:)?\/\/[^"']*\/(?:api|ajax)\/[^"']*)["']/gi,
 ];
 for (const re of patterns) {
 let m;
 while ((m = re.exec(html)) !== null) {
 try {
 const u = new URL(m[1], pageUrl).href;
 if (!endpoints.includes(u)) endpoints.push(u);
 } catch (e) {}
 }
 }
 return endpoints.slice(0, 5);
}

async function tryImageCaptchaTricks(pageUrl, html, deadline, jar) {
 const tricks = [];

 // Trik 1: Jawaban bocor
 const leaked = findLeakedCaptchaAnswer(html);
 if (leaked) {
 tricks.push({ trick: 'leaked-answer', answer: leaked });
 // Coba submit jawaban yang bocor
 const result = await submitCaptchaAnswer(pageUrl, html, leaked, deadline, jar);
 if (result && result.solved) return { ...result, trick: 'leaked-answer' };
 }

 // Trik 2: Cari API bypass
 const endpoints = findBypassEndpoints(html, pageUrl);
 for (const ep of endpoints) {
 if (Date.now() > deadline - 3000) break;
 try {
 // Coba panggil API langsung tanpa CAPTCHA
 const r = await fetchT(ep, {
 method: 'POST', redirect: 'manual',
 headers: { ...baseHeaders(jar), 'Content-Type': 'application/json', 'Referer': pageUrl },
 body: JSON.stringify({}),
 }, 6000);
 const text = await r.text().catch(() => '');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 // Cek apakah response berisi URL
 const urlM = text.match(/https?:\/\/[^\s"'<>\\]+/);
 if (urlM) {
 const u = validHttpUrl(urlM[0]);
 if (u && hostOf(u) !== hostOf(pageUrl)) {
 return { solved: true, destination: u, trick: 'api-bypass', method: 'image-captcha-bypassed' };
 }
 }
 } catch (e) {}
 }

 if (detectRecaptcha(html)) {
 const sitekey = getRecaptchaSitekey(html);
 return {
 solved: false,
 hasRecaptcha: true,
 sitekey,
 message: 'Situs ini pakai reCAPTCHA gambar. Coba mode manual atau audio CAPTCHA.'
 };
 }

 return { solved: false, tricksAttempted: tricks.length };
}

async function submitCaptchaAnswer(pageUrl, html, answer, deadline, jar) {
 try {
 const fm = html.match(/<form[^>]*action=["']([^"']*)["'][^>]*>/i);
 const actionUrl = fm ? new URL(fm[1], pageUrl).href : pageUrl;

 const hidden = {};
 const re = /<input[^>]*type=["']hidden["'][^>]*>/gi;
 let m;
 while ((m = re.exec(html)) !== null) {
 const nm = m[0].match(/name=["']([^"']+)["']/i);
 const vl = m[0].match(/value=["']([^"']*)["']/i);
 if (nm) hidden[nm[1]] = vl ? vl[1] : '';
 }
 // Tambah jawaban CAPTCHA
 hidden['captcha'] = answer;
 hidden['g-recaptcha-response'] = answer;

 const body = new URLSearchParams(hidden).toString();
 const r = await fetchT(actionUrl, {
 method: 'POST', redirect: 'manual',
 headers: { ...baseHeaders(jar), 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': pageUrl },
 body,
 }, 8000);
 storeCookies(jar, r.headers);
 const loc = r.headers.get('location');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}

 if (loc) {
 return { solved: true, destination: new URL(loc, actionUrl).href };
 }
 return { solved: false };
 } catch (e) {
 return { solved: false };
 }
}


const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; Redmi Note 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

async function tryCloudflareBypass(pageUrl, deadline, jar) {
 const tricks = [];

 // Trik 1: Google Translate proxy
 try {
 const u = new URL(pageUrl);
 const gtHost = u.hostname.replace(/\./g, '-') + '.translate.goog';
 const sep = u.search ? '&' : '?';
 const gtUrl = 'https://' + gtHost + u.pathname + u.search + sep + '_x_tr_sl=en&_x_tr_tl=id&_x_tr_hl=id';
 if (Date.now() < deadline - 5000) {
 const r = await fetchT(gtUrl, { redirect: 'manual', headers: baseHeaders(jar) }, 10000);
 const ct = (r.headers.get('content-type') || '').toLowerCase();
 storeCookies(jar, r.headers);
 if (ct.includes('html')) {
 const html = await r.text().catch(() => '');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 if (html && html.length > 1000 && !html.includes('Just a moment') && !html.includes('challenges.cloudflare')) {
 tricks.push('google-translate');
 return { html, url: gtUrl, trick: 'google-translate', jar };
 }
 }
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 }
 } catch (e) { tricks.push('gt-fail'); }

 // Trik 2: Coba dengan Mobile UA + header lengkap
 try {
 if (Date.now() < deadline - 5000) {
 const mobileHeaders = {
 ...baseHeaders(jar),
 'User-Agent': MOBILE_UA,
 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
 'Sec-Ch-Ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
 'Sec-Ch-Ua-Mobile': '?1',
 'Sec-Ch-Ua-Platform': '"Android"',
 'Sec-Fetch-Dest': 'document',
 'Sec-Fetch-Mode': 'navigate',
 'Sec-Fetch-Site': 'none',
 'Upgrade-Insecure-Requests': '1',
 };
 const r = await fetchT(pageUrl, { redirect: 'manual', headers: mobileHeaders }, 10000);
 storeCookies(jar, r.headers);
 const ct = (r.headers.get('content-type') || '').toLowerCase();
 if (ct.includes('html')) {
 const html = await r.text().catch(() => '');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 if (html && html.length > 1000 && !html.includes('Just a moment') && !html.includes('challenges.cloudflare')) {
 tricks.push('mobile-ua');
 return { html, url: pageUrl, trick: 'mobile-ua', jar };
 }
 }
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 }
 } catch (e) { tricks.push('mobile-fail'); }

 return { tricks, failed: true };
}


function resolveAbs(base, href) {
 try {
 if (!href) return null;
 href = href.trim();
 if (/^(javascript|data|mailto|tel):/i.test(href)) return null;
 const u = new URL(href, base);
 return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
 } catch (e) { return null; }
}

const HUNT_WORDS = [
 [/free\s*download/i, 95],
 [/download|unduh/i, 90],
 [/get\s*link|dapatkan/i, 85],
 [/continue|lanjut/i, 80],
 [/\bnext\b|berikut/i, 75],
 [/skip|lewati/i, 70],
 [/proceed/i, 65],
 [/verify|verifikasi/i, 40],
 [/submit|kirim/i, 35],
 [/click|klik/i, 30],
];

function scoreHunt(text, href, cls) {
 let sc = 0;
 const t = String(text || '');
 for (const [re, pts] of HUNT_WORDS) { if (re.test(t)) sc = Math.max(sc, pts); }
 const hh = String(href || '').toLowerCase();
 if (/download|\/go\/|\/out\//i.test(hh)) sc += 20;
 else if (/next|continue|lanjut|skip/i.test(hh)) sc += 10;
 if (/download|continue|skip|next|proceed/i.test(String(cls || ''))) sc += 15;
 return sc;
}

function findHuntButtons(html, pageUrl) {
 const out = [], seen = new Set();
 // 1) semua <a>
 const reA = /<a\b([^>]*)>([\s\S]{0,150}?)<\/a>/gi;
 let m;
 while ((m = reA.exec(html)) !== null) {
 const attrs = m[1];
 const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
 const hm = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
 if (!hm) continue;
 const cm = attrs.match(/(?:class|id)\s*=\s*["']([^"']+)["']/i);
 const sc = scoreHunt(inner, hm[1], cm ? cm[1] : '');
 if (sc < 25) continue;
 const u = resolveAbs(pageUrl, hm[1]);
 if (!u || seen.has(u)) continue;
 if (isSuspiciousAdHost(hostOf(u))) continue;
 seen.add(u);
 out.push({ url: u, score: sc, text: inner.slice(0, 40) });
 }
 const reB = /<button\b([^>]*)>([\s\S]{0,80}?)<\/button>/gi;
 while ((m = reB.exec(html)) !== null) {
 const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
 if (!/download|unduh|continue|next|lanjut|skip|lewati|proceed/i.test(inner)) continue;
 const before = html.slice(Math.max(0, m.index - 1500), m.index);
 const fm = before.match(/<form\b[^>]*action\s*=\s*["']([^"']+)["'][^>]*>(?!.*<form\b)/is);
 const act = fm ? fm[1] : pageUrl;
 const u = resolveAbs(pageUrl, act);
 if (!u || seen.has(u)) continue;
 if (isSuspiciousAdHost(hostOf(u))) continue;
 seen.add(u);
 out.push({ url: u, score: 80, text: 'btn:' + inner.slice(0, 30) });
 }
 // 3) <form> yang isinya download-ish
 const reF = /<form\b([^>]*)>([\s\S]{0,1500}?)<\/form>/gi;
 while ((m = reF.exec(html)) !== null) {
 if (!/download|unduh|continue|next|lanjut|skip|lewati|proceed/i.test(m[2])) continue;
 const am = m[1].match(/action\s*=\s*["']([^"']+)["']/i);
 const u = resolveAbs(pageUrl, am ? am[1] : pageUrl);
 if (!u || seen.has(u)) continue;
 if (isSuspiciousAdHost(hostOf(u))) continue;
 seen.add(u);
 out.push({ url: u, score: 70, text: 'form' });
 }
 return out.sort((a, b) => b.score - a.score);
}

function isFinalDestination(url) {
 const h = hostOf(url);
 if (!h) return false;
 if (h === 'mediafire.com' || h.endsWith('.mediafire.com')) return true;
 if (FILE_HOSTS.some(f => h === f || h.endsWith('.' + f))) return true;
 if (/\.(zip|rar|7z|apk|xapk|pdf|mp4|mkv|mp3|exe|dmg)(\?|$)/i.test(url)) return true;
 return false;
}

async function buttonHunterFlow(pageUrl, html, deadline, jar) {
 const visited = new Set();
 let cur = { url: pageUrl, html };
 for (let step = 0; step < 6; step++) {
 if (Date.now() > deadline - 4000) break;
 const key = cur.url.split('#')[0];
 if (visited.has(key)) break;
 visited.add(key);
 // Sudah sampai tujuan akhir?
 if (step > 0 && isFinalDestination(cur.url)) {
 return { destination: cur.url, steps: step };
 }
 // Buru tombol di halaman ini
 const btns = findHuntButtons(cur.html || '', cur.url);
 let nxt = null;
 for (const b of btns) {
 if (visited.has(b.url.split('#')[0])) continue;
 nxt = b; break;
 }
 if (!nxt) break;
 // Ikuti tombol terbaik
 try {
 const r = await fetchT(nxt.url, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': cur.url } }, 9000);
 storeCookies(jar, r.headers);
 const loc = r.headers.get('location');
 const ct = (r.headers.get('content-type') || '').toLowerCase();
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 if (loc) {
 const dest = new URL(loc, nxt.url).href;
 if (isFinalDestination(dest)) return { destination: dest, steps: step + 1 };
 const f2 = await fetchChain(dest, deadline, jar);
 if (f2.html) { cur = { url: f2.url, html: f2.html }; continue; }
 break;
 }
 if (ct.includes('html')) {
 const h2 = await (await fetchT(nxt.url, { redirect: 'follow', headers: { ...baseHeaders(jar), 'Referer': cur.url } }, 9000)).text().catch(() => '');
 cur = { url: nxt.url, html: h2 };
 continue;
 }
 break;
 } catch (e) { break; }
 }
 return null;
}

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

async function bypassViaRip(linkUrl, deadline) {
const crypto=require('crypto');
try{
const ep='https://api.linkvertise.lol/backend/bypass?url='+encodeURIComponent(linkUrl);
const r1=await fetchT(ep,{headers:{'User-Agent':'Mozilla/5.0'}},10000);
const html=await r1.text().catch(()=> '');
try{await r1.arrayBuffer().catch(()=>{});}catch(e){}
const sm=html.match(/(\{"prefix":"[0-9a-f]+".*?\})/);
if(!sm)return null;
const spec=JSON.parse(sm[1]);
const bits=Math.round(parseFloat(spec.diff)*4),w=Math.ceil(bits/4),sp=w*4-bits;
let nonce=-1;
for(let n=0;n<8000000;n++){
if(Date.now()>deadline-5000)return null;
const h=crypto.createHash('sha256').update(spec.prefix+':'+n).digest('hex');
let v=parseInt(h.slice(0,w),16);if(sp)v>>>=sp;
if(v===0){nonce=n;break;}
}
if(nonce<0)return null;
const csrfM=html.match(/name="rg_csrf"[^>]*value="([^"]*)"/);
const fd=new URLSearchParams({rg_pow_prefix:spec.prefix,rg_pow_exp:spec.exp,rg_pow_diff:spec.diff,rg_pow_sig:spec.sig,rg_pow_nonce:String(nonce),rg_csrf:csrfM?csrfM[1]:''});
const r2=await fetchT(ep,{method:'POST',body:fd.toString(),headers:{'User-Agent':'Mozilla/5.0','Content-Type':'application/x-www-form-urlencoded'}},15000);
const txt=await r2.text().catch(()=> '');
try{await r2.arrayBuffer().catch(()=>{});}catch(e){}
for(const line of txt.split('\n')){
if(line.startsWith('data: ')){
try{const ev=JSON.parse(line.slice(6));
if(ev.result&&ev.success){const v=validHttpUrl(ev.result);
if(v&&!/linkvertise\.com$/i.test(hostOf(v)))return{destination:v};}}catch(e){}
}}
return null;
}catch(e){return null;}
}

async function flowLinkvertise(pageUrl, deadline) {
 try {
 const u = new URL(pageUrl);
 const rParam = u.searchParams.get('r');
 if (rParam) {
 try {
 const decoded = Buffer.from(decodeURIComponent(rParam), 'base64').toString();
 const v = validHttpUrl(decoded);
 if (v) return { destination: v, via: 'dynamic-b64' };
 } catch (e) {}
 }
 const parts = u.pathname.split('/').filter(Boolean).slice(0, 2);
 if (parts.length < 1) return null;
 const path = '/' + parts.join('/');
 const h = { 'User-Agent': UA, 'Accept': 'application/json' };
 const r1 = await fetchT('https://publisher.linkvertise.com/api/v1/redirect/link/static' + path, { headers: h }, 6000);
 const j1 = await r1.json().catch(() => null);
 try { await r1.arrayBuffer().catch(() => {}); } catch (e) {}
 const linkId = j1 && j1.data && j1.data.link && j1.data.link.id;
 if (!linkId) return null;
 const serial = Buffer.from(JSON.stringify({ timestamp: Date.now(), random: String(Math.floor(Math.random()*9999999)), link_id: linkId })).toString('base64');
 const r2 = await fetchT('https://publisher.linkvertise.com/api/v1/redirect/link' + path + '/target?serial=' + encodeURIComponent(serial), { method: 'POST', headers: h }, 6000);
 const j2 = await r2.json().catch(() => null);
 try { await r2.arrayBuffer().catch(() => {}); } catch (e) {}
 const target = j2 && j2.data && (j2.data.target || (j2.data.link && j2.data.link.url));
 const v = target && validHttpUrl(target);
 if (v && /linkvertise\.com$/i.test(hostOf(v))) return null;
 return v ? { destination: v } : null;
 } catch (e) { return null; }
}

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
async function fetchBypassCF(url, opts, ms, jar) {
 let r = await fetchT(url, opts, ms);
 let ct = (r.headers.get('content-type') || '').toLowerCase();
 if (ct.includes('html')) {
 const h = await r.text().catch(() => '');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 if (h && !h.includes('Just a moment') && !h.includes('challenges.cloudflare.com')) {
 return { ok: true, html: h, headers: r.headers, via: 'direct' };
 }
 } else {
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 }
 // Kena Cloudflare -> coba Google Translate proxy
 try {
 const u = new URL(url);
 const gtHost = u.hostname.replace(/\./g, '-') + '.translate.goog';
 const sep = u.search ? '&' : '?';
 const gtUrl = 'https://' + gtHost + u.pathname + u.search + sep + '_x_tr_sl=en&_x_tr_tl=id&_x_tr_hl=id';
 const r2 = await fetchT(gtUrl, { redirect: 'manual', headers: baseHeaders(jar) }, ms);
 const ct2 = (r2.headers.get('content-type') || '').toLowerCase();
 storeCookies(jar, r2.headers);
 if (ct2.includes('html')) {
 const h2 = await r2.text().catch(() => '');
 try { await r2.arrayBuffer().catch(() => {}); } catch (e) {}
 if (h2 && h2.length > 1000 && !h2.includes('Just a moment')) {
 return { ok: true, html: h2, headers: r2.headers, via: 'gtranslate' };
 }
 }
 try { await r2.arrayBuffer().catch(() => {}); } catch (e) {}
 } catch (e) {}
 return { ok: false };
}

async function flowShrinkme(pageUrl, html, deadline, jar) {
 try {
 const u = new URL(pageUrl);
 const alias = u.pathname.replace(/\//g, '');
 if (!alias) return null;
 // 1) cookie (v18: lolos CF)
 const b1 = await fetchBypassCF('https://shrinkme.click/' + alias, { headers: baseHeaders(jar) }, 8000, jar);
 if (!b1.ok) return null;
 storeCookies(jar, b1.headers);
 // 2) form (v18: lolos CF)
 const b2 = await fetchBypassCF('https://en.mrproblogger.com/' + alias, {
 headers: { ...baseHeaders(jar), 'Referer': 'https://themezon.net/' },
 }, 8000, jar);
 if (!b2.ok) return null;
 storeCookies(jar, b2.headers);
 const h2 = b2.html;
 if (!h2) return null;
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
 // 4) tunggu counter
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

async function resolveUrl(raw, deadline, isManualContinue) {
 const t0 = Date.now();
 const start = validHttpUrl(raw);
 if (!start) return { ok: false, error: 'URL tidak valid. Pakai format https://...' };

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

 // 1) redirect murni ke host lain
 if (provider.fn !== 'manual' && first.chain.length > 1) {
 const dest = first.chain[first.chain.length - 1];
 if (hostOf(dest) !== hostOf(start)) {
 if (!isFinalDestination(dest) && first.html && Date.now() < deadline - 8000) {
 const deeper = await buttonHunterFlow(dest, first.html, deadline, jar);
 if (deeper && deeper.destination) {
 return { ok: true, provider: provider.name + ' (Deep)', destination: deeper.destination,
 chain: [...first.chain, deeper.destination], ms: Date.now() - t0, method: 'redirect+deep' };
 }
 const gc = genericCandidates(first.html, hostOf(dest)).filter(u => isFinalDestination(u));
 if (gc.length > 0) {
 return { ok: true, provider: provider.name + ' (Deep)', destination: gc[0],
 chain: [...first.chain, gc[0]], ms: Date.now() - t0, method: 'redirect+deep' };
 }
 }
 return { ok: true, provider: provider.name, destination: dest, chain: first.chain, ms: Date.now() - t0, method: 'redirect' };
 }
 }
 if (first.error && !first.html) {
 return { ok: false, provider: provider.name, error: first.error, chain: first.chain, ms: Date.now() - t0 };
 }

 // (disimpan ke first.html agar dipakai di bawah)
 if (first.html && (first.html.includes('Just a moment') || first.html.includes('challenges.cloudflare.com'))) {
 const cfResult = await tryCloudflareBypass(first.url, deadline, jar);
 if (cfResult && !cfResult.failed && cfResult.html) {
 first.html = cfResult.html;
 }
 }

 if (provider.fn === 'manual') {
 return { ok: false, needManual: true, provider: provider.name, manualUrl: first.url,
 reason: provider.reason || 'Link ini butuh verifikasi CAPTCHA manual.',
 chain: first.chain, ms: Date.now() - t0 };
 }

 let html = first.html || '';
 let pageUrl = first.url;
 let selfHost = hostOf(pageUrl);
 let chain = first.chain;

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
 if (provider.fn === 'subunlock') {
 try {
 const dp = html.match(/data-page="([^"]{100,20000})"/);
 if (dp) {
 const unesc = dp[1].replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/&amp;/g, '&');
 const um = unesc.match(/"link"\s*:\s*\{[^}]{0,500}?"url"\s*:\s*"([^"]+)"/);
 if (um) {
 const dest0 = validHttpUrl(um[1].replace(/\\/g, ''));
 if (dest0 && hostOf(dest0) !== hostOf(pageUrl)) {
 // v20: destinasi masih shortener -> rekursif
 const dh = hostOf(dest0);
 const isShort = PROVIDERS.some(p => p.hosts.some(h => dh === h || dh.endsWith('.' + h)));
 if (isShort && Date.now() < deadline - 8000) {
 const sub = await resolveUrl(dest0, deadline, false);
 if (sub && sub.ok && sub.destination) {
 return { ok: true, provider: provider.name + ' → ' + sub.provider,
 destination: sub.destination, chain: [...chain, dest0, ...sub.chain.slice(1)],
 ms: Date.now() - t0, method: 'subunlock-data+recursive' };
 }
 }
 return { ok: true, provider: provider.name, destination: dest0,
 chain: [...chain, dest0], ms: Date.now() - t0, method: 'subunlock-data' };
 }
 }
 }
 } catch (e) {}
 const fm = html.match(/<form[^>]*action=["']([^"']*redirect\.php[^"']*)["'][^>]*>/i);
 if (fm) {
 const code = (html.match(/name=["']code["']\s+value=["']([^"']+)["']/i) || [])[1];
 const token = (html.match(/name=["']token["']\s+value=["']([^"']+)["']/i) || [])[1];
 if (code && token) {
 try {
 const actionUrl = new URL(fm[1], pageUrl).href;
 const submitUrl = actionUrl + (actionUrl.includes('?') ? '&' : '?') +
 'code=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(token);
 const r = await fetchT(submitUrl, { redirect: 'manual', headers: { ...baseHeaders(jar), 'Referer': pageUrl } }, 8000);
 storeCookies(jar, r.headers);
 const loc = r.headers.get('location');
 const rh = await r.text().catch(() => '');
 try { await r.arrayBuffer().catch(() => {}); } catch (e) {}
 if (loc) {
 const dest = new URL(loc, submitUrl).href;
 return { ok: true, provider: provider.name, destination: dest, chain: [...chain, dest], ms: Date.now() - t0, method: 'subunlock-direct' };
 }
 // Cek apakah dapat link dari HTML response
 const urlM = rh.match(/https?:\/\/[^\s"'<>\\]+/g);
 if (urlM) {
 for (const u of urlM) {
 const v = validHttpUrl(u);
 if (v && hostOf(v) !== hostOf(pageUrl) && !isSuspiciousAdHost(hostOf(v))) {
 return { ok: true, provider: provider.name, destination: v, chain: [...chain, v], ms: Date.now() - t0, method: 'subunlock-direct' };
 }
 }
 }
 } catch (e) {}
 }
 }
 return { ok: false, needManual: true, provider: provider.name, manualUrl: pageUrl,
 reason: 'Link ini tipe "Subscribe to Unlock" - kamu harus subscribe channel YouTube-nya dulu di browser, baru link download-nya kebuka.',
 chain, ms: Date.now() - t0 };
 }

 if (provider.fn === 'linkvertise') {
 const r = await flowLinkvertise(pageUrl, deadline);
 if (r) return { ok: true, provider: provider.name, destination: r.destination, chain: [...chain, r.destination], ms: Date.now() - t0, method: r.via || 'api' };
 const rip = await bypassViaRip(pageUrl, deadline);
 if (rip && rip.destination) {
 return { ok: true, provider: provider.name + ' (Rip)', destination: rip.destination,
 chain: [...chain, rip.destination], ms: Date.now() - t0, method: 'rip-api' };
 }
 const lhunt = await buttonHunterFlow(pageUrl, html, deadline, jar);
 if (lhunt && lhunt.destination) {
 return { ok: true, provider: provider.name + ' (Button Hunter)', destination: lhunt.destination,
 chain: [...chain, lhunt.destination], ms: Date.now() - t0, method: 'button-hunter', steps: lhunt.steps };
 }
 return { ok: false, needManual: true, provider: provider.name, manualUrl: pageUrl,
 reason: 'Linkvertise butuh verifikasi browser. Buka linknya di Chrome, selesaikan hitung mundurnya, baru dapat link asli.',
 chain, ms: Date.now() - t0 };
 }

 if (provider.fn === 'generic' || provider.name === 'Otomatis') {
 const learned = await autoLearnBypass(pageUrl, html, deadline, jar);
 if (learned && learned.destination) {
 return { ok: true, provider: provider.name + ' (Auto-Learned)', destination: learned.destination,
 chain: [...chain, learned.destination], ms: Date.now() - t0,
 method: learned.method, learnedPattern: learned.pattern };
 }
 const hunt = await buttonHunterFlow(pageUrl, html, deadline, jar);
 if (hunt && hunt.destination) {
 learnPattern(hostOf(pageUrl), 'button-hunter', 'tombol download/next');
 return { ok: true, provider: provider.name + ' (Button Hunter)', destination: hunt.destination,
 chain: [...chain, hunt.destination], ms: Date.now() - t0,
 method: 'button-hunter', steps: hunt.steps };
 }
 }

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

 if (!isCloudflare(html) && (/captcha/i.test(html) || detectRecaptcha(html))) {
 const imgResult = await tryImageCaptchaTricks(pageUrl, html, deadline, jar);
 if (imgResult && imgResult.solved && imgResult.destination) {
 return { ok: true, provider: provider.name, destination: imgResult.destination,
 chain: [...chain, imgResult.destination], ms: Date.now() - t0,
 method: 'captcha-trick:' + imgResult.trick };
 }
 }

 if (!isCloudflare(html)) {
 const captchaResult = await trySolveCaptcha(pageUrl, html, deadline, jar);
 if (captchaResult && captchaResult.cloudflare) {
 return { ok: false, needManual: true, provider: provider.name, manualUrl: pageUrl,
 reason: 'Link ini dilindungi Cloudflare. Selesaikan verifikasinya manual di browser.',
 chain, ms: Date.now() - t0 };
 }
 if (captchaResult && captchaResult.solved && captchaResult.destination) {
 return { ok: true, provider: provider.name, destination: captchaResult.destination,
 chain: [...chain, captchaResult.destination], ms: Date.now() - t0, method: 'captcha-solved' };
 }
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
 const deadline = Date.now() + 28000;
 const out = await aggressiveRetry(
 async (attempt) => await resolveUrl(raw, deadline, req.query.manual === '1'),
 7, deadline
 );
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
