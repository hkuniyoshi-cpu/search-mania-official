const GAS_URL    = 'https://script.google.com/macros/s/AKfycbybbWX0lJQ8drdfsh5C67Z472fO2TY1PLz6HQpujgVzLPPFtvJ-p0SWrfbHeQxGgWm6aw/exec';
const SITE_URL   = 'https://search-mania.net';
const STORE_NAME = 'SearchMania Inc.';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '.' + m[2] + '.' + m[3] : String(s);
}
function driveImg(url) {
  if (!url) return '';
  const s = String(url).trim();
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return 'https://drive.google.com/thumbnail?id=' + m1[1] + '&sz=w1200';
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return 'https://lh3.googleusercontent.com/d/' + m2[1] + '=w1200';
  if (s.indexOf('drive.google.com/thumbnail') !== -1) {
    return s.replace(/[?&]sz=[^&]*/, '?sz=w1200');
  }
  return s;
}
function getSlug() {
  const m = location.pathname.match(/\/blog\/([^\/]+)\/?$/);
  return m ? m[1] : '';
}
function findBySlug(items, slug) {
  if (!Array.isArray(items) || !slug) return null;
  return items.find(function(b) {
    if (!b || !b.url) return false;
    return b.url.indexOf('/blog/' + slug + '/') !== -1
        || b.url.indexOf('/blog/' + slug) !== -1;
  }) || null;
}
function updateMeta(title, desc, imgUrl) {
  document.title = title + ' | ' + STORE_NAME;
  const m1 = document.querySelector('meta[name="description"]');
  if (m1) m1.setAttribute('content', desc);
  function upsertMeta(attrName, attrValue, contentValue) {
    let el = document.querySelector('meta[' + attrName + '="' + attrValue + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', contentValue);
  }
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', desc);
  upsertMeta('property', 'og:url', SITE_URL + location.pathname);
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', desc);
  if (imgUrl) {
    upsertMeta('property', 'og:image', imgUrl);
    upsertMeta('name', 'twitter:image', imgUrl);
  }
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', SITE_URL + location.pathname);
}
function render(item) {
  const root = document.getElementById('root');
  if (!item) {
    root.innerHTML =
      '<div class="not-found">' +
        '<h1>記事が見つかりません</h1>' +
        '<p>指定された記事は削除されたか、URLが正しくない可能性があります。</p>' +
        '<a class="back-btn" href="' + esc(SITE_URL) + '/">← トップへ戻る</a>' +
      '</div>';
    document.title = '記事が見つかりません | ' + STORE_NAME;
    return;
  }
  const imgUrl = driveImg(item.image);
  let title = (item.title || '').trim();
  if (!title && item.body) {
    title = String(item.body).split(/[。\n]/)[0].trim();
  }
  if (!title && item.date) {
    title = fmtDate(item.date) + ' の投稿';
  }
  const desc = (item.body || title).slice(0, 120);
  updateMeta(title, desc, imgUrl);
  root.innerHTML =
    '<article class="card">' +
      (imgUrl ? '<img src="' + esc(imgUrl) + '" alt="' + esc(title) + '" loading="eager">' : '') +
      '<div class="card-body">' +
        (item.date ? '<span class="date">' + esc(fmtDate(item.date)) + '</span>' : '') +
        (item.title && item.title.trim() ? '<h1>' + esc(item.title) + '</h1>' : '') +
        '<p class="text">' + esc(item.body || '') + '</p>' +
      '</div>' +
    '</article>' +
    '<div class="back-wrap">' +
      '<a class="back-btn" href="' + esc(SITE_URL) + '/">← トップへ戻る</a>' +
    '</div>' +
    '<div class="produced-by">' +
      'Produced by <a href="https://search-mania.net/" target="_blank" rel="noopener noreferrer">SearchMania Inc.</a>' +
    '</div>';
}
(function init() {
  const slug = getSlug();
  if (!slug) { render(null); return; }
  if (!GAS_URL || GAS_URL === '__GAS_URL__') { render(null); return; }
  fetch(GAS_URL + (GAS_URL.indexOf('?') >= 0 ? '&' : '?') + 'blog_all=1')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      const item = findBySlug(data && data.blog, slug);
      render(item);
    })
    .catch(function(err) {
      console.warn('CMS fetch error:', err);
      fetch(GAS_URL)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          const item = findBySlug(data && data.blog, slug);
          render(item);
        })
        .catch(function() { render(null); });
    });
})();
