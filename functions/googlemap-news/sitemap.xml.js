// GET /googlemap-news/sitemap.xml — 一覧と公開記事の URL

import { SITE_URL, BASE, getNews, respond, xmlEsc, articleUrl } from '../../lib/news.js';

export async function onRequest(context) {
  let data;
  try {
    data = await getNews(context);
  } catch (e) {
    return respond('', 503, 'text/plain; charset=utf-8', { 'retry-after': '600', 'cache-control': 'no-store' });
  }
  const urls = [`  <url><loc>${xmlEsc(SITE_URL + BASE)}</loc></url>`].concat(data.news.map(n => {
    const mod = /^\d{4}-\d{2}-\d{2}/.test(n.updated_at || n.published_at) ? (n.updated_at || n.published_at) : '';
    return `  <url><loc>${xmlEsc(articleUrl(n.slug))}</loc>${mod ? `<lastmod>${xmlEsc(mod)}</lastmod>` : ''}</url>`;
  }));
  return respond(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    200, 'application/xml; charset=utf-8');
}
