/* ============================================================
   ⚡ リロード時はページTOPへ。ブラウザのスクロール位置復元を無効化
   - URLに #anchor がある場合は通常通りアンカー先へジャンプ
   - 何もない場合: 必ず 0,0 から始まる
   ============================================================ */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.addEventListener('load', () => {
  if (!location.hash) {
    window.scrollTo(0, 0);
  }
});

/* ============================================================
   ⚡ パフォーマンス: Font Awesome を非ブロッキングで読込
   (preload は事前ダウンロード用、stylesheet を確実に append して適用)
   ============================================================ */
(function loadFontAwesomeAsync(){
  /* 既存の preload タグを除去 (キャッシュに乗ってる) */
  const existing = document.getElementById('fa-css');
  if(existing && existing.rel === 'preload') existing.remove();
  /* 確実にstylesheetとして適用 */
  const fa = document.createElement('link');
  fa.rel = 'stylesheet';
  fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
  fa.crossOrigin = 'anonymous';
  document.head.appendChild(fa);
})();

/* ============================================================
   GAS_URL — STEP 4 でデプロイURLに置換
   ============================================================ */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbybbWX0lJQ8drdfsh5C67Z472fO2TY1PLz6HQpujgVzLPPFtvJ-p0SWrfbHeQxGgWm6aw/exec';

/* ============================================================
   ⚡ CMS localStorage キャッシュ (60分 TTL)
   - 初回: GAS から取得しキャッシュ
   - 2回目以降: キャッシュ即返却で 2-3秒の待ち時間ゼロに
   - バックグラウンドで最新を取得し差分があれば再描画
   ============================================================ */
const CMS_CACHE_KEY = 'sm_cms_cache_v1';
const CMS_CACHE_TTL_MS = 60 * 60 * 1000; /* 60分 */

function loadCMSFromCache(){
  try {
    const raw = localStorage.getItem(CMS_CACHE_KEY);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !obj.t || !obj.data) return null;
    if(Date.now() - obj.t > CMS_CACHE_TTL_MS) return null;
    return obj.data;
  } catch(_){ return null; }
}
function saveCMSToCache(data){
  try {
    localStorage.setItem(CMS_CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
  } catch(_){}
}

/* ============================================================
   Utilities
   ============================================================ */
function esc(s){
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(s){
  if(!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s);
}
function driveImg(url){
  if(!url) return '';
  const s = String(url).trim();
  // lh3 形式はそのまま返す
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if(m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=w1200`;
  // /d/FILE_ID 形式 → lh3 に変換（最も安定）
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m1) return `https://lh3.googleusercontent.com/d/${m1[1]}=w1200`;
  // thumbnail 形式が直接渡された場合
  if(s.indexOf('drive.google.com/thumbnail') !== -1){
    const idm = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if(idm) return `https://lh3.googleusercontent.com/d/${idm[1]}=w1200`;
    return s;
  }
  return s;
}
function stars(n){
  n = Math.max(0, Math.min(5, parseInt(n,10) || 5));
  return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5-n) + '</span>';
}

/* ============================================================
   CMS apply functions
   ============================================================ */
window._settings = {};

function applySettings(s){
  if(!s) return;
  window._settings = s;
  if(s.copyright){
    const el = document.getElementById('copyright');
    if(el) el.textContent = '© ' + new Date().getFullYear() + ' ' + s.copyright + ' All Rights Reserved.';
  }
  // 電話導線は廃止: 問い合わせはフォーム/メールに一本化
}

function applyHero(h){
  if(!h) return;
  if(h.subLines && h.subLines.length){
    const sub = document.getElementById('heroSub');
    if(sub) sub.innerHTML = h.subLines.map(esc).join('<br>');
  }
}

function applyAbout(a){
  if(!a) return;
  if(a.paragraphs && a.paragraphs.length){
    const body = document.getElementById('greetingBody');
    if(body) body.innerHTML = a.paragraphs.map(p => '<p>' + esc(p) + '</p>').join('');
  }
}

function applyMenu(items){
  if(!Array.isArray(items) || !items.length) return;
  const grid = document.getElementById('servicesGrid');
  if(!grid) return;
  grid.innerHTML = items.map((m,i) => {
    const img = driveImg(m.image);
    const num = String(i+1).padStart(2,'0');
    const hasLink = m.url && m.url.trim() !== '';
    const tag = hasLink ? `a href="${esc(m.url.trim())}"` : 'article';
    const closeTag = hasLink ? 'a' : 'article';
    const linkStyle = hasLink ? ' style="text-decoration:none;color:inherit;display:block;"' : '';
    return `<${tag} class="service-card reveal"${linkStyle}${hasLink ? ' target="_blank" rel="noopener noreferrer"' : ''}>
      <div class="service-num">${num}</div>
      ${img ? `<div class="service-img"><img src="${esc(img)}" alt="${esc(m.name)}" loading="lazy"></div>` : '<div class="service-img placeholder"><i class="fa-solid fa-circle-nodes"></i></div>'}
      <div class="service-body">
        ${m.bestSeller ? '<span class="service-badge">人気</span>' : ''}
        <h3 class="service-name">${esc(m.name)}</h3>
        ${m.price ? `<p class="service-price">${esc(m.price)}</p>` : ''}
        <p class="service-desc">${esc(m.desc)}</p>
        ${hasLink ? '<span class="service-link-hint">詳しく見る →</span>' : ''}
      </div>
    </${closeTag}>`;
  }).join('');
}

function applyFeatures(items){
  if(!Array.isArray(items) || !items.length) return;
  const grid = document.getElementById('featuresList');
  if(!grid) return;
  grid.innerHTML = items.map(f => `<article class="feature-card reveal">
    <div class="feature-num">${esc(f.num)}</div>
    <h3 class="feature-title">${esc(f.title)}</h3>
    <p class="feature-desc">${esc(f.desc)}</p>
  </article>`).join('');
}

function applyForYou(items){
  if(!Array.isArray(items) || !items.length) return;
  const grid = document.getElementById('forYouGrid');
  if(!grid) return;
  grid.innerHTML = items.map((f, i) => {
    const img = driveImg(f.image);
    const idx = String(i + 1).padStart(2, '0');
    return `<article class="foryou-card reveal" data-index="${idx}">
      ${img ? `<div class="foryou-img"><img src="${esc(img)}" alt="" loading="lazy"></div>` : '<div class="foryou-img placeholder"><i class="fa-solid fa-check"></i></div>'}
      <div class="foryou-body">
        <span class="foryou-label">${esc(f.label)}</span>
        <p class="foryou-cap">${esc(f.caption)}</p>
      </div>
    </article>`;
  }).join('');
}

function applyReviews(items){
  const grid = document.getElementById('reviewsGrid');
  if(!grid) return;
  const list = Array.isArray(items) ? items : [];
  let html = list.slice(0,5).map(r => `<article class="review">
    <div class="stars">${stars(r.stars)}</div>
    <p class="body">${esc(r.text||'')}</p>
    <div class="meta">
      <span class="name">${esc(r.name||'')}</span>
      <span class="date">${esc(fmtDate(r.date))}</span>
    </div>
  </article>`).join('');
  const gbpUrl = (window._settings && window._settings.gbpUrl) || '#';
  const ctaMsg = list.length
    ? '他のクチコミも<br>Googleでご覧いただけます'
    : 'お客様の声を<br>Googleでご覧いただけます';
  html += `<a class="review review-cta" href="${esc(gbpUrl)}" target="_blank" rel="noopener">
    <div class="review-cta-stars">★ ★ ★ ★ ★</div>
    <p class="review-cta-msg">${ctaMsg}</p>
    <span class="review-cta-link">Googleで見る →</span>
  </a>`;
  grid.innerHTML = html;
}

/* ============================================================
   applyBlog (skill仕様準拠・触らない)
   ============================================================ */
function applyBlog(items){
  const wall = document.querySelector('#blog .wall');
  if(wall) wall.classList.remove('cms-loading');
  if(!items || !items.length){
    if(wall) wall.innerHTML = '<div class="blog-empty">準備中です。MEO・AI活用の最新情報をお届け予定です。</div>';
    return;
  }
  const valid = items.filter(b => b.body || (b.title && !/^（.*）$/.test(b.title)));
  if(!valid.length){
    if(wall) wall.innerHTML = '<div class="blog-empty">準備中です。MEO・AI活用の最新情報をお届け予定です。</div>';
    return;
  }
  window._blogItems = valid;
  wall.innerHTML = valid.map((b,i) => {
    let rawTitle = (b.title || '').trim();
    if(!rawTitle && b.body){
      const firstSentence = String(b.body).split(/[。\n]/)[0] || '';
      rawTitle = firstSentence.trim();
    }
    if(!rawTitle && b.date){
      rawTitle = `${fmtDate(b.date)} の投稿`;
    }
    const shortTitle = rawTitle.length > 44 ? rawTitle.slice(0,44) + '…' : rawTitle;
    const imgUrl = driveImg(b.image);
    const blogHref = (b.url && b.url.includes('/blog/'))
      ? b.url
      : (b.date ? `/blog/${b.date}/` : null);
    const tagOpen = blogHref
      ? `<a href="${blogHref}" class="e blog-card reveal">`
      : `<article class="e blog-card reveal" role="button" tabindex="0" data-idx="${i}">`;
    const tagClose = blogHref ? '</a>' : '</article>';
    return `${tagOpen}
      <span class="tape"></span>
      ${imgUrl ? '<div class="image"><img src="' + esc(imgUrl) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></div>' : ''}
      <div class="body">
        ${b.date ? '<span class="date">' + esc(fmtDate(b.date)) + '</span>' : ''}
        <p class="cap">${esc(shortTitle)}</p>
        ${b.body ? '<span class="cta-lbl">続きを読む →</span>' : ''}
      </div>
    ${tagClose}`;
  }).join('');
}

/* ============================================================
   Partners (delivery 流用)
   delivery シートの type=partner で扱う or 専用partnersシート
   ============================================================ */
/* ============================================================
   Works
   ============================================================ */
function applyWorks(items){
  if(!Array.isArray(items) || !items.length) return;
  const grid = document.getElementById('worksGrid');
  if(!grid) return;
  // 「サンプル」が含まれるものはスケルトンのまま空にせず、フォールバックでサンプル表示
  const real = items.filter(w => !/サンプル/.test(w.title || ''));
  const display = real.length ? real : items;
  grid.innerHTML = display.map(w => {
    const img = driveImg(w.image);
    const hasUrl = w.url && /^https?:/.test(w.url);
    const open = hasUrl
      ? `<a class="work-card reveal" href="${esc(w.url)}" target="_blank" rel="noopener">`
      : `<article class="work-card reveal">`;
    const close = hasUrl ? '</a>' : '</article>';
    return `${open}
      <div class="work-image">
        ${img
          ? `<img src="${esc(img)}" alt="${esc(w.title)}" loading="lazy" onerror="this.closest('.work-image').innerHTML='<div class=\\'work-image-placeholder\\'><i class=\\'fa-solid fa-image\\'></i></div>'">`
          : '<div class="work-image-placeholder"><i class="fa-solid fa-image"></i></div>'}
        <div class="work-image-overlay"></div>
      </div>
      <div class="work-body">
        ${w.category ? `<span class="work-cat">${esc(w.category)}</span>` : ''}
        <h3 class="work-title">${esc(w.title)}</h3>
        ${w.desc ? `<p class="work-desc">${esc(w.desc)}</p>` : ''}
        ${hasUrl ? '<span class="work-link">View Project <i class="fa-solid fa-arrow-up-right-from-square"></i></span>' : ''}
      </div>
    ${close}`;
  }).join('');
}

function applyPartners(items){
  if(!Array.isArray(items) || !items.length) return;
  const grid = document.getElementById('partnersGrid');
  if(!grid) return;
  grid.innerHTML = items.map(p => {
    const img = driveImg(p.logo || p.image);
    const featured = p.featured === true || p.featured === 'TRUE' || p.featured === 'true';
    const klass = featured ? 'partner-card featured reveal' : 'partner-card reveal';
    const linkOpen = p.url
      ? `<a class="${klass}" href="${esc(p.url)}" target="_blank" rel="noopener">`
      : `<div class="${klass}">`;
    const linkClose = p.url ? '</a>' : '</div>';
    return `${linkOpen}
      ${featured ? '<span class="partner-tag">PARTNERSHIP</span>' : ''}
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="partner-name-fallback">${esc(p.name||'')}</span>`}
      ${p.name ? `<span class="partner-name">${esc(p.name)}</span>` : ''}
    ${linkClose}`;
  }).join('');
}

/* ============================================================
   Recruit (delivery 流用 or recruitシート)
   ============================================================ */
function applyRecruit(items, statusText){
  const list = document.getElementById('recruitList');
  if(!list) return;
  if(statusText){
    const sub = document.getElementById('recruitStatus');
    if(sub) sub.textContent = statusText;
  }
  if(!Array.isArray(items) || !items.length){
    list.innerHTML = '<div class="recruit-empty">現在の募集はありません。カジュアル面談のご相談は <a href="#contact">こちら</a> からお気軽にどうぞ。</div>';
    return;
  }
  list.innerHTML = items.map(r => {
    const isOpen = String(r.status||'').toLowerCase() === 'open' || r.status === '募集中';
    const btnText = isOpen ? '応募する' : '募集停止中';
    const btnClass = isOpen ? 'btn btn-primary' : 'btn btn-disabled';
    const btnHref = isOpen ? (r.applyUrl || '#contact') : '#';
    return `<article class="recruit-card reveal">
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
  }).join('');
}

function applyCTA(c){
  if(!c) return;
  if(c.headline1){
    const h = document.getElementById('ctaH1');
    if(h) h.textContent = c.headline1;
  }
  if(c.subText){
    const s = document.getElementById('ctaSub');
    if(s) s.textContent = c.subText;
  }
}

/* ============================================================
   CMS fetch
   ============================================================ */
function applyCMSData(data){
  if(!data) return;
  if(data.settings) applySettings(data.settings);
  if(data.hero)     applyHero(data.hero);
  if(data.about)    applyAbout(data.about);
  if(data.menu)     applyMenu(data.menu);
  if(data.features) applyFeatures(data.features);
  if(data.forYou)   applyForYou(data.forYou);
  if(data.reviews)  applyReviews(data.reviews);
  if(data.blog)     applyBlog(data.blog);
  if(data.works)    applyWorks(data.works);
  if(data.partners) applyPartners(data.partners);
  if(data.recruit)  applyRecruit(data.recruit, data.recruitStatus);
  if(data.cta)      applyCTA(data.cta);
}

function loadCMS(){
  if(!GAS_URL || GAS_URL === '__GAS_URL__') {
    console.warn('GAS_URL not configured yet');
    return;
  }
  /* ⚡ キャッシュがあれば先に描画 (体感速度UP) */
  const cached = loadCMSFromCache();
  if(cached){
    applyCMSData(cached);
    if(typeof observeNew === 'function') observeNew();
    setTimeout(() => {
      document.querySelectorAll('.reveal:not(.is-visible), .reveal-stagger > *:not(.is-visible)').forEach(el => {
        el.classList.add('is-visible');
      });
    }, 200);
  }
  /* バックグラウンドで最新を取得 (キャッシュ更新+差分があれば再描画) */
  fetch(GAS_URL)
    .then(r => r.json())
    .then(data => {
      saveCMSToCache(data);
      /* キャッシュなしならここで初描画 */
      if(!cached) applyCMSData(data);
      /* キャッシュありで内容が変わっていれば再描画 */
      else if(JSON.stringify(cached) !== JSON.stringify(data)) applyCMSData(data);
      // CMS反映直後に新規挿入要素のアニメーションを監視（タイミング依存バグの修正）
      if(typeof observeNew === 'function') observeNew();
      // CMS反映から800ms後にフェイルセーフ実行（全ての未表示 reveal を強制的に is-visible 化）
      setTimeout(() => {
        document.querySelectorAll('.reveal:not(.is-visible), .reveal-stagger > *:not(.is-visible)').forEach(el => {
          el.classList.add('is-visible');
        });
      }, 800);
    })
    .catch(err => console.warn('CMS fetch error:', err));
}

/* ============================================================
   Nav scroll behavior
   ============================================================ */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  if(window.scrollY > 50) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
}, { passive: true });

/* ============================================================
   Mobile menu
   ============================================================ */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobile-nav');
function toggleMobile(){
  hamburger.classList.toggle('is-open');
  mobileNav.classList.toggle('is-open');
  document.body.classList.toggle('nav-open');
}
hamburger.addEventListener('click', toggleMobile);
mobileNav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    if(mobileNav.classList.contains('is-open')) toggleMobile();
  });
});

/* ============================================================
   Tab switching (Contact form)
   ============================================================ */
document.querySelectorAll('.tab-link').forEach(btn => {
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab-link').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected','false');
    });
    this.classList.add('active');
    this.setAttribute('aria-selected','true');
    const target = this.getAttribute('data-tab');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(target).classList.add('active');
  });
});

/* ============================================================
   Form submission (GAS endpoint)
   ============================================================ */
document.querySelectorAll('form[data-form]').forEach(form => {
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    const status = document.getElementById('formStatus');
    status.hidden = false;
    status.className = 'form-status loading';
    status.textContent = '送信中...';

    const formType = form.getAttribute('data-form');
    const fd = new FormData(form);

    // Honeypot: 不可視フィールドに値があればBotとみなして無音で破棄
    if(fd.get('website')) {
      console.warn('Honeypot triggered, dropping silently');
      status.className = 'form-status success';
      status.innerHTML = '<i class="fa-solid fa-circle-check"></i> 送信が完了しました。<br>担当者より2営業日以内にご返信いたします。';
      form.reset();
      return;
    }

    const payload = {
      type: formType,
      name: fd.get('name') || '',
      company: fd.get('company') || '',
      email: fd.get('email') || '',
      tel: fd.get('tel') || '',
      message: fd.get('message') || '',
      requestType: fd.get('requestType') || '',
      interests: fd.getAll('interests').join(' / '),
    };

    try {
      if(!GAS_URL || GAS_URL === '__GAS_URL__'){
        throw new Error('GAS endpoint not configured');
      }
      // GAS Web App は CORS preflight 嫌うので text/plain で送信
      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      // no-cors なのでレスポンス検証不可。送信完了とみなす。
      status.className = 'form-status success';
      status.innerHTML = '<i class="fa-solid fa-circle-check"></i> 送信が完了しました。<br>担当者より2営業日以内にご返信いたします。';
      form.reset();
      setTimeout(() => { status.scrollIntoView({behavior:'smooth', block:'center'}); }, 100);
    } catch(err){
      status.className = 'form-status error';
      status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 送信に失敗しました。お手数ですが時間を置いて再度お試しいただくか、<a href="mailto:h.kuniyoshi@search-mania.net">h.kuniyoshi@search-mania.net</a> までご連絡ください。';
      console.error(err);
    }
  });
});

/* ============================================================
   Reveal on scroll
   ============================================================ */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if(e.isIntersecting){
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal, .reveal-stagger > *').forEach(el => io.observe(el));

/* Re-observe CMS-inserted elements. Elements already in viewport become visible immediately. */
function observeNew(){
  document.querySelectorAll('.reveal:not(.is-visible), .reveal-stagger > *:not(.is-visible)').forEach(el => {
    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.95 && rect.bottom > 0;
    if(inView){
      el.classList.add('is-visible');
    } else {
      io.observe(el);
    }
  });
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadCMS();
  // CMS 読み込み後に reveal を再観測
  setTimeout(observeNew, 1500);
  // 最終フェイルセーフ: 5秒後に未表示の reveal を強制 is-visible 化
  setTimeout(() => {
    document.querySelectorAll('.reveal:not(.is-visible), .reveal-stagger > *:not(.is-visible)').forEach(el => {
      el.classList.add('is-visible');
    });
  }, 5000);

  /* ----- Hero keywords: 中央のキーワードをアクティブ化 ----- */
  const kwsContainer = document.querySelector('.hero-keywords');
  if(kwsContainer){
    const kws = kwsContainer.querySelectorAll('.kw');
    const centerY = () => {
      const rect = kwsContainer.getBoundingClientRect();
      return rect.top + rect.height / 2;
    };
    const updateActive = () => {
      const c = centerY();
      let nearest = null, nearestDist = Infinity;
      kws.forEach(k => {
        const r = k.getBoundingClientRect();
        const ky = r.top + r.height / 2;
        const d = Math.abs(c - ky);
        if(d < nearestDist){ nearestDist = d; nearest = k; }
      });
      kws.forEach(k => k.classList.toggle('is-active', k === nearest));
    };
    const tick = () => {
      updateActive();
      requestAnimationFrame(tick);
    };
    tick();
  }

  /* ----- 勉強会ポップアップ ----- */
  const studyPopup = document.getElementById('studyPopup');
  if(studyPopup){
    const closeBtn = studyPopup.querySelector('.study-popup-close');
    // セッション中に閉じていなければ 2秒後に出現
    if(sessionStorage.getItem('studyPopupDismissed') !== '1'){
      setTimeout(() => studyPopup.classList.add('is-shown'), 2000);
    }
    if(closeBtn){
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        studyPopup.classList.remove('is-shown');
        studyPopup.classList.add('is-dismissed');
        try { sessionStorage.setItem('studyPopupDismissed', '1'); } catch(_){}
      });
    }
  }

  /* ----- 全主要セクション: スクロール到達で in-view 付与 ----- */
  const animSections = document.querySelectorAll(
    '.section.chapter, #features, #for-you, #works, #partners, #reviews, #recruit, #contact'
  );
  if(animSections.length && 'IntersectionObserver' in window){
    const secIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if(e.isIntersecting) e.target.classList.add('in-view');
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    animSections.forEach(c => secIO.observe(c));
  }
});

/* ============================================================
   Character cascade animation for hero title
   ============================================================ */
function setupCharCascade(){
  const el = document.querySelector('[data-anim="char-cascade"] .hero-title-main');
  if(!el) return;
  // Walk text nodes only, preserving <br> tags
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while((n = walker.nextNode())) nodes.push(n);
  let idx = 0;
  nodes.forEach(node => {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    [...text].forEach(ch => {
      if(ch === ' ' || ch === '　'){
        frag.appendChild(document.createTextNode(ch));
        return;
      }
      const span = document.createElement('span');
      span.className = 'char';
      span.style.animationDelay = (0.04 * idx) + 's';
      span.textContent = ch;
      frag.appendChild(span);
      idx++;
    });
    node.parentNode.replaceChild(frag, node);
  });
}
setupCharCascade();

/* ============================================================
   3D Tilt on cards (mouse-tracked)
   ============================================================ */
function setupTilt(){
  document.querySelectorAll('.tilt').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotY = (x - 0.5) * 10;
      const rotX = (0.5 - y) * 10;
      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/* Apply tilt to dynamically inserted service/work cards too */
const tiltObserver = new MutationObserver(() => {
  document.querySelectorAll('.service-card:not(.tilt), .work-card:not(.tilt)').forEach(c => {
    c.classList.add('tilt');
  });
  setupTilt();
});
tiltObserver.observe(document.body, { childList: true, subtree: true });

/* ============================================================
   Mouse-tracked parallax for hero orbs
   ============================================================ */
const heroSec = document.getElementById('hero');
if(heroSec){
  heroSec.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 30;
    const y = (e.clientY / window.innerHeight - 0.5) * 30;
    heroSec.style.setProperty('--parallax-x', x + 'px');
    heroSec.style.setProperty('--parallax-y', y + 'px');
  });
}

/* ============================================================
   Scroll progress + parallax bg image
   ============================================================ */
window.addEventListener('scroll', () => {
  const sc = window.scrollY;
  const heroBgImg = document.querySelector('.hero-bg-image');
  if(heroBgImg && sc < window.innerHeight){
    heroBgImg.style.transform = `scale(1.08) translateY(${sc * 0.35}px)`;
  }
}, { passive: true });

/* Click anchor in same page → smooth scroll */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e){
    const href = this.getAttribute('href');
    if(href === '#') return;
    const tgt = document.querySelector(href);
    if(tgt){
      e.preventDefault();
      const top = tgt.getBoundingClientRect().top + window.pageYOffset - 70;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});
