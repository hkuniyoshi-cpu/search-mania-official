/**
 * CMS (GAS JSON) → index.html 静的プリレンダ
 *
 * 目的: 検索エンジン / AI クローラー (JS 非実行) にもサービス・強み・クチコミ等の本文を届け、
 *       初回訪問者のスケルトン待ち (GAS 応答 5〜10 秒) を無くす。
 *
 * 動作: index.html 内の <!--CMS:id--> ... <!--/CMS:id--> の間を、app.js と同一マークアップで置換し、
 *       <meta name="cms-hash"> に JSON のハッシュを書き込む。app.js は同一ハッシュなら再描画をスキップする。
 *
 * 実行: node scripts/prerender.mjs        (GitHub Actions: .github/workflows/prerender.yml が 6 時間毎に実行)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbybbWX0lJQ8drdfsh5C67Z472fO2TY1PLz6HQpujgVzLPPFtvJ-p0SWrfbHeQxGgWm6aw/exec';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');

/* ---------- app.js と同一のユーティリティ ---------- */
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s || ''); };
function driveImg(url) {
  if (!url) return '';
  const s = String(url).trim();
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/); if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=w1200`;
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/); if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}=w1200`;
  if (s.includes('drive.google.com/thumbnail')) { const idm = s.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (idm) return `https://lh3.googleusercontent.com/d/${idm[1]}=w1200`; }
  return s;
}
function stars(n) { n = Math.max(0, Math.min(5, parseInt(n, 10) || 5)); return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5 - n) + '</span>'; }
function cmsHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + '.' + s.length; }

/* ---------- レンダラ (app.js の apply* と同じ DOM。reveal は is-visible 付きで出力) ---------- */
const R = 'reveal is-visible';

function renderMenu(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map((m, i) => {
    const img = driveImg(m.image);
    const num = String(i + 1).padStart(2, '0');
    const hasLink = m.url && m.url.trim() !== '';
    const tag = hasLink ? `a href="${esc(m.url.trim())}"` : 'article';
    const close = hasLink ? 'a' : 'article';
    const linkStyle = hasLink ? ' style="text-decoration:none;color:inherit;display:block;"' : '';
    return `<${tag} class="service-card ${R}"${linkStyle}${hasLink ? ' target="_blank" rel="noopener noreferrer"' : ''}>
      <div class="service-num">${num}</div>
      ${img ? `<div class="service-img"><img src="${esc(img)}" alt="${esc(m.name)}" loading="lazy"></div>` : '<div class="service-img placeholder"><i class="fa-solid fa-circle-nodes"></i></div>'}
      <div class="service-body">
        ${m.bestSeller ? '<span class="service-badge">人気</span>' : ''}
        <h3 class="service-name">${esc(m.name)}</h3>
        ${m.price ? `<p class="service-price">${esc(m.price)}</p>` : ''}
        <p class="service-desc">${esc(m.desc)}</p>
        ${hasLink ? '<span class="service-link-hint">詳しく見る →</span>' : ''}
      </div>
    </${close}>`;
  }).join('\n');
}

function renderFeatures(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map(f => `<article class="feature-card ${R}">
    <div class="feature-num">${esc(f.num)}</div>
    <h3 class="feature-title">${esc(f.title)}</h3>
    <p class="feature-desc">${esc(f.desc)}</p>
  </article>`).join('\n');
}

function renderForYou(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map((f, i) => {
    const img = driveImg(f.image);
    const idx = String(i + 1).padStart(2, '0');
    return `<article class="foryou-card ${R}" data-index="${idx}">
      ${img ? `<div class="foryou-img"><img src="${esc(img)}" alt="" loading="lazy"></div>` : '<div class="foryou-img placeholder"><i class="fa-solid fa-check"></i></div>'}
      <div class="foryou-body">
        <span class="foryou-label">${esc(f.label)}</span>
        <p class="foryou-cap">${esc(f.caption)}</p>
      </div>
    </article>`;
  }).join('\n');
}

function renderReviews(items, settings) {
  const list = Array.isArray(items) ? items : [];
  let html = list.slice(0, 5).map(r => `<article class="review ${R}">
    <div class="stars">${stars(r.stars)}</div>
    <p class="body">${esc(r.text || '')}</p>
    <div class="meta">
      <span class="name">${esc(r.name || '')}</span>
      <span class="date">${esc(fmtDate(r.date))}</span>
    </div>
  </article>`).join('\n');
  const gbpUrl = (settings && settings.gbpUrl) || '#';
  const ctaMsg = list.length ? '他のクチコミも<br>Googleでご覧いただけます' : 'お客様の声を<br>Googleでご覧いただけます';
  html += `\n<a class="review review-cta ${R}" href="${esc(gbpUrl)}" target="_blank" rel="noopener">
    <div class="review-cta-stars">★ ★ ★ ★ ★</div>
    <p class="review-cta-msg">${ctaMsg}</p>
    <span class="review-cta-link">Googleで見る →</span>
  </a>`;
  return html;
}

function renderBlog(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const valid = items.filter(b => b.body || (b.title && !/^（.*）$/.test(b.title)));
  if (!valid.length) return null; /* 記事なし → HTML 内の静的特集カードを残す */
  return valid.map((b, i) => {
    let rawTitle = (b.title || '').trim();
    if (!rawTitle && b.body) rawTitle = (String(b.body).split(/[。\n]/)[0] || '').trim();
    if (!rawTitle && b.date) rawTitle = `${fmtDate(b.date)} の投稿`;
    const shortTitle = rawTitle.length > 44 ? rawTitle.slice(0, 44) + '…' : rawTitle;
    const imgUrl = driveImg(b.image);
    const href = (b.url && b.url.includes('/blog/')) ? b.url : (b.date ? `/blog/${b.date}/` : null);
    const open = href ? `<a href="${esc(href)}" class="e blog-card ${R}">` : `<article class="e blog-card ${R}" role="button" tabindex="0" data-idx="${i}">`;
    const close = href ? '</a>' : '</article>';
    return `${open}
      <span class="tape"></span>
      ${imgUrl ? '<div class="image"><img src="' + esc(imgUrl) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></div>' : ''}
      <div class="body">
        ${b.date ? '<span class="date">' + esc(fmtDate(b.date)) + '</span>' : ''}
        <p class="cap">${esc(shortTitle)}</p>
        ${b.body ? '<span class="cta-lbl">続きを読む →</span>' : ''}
      </div>
    ${close}`;
  }).join('\n');
}

function renderPartners(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map(p => {
    const img = driveImg(p.logo || p.image);
    const featured = p.featured === true || p.featured === 'TRUE' || p.featured === 'true';
    const klass = featured ? `partner-card featured ${R}` : `partner-card ${R}`;
    const open = p.url ? `<a class="${klass}" href="${esc(p.url)}" target="_blank" rel="noopener">` : `<div class="${klass}">`;
    const close = p.url ? '</a>' : '</div>';
    return `${open}
      ${featured ? '<span class="partner-tag">PARTNERSHIP</span>' : ''}
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="partner-name-fallback">${esc(p.name || '')}</span>`}
      ${p.name ? `<span class="partner-name">${esc(p.name)}</span>` : ''}
    ${close}`;
  }).join('\n');
}

function renderRecruit(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div class="recruit-empty">現在の募集はありません。カジュアル面談のご相談は <a href="#contact">こちら</a> からお気軽にどうぞ。</div>';
  }
  return items.map(r => {
    const isOpen = String(r.status || '').toLowerCase() === 'open' || r.status === '募集中';
    const btnText = isOpen ? '応募する' : '募集停止中';
    const btnClass = isOpen ? 'btn btn-primary' : 'btn btn-disabled';
    const btnHref = isOpen ? (r.applyUrl || '#contact') : '#';
    return `<article class="recruit-card ${R}">
      <div class="recruit-info">
        <span class="recruit-type">${esc(r.type || '')}</span>
        <h3 class="recruit-title">${esc(r.title || '')}</h3>
        <dl class="recruit-dl">
          ${r.work ? `<dt>業務内容</dt><dd>${esc(r.work)}</dd>` : ''}
          ${r.salary ? `<dt>給与・報酬</dt><dd>${esc(r.salary)}</dd>` : ''}
          ${r.location ? `<dt>勤務地</dt><dd>${esc(r.location)}</dd>` : ''}
        </dl>
      </div>
      <div class="recruit-cta">
        <a href="${esc(btnHref)}" class="${btnClass}">${btnText}</a>
      </div>
    </article>`;
  }).join('\n');
}

/* ---------- マーカー置換 ---------- */
function replaceBlock(html, id, inner) {
  if (inner == null) return html;
  const re = new RegExp(`(<!--CMS:${id}-->)[\\s\\S]*?(<!--/CMS:${id}-->)`);
  if (!re.test(html)) { console.warn(`[prerender] marker not found: ${id}`); return html; }
  return html.replace(re, (_, a, b) => `${a}\n${inner}\n${b}`);
}

async function main() {
  const res = await fetch(GAS_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GAS fetch failed: ${res.status}`);
  const data = await res.json();
  const raw = JSON.stringify(data);
  const hash = cmsHash(raw);

  let html = await readFile(INDEX, 'utf8');
  const before = html;

  html = replaceBlock(html, 'servicesGrid', renderMenu(data.menu));
  html = replaceBlock(html, 'featuresList', renderFeatures(data.features));
  html = replaceBlock(html, 'forYouGrid',   renderForYou(data.forYou));
  html = replaceBlock(html, 'reviewsGrid',  renderReviews(data.reviews, data.settings));
  html = replaceBlock(html, 'blogWall',     renderBlog(data.blog));
  html = replaceBlock(html, 'partnersGrid', renderPartners(data.partners));
  html = replaceBlock(html, 'recruitList',  renderRecruit(data.recruit));
  if (data.about && Array.isArray(data.about.paragraphs) && data.about.paragraphs.length) {
    html = replaceBlock(html, 'greetingBody', data.about.paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n'));
  }
  if (data.cta) {
    if (data.cta.headline1) html = replaceBlock(html, 'ctaH1', esc(data.cta.headline1));
    if (data.cta.subText)   html = replaceBlock(html, 'ctaSub', esc(data.cta.subText));
  }
  if (data.settings && data.settings.copyright) {
    html = replaceBlock(html, 'copyright', `&copy; ${new Date().getFullYear()} ${esc(data.settings.copyright)} All Rights Reserved.`);
  }
  if (data.recruitStatus) {
    html = html.replace(/(id="recruitStatus">)[^<]*(<)/, (_, a, b) => `${a}${esc(data.recruitStatus)}${b}`);
  }
  html = html.replace(/<meta name="cms-hash" content="[^"]*">/, `<meta name="cms-hash" content="${hash}">`);

  if (html === before) { console.log('[prerender] unchanged'); return; }
  await writeFile(INDEX, html, 'utf8');
  console.log(`[prerender] index.html updated (cms-hash=${hash}, menu=${(data.menu || []).length}, reviews=${(data.reviews || []).length}, blog=${(data.blog || []).length})`);
}

main().catch(err => { console.error('[prerender] ERROR', err); process.exit(1); });
