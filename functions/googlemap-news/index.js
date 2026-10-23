// GET /googlemap-news/ — 記事一覧（20 件/ページ。?page=2 以降）

import {
  SITE_URL, BASE, NAME, getNews, respond, redirect, unavailable, notFound,
  page, crumbs, crumbLd, ctaBand, esc, bxText, fmtDate, ld,
} from '../../lib/news.js';

const PER_PAGE = 20;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!url.pathname.endsWith('/')) return redirect(BASE + url.search);

  const p = url.searchParams.get('page');
  const cur = p == null ? 1 : Number(p);
  if (!Number.isInteger(cur) || cur < 1 || (p != null && cur === 1)) return redirect(BASE);

  let data;
  try {
    data = await getNews(context);
  } catch (e) {
    return unavailable();
  }
  const pages = Math.max(1, Math.ceil(data.news.length / PER_PAGE));
  if (cur > pages) return notFound();
  return respond(render(data.news, cur, pages));
}

function render(news, cur, pages) {
  const list = news.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const canonical = SITE_URL + BASE + (cur > 1 ? `?page=${cur}` : '');
  const desc = 'Google マップ・Googleビジネスプロフィール・検索アップデート・AI 検索について、Google の公式発表を日本の店舗オーナー向けに要約・解説します。';
  const items = [['ホーム', '/'], [NAME]];

  const main = `${crumbs(items)}
<header class="page-head">
  <p class="eyebrow">Google Maps News</p>
  <h1 class="bx">${bxText(NAME)}</h1>
  <p class="lead bx">${bxText(desc)}</p>
</header>
${list.length ? `<ul class="news-list">
${list.map(n => `<li><a class="news-card" href="${BASE}${esc(n.slug)}/">
  <time datetime="${esc(n.published_at)}">${esc(fmtDate(n.published_at))}</time>
  <h2 class="bx">${bxText(n.title)}</h2>
  <p>${esc(n.description)}</p>
</a></li>`).join('\n')}
</ul>` : `<div class="empty"><p class="bx">${bxText('まだ記事はありません。Google の発表があり次第、こちらでお知らせします。')}</p></div>`}
${pages > 1 ? `<nav class="pager" aria-label="ページ送り">
  <span>${cur > 1 ? `<a href="${BASE}${cur > 2 ? `?page=${cur - 1}` : ''}">← 新しい記事</a>` : ''}</span>
  <span>${cur < pages ? `<a href="${BASE}?page=${cur + 1}">古い記事 →</a>` : ''}</span>
</nav>` : ''}
${ctaBand()}`;

  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: NAME,
    url: canonical,
    description: desc,
    inLanguage: 'ja',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#org` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.map((n, i) => ({ '@type': 'ListItem', position: (cur - 1) * PER_PAGE + i + 1, url: `${SITE_URL}${BASE}${n.slug}/` })),
    },
  };

  return page({
    title: `${NAME}${cur > 1 ? `（${cur}ページ目）` : ''}｜Google公式発表を店舗向けに解説｜SearchMania`,
    desc,
    canonical,
    head: `${ld(listLd)}\n${ld(crumbLd(items))}`,
    main,
  });
}
