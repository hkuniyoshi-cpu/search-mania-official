// Googleマップ最新情報（/googlemap-news/）の共通処理
// GAS gas-hp の ?news=1（公開記事だけの JSON）を取り、Cache API に置いて SSR する。
// 設計: docs/googlemap-news/2026-10-22-design.md

import { phrases } from './budoux.js';

export const SITE_URL = 'https://search-mania.net';
export const BASE = '/googlemap-news/';
export const NAME = 'Googleマップ最新情報';
export const LP_URL = 'https://search-mania.net/automap/';
export const DIAG_URL = 'https://meo.search-mania.net/';
export const LOGO = 'https://res.cloudinary.com/dgs6qz3bd/image/upload/v1762307524/SearchMania%E3%83%AD%E3%82%B4_%E9%BB%92_hxaeuk.png';
const CSS_V = '20261024a';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbybbWX0lJQ8drdfsh5C67Z472fO2TY1PLz6HQpujgVzLPPFtvJ-p0SWrfbHeQxGgWm6aw/exec';
const DATA_V = 'v1';
const FRESH_MS = 10 * 60 * 1000;          // これより古ければ裏で取り直す
const MAX_STALE_MS = 24 * 3600 * 1000;    // これより古いデータは出さない（取り下げを長く残さない）
const GAS_TIMEOUT_MS = 15000;             // waitUntil の 30 秒以内に保存まで終える
const RETRY_AFTER_FAIL_MS = 60 * 1000;    // 取得に失敗したら 1 分は取り直さない
const SLUG_RE = /^[a-z0-9-]{10,80}$/;
const SOURCE_HOSTS = ['developers.google.com', 'blog.google', 'status.search.google.com'];

// ---------- 文字列 ----------

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 日本語を文節ごとに <wbr> で区切る（.bx と組み合わせて単語の途中で折り返さない） */
export function bxText(s) {
  return phrases(String(s == null ? '' : s)).map(esc).join('<wbr>');
}

export function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function fmtDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : '';
}

export const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

export function sourceOk(url) {
  const m = /^https:\/\/([^/?#:]+)(?:[/?#]|$)/i.exec(String(url || ''));
  return !!m && SOURCE_HOSTS.includes(m[1].toLowerCase());
}

export const articleUrl = slug => `${SITE_URL}${BASE}${slug}/`;

// ---------- 取得 ----------

// GAS の /exec は別ホストへ 302 する。302 は自分で 1 回だけ辿る（Cloudflare でリダイレクトが循環した前例がある）
// 302 の前後と JSON の読み取りまでを、ひとつの時間制限（GAS_TIMEOUT_MS）で包む
async function gas(query) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GAS_TIMEOUT_MS);
  try {
    let res = await fetch(GAS_URL + query, { redirect: 'manual', signal: ctl.signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('GAS redirect without location');
      res = await fetch(loc, { redirect: 'follow', signal: ctl.signal });
    }
    if (!res.ok) throw new Error('GAS ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const s = v => String(v == null ? '' : v).trim();

/** 実在する日付で始まる ISO 8601 だけを残す（手で壊れた値を構造化データやサイトマップに出さない） */
function isoOrEmpty(v) {
  const t = s(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(t);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : '';
}

async function loadNews() {
  const d = await gas('?news=1');
  if (!d || !Array.isArray(d.news) || !Array.isArray(d.withdrawn)) throw new Error('bad news json');
  // GAS 側でも検査しているが、表示側でももう一度確かめる
  const news = d.news
    .map(n => ({
      slug: s(n.slug), title: s(n.title), description: s(n.description), body: s(n.body), points: s(n.points),
      impact: s(n.impact), availability: s(n.availability), source_name: s(n.source_name),
      source_title: s(n.source_title), source_url: s(n.source_url), source_date: isoOrEmpty(n.source_date),
      published_at: isoOrEmpty(n.published_at), updated_at: isoOrEmpty(n.updated_at),
    }))
    .filter(n => SLUG_RE.test(n.slug) && n.title && n.body && sourceOk(n.source_url));
  const withdrawn = d.withdrawn.map(s).filter(x => SLUG_RE.test(x));
  return { news, withdrawn };
}

// ---------- キャッシュ（新鮮 10 分・古いものは 24 時間まで） ----------

const mem = new Map();
const inflight = new Map();   // 同じ isolate で同時に来た取り直しを 1 回にまとめる
const failedAt = new Map();
const storeUrl = key => `${SITE_URL}/__cache/googlemap-news/${DATA_V}/${key}`;

async function readStore(key) {
  try {
    const hit = await caches.default.match(storeUrl(key));
    return hit ? await hit.json() : null;
  } catch (e) {
    return null;
  }
}

function refresh(key, loader) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const data = await loader();
      const entry = { t: Date.now(), data };
      const cur = mem.get(key);
      if (!cur || cur.t <= entry.t) mem.set(key, entry);
      failedAt.delete(key);
      try {
        await caches.default.put(storeUrl(key), new Response(JSON.stringify(entry), {
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' },
        }));
      } catch (e) {
        console.error('cache put failed', key, e);
      }
      return data;
    } catch (e) {
      failedAt.set(key, Date.now());
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function swr(context, key, loader) {
  const now = Date.now();
  let cur = mem.get(key);
  if (!cur || now - cur.t > FRESH_MS) {
    const stored = await readStore(key);
    if (stored && (!cur || stored.t > cur.t)) { cur = stored; mem.set(key, stored); }
  }
  if (cur && now - cur.t <= MAX_STALE_MS) {
    const recentlyFailed = now - (failedAt.get(key) || 0) < RETRY_AFTER_FAIL_MS;
    if (now - cur.t > FRESH_MS && !recentlyFailed) context.waitUntil(refresh(key, loader).catch(e => console.error('refresh failed', e)));
    return cur.data;
  }
  return refresh(key, loader);   // キャッシュがない・24 時間を超えた → 取れなければ throw（呼び出し側で 503）
}

/** { news, withdrawn }。GAS もキャッシュも使えなければ throw */
export const getNews = context => swr(context, 'news', loadNews);

// ---------- 応答 ----------

// Functions の応答には _headers が効かないので、ここで付ける（/_headers の /* と同じ内容）
const SECURITY_HEADERS = {
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), midi=(), fullscreen=(self), interest-cohort=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'content-security-policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com; img-src 'self' data: https://res.cloudinary.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
};

export function respond(body, status, type, extra) {
  return new Response(body, {
    status: status || 200,
    headers: Object.assign({
      'content-type': type || 'text/html; charset=utf-8',
      // データ側で 10 分キャッシュしているので、HTML は毎回確認させる（取り下げを早く反映する）
      'cache-control': 'public, max-age=0, must-revalidate',
    }, SECURITY_HEADERS, extra || {}),
  });
}

export function redirect(to) {
  return respond(null, 301, 'text/plain; charset=utf-8', { location: to, 'cache-control': 'public, max-age=3600' });
}

// ---------- 共通 HTML ----------

const NAV = `<nav id="nav">
  <a class="nav-brand" href="/">
    <img src="${LOGO}" alt="SearchMania" width="28" height="28">
    <div><span>SearchMania</span><br><small>DIGITAL · MEO · AI</small></div>
  </a>
  <a href="/#contact" class="nav-cta">相談する →</a>
</nav>`;

const FOOTER = `<footer>
  <a href="/">ホーム</a>
  <a href="${BASE}">${NAME}</a>
  <a href="/googlemap-shukyaku/">Googleマップ集客とは</a>
  <a href="/automap/">手放しマップ集客（MEO）</a>
  <a href="/case/">導入事例</a>
  <a href="/privacy-policy.html">プライバシー</a>
  <a href="/terms.html">利用規約</a>
  <br><br>
  &copy; 2026 SearchMania Inc.
</footer>`;

export function crumbs(items) {
  return `<nav class="crumbs" aria-label="パンくずリスト"><ol>${items.map(([label, href]) =>
    `<li>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join('')}</ol></nav>`;
}

export function crumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: href ? SITE_URL + href : undefined })),
  };
}

/** 記事ページの下に置く導線（手放しマップ集客 LP が主・無料 MEO 診断を併記） */
export function ctaBand() {
  return `<section class="cta-band" aria-labelledby="cta-h">
  <h2 id="cta-h" class="bx">Googleマップの<wbr>運用を、<wbr>まるごと<wbr>任せませんか？</h2>
  <p class="bx">クチコミ返信・<wbr>投稿・<wbr>記事作成を<wbr>毎日自動で<wbr>運用する<wbr>「手放しマップ集客」。<br>Google の<wbr>変更にも<wbr>合わせて<wbr>運用します。</p>
  <a class="btn bx" href="/automap/">手放しマップ集客（MEO）を<wbr>見る&nbsp;→</a><br>
  <a class="sub" href="${DIAG_URL}" target="_blank" rel="noopener">まずは無料MEO診断で、お店の現状をチェック</a>
</section>`;
}

export function page(o) {
  const title = o.title;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(o.desc)}">
${o.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(o.canonical)}">`}
<link rel="icon" href="${LOGO}" type="image/png">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="SearchMania Inc.">
<meta property="og:title" content="${esc(o.ogTitle || title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${LOGO}">
${o.canonical ? `<meta property="og:url" content="${esc(o.canonical)}">` : ''}
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
${o.head || ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/news.css?v=${CSS_V}">
</head>
<body>
${NAV}
<main class="wrap">
${o.main}
</main>
${FOOTER}
</body>
</html>`;
}

function simplePage(status, heading, text) {
  return respond(page({
    title: `${heading}｜${NAME}｜SearchMania`,
    desc: text,
    noindex: true,
    main: `${crumbs([['ホーム', '/'], [NAME, BASE], [heading]])}
<div class="empty"><h1 class="bx empty-title">${bxText(heading)}</h1><p>${esc(text)}</p><p><a href="${BASE}">${NAME}の一覧へ</a></p></div>`,
  }), status);
}

export const notFound = () => simplePage(404, '記事が見つかりませんでした', 'URL が変わったか、記事がまだ公開されていない可能性があります。');
export const gone = () => simplePage(410, 'この記事は公開を終了しました', '内容を見直したため、この記事の公開を終了しました。');

export function unavailable() {
  return respond(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>一時的に表示できません</title><link rel="stylesheet" href="/assets/news.css?v=${CSS_V}"></head><body><main class="wrap"><div class="empty"><h1 class="empty-title">ただいまページを読み込めません</h1><p>少し時間をおいて、もう一度お試しください。</p><p><a href="/">SearchMania トップへ</a></p></div></main></body></html>`,
    503, null, { 'retry-after': '600', 'cache-control': 'no-store' });
}
