// 配色偏好儲存在目前瀏覽器；儲存空間不可用時仍可切換。
const themeOptions = ['light', 'dark', 'auto'];
const themeLabels = { light: '淺色', dark: '深色', auto: '自動' };
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('opal-theme', theme); } catch { /* 隱私模式可能停用 localStorage。 */ }
  document.querySelectorAll('[data-theme-choice]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  const cycle = document.querySelector('.theme-cycle');
  if (cycle) cycle.setAttribute('aria-label', `切換配色，目前為${themeLabels[theme]}`);
}
setTheme(document.documentElement.dataset.theme || 'light');
document.querySelectorAll('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));
document.querySelector('.theme-cycle')?.addEventListener('click', () => setTheme(themeOptions[(themeOptions.indexOf(document.documentElement.dataset.theme) + 1) % themeOptions.length]));

// 所有文章已在 HTML 內，搜尋及分類不需網路請求或後端服務。
const journal = document.querySelector('.journal');
if (journal) {
  const rows = [...journal.querySelectorAll('.post-row')];
  const search = document.querySelector('#search');
  const filters = [...journal.querySelectorAll('[data-category-filter]')];
  const pagination = journal.querySelector('.pagination');
  const pageButtons = journal.querySelector('.page-buttons');
  const params = new URLSearchParams(location.search);
  let category = filters.some((b) => b.dataset.categoryFilter === params.get('category')) ? params.get('category') : '全部';
  let currentPage = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  search.value = params.get('q') || '';
  const pageSize = Number(journal.dataset.pageSize);

  function render(updateUrl = true) {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = rows.filter((row) => (category === '全部' || row.dataset.category === category) && terms.every((term) => row.dataset.search.includes(term)));
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    rows.forEach((row) => { row.hidden = true; });
    matches.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach((row) => { row.hidden = false; });
    filters.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category)));
    journal.querySelector('.empty-state').hidden = matches.length > 0;
    pagination.hidden = false;
    journal.querySelector('.result-summary').textContent = matches.length ? `顯示 ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, matches.length)} 篇，共 ${matches.length} 篇` : '共 0 篇文章';
    pageButtons.replaceChildren();
    function addPageButton(label, nextPage, disabled = false, selected = false, ariaLabel) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = disabled;
      if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
      if (selected) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => { currentPage = nextPage; render(); journal.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); pageButtons.querySelector('[aria-current="page"]')?.focus({ preventScroll: true }); });
      pageButtons.append(button);
    }
    if (totalPages > 1) {
      addPageButton('←', currentPage - 1, currentPage === 1, false, '上一頁');
      for (let page = 1; page <= totalPages; page++) addPageButton(String(page).padStart(2, '0'), page, false, page === currentPage, `第 ${page} 頁`);
      addPageButton('→', currentPage + 1, currentPage === totalPages, false, '下一頁');
    }
    if (updateUrl) {
      const nextParams = new URLSearchParams();
      if (category !== '全部') nextParams.set('category', category);
      if (search.value.trim()) nextParams.set('q', search.value.trim());
      if (currentPage > 1) nextParams.set('page', String(currentPage));
      history.replaceState(null, '', `${location.pathname}${nextParams.size ? `?${nextParams}` : ''}`);
    }
  }
  filters.forEach((button) => button.addEventListener('click', () => { category = button.dataset.categoryFilter; currentPage = 1; render(); }));
  search.addEventListener('input', () => { currentPage = 1; render(); });
  journal.querySelector('.reset-search').addEventListener('click', () => { search.value = ''; category = '全部'; currentPage = 1; render(); search.focus(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { event.preventDefault(); search.focus(); }
    if (event.key === 'Escape' && document.activeElement === search) { search.value = ''; currentPage = 1; render(); search.blur(); }
  });
  render(false);
  if (params.get('search') === '1') search.focus();
}

document.querySelectorAll('.copy-code').forEach((button) => button.addEventListener('click', async () => {
  const block = button.closest('.code-block');
  try {
    await navigator.clipboard.writeText(block.querySelector('code').textContent);
    block.querySelector('.copy-status').textContent = '程式碼已複製';
    button.textContent = '已複製';
  } catch {
    block.querySelector('.copy-status').textContent = '無法存取剪貼簿，請手動選取程式碼。';
  }
}));

// 動畫僅在瀏覽器支援時啟用。停用 JavaScript 時，所有內容維持正常顯示。
(() => {
  if (document.body.dataset.motion !== 'true' || !('IntersectionObserver' in window)) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compactViewport = matchMedia('(max-height: 680px)');
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const banner = document.querySelector('.top-pattern');
  const story = document.querySelector('.scroll-story');
  const stage = story?.querySelector('.story-sticky');
  const panels = [...document.querySelectorAll('[data-story-panel]')];
  const steps = [...document.querySelectorAll('.story-steps li')];
  const targets = [...document.querySelectorAll('.post-row, .project, .archive-row, .timeline-item, .about-portrait, .about-copy > p, .skill-columns > div, .closing-note, .article-header, .prose > h2, .prose > p, .prose > ul, .prose > blockquote, .next-article')];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -20px 0px' });

  targets.forEach((element) => { element.dataset.reveal = ''; observer.observe(element); });
  root.classList.toggle('motion-enabled', !reducedMotion.matches);
  const clamp = (number, min = 0, max = 1) => Math.min(max, Math.max(min, number));
  let frame = null;
  let previousStep = -1;

  function update() {
    frame = null;
    const pageTop = window.scrollY;
    const scrollRange = root.scrollHeight - root.clientHeight;
    root.style.setProperty('--page-progress', String(scrollRange > 0 ? clamp(pageTop / scrollRange) : 0));
    document.body.classList.toggle('is-scrolled', pageTop > 25);
    if (!reducedMotion.matches && banner && pageTop < 500) {
      const strength = Number(document.body.dataset.parallax) || 0;
      banner.style.backgroundPositionY = `${Math.min(pageTop * .15, strength)}px`;
    }
    if (!story) return;
    const staticScene = reducedMotion.matches || compactViewport.matches;
    if (staticScene) {
      panels.forEach((panel) => panel.removeAttribute('aria-hidden'));
      previousStep = -1;
      return;
    }
    const top = header.getBoundingClientRect().height + 24;
    const travel = Math.max(1, story.offsetHeight - stage.offsetHeight);
    const progress = clamp((top - story.getBoundingClientRect().top) / travel);
    story.style.setProperty('--story-progress', progress.toFixed(4));
    const active = Math.min(2, Math.floor(progress * 3));
    if (active !== previousStep) {
      panels.forEach((panel, index) => { panel.classList.toggle('is-active', index === active); panel.setAttribute('aria-hidden', String(index !== active)); });
      steps.forEach((step, index) => step.classList.toggle('is-active', index === active));
      previousStep = active;
    }
  }
  // scroll listener 不進行同步排版；每個畫面最多更新一次，沒有常駐動畫迴圈。
  function scheduleUpdate() { if (frame === null) frame = requestAnimationFrame(update); }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  reducedMotion.addEventListener('change', () => {
    root.classList.toggle('motion-enabled', !reducedMotion.matches);
    if (reducedMotion.matches) targets.forEach((element) => element.classList.add('is-visible'));
    scheduleUpdate();
  });
  compactViewport.addEventListener('change', scheduleUpdate);
  // 篩選會改變文章列表高度，ResizeObserver 同步更新進度與 sticky 範圍。
  if ('ResizeObserver' in window) new ResizeObserver(scheduleUpdate).observe(document.body);
  scheduleUpdate();
})();
