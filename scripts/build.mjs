import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// 所有內容與設定都從專案根目錄讀入，不依賴執行命令的位置。
const root = fileURLToPath(new URL('../', import.meta.url));
const buildArgs = process.argv.slice(2);
const option = (flag, fallback) => buildArgs.includes(flag) ? buildArgs[buildArgs.indexOf(flag) + 1] : fallback;
const outputName = option('--out', 'dist');
if (!['dist', 'docs'].includes(outputName)) throw new Error('--out 僅允許 dist 或 docs');
const output = path.resolve(root, outputName);
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const locale = option('--locale', 'zh-Hant');
if (!['zh-Hant', 'en'].includes(locale)) throw new Error('不支援的語言');
const isEnglish = locale === 'en';
const localePrefix = isEnglish ? '/en' : '';
const localeOutput = path.join(output, isEnglish ? 'en' : '');
const site = { ...await readJson('config/site.json'), ...(isEnglish ? await readJson('content/en/site.json') : {}) };
const ui = isEnglish ? await readJson('content/en/ui.json') : {};
// 避免公開主機快取舊版 JS/CSS，使新語言介面搭到舊搜尋邏輯。
const assetHash = createHash('sha256');
for (const asset of ['styles.css', 'motion.css', 'enhancements.css', 'immersive.css', 'app.js', 'immersive.js']) assetHash.update(await readFile(path.join(root, 'public', asset)));
const assetVersion = assetHash.digest('hex').slice(0, 12);
site.baseUrl = option('--base-url', site.baseUrl);
const posts = (await readJson(`content/${isEnglish ? 'en/' : ''}posts.json`)).sort((a, b) => b.date.localeCompare(a.date));
const projects = await readJson(`content/${isEnglish ? 'en/' : ''}projects.json`);
const motion = { enabled: true, immersive: true, particleCount: 32, transitionMs: 240, revealDurationMs: 900, revealDistancePx: 28, storyScrollVh: 180, parallaxPx: 28, ...site.motion };
for (const key of ['revealDurationMs', 'revealDistancePx', 'storyScrollVh', 'parallaxPx', 'particleCount', 'transitionMs']) {
  if (!Number.isFinite(motion[key]) || motion[key] < 0) throw new Error(`動畫參數無效：${key}`);
}
const e = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const originUrl = (route) => new URL(route, site.baseUrl).href;
const url = (route) => originUrl(`${localePrefix}${route}`);
// UI 翻譯只在建置階段套用；較長的完整句子先處理，保留內容與 HTML 跳脫。
function translateUi(html) {
  for (const [source, translated] of Object.entries(ui).sort((a, b) => b[0].length - a[0].length)) html = html.split(e(source)).join(e(translated));
  return html;
}
function localizeHtml(html) {
  if (!isEnglish) return html;
  return translateUi(html).replace(/<a\b[^>]*>/g, (tag) => tag.includes('data-language-switch') ? tag : tag.replace(/href="\/(?!\/)/, 'href="/en/'));
}
const postUrl = (post) => `/posts/${post.slug}/`;
const dateText = (date) => date.replaceAll('-', '.');
const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: site.timezone }).format(new Date());
const categories = ['全部', ...new Set(posts.map((post) => post.category))];
const icon = (name) => {
  const paths = {
    search: '<circle cx="10.7" cy="10.7" r="6.2"/><path d="m15.4 15.4 4.2 4.2"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    rss: '<circle cx="5" cy="19" r="1"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>',
    external: '<path d="M7 17 17 7M7 7h10v10"/>',
  };
  return `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.arrow}</svg>`;
};
const avatar = () => site.portrait ? `<img class="brand-portrait" src="${e(site.portrait)}" width="40" height="44" alt="">` : '<span class="brand-mark" aria-hidden="true">o.</span>';

// 先驗證輸入，再重建 dist；slug 僅允許安全字元，避免輸出路徑逸出。
if (!Number.isInteger(site.postsPerPage) || site.postsPerPage < 1) throw new Error('postsPerPage 必須為正整數');
if (!/^https?:$/.test(new URL(site.baseUrl).protocol)) throw new Error('baseUrl 必須為 HTTP(S) 網址');
const slugs = new Set();
for (const post of posts) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || slugs.has(post.slug)) throw new Error(`文章 slug 無效或重複：${post.slug}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date) || Number.isNaN(Date.parse(post.date))) throw new Error(`文章日期無效：${post.slug}`);
  if (!post.title || !post.summary || !Array.isArray(post.sections) || !post.sections.length) throw new Error(`文章內容不完整：${post.slug}`);
  slugs.add(post.slug);
}
for (const project of projects) if (project.article && !slugs.has(project.article)) throw new Error(`專案文章連結不存在：${project.article}`);
for (const key of ['github', 'linkedin']) if (site[key] && !/^https?:$/.test(new URL(site[key]).protocol)) throw new Error(`${key} 必須為 HTTP(S) 網址`);
// 在 Windows 進行遞迴刪除前，確認目標恰好是本專案允許的輸出資料夾。
if (!['dist', 'docs'].includes(path.relative(root, output))) throw new Error('拒絕清除非網站輸出路徑');
if (!buildArgs.includes('--append')) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'public'), output, { recursive: true });
  await writeFile(path.join(output, '.nojekyll'), '');
}
await mkdir(localeOutput, { recursive: true });

const nav = (active) => [ ['/', '文章', 'posts'], ['/archive/', '歸檔', 'archive'], ['/projects/', '專案', 'projects'], ['/about/', '關於我', 'about'] ].map(([href, label, id]) => `<a href="${href}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('');
const demo = (article = false) => site.showDemoNotice ? `<p class="demo-note"><span class="demo-dot" aria-hidden="true"></span>${article ? '示範文章 · 此內容用於展示閱讀版面，尚非本人正式發表。' : '文章內容為版面示範，後續將更新為正式筆記。'}</p>` : '';
const tags = (items) => `<div class="tags">${items.map((tag) => `<span>${e(tag)}</span>`).join('')}</div>`;
const social = () => [site.linkedin ? `<a href="${e(site.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn ${icon('external')}</a>` : '', site.github ? `<a href="${e(site.github)}" target="_blank" rel="noopener noreferrer">GitHub ${icon('external')}</a>` : '', site.email ? `<a href="mailto:${e(site.email)}">Email ${icon('external')}</a>` : ''].join('');

function layout({ title, description = site.description, active, route, body, className = '' }) {
  return `<!doctype html>
<html lang="${e(site.language)}" data-theme="light">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} · ${e(site.name)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="theme-color" content="#f8f7f3">
  <link rel="canonical" href="${e(url(route))}">
  <link rel="alternate" hreflang="zh-Hant" href="${e(originUrl(route))}">
  <link rel="alternate" hreflang="en" href="${e(originUrl(`/en${route}`))}">
  <meta property="og:type" content="${active === 'article' ? 'article' : 'website'}">
  <meta property="og:title" content="${e(title)} · ${e(site.name)}">
  <meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(url(route))}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="alternate" type="application/rss+xml" title="${e(site.name)} 的文章" href="${localePrefix}/feed.xml">
  <script>try{var t=localStorage.getItem('opal-theme');if(['light','dark','auto'].includes(t))document.documentElement.dataset.theme=t}catch{}</script>
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}"><link rel="stylesheet" href="/motion.css?v=${assetVersion}"><link rel="stylesheet" href="/enhancements.css?v=${assetVersion}"><link rel="stylesheet" href="/immersive.css?v=${assetVersion}"><script src="/app.js?v=${assetVersion}" defer></script><script src="/immersive.js?v=${assetVersion}" defer></script>
</head>
<body data-motion="${motion.enabled !== false}" data-immersive="${motion.immersive !== false}" data-particles="${motion.particleCount}" data-transition-ms="${motion.transitionMs}" data-parallax="${motion.parallaxPx}" style="--motion-duration:${motion.revealDurationMs}ms;--reveal-distance:${motion.revealDistancePx}px;--story-height:${motion.storyScrollVh}vh">
  <a href="#main" class="skip-link">跳到主要內容</a>
  <div class="reading-progress" aria-hidden="true"></div>
  <div class="top-pattern" aria-hidden="true"></div>
  <header class="site-header shell">
    <a class="brand" href="/" aria-label="${e(site.name)} 首頁">${avatar()}<span>${e(site.name)}<small>THOUGHTS & FIELD NOTES</small></span></a>
    <div class="header-right"><nav aria-label="主要導覽">${nav(active === 'article' ? 'posts' : active)}</nav><a class="language-switch" data-language-switch href="${isEnglish ? route : `/en${route}`}" lang="${isEnglish ? 'zh-Hant' : 'en'}" hreflang="${isEnglish ? 'zh-Hant' : 'en'}" aria-label="${isEnglish ? '切換為中文' : 'Switch to English'}">${isEnglish ? '中文' : 'EN'}</a><div class="header-tools"><a class="icon-button" href="/?search=1#search" aria-label="搜尋文章">${icon('search')}</a><button type="button" class="icon-button theme-cycle" aria-label="切換配色">${icon('sun')}</button></div></div>
  </header>
  <main id="main" class="shell ${className}" tabindex="-1">${body}</main>
  <footer class="site-footer shell"><div class="footer-top"><div><a class="footer-name" href="/">${e(site.name)}<span class="opal-dot">.</span></a><p>醫療、AI，與持續學習的日常。</p></div><div class="footer-links">${social()}<a href="/feed.xml">RSS 訂閱 ${icon('rss')}</a></div></div><div class="footer-bottom"><span>© ${year} ${e(site.name)}<span class="footer-aside"> · 寫下來，讓思考留下來。</span></span><div class="theme-options" role="group" aria-label="網站配色"><button type="button" data-theme-choice="light">淺色</button><button type="button" data-theme-choice="dark">深色</button><button type="button" data-theme-choice="auto">自動</button></div></div></footer>
</body></html>`;
}

// 以逗點分段，手機換行時保留完整語意，避免「之間」被拆開。
const intro = (eyebrow, title, description) => `<section class="page-intro"><p class="eyebrow"><span class="tiny-line"></span>${e(eyebrow)}</p><h1>${title.split(isEnglish ? ', ' : '，').map((part, i, parts) => `<span class="title-clause">${e(part)}${i < parts.length - 1 ? (isEnglish ? ', ' : '，') : ''}</span>`).join('')}</h1><p class="intro-description">${e(description)}</p></section>`;
const articleRow = (post) => `<article class="post-row" data-category="${e(post.category)}" data-search="${e([post.title, post.summary, post.category, ...post.tags].join(' ').toLocaleLowerCase())}"><div class="post-date"><time datetime="${e(post.date)}">${dateText(post.date)}</time><span>${e(post.category)}</span></div><div class="post-content"><h2><a href="${postUrl(post)}">${e(post.title)}<span class="post-arrow">${icon('arrow')}</span></a></h2><p>${e(post.summary)}</p><div class="post-bottom">${tags(post.tags)}<span class="reading-time">${post.minutes} 分鐘閱讀</span></div></div></article>`;

const topics = isEnglish ? ['MEDICAL IMAGING', 'DEEP LEARNING', 'PYTHON', 'SEGMENTATION', 'EDGE AI', 'CLINICAL RESEARCH'] : ['醫療影像', '深度學習', 'PYTHON', '影像分割', 'EDGE AI', '臨床研究'];
const techMarquee = `<aside class="tech-marquee" aria-label="${isEnglish ? 'Research and engineering topics' : '研究與工程主題'}"><p class="sr-only">${topics.join(isEnglish ? ', ' : '、')}</p><div class="marquee-track" aria-hidden="true">${[0, 1].map(() => `<div class="marquee-set">${topics.map((topic) => `<span><i aria-hidden="true">✳</i>${e(topic)}</span>`).join('')}</div>`).join('')}</div></aside>`;

// 原創抽象影像圖層，隨捲動依序介紹研究方向，不使用臨床影像或病人資料。
const scrollStory = `<section class="scroll-story" id="explore" aria-label="從影像到臨床的研究方向">
  <div class="story-sticky">
    <div class="story-visual" aria-hidden="true">
      <div class="visual-grid"></div><div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div>
      <div class="scan-stack"><div class="scan-plane plane-back"></div><div class="scan-plane plane-middle"></div><div class="scan-plane plane-front"><span class="scan-crosshair"></span><div class="scan-core"></div></div></div>
      <span class="visual-label">IMAGE → MODEL → WORKFLOW</span>
    </div>
    <div class="story-copy"><p class="eyebrow">WHERE CURIOSITY MEETS PRACTICE</p><h2 class="sr-only">從醫療影像，到真實世界的應用</h2><div class="story-panels">
      <section class="story-panel is-active" data-story-panel="0"><span class="story-number">01 / IMAGE</span><h3>從影像，<br>開始理解<span>。</span></h3><p>X-ray、CT、MRI。從每一張影像出發，理解資料、空間與值得回答的問題。</p></section>
      <section class="story-panel" data-story-panel="1"><span class="story-number">02 / MODEL</span><h3>讓模型，<br>回應問題<span>。</span></h3><p>偵測、分割與分類。在實驗與驗證之間，探索醫療影像 AI 的可能性。</p></section>
      <section class="story-panel" data-story-panel="2"><span class="story-number">03 / WORKFLOW</span><h3>把研究，<br>帶進現場<span>。</span></h3><p>從 API、Edge AI 到系統整合，讓模型的輸出接上實際的醫療工作流程。</p></section>
    </div><ol class="story-steps" aria-label="研究方向階段"><li class="is-active">醫療影像</li><li>模型研究</li><li>系統整合</li></ol><a href="#field-notes" class="story-skip">繼續閱讀筆記 ↓</a></div>
  </div>
</section>`;

const home = intro('A PERSONAL JOURNAL', site.tagline, site.description) + `<a class="scroll-cue" href="#explore"><span>向下探索</span><span aria-hidden="true">↓</span></a>` + techMarquee + scrollStory + `<section id="field-notes" class="journal" aria-label="文章列表" data-page-size="${site.postsPerPage}"><div class="section-heading"><h2>最近的筆記<span class="small-count">${String(posts.length).padStart(2, '0')}</span></h2><a class="text-link" href="/archive/">所有文章 ${icon('arrow')}</a></div><div class="journal-toolbar"><div class="category-filters" role="group" aria-label="文章分類">${categories.map((category, index) => `<button type="button" data-category-filter="${e(category)}" aria-pressed="${index === 0}">${e(category)}</button>`).join('')}</div><label class="search-box" for="search">${icon('search')}<input id="search" type="search" placeholder="搜尋文章…" aria-label="搜尋文章標題、主題或標籤" autocomplete="off"><kbd>/</kbd></label></div>${demo()}<div class="post-list">${posts.map(articleRow).join('')}</div><div class="empty-state" hidden><span aria-hidden="true">∅</span><h2>這裡暫時沒有筆記</h2><p>試試其他關鍵字，或回到全部文章。</p><button type="button" class="reset-search text-link">清除篩選 ${icon('arrow')}</button></div><div class="pagination" hidden><p class="result-summary" aria-live="polite" aria-atomic="true"></p><nav aria-label="文章分頁" class="page-buttons"></nav></div><noscript><p class="demo-note">目前顯示所有文章。啟用 JavaScript 即可使用搜尋、分類與分頁。</p></noscript></section><aside class="closing-note"><span class="note-star" aria-hidden="true">✳</span><p>好的想法，常常從一個小問題開始。<br><span>一些記錄，也是一段持續探索的路。</span></p><a href="/about/" class="text-link">多認識我一點 ${icon('arrow')}</a></aside>`;

await page('/', layout({ title: site.title, route: '/', active: 'posts', body: home, className: 'home-page' }));
const years = [...new Set(posts.map((post) => post.date.slice(0, 4)))];
await page('/archive/', layout({ title: '文章歸檔', route: '/archive/', active: 'archive', body: intro('THE ARCHIVE', '把走過的路，整理成筆記。', isEnglish ? `${posts.length} notes on medical imaging, model training, and engineering.` : `共 ${posts.length} 篇筆記，關於醫療影像、模型訓練與工程實作。`) + demo() + years.map((y) => `<section class="archive-year"><h2>${y}<span>${posts.filter((p) => p.date.startsWith(y)).length} 篇</span></h2><div>${posts.filter((p) => p.date.startsWith(y)).map((p) => `<article class="archive-row"><time datetime="${p.date}">${p.date.slice(5).replace('-', '.')}</time><a href="${postUrl(p)}">${e(p.title)}</a><span class="archive-category">${e(p.category)}</span></article>`).join('')}</div></section>`).join('') }));

await page('/projects/', layout({ title: '研究與專案', route: '/projects/', active: 'projects', body: intro('RESEARCH & PRACTICE', '把問題，做成可以使用的解答。', '從病理影像研究、放射影像模型，到 Edge AI 部署與醫療系統整合。') + `<p class="project-intro-note">依學經歷整理的研究與實作方向。</p><div class="project-list">${projects.map((project) => `<article class="project"><div class="project-index">${e(project.id)}</div><div><p class="eyebrow">${e(project.subtitle)}</p><h2>${e(project.title)}</h2><p class="project-description">${e(project.description)}</p>${tags(project.tags)}<ul>${project.focus.map((item) => `<li>${e(item)}</li>`).join('')}</ul><a class="text-link" href="/posts/${e(project.article)}/">相關主題筆記${site.showDemoNotice ? '（示範）' : ''} ${icon('arrow')}</a></div></article>`).join('')}</div>` }));

const timeline = (title, items) => `<section class="about-section"><h2>${title}</h2><div class="timeline">${items.map((item) => `<article class="timeline-item"><span class="timeline-period">${e(item.period)}</span><div><h3>${e(item.organization)}</h3><p class="timeline-role">${e(item.title)}</p><p>${e(item.description)}</p></div></article>`).join('')}</div></section>`;
await page('/about/', layout({ title: '關於我', route: '/about/', active: 'about', body: `<section class="about-intro">${site.portrait ? `<img class="about-portrait" src="${e(site.portrait)}" width="103" height="114" alt="${e(site.name)} 的個人照片">` : '<div class="about-monogram" aria-hidden="true">oc<span>✳</span></div>'}<div><p class="eyebrow">A LITTLE ABOUT ME</p><h1>你好，我是 Opal<span class="opal-dot">.</span></h1><p class="about-role">${e(site.role)}</p></div></section><div class="about-copy">${site.about.map((p) => `<p>${e(p)}</p>`).join('')}<div class="about-social">${social()}</div></div>${timeline('工作經歷', site.experience)}${timeline('教育背景', site.education)}<section class="about-section"><h2>常用工具與專長</h2><div class="skill-columns">${site.skills.map((skill) => `<div><h3>${e(skill.title)}</h3><p>${skill.items.map(e).join('<br>')}</p></div>`).join('')}</div></section><aside class="about-end"><span aria-hidden="true">↗</span><p>對醫療影像與 AI 系統有共同的興趣？</p>${site.linkedin ? `<a class="text-link" href="${e(site.linkedin)}" target="_blank" rel="noopener noreferrer">在 LinkedIn 找到我 ${icon('external')}</a>` : '<a class="text-link" href="/projects/">看看我的研究與專案 →</a>'}</aside>`, className: 'about-page' }));

function sectionHtml(section, index) {
  if (section.type === 'heading') return `<h2 id="section-${index}">${e(section.text)}</h2>`;
  if (section.type === 'paragraph') return `<p>${e(section.text)}</p>`;
  if (section.type === 'list') return `<ul>${section.items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
  if (section.type === 'callout') return `<blockquote><p>${e(section.text)}</p></blockquote>`;
  if (section.type === 'code') return `<div class="code-block"><div class="code-label">${e(section.language)}<button class="copy-code" type="button">複製</button></div><pre><code>${e(section.text)}</code></pre><span class="copy-status" aria-live="polite"></span></div>`;
  throw new Error(`未知文章區塊：${section.type}`);
}

for (const [index, post] of posts.entries()) {
  const other = posts[index + 1] || posts[0];
  const headings = post.sections.map((section, i) => section.type === 'heading' ? `<a href="#section-${i}">${e(section.text)}</a>` : '').join('');
  const body = `<a class="back-link" href="/">← 回到所有文章</a><header class="article-header"><p class="eyebrow">${e(post.category)}<span> / </span><time datetime="${post.date}">${dateText(post.date)}</time><span> / </span>${post.minutes} 分鐘閱讀</p><h1>${e(post.title)}</h1><p class="article-lead">${e(post.summary)}</p>${tags(post.tags)}${demo(true)}</header><div class="article-layout"><article class="prose">${post.sections.map(sectionHtml).join('')}<div class="article-signature">${avatar()}<div>${e(site.name)}<p>醫療、AI，與持續學習的日常。</p></div></div></article><aside class="article-toc" aria-label="文章目錄"><p>這篇筆記</p>${headings}</aside></div><a class="next-article" href="${postUrl(other)}"><span>繼續閱讀 ${icon('arrow')}</span><h2>${e(other.title)}</h2><p>${e(other.summary)}</p></a>`;
  await page(postUrl(post), layout({ title: post.title, description: post.summary, active: 'article', route: postUrl(post), body, className: 'article-page' }));
}
await writeFile(path.join(localeOutput, '404.html'), localizeHtml(layout({ title: '找不到這一頁', route: '/404.html', body: `<section class="not-found"><p class="eyebrow">404 / A SMALL DETOUR</p><h1>這一頁，還沒寫到。</h1><p>也許網址有些不同，回到首頁繼續閱讀吧。</p><a href="/" class="text-link">回到所有文章 ${icon('arrow')}</a></section>` })), 'utf8');
await writeFile(path.join(localeOutput, 'feed.xml'), translateUi(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${e(site.name)} · ${e(site.title)}${site.showDemoNotice ? '（示範內容）' : ''}</title><link>${e(site.baseUrl)}</link><description>${e(site.description)}</description><language>${isEnglish ? 'en' : 'zh-TW'}</language><atom:link href="${e(url('/feed.xml'))}" rel="self" type="application/rss+xml"/>${posts.map((p) => `<item><title>${e(p.title)}</title><link>${e(url(postUrl(p)))}</link><guid isPermaLink="true">${e(url(postUrl(p)))}</guid><pubDate>${new Date(`${p.date}T00:00:00+08:00`).toUTCString()}</pubDate><description>${site.showDemoNotice ? '【示範文章】' : ''}${e(p.summary)}</description></item>`).join('')}</channel></rss>`), 'utf8');
await writeFile(path.join(localeOutput, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/about/', '/projects/', '/archive/', ...posts.map(postUrl)].flatMap((route) => (isEnglish ? [url(route)] : [originUrl(route), originUrl(`/en${route}`)])).map((address) => `<url><loc>${e(address)}</loc></url>`).join('')}</urlset>`, 'utf8');
await writeFile(path.join(localeOutput, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${url('/sitemap.xml')}\n`, 'utf8');
console.log(`Built ${posts.length + 5} pages, RSS and sitemap → ${output}`);

async function page(route, content) {
  const destination = path.join(localeOutput, route, 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, localizeHtml(content), 'utf8');
}
