// 裝飾動畫與既有搜尋、語言切換分開管理，停用後內容仍可完整閱讀。
(() => {
  const body = document.body;
  if (body.dataset.motion !== 'true' || body.dataset.immersive !== 'true' || !('IntersectionObserver' in window)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const english = document.documentElement.lang === 'en';
  let paused = false;
  try { paused = localStorage.getItem('opal-motion-paused') === 'true'; } catch { /* 不影響瀏覽。 */ }
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const visible = new Map();
  const activityHandlers = new Map();
  let enterTimer = null;
  let leaveTimer = null;
  const active = (element) => visible.get(element) && !reduced.matches && !document.hidden && !paused;
  const pauseButton = document.createElement('button');
  pauseButton.type = 'button'; pauseButton.className = 'motion-pause';
  document.querySelector('.footer-bottom')?.append(pauseButton);

  function syncActivity() {
    body.classList.toggle('immersive-ready', !reduced.matches);
    body.classList.toggle('animations-paused', paused);
    pauseButton.disabled = reduced.matches;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = reduced.matches ? (english ? 'Reduced motion' : '已減少動態') : paused ? (english ? 'Resume motion' : '恢復動畫') : (english ? 'Pause motion' : '暫停動畫');
    pauseButton.setAttribute('aria-label', pauseButton.textContent);
    visible.forEach((isVisible, element) => {
      const onScreen = Boolean(isVisible && !reduced.matches && !document.hidden);
      element.classList.toggle('motion-in-view', onScreen);
      activityHandlers.get(element)?.(onScreen && !paused);
    });
    if (reduced.matches) {
      body.classList.remove('is-entering', 'is-leaving');
      clearTimeout(enterTimer);
    }
  }
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('opal-motion-paused', String(paused)); } catch { /* 仍可切換。 */ }
    if (paused) { body.classList.remove('is-entering'); clearTimeout(enterTimer); }
    syncActivity();
  });
  const viewportObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => visible.set(entry.target, entry.isIntersecting));
    syncActivity();
  }, { threshold: .04 });
  function watch(element, handler) {
    if (!element) return;
    visible.set(element, false);
    if (handler) activityHandlers.set(element, handler);
    viewportObserver.observe(element);
  }
  document.querySelectorAll('.page-intro, .tech-marquee, .about-intro, .about-section').forEach((element) => watch(element));
  document.addEventListener('visibilitychange', syncActivity);
  reduced.addEventListener('change', syncActivity);
  syncActivity();

  // 粒子位置由固定序列產生；只在首頁可見時以最多 24fps 更新。
  const hero = document.querySelector('.home-page .page-intro');
  if (hero) {
    const atmosphere = document.createElement('div');
    atmosphere.className = 'hero-atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    atmosphere.append(canvas);
    hero.append(atmosphere);
    const context = canvas.getContext('2d');
    if (context) {
      let frame = null;
      let lastDraw = -Infinity;
      let width = 0;
      let height = 0;
      let color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const smallViewport = matchMedia('(max-width: 760px)');
      const count = clamp(Number(body.dataset.particles) || 32, 8, 44);
      let visibleCount = Math.min(count, smallViewport.matches ? 18 : 44);
      const seeds = Array.from({ length: count }, (_, i) => ({ x: ((i * 73 + 31) % 101) / 101, y: ((i * 47 + 11) % 97) / 97, phase: i * 1.37 }));
      function resize() {
        const rect = atmosphere.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        visibleCount = Math.min(count, smallViewport.matches ? 18 : 44);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      function draw(time) {
        frame = null;
        if (!active(hero) || !width || !height) return;
        if (time - lastDraw >= 1000 / 24) {
          lastDraw = time;
          context.clearRect(0, 0, width, height);
          const points = seeds.slice(0, visibleCount).map((seed) => ({ x: seed.x * width + Math.sin(time * .00019 + seed.phase) * 22, y: seed.y * height + Math.cos(time * .00023 + seed.phase) * 17 }));
          context.strokeStyle = color;
          context.fillStyle = color;
          const reach = Math.min(160, width * .32);
          for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
              const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
              if (distance >= reach) continue;
              context.globalAlpha = (1 - distance / reach) * .34;
              context.lineWidth = .8;
              context.beginPath(); context.moveTo(points[i].x, points[i].y); context.lineTo(points[j].x, points[j].y); context.stroke();
            }
            context.globalAlpha = .35 + Math.sin(time * .001 + seeds[i].phase) * .18;
            context.beginPath(); context.arc(points[i].x, points[i].y, 2.2 + Math.sin(time * .001 + seeds[i].phase) * .6, 0, Math.PI * 2); context.fill();
          }
          context.globalAlpha = 1;
        }
        frame = requestAnimationFrame(draw);
      }
      function setRunning(running) {
        if (running && frame === null) frame = requestAnimationFrame(draw);
        else if (!running && frame !== null) { cancelAnimationFrame(frame); frame = null; }
      }
      const refreshSize = () => { resize(); setRunning(Boolean(active(hero))); };
      if ('ResizeObserver' in window) new ResizeObserver(refreshSize).observe(atmosphere);
      else window.addEventListener('resize', refreshSize, { passive: true });
      new MutationObserver(() => { color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      resize();
      watch(hero, setRunning);
    }
  }

  // 頭像原圖不變，額外的軌道及浮動放在外層，保留圖片替代文字。
  const portrait = document.querySelector('.about-portrait');
  if (portrait) {
    const wrapper = document.createElement('div');
    wrapper.className = 'portrait-stage';
    portrait.before(wrapper);
    wrapper.append(portrait);
    for (let index = 0; index < 2; index++) {
      const orbit = document.createElement('span');
      orbit.className = 'portrait-orbit'; orbit.setAttribute('aria-hidden', 'true'); wrapper.append(orbit);
    }
    watch(wrapper);
  }

  // 傾斜內容層，外層尺寸維持不動；觸控裝置不使用游標追蹤。
  document.querySelectorAll('.project').forEach((card) => {
    const content = card.children[1];
    content?.classList.add('depth-body');
    let frame = null;
    let pointer = null;
    card.addEventListener('pointermove', (event) => {
      if (reduced.matches || paused || !finePointer.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!pointer) return;
        const rect = card.getBoundingClientRect();
        const x = clamp((pointer.x - rect.left) / rect.width, 0, 1);
        const y = clamp((pointer.y - rect.top) / rect.height, 0, 1);
        card.style.setProperty('--card-x', `${x * 100}%`);
        card.style.setProperty('--card-y', `${y * 100}%`);
        card.style.setProperty('--card-tilt-y', `${(x - .5) * 4}deg`);
        card.style.setProperty('--card-tilt-x', `${(.5 - y) * 3}deg`);
      });
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      pointer = null;
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      card.style.setProperty('--card-tilt-x', '0deg'); card.style.setProperty('--card-tilt-y', '0deg');
    });
  });
  document.querySelectorAll('.language-switch, .icon-button, .text-link').forEach((link) => {
    link.classList.add('magnetic-link');
    link.addEventListener('pointermove', (event) => {
      if (reduced.matches || paused || !finePointer.matches) return;
      const rect = link.getBoundingClientRect();
      link.style.setProperty('--magnetic-x', `${clamp((event.clientX - rect.left - rect.width / 2) * .13, -4, 4)}px`);
      link.style.setProperty('--magnetic-y', `${clamp((event.clientY - rect.top - rect.height / 2) * .13, -3, 3)}px`);
    }, { passive: true });
    link.addEventListener('pointerleave', () => { link.style.setProperty('--magnetic-x', '0px'); link.style.setProperty('--magnetic-y', '0px'); });
  });

  // 委派事件讓分頁新產生的按鈕也有點擊波紋，不改變原有操作結果。
  document.addEventListener('click', (event) => {
    if (reduced.matches || paused) return;
    const target = event.target.closest('button, .language-switch');
    if (!target || target.disabled) return;
    if (getComputedStyle(target).position === 'static') target.classList.add('ripple-relative');
    target.classList.add('ripple-target');
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'interaction-ripple'; ripple.setAttribute('aria-hidden', 'true');
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${(event.detail ? event.clientX - rect.left : rect.width / 2) - size / 2}px`;
    ripple.style.top = `${(event.detail ? event.clientY - rect.top : rect.height / 2) - size / 2}px`;
    target.append(ripple); ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    setTimeout(() => ripple.remove(), 750);
  });

  const curtain = document.createElement('div');
  curtain.className = 'page-curtain'; curtain.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) curtain.append(document.createElement('span'));
  body.append(curtain);
  function enter() {
    clearTimeout(leaveTimer);
    body.classList.remove('is-leaving');
    if (reduced.matches || paused || document.hidden) return;
    body.classList.add('is-entering');
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => body.classList.remove('is-entering'), 900);
  }
  window.addEventListener('pageshow', enter);
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduced.matches || paused) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.hash || /\.(xml|pdf|png|jpg|svg|zip)$/i.test(destination.pathname) || destination.href === location.href) return;
    event.preventDefault();
    if (body.classList.contains('is-leaving')) return;
    clearTimeout(enterTimer);
    body.classList.remove('is-entering');
    const duration = clamp(Number(body.dataset.transitionMs) || 240, 100, 500);
    body.style.setProperty('--page-exit-ms', `${duration}ms`);
    body.classList.add('is-leaving');
    leaveTimer = setTimeout(() => location.assign(destination.href), duration + 35);
  });
})();
