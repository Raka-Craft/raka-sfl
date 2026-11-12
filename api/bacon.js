/* SUBSAFE BYPASS — proxy API Bacon (Linkvertise model baru).
   Key milik user sendiri (dari baconbypass.online, berlaku 24 jam) — dikirim
   per-request dari aplikasi, TIDAK pernah disimpan/log di server. */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const url = body && body.url;
    const key = body && body.key;
    if (!url || !key) {
      return res.status(400).json({ status: 'error', code: 'ERR_MISSING_PARAMS', message: 'Missing required parameters: url and key.' });
    }
    const ep = 'https://baconbypass.online/api/bypass?url=' + encodeURIComponent(url) + '&key=' + encodeURIComponent(key);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    let r;
    try {
      r = await fetch(ep, { signal: ctl.signal, headers: { 'User-Agent': 'BypassPro/12', 'Accept': 'application/json' } });
    } finally { clearTimeout(t); }
    const j = await r.json().catch(() => null);
    if (!j) return res.status(200).json({ status: 'error', code: 'ERR_BADJSON', message: 'Respon Bacon tidak bisa dibaca.' });
    return res.status(200).json(j);
  } catch (e) {
    return res.status(200).json({ status: 'error', code: 'ERR_NETWORK', message: 'Tidak bisa menghubungi server Bacon.' });
  }
};
