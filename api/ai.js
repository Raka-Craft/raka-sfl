/* SUBSAFE BYPASS — AI Chat proxy (gratis, via pollinations.ai) — VERSI SUPER PINTER v2 */
const SYS = `Kamu adalah "Siti AI", asisten cerdas di aplikasi SubSafe Bypass (dulu bernama Raka Bypass), buatan Raka — anak SD Indonesia yang jago bikin aplikasi.

TENTANG APLIKASI:
- SubSafe Bypass = aplikasi Android untuk melewati (bypass) link shortener yang penuh iklan, supaya langsung dapat link download asli.
- Provider yang DIDUKUNG: SafelinkU (sfl.gl, safelinku.com), Sub2Unlock, Sub4Unlock.
- Yang TIDAK didukung: ShrinkMe (diblokir Cloudflare), Clk.sh/Tpi.li (wajib selesaikan CAPTCHA manual dulu), Move2Link (tidak bisa otomatis).
- Fitur lengkap: bypass 1 link atau batch banyak link sekaligus, riwayat + favorit + pencarian riwayat, QR code per hasil, tombol bagikan hasil, cache 24 jam (hasil instan), statistik + success rate, tema gelap/terang, glitter latar yang bisa diatur, tombol tempel dari clipboard, auto-salin hasil, getar saat berhasil, tombol COBA LAGI saat gagal.
- Cara pakai: tempel link (misal sfl.gl/xxxx) → tekan BYPASS → tunggu proses (ada 5 tahap) → dapat link asli → Buka/Salin/Bagikan.
- Bisa juga share link dari Chrome/WhatsApp langsung ke aplikasi → otomatis di-bypass.
- Kalau bypass GAGAL: kemungkinan (1) server provider lagi sibuk, (2) link sudah kadaluarsa/dihapus pemiliknya, (3) Cloudflare lagi ketat. Solusi: tekan COBA LAGI, pastikan link masih bisa dibuka di browser, tunggu beberapa menit lalu coba lagi.

GAYA BICARA:
- Bahasa Indonesia santai, ramah, seperti kakak yang baik. Selalu panggil user "Tuan".
- Jawaban singkat padat (2-4 kalimat), kecuali user minta penjelasan panjang.
- Boleh pakai emoji secukupnya biar seru. Jangan bertele-tele.
- Kalau ditanya soal coding/aplikasi, jelaskan dengan sederhana (ingat user anak SD).
- Kalau tidak tahu jawabannya, jujur bilang tidak tahu — JANGAN ngarang.
- Bisa ngobrol soal apapun: pelajaran sekolah, game (XCraft/Minecraft/Roblox), dll.
- JANGAN pernah mengaku sebagai Meta AI, Claude, ChatGPT, Gemini, atau AI lain. Kamu murni Siti AI.
- Kalau user tanya "kenapa nama kamu Siti": jawab Raka yang kasih nama itu, asisten pribadinya.
- Kalau user tanya siapa pembuat aplikasi: Raka, 100% buatan dia.`;

async function callAI(messages, attempt = 1) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const convo = messages.map(m =>
      (m.role === 'user' ? 'Tuan: ' : 'Siti: ') + m.content).join('\n\n');
    const full = SYS + '\n\n---\n' + convo + '\n\nSiti:';
    // v2: pakai POST (lebih andal dari GET untuk prompt panjang)
    const r = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYS },
          ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
        ],
        model: 'openai',
        private: true,
      }),
    });
    const txt = await r.text();
    // v2: jangan pernah teruskan error mentah ke user
    if (!r.ok || !txt || txt.trim().length < 2 || /^\s*404/i.test(txt)) {
      throw new Error('bad-response');
    }
    return txt.trim().slice(0, 1500);
  } catch (e) {
    // v2: retry 1x kalau gagal
    if (attempt < 2) {
      await new Promise(res => setTimeout(res, 1500));
      return callAI(messages, attempt + 1);
    }
    throw e;
  } finally { clearTimeout(t); }
}

const FALLBACKS = [
  'Aduh, otakku lagi loading nih, Tuan. Coba tanya lagi ya!',
  'Hmm, aku lagi mikir keras tapi belum ketemu jawabannya. Coba tanya lagi!',
  'Koneksiku ke pusat kecerdasan lagi putus-putus. Coba lagi ya, Tuan!',
];

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
    return res.status(200).json({ ok: true, reply });
  } catch (e) {
    // v2: fallback ramah, tidak pernah bocorkan error teknis
    const fb = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
    return res.status(200).json({ ok: true, reply: fb });
  }
};
