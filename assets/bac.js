/* BAC — Before/After Comparison: 表示範囲に入ったらバーを伸ばし、支援後の数値をカウントアップする
   失敗時・非表示タブ・動き抑制設定では、マークアップの最終状態 (値もバー幅も確定済み) のまま表示する */
(function () {
  var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-bac]'));
  if (!blocks.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var ROW_STAGGER = 160, AFTER_LAG = 260, DURATION = 1050;

  function fmt(n) { return Math.round(n).toLocaleString('ja-JP'); }

  function countUp(el, from, to, delay) {
    el.textContent = fmt(from);
    var start = null, done = false;
    function finish() { if (!done) { done = true; el.textContent = fmt(to); } }
    function step(ts) {
      if (done) return;
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / DURATION);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step); else finish();
    }
    setTimeout(function () { requestAnimationFrame(step); }, delay);
    /* rAF が止まっても最終値は必ず表示する */
    setTimeout(finish, delay + DURATION + 150);
  }

  function play(block) {
    if (block.classList.contains('is-play')) return;
    block.classList.remove('is-armed');
    block.classList.add('is-play');
    block.querySelectorAll('.bac-row').forEach(function (row, i) {
      var num = row.querySelector('.bac-track--after .bac-num');
      var from = parseFloat(row.getAttribute('data-before')) || 0;
      var to = parseFloat(row.getAttribute('data-after')) || 0;
      if (num) countUp(num, from, to, i * ROW_STAGGER + AFTER_LAG);
    });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      /* armed (幅0) を一度描画させてから伸ばす */
      setTimeout(function () { play(e.target); }, 30);
    });
  }, { threshold: 0.3 });

  function arm() {
    blocks.forEach(function (block) {
      block.querySelectorAll('.bac-row').forEach(function (row, i) { row.style.setProperty('--i', i); });
      block.classList.add('is-armed');
      io.observe(block);
    });
  }

  /* 裏タブ等で開かれた場合は、ページが表示された瞬間にアニメーション待機へ入る */
  if (document.visibilityState === 'visible') {
    arm();
  } else {
    document.addEventListener('visibilitychange', function onVis() {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVis);
      arm();
    });
  }
})();
