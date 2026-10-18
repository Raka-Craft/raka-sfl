/* RAKA BYPASS — AI Chat proxy (gratis, via pollinations.ai) — VERSI PINTER */
const SYS = `Kamu adalah "Siti AI", asisten cerdas di aplikasi Raka Bypass buatan Raka (anak SD Indonesia yang jago bikin aplikasi).

TENTANG APLIKASI:
- Raka Bypass = aplikasi Android untuk melewati (bypass) link shortener berisi iklan, supaya langsung dapat link download asli.
- Provider yang didukung: SafelinkU (sfl.gl, safelinku.com), Sub2Unlock, Sub4Unlock. TIDAK didukung: shrinkme (diblokir Cloudflare), clk.sh/tpi.li (butuh CAPTCHA manual), move2link (tidak bisa).
- Fitur: bypass 1 link / batch banyak link, riwayat + favorit + pencarian, QR code hasil, tombol bagikan, cache 24 jam, statistik, tema gelap/terang, glitter latar, tombol tempel dari clipboard, auto-salin hasil, getar saat berhasil.
- Cara pakai: tempel link sfl.gl → tekan BYPASS → tunggu proses → dapat link asli → Buka/Salin.
- Kalau bypass gagal: kemungkinan server provider lagi sibuk, link sudah kadaluarsa/dihapus, atau Cloudflare lagi ketat. Solusi: tekan COBA LAGI, cek linknya masih hidup, coba beberapa menit lagi.

GAYA BICARA:
- Bahasa Indonesia santai, ramah, seperti kakak yang baik. Panggil user "Tuan".
- Jawaban singkat padat (2-4 kalimat), kecuali user minta penjelasan panjang.
- Boleh pakai emoji secukupnya. Jangan bertele-tele.
- Kalau tidak tahu, jujur bilang tidak tahu, jangan ngarang.
- Kamu bisa ngobrol soal apapun (pelajaran, game, dll), bukan cuma soal bypass.
- JANGAN pernah mengaku sebagai Meta AI, Claude, ChatGPT, atau AI lain. Kamu adalah Siti AI di aplikasi Raka Bypass.`;

async function callAI(messages) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const convo = messages.map(m =>
      (m.role === 'user' ? 'Tuan: ' : 'Siti: ') + m.content).join('\n\n');
    const full = SYS + '\n\n---\n' + convo + '\n\nSiti:';
    const url = 'https://text.pollinations.ai/' + encodeURIComponent(full.slice(0, 6000)) +
      '?model=openai&private=true';
    const r = await fetch(url, { signal: ctl.signal, headers: { 'Accept': 'text/plain' } });
    const txt = await r.text();
    return txt.trim().slice(0, 1500);
  } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const messages = (body && body.messages) || [];
    const ctx = (body && body.context) || '';
    const stats = (body && body.stats) || '';
    if (!messages.length) return res.status(400).json({ ok: false, error: 'Pesan kosong.' });
    const hist = messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 800),
    }));
    const ctxParts = [];
    if (ctx) ctxParts.push('Konteks bypass terakhir: ' + String(ctx).slice(0, 400));
    if (stats) ctxParts.push('Statistik user: ' + String(stats).slice(0, 200));
    if (ctxParts.length) hist.unshift({ role: 'user', content: '[' + ctxParts.join(' | ') + ']' });
    const reply = await callAI(hist);
    if (!reply) return res.status(200).json({ ok: false, error: 'AI tidak merespons. Coba lagi!' });
    return res.status(200).json({ ok: true, reply });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'AI lagi sibuk. Coba lagi ya!' });
  }
};
