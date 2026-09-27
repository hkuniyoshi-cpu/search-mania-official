/* BAC — Before/After Comparison: スクロールで表示範囲に入ったらバーを伸ばし、支援後の数値をカウントアップする */
(function () {
  var blocks = document.querySelectorAll('[data-bac]');
  if (!blocks.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return; /* マークアップの最終状態のまま表示 */

  function fmt(n) { return Math.round(n).toLocaleString('ja-JP'); }

  function countUp(el, from, to, delay) {
    var dur = 1050;
    el.textContent = fmt(from);
    setTimeout(function () {
      var t0 = null;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(from + (to - from) * eased);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt(to);
      }
      requestAnimationFrame(step);
    }, delay);
  }

  function play(block) {
    block.classList.remove('is-armed');
    block.classList.add('is-play');
    block.querySelectorAll('.bac-row').forEach(function (row, i) {
      var num = row.querySelector('.bac-track--after .bac-num');
      var from = parseFloat(row.getAttribute('data-before')) || 0;
      var to = parseFloat(row.getAttribute('data-after')) || 0;
      if (num) countUp(num, from, to, i * 160 + 260);
    });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      /* 2フレーム待ってから開始 (armed 状態の幅0が描画されてから伸ばす) */
      requestAnimationFrame(function () { requestAnimationFrame(function () { play(e.target); }); });
    });
  }, { threshold: 0.35 });

  blocks.forEach(function (block) {
    block.querySelectorAll('.bac-row').forEach(function (row, i) { row.style.setProperty('--i', i); });
    /* 既に画面内にあるものも armed → play の流れで一度だけアニメーションさせる */
    block.classList.add('is-armed');
    io.observe(block);
  });
})();
