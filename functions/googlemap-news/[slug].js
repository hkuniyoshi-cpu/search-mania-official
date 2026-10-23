// GET /googlemap-news/{slug}/ — 記事 1 本を SSR
// 本文は【見出し】区切りのプレーンテキスト。HTML は書かれていない前提で、すべてエスケープして組み立てる

import {
  SITE_URL, BASE, NAME, LOGO, getNews, respond, redirect, unavailable, notFound, gone,
  page, crumbs, crumbLd, ctaBand, esc, bxText, fmtDate, ld, articleUrl, imageUrl, IMAGE_W, IMAGE_H,
} from '../../lib/news.js';
import { onRequest as sitemap } from './sitemap.xml.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const slug = String(context.params.slug || '');
  // Pages では sitemap.xml.js より [slug].js が先に当たる（2026-10-24 本番で確認）ので、ここで渡す
  if (slug === 'sitemap.xml') return sitemap(context);

  let data;
  try {
    data = await getNews(context);
  } catch (e) {
    return unavailable();   // 取得できないときは 404 にしない（検索エンジンが記事を落とすため）
  }
  const n = data.news.find(x => x.slug === slug);
  if (!n) return data.withdrawn.includes(slug) ? gone() : notFound();
  if (!url.pathname.endsWith('/')) return redirect(`${BASE}${slug}/`);
  return respond(render(n));
}

/** 【見出し】の行は h2、空行で段落、段落内の改行は <br> */
function bodyHtml(text) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(esc).join('<br>')}</p>`); para = []; } };
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const h = /^【(.+)】$/.exec(line);
    if (h) { flush(); out.push(`<h2 class="bx">${bxText(h[1])}</h2>`); }
    else if (!line) flush();
    else para.push(line);
  }
  flush();
  return out.join('\n');
}

const lines = s => String(s || '').split('\n').map(x => x.replace(/^[・\-\s]+/, '').trim()).filter(Boolean);

function render(n) {
  const canonical = articleUrl(n.slug);
  const items = [['ホーム', '/'], [NAME, BASE], [n.title]];
  const points = lines(n.points);
  const modified = n.updated_at || n.published_at;
  const ogImage = n.image ? imageUrl(n.image, 1200) : '';

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: n.title,
    description: n.description,
    // 画像がない記事は image を付けない（ロゴは publisher.logo にだけ使う）
    image: ogImage ? [ogImage] : undefined,
    datePublished: n.published_at || undefined,
    dateModified: modified || undefined,
    inLanguage: 'ja',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    author: { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: 'SearchMania Inc.', url: `${SITE_URL}/` },
    publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: 'SearchMania Inc.', logo: { '@type': 'ImageObject', url: LOGO } },
    isBasedOn: { '@type': 'CreativeWork', name: n.source_title, url: n.source_url, publisher: { '@type': 'Organization', name: 'Google' } },
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };

  const main = `${crumbs(items)}
<article>
<header class="page-head">
  <p class="eyebrow">${esc(NAME)}</p>
  <h1 class="bx">${bxText(n.title)}</h1>
  <p class="meta">
    ${n.published_at ? `<span>公開 <strong><time datetime="${esc(n.published_at)}">${esc(fmtDate(n.published_at))}</time></strong></span>` : ''}
    ${n.updated_at ? `<span>更新 <strong><time datetime="${esc(n.updated_at)}">${esc(fmtDate(n.updated_at))}</time></strong></span>` : ''}
    <span>出典 <strong>${esc(n.source_name)}</strong></span>
  </p>
</header>
${n.image ? `<figure class="eyecatch"><img src="${esc(imageUrl(n.image, 1200))}" srcset="${esc(imageUrl(n.image, 800))} 800w, ${esc(imageUrl(n.image, 1200))} 1200w, ${esc(imageUrl(n.image, 1536))} 1536w" sizes="(max-width: 780px) 100vw, 732px" width="${IMAGE_W}" height="${IMAGE_H}" alt="" fetchpriority="high"></figure>` : ''}
${points.length ? `<section class="points" aria-labelledby="pt-h"><h2 id="pt-h">この記事のポイント</h2><ul>${points.map(p => `<li class="bx">${bxText(p)}</li>`).join('')}</ul></section>` : ''}
<div class="prose">
${bodyHtml(n.body)}
</div>
${n.impact ? `<section class="box box--view" aria-labelledby="view-h"><h2 id="view-h">SearchMania の見解</h2><p>${esc(n.impact).replace(/\n/g, '<br>')}</p></section>` : ''}
${n.availability ? `<section class="box" aria-labelledby="jp-h"><h2 id="jp-h">日本での提供状況</h2><p>${esc(n.availability).replace(/\n/g, '<br>')}</p></section>` : ''}
<section class="box source" aria-labelledby="src-h">
  <h2 id="src-h">出典</h2>
  <dl>
    <dt>発表元</dt><dd>${esc(n.source_name)}</dd>
    <dt>原題</dt><dd>${esc(n.source_title)}</dd>
    ${n.source_date ? `<dt>公開日</dt><dd>${esc(fmtDate(n.source_date) || n.source_date)}</dd>` : ''}
    <dt>URL</dt><dd><a href="${esc(n.source_url)}" target="_blank" rel="noopener">${esc(n.source_url)}</a></dd>
  </dl>
  <p class="note">本記事は Google の公式発表をもとに SearchMania が要約・解説したものです。最新の内容は出典をご確認ください。</p>
</section>
</article>
${ctaBand()}
<p class="back"><a href="${BASE}">← ${esc(NAME)}の一覧へ</a></p>`;

  return page({
    title: `${n.title}｜${NAME}｜SearchMania`,
    ogTitle: n.title,
    desc: n.description,
    canonical,
    ogType: 'article',
    image: ogImage,
    head: `${n.published_at ? `<meta property="article:published_time" content="${esc(n.published_at)}">\n` : ''}${ld(articleLd)}\n${ld(crumbLd(items.slice(0, 2).concat([[n.title, `${BASE}${n.slug}/`]])))}`,
    main,
  });
}
