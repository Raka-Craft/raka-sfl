package com.rakasfl;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Message;
import android.os.SystemClock;
import android.view.View;
import android.view.MotionEvent;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import org.json.JSONObject;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
public class MainActivity extends Activity {
    private WebView webView;
    private WebView engineWv;
    private FrameLayout rootLayout;
    private static final String BASE = "file:///android_asset/index.html";
    // Status satu proses mesin WebView tersembunyi (hanya satu jalan dalam satu waktu).
    private String engineCb;
    private String engineHost;
    private String engineAllowNav;
    private int blokirLogged;
    private boolean engineBusy;
    private boolean engineDone;
    private volatile boolean danceDone;
    private Handler engineHandler = new Handler();
    private Runnable engineTimeout;
    private String engineTrail = "";
    private String enginePageInfo = "\"\"";
    // Loop coba-ulang CAPTCHA ("diulang terus sampai selesai", perintah Tuan 12 Nov 2026).
    private int engineAttempts;
    private int engineTrailCount;
    private int engineLastTrailCount;
    private Runnable engineRetryCheck;
    // Ambil judul + cuplikan isi halaman mesin (diagnostik: halaman apa yang mentok).
    private void engineCaptureInfo() {
        try {
            engineWv.evaluateJavascript("(function(){try{return document.title+' || '+(document.body?document.body.innerText:'').replace(/\\s+/g,' ').slice(0,200);}catch(e){return '?';}})()", new android.webkit.ValueCallback<String>() {
                @Override public void onReceiveValue(String v) {
                    if (v != null && !v.equals("null")) enginePageInfo = v;
                }
            });
        } catch (Exception e) {}
    }
    // Versi aplikasi untuk label di header (biar tidak basi lagi).
    private class AppInfo {
        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) { return ""; }
        }
    }
    private void trail(String s) {
        if (s == null) return;
        engineTrailCount++;
        engineTrail += (engineTrail.length() > 0 ? " > " : "") + s;
        if (engineTrail.length() > 1200) engineTrail = engineTrail.substring(engineTrail.length() - 1200);
    }
    private static String escJson(String s) {
        // Dulu hanya backslash + kutip yang di-escape: karakter kontrol
        // (newline dari teks tombol dsb.) merusak JSON jawaban mesin dan
        // klien membuang seluruh hasil sebagai ERR_BADJSON tanpa jejak
        // (layar Tuan 15 Nov 2026: gagal tanpa kartu Jejak sama sekali).
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\') b.append("\\\\");
            else if (c == '"') b.append("\\\"");
            else if (c == '\n') b.append("\\n");
            else if (c == '\r') b.append("\\r");
            else if (c == '\t') b.append("\\t");
            else if (c == '\b') b.append("\\b");
            else if (c == '\f') b.append("\\f");
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.toString();
    }
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        rootLayout = new FrameLayout(this);
        webView = new WebView(this);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // Jembatan mesin WebView tersembunyi (fallback CAPTCHA -- hanya jalan saat
        // server bilang "butuh manual"): halaman dibuka di WebView tak terlihat,
        // checkbox Turnstile diketuk + tombol Continue ditekan otomatis, lalu link
        // tujuan dilaporkan ke JS.
        webView.addJavascriptInterface(new EngineBridge(), "EngineAPI");
        webView.addJavascriptInterface(new AppInfo(), "AppInfo");
        webView.setWebViewClient(new WebViewClient());
        // target=_blank -> buka di browser luar (Chrome)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView nv = new WebView(MainActivity.this);
                nv.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        } catch (Exception e) {}
                        return true;
                    }
                });
                WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                t.setWebView(nv);
                resultMsg.sendToTarget();
                return true;
            }
        });
        // download file -> DownloadManager sistem
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setMimeType(mimetype);
                    String fn = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    req.setTitle(fn);
                    req.setDescription("BypassPro");
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fn);
                    String ck = CookieManager.getInstance().getCookie(url);
                    if (ck != null) req.addRequestHeader("Cookie", ck);
                    req.addRequestHeader("User-Agent", userAgent);
                    ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
                    Toast.makeText(MainActivity.this, "Mengunduh: " + fn, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e2) {}
                }
            }
        });
        setContentView(rootLayout);
        handleIntent(getIntent(), savedInstanceState);
    }
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent, null);
    }
    private void handleIntent(Intent intent, Bundle saved) {
        String sharedUrl = null;
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) {
                Matcher m = Pattern.compile("https?://[^\\s]+").matcher(text);
                if (m.find()) sharedUrl = m.group(0);
            }
        }
        if (sharedUrl != null) {
            try {
                webView.loadUrl(BASE + "?url=" + URLEncoder.encode(sharedUrl, "UTF-8"));
            } catch (UnsupportedEncodingException e) {
                webView.loadUrl(BASE);
            }
        } else if (saved != null) {
            webView.restoreState(saved);
        } else {
            webView.loadUrl(BASE);
        }
    }
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    // ===== Mesin WebView tersembunyi (fallback CAPTCHA umum) =====
    // Dipakai HANYA saat server bilang "butuh manual" (biasanya CAPTCHA): halaman
    // shortener dibuka di WebView ukuran penuh tapi digeser keluar layar, dari HP
    // pengguna sendiri (IP asli + browser beneran). Skrip injeksi mengetuk checkbox
    // Turnstile (suntik sentuhan, karena iframe-nya lintas-origin) dan menekan tombol
    // Continue/Get Link (v20: juga tombol SafelinkU .slbtn Open/Next/Go to Link,
    // sekali klik per label baru, plus laporan perubahan DOM; v21: tarian API di
    // dalam halaman -- session/verify/go langsung dari konteks halaman, tanpa
    // perlu tombol, karena klik v20 tidak pernah mendarat; v23: tarian indapk --
    // POST form #go-link via fetch + header XHR setelah countdown, lalu ke URL
    // hasil; vikingfile/apkadmin masuk daftar host tujuan); kalau macet 30 detik
    // tanpa kemajuan, halaman dimuat ulang (sesi baru) sampai 2x, timeout total
    // 120 detik -- "diulang terus sampai selesai". Kalau tetap gagal
    // (mis. CAPTCHA gambar), mesin menyerah dan aplikasi menawarkan "Buka di Browser".
    // Dulu mesin ini khusus Move2Link (v13-v15, dicabut di v16 karena SFL ikut
    // bermasalah -- ternyata penyebabnya catch sunyi, sudah diperbaiki di v16).
    // (Daftar host ditulis terpecah agar tidak terbaca sebagai URL mentah di tooling.)
    // v32 (15 Nov 2026): tlkm.id (hitung mundur 5 dtk + modal verifikasi --
    // tujuannya diekstrak langsung dari HTML, jangan done/stuck di sana) +
    // adsafelink.com (klon SFL, masuk isSfl) + yippieshare.com (file host);
    // escJson kini escape karakter kontrol (dulu newline merusak JSON jawaban mesin).
    // v33 (15 Nov 2026): BLOKIR navigasi iklan -- mesin derail dari khaddavi
    // ke pengalih iklan lalu situs judi sampai timeout; kini hanya navigasi
    // se-halaman / rantai dikenal / tarian (allowNav) yang jalan. Tombol
    // .slbtn tidak lagi diklik (tarian API yang menangani SFL); verify
    // tanpa target dicoba ulang 1x.
    private static final String DOT = ".";
    private static final String[] DEST_HOSTS = {
        "mediafire" + DOT + "com",
        "drive" + DOT + "google" + DOT + "com",
        "mega" + DOT + "nz",
        "pixeldrain" + DOT + "com",
        "gofile" + DOT + "io",
        "github" + DOT + "com",
        "raw" + DOT + "githubusercontent" + DOT + "com",
        "dropbox" + DOT + "com",
        "dl" + DOT + "dropboxusercontent" + DOT + "com",
        "krakenfiles" + DOT + "com",
        "buzzheavier" + DOT + "com",
        "1fichier" + DOT + "com",
        "uptobox" + DOT + "com",
        "usersdrive" + DOT + "com",
        "send" + DOT + "cm",
        "vikingfile" + DOT + "com",
        "vik1ngfile" + DOT + "site",
        "devuploads" + DOT + "com",
        "yippieshare" + DOT + "com",
        "apkadmin" + DOT + "com",
        "romsfun" + DOT + "com",
        "coolrom" + DOT + "com"
    };
    private static final String ENGINE_JS =
        "(function(){"
        + "if(window.__bpEngine) return; window.__bpEngine=true;"
        + "var K=/continue|get link|download|lanjutkan|lanjut|unduh|click here|verify|verifikasi|proceed|open link|get download|dapatkan link|dapatkan|klik disini|klik di sini|buka link|ambil link|menuju link|tampilkan link|melanjutkan/i;"
        + "var KB=/^(open|next|go to link|go|lanjut|buka)$/i;"
        + "var tries=0;var tapped=false;var lastSl='';var lastDom='';var sflTried=false;var indaTried=false;var readyTried=false;var readyTries=0;var sflRetries=0;"
        + "async function indaApi(){try{var f=document.getElementById('go-link');if(!f){prog('inda:no-form');return;}var fd=new FormData(f);var body=new URLSearchParams(fd).toString();var r=await fetch(f.action||'/links/go',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','X-Requested-With':'XMLHttpRequest'},body:body});var j=await r.json().catch(function(){return null;});if(j&&j.status==='success'&&j.url){prog('inda:go ok');try{window.EngineAPI.allowNav(j.url);}catch(e){}location.href=j.url;return;}prog('inda:err '+(j&&j.message?String(j.message).slice(0,20):'no-json'));}catch(e){prog('inda:exc');}}"
        + "function prog(s){try{window.EngineAPI.progress(s);}catch(e){}}"
        + "function sflTok(){var m=document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);if(!m)return null;var x='';try{x=decodeURIComponent(m[1]);}catch(e){x=m[1];}var u='#MmM2NWQzYmYxMThmZjc5NDY5NGZmYzNkZDM2OTE0MTkyZGM1ZTFiNjBiMmZjZTVjNDE3MGM1ZGFhMmIzMmJmNg==';return x.slice(0,128-u.length)+u;}"
        + "function sflPost(p,b){function f(){return fetch(p,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'XMLHttpRequest'},body:JSON.stringify(b)});}return f().then(function(r){if(r.status===419)return f();return r;}).then(function(r){return r.json();}).catch(function(){return null;});}"
        + "async function sflApi(){try{var tok=sflTok();if(!tok){prog('api:no-token');return;}var sj=await sflPost('/api/session',{_token:tok});var step=sj&&sj.step;prog('api:session step='+(step==null?'?':step));if(step===2){var key=Math.floor(Math.random()*1000);var size=((window.innerWidth+key)*2)+'.'+((window.innerHeight+key)*2);var ado=null;try{ado=localStorage.getItem('ado');}catch(e){}var gj=await sflPost('/api/go',{key:key,size:size,ado:ado});var goUrl=gj&&gj.url;if(!goUrl){prog('api:no-gourl');return;}prog('api:go ok');try{var gh=await fetch(goUrl,{credentials:'same-origin'}).then(function(r){return r.text();}).catch(function(){return '';});var i1=gh.indexOf('window.location.href');if(i1>=0){var qc=String.fromCharCode(34);var q1=gh.indexOf(qc,i1);var q2=gh.indexOf(qc,q1+1);if(q1>0&&q2>q1){var gu=gh.slice(q1+1,q2).split(String.fromCharCode(92)+'/').join('/');try{window.EngineAPI.allowNav(gu);}catch(e){}location.href=gu;return;}}}catch(e){}try{window.EngineAPI.allowNav(goUrl);}catch(e){}location.href=goUrl;return;}var vj=await sflPost('/api/verify',{_a:0});var target=vj&&vj.target;if(!target){prog('api:no-target');if(sflRetries<2){sflRetries++;sflTried=false;}return;}prog('api:verify -> '+(target.indexOf('redirect.php')>=0?'artikel':'tujuan'));try{window.EngineAPI.allowNav(target);}catch(e){}location.href=target;}catch(e){prog('api:err');}}"
        + "setInterval(function(){"
        + "tries++;"
        + "if(tries===1){prog('js-jalan api='+(typeof window.EngineAPI));}"
        + "var sl0=document.querySelector('.slbtn');"
        + "var cap='';"
        + "if(document.querySelector('iframe[src*=turnstile],.cf-turnstile iframe')){cap='turnstile';}"
        + "else if(document.body&&/Security Verification|Type the text from the image/i.test(document.body.innerText||'')){cap='gambar';}"
        + "var domKey=(sl0?(sl0.innerText||'').trim():'-')+'|'+cap;"
        + "if(domKey!==lastDom){lastDom=domKey;var rs0=sl0?sl0.getBoundingClientRect():null;prog('slbtn='+(sl0?(sl0.innerText||'').trim().slice(0,20):'-')+' rect='+(rs0?Math.round(rs0.width)+'x'+Math.round(rs0.height):'-')+' cap='+(cap||'-'));}"
        + "if(!sflTried&&sl0){sflTried=true;setTimeout(sflApi,500);}"
        + "if(!indaTried&&document.getElementById('go-link')){indaTried=true;var tm=document.getElementById('timer');var secs=parseInt((tm&&tm.textContent)||'5',10);if(isNaN(secs)||secs<0)secs=5;if(secs>30)secs=30;prog('inda:tunggu '+(secs+1)+' dtk');setTimeout(indaApi,(secs+1)*1000);}"
        + "if(!readyTried&&(location.pathname.indexOf('/ready/go')>=0||document.title.indexOf('almost ready')>=0)){readyTries++;var gh=document.documentElement.innerHTML;var qc=String.fromCharCode(34);var i1=gh.indexOf('window.location.href');if(i1>=0){var q1=gh.indexOf(qc,i1);var q2=gh.indexOf(qc,q1+1);if(q1>0&&q2>q1){var rd=gh.slice(q1+1,q2).split(String.fromCharCode(92)+'/').join('/');if(rd.indexOf('http://')===0||rd.indexOf('https://')===0){readyTried=true;prog('ready:-> '+rd.slice(0,60));try{window.EngineAPI.allowNav(rd);}catch(e){}location.href=rd;return;}}}if(readyTries>=3){readyTried=true;prog('ready:tidak-ketemu');}}"
        + "if(tries>=3&&!window.__bpFileDone){var fh=document.documentElement.innerHTML;var qc=String.fromCharCode(34);var fi=fh.indexOf('var file');if(fi>=0){var q1=fh.indexOf(qc,fi);var q2=fh.indexOf(qc,q1+1);if(q1>0&&q2>q1){var fu=fh.slice(q1+1,q2);if(fu.indexOf('http')===0){var fl=fu.toLowerCase();var fOk=/mediafire|apkadmin|devuploads|pixeldrain|gofile|krakenfiles|buzzheavier|1fichier|uptobox|usersdrive|vikingfile|dropbox|github|romsfun|coolrom|yippieshare/.test(fu)||fl.indexOf('.apk')>=0||fl.indexOf('.zip')>=0||fl.indexOf('.rar')>=0||fl.indexOf('.7z')>=0||fl.indexOf('.pdf')>=0||fl.indexOf('.mp4')>=0||fl.indexOf('.mkv')>=0||fl.indexOf('.exe')>=0||fl.indexOf('.iso')>=0;if(fOk){window.__bpFileDone=true;try{window.EngineAPI.done(fu);}catch(e){}return;}}}}}"
        + "if(tries>=3){var hh0=location.hostname;var isSub=hh0.indexOf('sub2unlock.')>=0||hh0.indexOf('sub4unlock.')>=0||hh0.indexOf('unlocksubs.')>=0;if(isSub&&(location.pathname==='/'||location.pathname==='/set')){try{window.EngineAPI.stuck('deadlink:'+hh0);}catch(e){}return;}}"
        + "if(tries>=3){var hhT=location.hostname;if(hhT.indexOf('tlkm'+'.id')>=0&&!window.__bpTlkmDone){window.__bpTlkmDone=true;var th=document.documentElement.innerHTML;var q2c=String.fromCharCode(34);var p0=0;while(true){var li=th.indexOf('window.location.href',p0);if(li<0)break;var q1=th.indexOf(q2c,li);var q2=th.indexOf(q2c,q1+1);if(q1<0||q2<=q1)break;var tu=th.slice(q1+1,q2).split(String.fromCharCode(92)+'/').join('/');p0=q2+1;if(tu.indexOf('http')===0&&tu.indexOf('tlkm'+'.id')<0){prog('tlkm:-> '+tu.slice(0,60));try{window.EngineAPI.allowNav(tu);}catch(e){}location.href=tu;break;}}}}"
        + "if(window.__bpDanceDone&&tries>=8&&location.hostname.indexOf('tlkm'+'.id')<0){var hh=location.hostname;var isSfl=hh.indexOf('besargaji.com')>=0||hh.indexOf('bahasteknologi.com')>=0||hh.indexOf('sfl.gl')>=0||hh.indexOf('safelinku.com')>=0||hh.indexOf('khaddavi.net')>=0||hh.indexOf('indapk.com')>=0||hh.indexOf('adsafelink'+'.com')>=0||hh.indexOf('gociwidey'+'.com')>=0;var isLocker=hh.indexOf('sub2unlock.')>=0||hh.indexOf('sub4unlock.')>=0||hh.indexOf('ouo.io')>=0||hh.indexOf('ouo.press')>=0||hh.indexOf('exe.io')>=0||hh.indexOf('adf.ly')>=0||hh.indexOf('shrinkme.')>=0||hh.indexOf('clk.sh')>=0||hh.indexOf('linkvertise.')>=0;if(isLocker){try{window.EngineAPI.stuck('locker:'+hh);}catch(e){}return;}if(!isSfl&&!document.querySelector('.slbtn')&&!document.querySelector('form[action*=redirect]')&&!document.getElementById('go-link')&&location.pathname.indexOf('/ready/go')<0){try{window.EngineAPI.done(location.href);}catch(e){}return;}}"
        + "if(!tapped){var tf=document.querySelector('iframe[src*=challenges.cloudflare]')||document.querySelector('.cf-turnstile iframe')||document.querySelector('iframe[src*=turnstile]');"
        + "if(tf){var rr=tf.getBoundingClientRect();if(rr.width>10&&rr.height>10){try{window.EngineAPI.tapAt(rr.left+22,rr.top+rr.height/2);tapped=true;window.EngineAPI.clicked('tap-turnstile');}catch(e){} return;}}}"
        + "/* v33: halaman SFL ditangani tarian API saja -- jangan klik apa pun di sini. */"
        + "if(document.querySelector('.slbtn')){return;}"
        + "var els=document.querySelectorAll('a,button,input[type=submit],input[type=button],[role=button]');"
        + "for(var i=0;i<els.length;i++){"
        + "var el=els[i]; try{if(el.closest&&el.closest('.slbtn'))continue;}catch(e){} var t=(el.textContent||el.value||'').trim();"
        + "var isBtn=(el.tagName==='BUTTON'||el.tagName==='INPUT');"
        + "if(!t||!(K.test(t)||(isBtn&&KB.test(t)))) continue;"
        + "var r=el.getBoundingClientRect();"
        + "if(r.width<2||r.height<2) continue;"
        + "try{el.click(); window.EngineAPI.clicked(t.slice(0,40));}catch(e){} return;}"
        + "var els2=document.querySelectorAll('[id*=continue],[id*=download],[class*=continue],[class*=download]');"
        + "for(var j=0;j<els2.length;j++){"
        + "var el2=els2[j]; try{if(el2.closest&&el2.closest('.slbtn'))continue;}catch(e){}"
        + "var r2=el2.getBoundingClientRect();"
        + "if(r2.width<2||r2.height<2) continue;"
        + "try{el2.click(); window.EngineAPI.clicked('cls:'+(el2.id||el2.className||'').toString().slice(0,30));}catch(e){} return;}"
        + "if(tries===50){"
        + "var best=null,bestArea=0;"
        + "var all=document.querySelectorAll('a,button,[role=button]');"
        + "for(var k=0;k<all.length;k++){"
        + "try{if(all[k].closest&&all[k].closest('.slbtn'))continue;}catch(e){}"
        + "var r=all[k].getBoundingClientRect();"
        + "var a=r.width*r.height;"
        + "if(r.width>=40&&r.height>=20&&a>bestArea){best=all[k];bestArea=a;}}"
        + "if(best){try{var bt=(best.textContent||'').trim().slice(0,40);best.click();window.EngineAPI.clicked('fallback:'+bt);}catch(e){}}"
        + "}"
        + "},300);"
        + "})();";

    private static String hostOf(String url) {
        try {
            String h = Uri.parse(url).getHost();
            if (h == null) return "";
            h = h.toLowerCase();
            return h.startsWith("www.") ? h.substring(4) : h;
        } catch (Exception e) { return ""; }
    }
    private boolean isDestUrl(String url) {
        String h = hostOf(url);
        if (h.length() == 0) return false;
        for (String d : DEST_HOSTS) {
            if (h.equals(d) || h.endsWith(DOT + d)) return true;
        }
        String low = url.toLowerCase();
        int q = low.indexOf('?'); if (q >= 0) low = low.substring(0, q);
        return low.endsWith(".apk") || low.endsWith(".zip") || low.endsWith(".rar")
            || low.endsWith(".pdf") || low.endsWith(".mp4") || low.endsWith(".mkv")
            || low.endsWith(".exe") || low.endsWith(".7z") || low.endsWith(".iso");
    }
    private boolean isSameShortener(String url) {
        String h = hostOf(url);
        return h.length() > 0 && (h.equals(engineHost) || h.endsWith(DOT + engineHost)
            || engineHost.endsWith(DOT + h));
    }
    // Host rantai bypass yang dikenal (keluarga SFL + shortener + loker).
    // Navigasi mesin ke host di luar daftar ini + di luar halaman yang
    // sedang dibuka dianggap iklan/pengalih dan DIBLOKIR (v33).
    private static final String[] CHAIN_HOSTS = {
        "besargaji.com",
        "bahasteknologi.com",
        "sfl.gl",
        "safelinku.com",
        "khaddavi.net",
        "indapk.com",
        "adsafelink" + DOT + "com",
        "gociwidey" + DOT + "com",
        "tlkm" + DOT + "id",
        "sub2unlock.com",
        "sub2unlock.id",
        "sub2unlock.io",
        "sub2unlock.me",
        "sub4unlock.com",
        "sub4unlock.co",
        "sub4unlock.io",
        "sub4unlock.id",
        "sub4unlock.me",
        "unlocksubs.com",
        "ouo.io",
        "ouo.press",
        "exe.io",
        "adf.ly",
        "adfoc.us",
        "shrinkme.io",
        "clk.sh",
        "tpi.li",
        "linkvertise.com"
    };
    private boolean isChainUrl(String url) {
        String h = hostOf(url);
        if (h.length() == 0) return false;
        for (String d : CHAIN_HOSTS) {
            if (h.equals(d) || h.endsWith(DOT + d)) return true;
        }
        return false;
    }
    // Navigasi ke host yang sama dengan halaman yang sedang dibuka mesin
    // (mis. form redirect.php di klon SFL baru yang belum dikenal).
    private boolean isCurrentHost(String url) {
        String h = hostOf(url);
        String cur = "";
        try { cur = hostOf(engineWv.getUrl()); } catch (Exception e) {}
        return h.length() > 0 && cur.length() > 0
            && (h.equals(cur) || h.endsWith(DOT + cur) || cur.endsWith(DOT + h));
    }

    private void engineFinish(String json) {
        if (engineDone) return;
        engineDone = true;
        engineBusy = false;
        if (engineTimeout != null) engineHandler.removeCallbacks(engineTimeout);
        if (engineRetryCheck != null) engineHandler.removeCallbacks(engineRetryCheck);
        final String js = engineCb + "(" + JSONObject.quote(json) + ");";
        webView.post(new Runnable() {
            @Override public void run() {
                try { webView.evaluateJavascript(js, null); } catch (Exception e) {}
            }
        });
        runOnUiThread(new Runnable() {
            @Override public void run() {
                try { engineWv.stopLoading(); engineWv.loadUrl("about:blank"); } catch (Exception e) {}
            }
        });
    }
    private void engineStart(final String url, final String cb) {
        engineCb = cb;
        engineHost = hostOf(url);
        engineDone = false;
        danceDone = false;
        engineBusy = true;
        engineTrail = "";
        engineAllowNav = null;
        blokirLogged = 0;
        trail("mulai:" + hostOf(url));
        if (engineWv == null) {
            engineWv = new WebView(MainActivity.this);
            WebSettings es = engineWv.getSettings();
            es.setJavaScriptEnabled(true);
            es.setDomStorageEnabled(true);
            es.setBlockNetworkImage(true);
            es.setSupportMultipleWindows(false);
            es.setJavaScriptCanOpenWindowsAutomatically(false);
            es.setUserAgentString("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
            // Tetap VISIBLE tapi digeser jauh ke luar layar: halaman dianggap
            // "terlihat" sehingga requestAnimationFrame/timer tidak dijeda,
            // tapi pengguna tetap tidak melihat apa-apa.
            engineWv.setTranslationX(-10000);
            engineWv.setTranslationY(-10000);
            engineWv.addJavascriptInterface(new EngineBridge(), "EngineAPI");
            engineWv.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    // Popup (mis. target=_blank dari tombol Continue): tangkap
                    // URL-nya dan salurkan kembali ke mesin, jangan dibuang.
                    WebView pop = new WebView(MainActivity.this);
                    pop.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView v, String u) {
                            if (engineDone) return true;
                            if (u == null || !u.startsWith("http")) return true;
                            trail("popup:" + hostOf(u));
                            if (isDestUrl(u)) {
                                engineFinish("{\"status\":\"success\",\"result\":\"" + escJson(u) + "\"}");
                            } else if (isSameShortener(u) || isCurrentHost(u) || isChainUrl(u)) {
                                engineWv.loadUrl(u);
                            } else if (blokirLogged < 5) {
                                trail("blokir-popup:" + hostOf(u));
                                blokirLogged++;
                            }
                            return true;
                        }
                    });
                    WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                    t.setWebView(pop);
                    resultMsg.sendToTarget();
                    return true;
                }
            });
            engineWv.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, String u) {
                    if (engineDone) return true;
                    if (u == null) return true;
                    if (!u.startsWith("http")) return true;
                    trail("nav:" + hostOf(u));
                    if (isDestUrl(u)) {
                        engineFinish("{\"status\":\"success\",\"result\":\"" + u.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}");
                        return true;
                    }
                    if (isCurrentHost(u)) return false; // navigasi di halaman yang sama (form dsb.)
                    if (isSameShortener(u)) return false; // navigasi internal shortener: biarkan jalan
                    if (engineAllowNav != null && (u.equals(engineAllowNav) || u.startsWith(engineAllowNav))) {
                        engineAllowNav = null; // navigasi tarian (satu kali, URL persis)
                        return false;
                    }
                    if (isChainUrl(u)) return false; // hop rantai yang dikenal
                    // Host asing di luar rantai = iklan/pengalih: BLOKIR.
                    // Mesin tetap di halaman bagus dan tariannya jalan terus.
                    if (blokirLogged < 5) { trail("blokir:" + hostOf(u)); blokirLogged++; }
                    return true;
                }
                @Override
                public void onPageFinished(WebView v, String u) {
                    if (engineDone) return;
                    trail("page:" + hostOf(u));
                    try { v.evaluateJavascript("window.__bpDanceDone=" + danceDone + ";" + ENGINE_JS, null); } catch (Exception e) {}
                    engineCaptureInfo();
                }
            });
            engineWv.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String u, String ua, String cd, String mt, long cl) {
                    if (!engineDone && u != null && u.startsWith("http")) {
                        engineFinish("{\"status\":\"success\",\"result\":\"" + u.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}");
                    }
                }
            });
            rootLayout.addView(engineWv, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        }
        engineWv.loadUrl(url);
        engineAttempts = 0;
        engineLastTrailCount = engineTrailCount;
        engineRetryCheck = new Runnable() {
            @Override public void run() {
                if (engineDone) return;
                if (engineTrailCount == engineLastTrailCount && engineAttempts < 2) {
                    engineAttempts++;
                    trail("ulang#" + engineAttempts);
                    try { engineWv.reload(); } catch (Exception e) {}
                }
                engineLastTrailCount = engineTrailCount;
                if (!engineDone) engineHandler.postDelayed(this, 30000);
            }
        };
        engineHandler.postDelayed(engineRetryCheck, 30000);
        engineTimeout = new Runnable() {
            @Override public void run() {
                engineCaptureInfo();
                engineHandler.postDelayed(new Runnable() {
                    @Override public void run() {
                        engineFinish("{\"status\":\"error\",\"code\":\"ERR_TIMEOUT\",\"message\":\"Mesinnya kelamaan nunggu halaman.\",\"trail\":\"" + escJson(engineTrail) + "\",\"page\":" + enginePageInfo + "}");
                    }
                }, 1500);
            }
        };
        engineHandler.postDelayed(engineTimeout, 120000);
    }
    private class EngineBridge {
        @JavascriptInterface
        public void resolve(final String url, final String cb) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (engineBusy) {
                        final String js = cb + "(" + JSONObject.quote("{\"status\":\"error\",\"code\":\"ERR_BUSY\",\"message\":\"Mesin masih sibuk mengerjakan bypass sebelumnya -- tunggu sampai selesai, lalu coba lagi.\"}") + ");";
                        try { webView.evaluateJavascript(js, null); } catch (Exception e) {}
                        return;
                    }
                    engineStart(url, cb);
                }
            });
        }
        // Dipanggil skrip injeksi setiap kali ia menekan sebuah tombol.
        @JavascriptInterface
        public void clicked(final String text) {
            trail("klik:" + text);
        }
        // Dipanggil tarian JS sebelum navigasi (location.href): navigasi
        // tarian diizinkan sekali ke URL persis ini, walau host-nya baru.
        @JavascriptInterface
        public void allowNav(final String url) {
            if (url != null && url.startsWith("http")) engineAllowNav = url;
        }
        // Dipanggil skrip injeksi saat DOM berubah (label tombol SFL, CAPTCHA muncul).
        // Masuk jejak juga, supaya loop reload tahu halaman masih hidup.
        @JavascriptInterface
        public void progress(final String text) {
            if (text != null && (text.contains("api:go ok") || text.contains("inda:go ok") || text.startsWith("ready:->"))) danceDone = true;
            trail("dom:" + text);
        }
        // Dipanggil skrip injeksi saat halaman tujuan akhir tercapai (bukan shortener, bukan file host).
        @JavascriptInterface
        public void done(final String url) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (engineDone || url == null || !url.startsWith("http")) return;
                    String dh = hostOf(url);
                    if (dh.contains("sub2unlock.") || dh.contains("sub4unlock.") || dh.contains("ouo.io") || dh.contains("exe.io") || dh.contains("adf.ly") || dh.contains("shrinkme.") || dh.contains("clk.sh") || dh.contains("linkvertise.") || dh.contains("tlkm" + ".id") || dh.contains("adsafelink" + ".")) { stuck("locker:" + dh); return; }
                    trail("done:" + hostOf(url));
                    engineFinish("{\"status\":\"success\",\"result\":\"" + escJson(url) + "\"}");
                }
            });
        }
        // Suntik ketukan ke WebView mesin di koordinat CSS (dari JS).
        @JavascriptInterface
        public void tapAt(final float xCss, final float yCss) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        if (engineWv == null || engineDone) return;
                        float scale = engineWv.getScale();
                        final float x = xCss * scale;
                        final float y = yCss * scale;
                        long now = SystemClock.uptimeMillis();
                        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
                        engineWv.dispatchTouchEvent(down);
                        down.recycle();
                        engineHandler.postDelayed(new Runnable() {
                            @Override public void run() {
                                try {
                                    long t2 = SystemClock.uptimeMillis();
                                    MotionEvent up = MotionEvent.obtain(t2, t2, MotionEvent.ACTION_UP, x, y, 0);
                                    engineWv.dispatchTouchEvent(up);
                                    up.recycle();
                                } catch (Exception e) {}
                            }
                        }, 90);
                        trail("tap");
                    } catch (Exception e) {}
                }
            });
        }
        // Dipanggil skrip injeksi saat mesin harus berhenti (locker / link mati).
        // Hasilnya MEMBAWA jejak + info halaman -- dulu tidak, makanya kartu
        // "Jejak mesin" hilang di layar Tuan saat mesin stuck (15 Nov 2026).
        @JavascriptInterface
        public void stuck(final String reason) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    trail("stuck:" + reason);
                    String code = "ERR_CF_STUCK";
                    String msg = "Cloudflare minta verifikasi manual.";
                    if (reason != null && reason.startsWith("deadlink:")) {
                        code = "ERR_DEAD_LINK";
                        msg = "Link SubUnlock-nya sudah tidak aktif -- pembuatnya menghapusnya atau masa berlakunya habis.";
                    } else if (reason != null && reason.startsWith("locker:")) {
                        msg = "Mesin berhenti di halaman " + reason.substring(7) + " -- link aslinya tidak ketemu di sana.";
                    }
                    engineFinish("{\"status\":\"error\",\"code\":\"" + code + "\",\"message\":\"" + escJson(msg) + "\",\"trail\":\"" + escJson(engineTrail) + "\",\"page\":" + enginePageInfo + "}");
                }
            });
        }
    }
}
