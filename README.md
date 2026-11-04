# Opal.Chien · 醫療 AI 手記



## 執行

需要 Node.js 20 以上，不需安裝任何 npm 套件。

```powershell
cd H:\my_web\opal-chien-github
npm run dev
```

開啟 http://127.0.0.1:4173 。修改內容後重新執行 `npm run build`，並重新整理瀏覽器。若 4173 已被使用，可用 `node scripts/serve.mjs --build --port 4174`。

## 你會修改的檔案

| 檔案 | 用途 |
| --- | --- |
| `config/site.json` | 姓名、簡介、工作經歷、學歷、專長、LinkedIn、站點網址及每頁文章數 |
| `content/posts.json` | 文章標題、日期、分類、標籤、摘要與內文 |
| `content/projects.json` | 專案及研究方向 |
| `public/styles.css` | 配色、字體、版面及響應式設定 |
| `public/motion.css` | 固定視窗轉場、淡入、視差與動畫的響應式設定 |
| `public/banner.svg` | 頁面頂端的原創等高線圖紋 |
| `public/opal-portrait.png` | 使用者提供的個人照片，頁首與關於我共用 |
| `scripts/build.mjs` | 靜態頁面、RSS、sitemap 產生器 |

## 新增文章

在 `content/posts.json` 加入一筆資料。slug 只能使用小寫英文、數字與單一連字號，且不可重複。文章依日期由新到舊排序。

```json
{
  "slug": "my-new-note",
  "title": "我的新文章",
  "date": "2026-11-04",
  "category": "研究筆記",
  "summary": "一句話說明這篇文章的重點。",
  "tags": ["Medical AI"],
  "minutes": 3,
  "sections": [
    { "type": "paragraph", "text": "第一段內容。" },
    { "type": "heading", "text": "小節標題" },
    { "type": "list", "items": ["第一個重點", "第二個重點"] },
    { "type": "code", "language": "python", "text": "print('hello')" },
    { "type": "callout", "text": "想強調的一句話。" }
  ]
}
```

完成後執行 `npm run build`，產物位於 `dist/`。每篇文章都有自己的 HTML 網址，可以直接連結與重新整理，搜尋與分類由瀏覽器處理。

## 履歷與示範內容

關於我、工作經歷、教育與專案依使用者提供的履歷及專案背景整理。網站只提供 LinkedIn 聯絡連結；原始履歷 PDF、電話、私人信箱與推薦人聯絡資料未放入網站或原始碼儲存庫。

目前八篇文章為展示用內容，並在列表、文章及 RSS 明確標示。換成自己的正式文章後，可將 `config/site.json` 的 `showDemoNotice` 改為 `false`。工作經歷的「至今」依提供的履歷填入，後續請隨任職狀態更新。

## 部署

Sites 設定儲存在 `.openai/hosting.json`。網站已依使用者要求開放公開存取。若使用其他靜態主機，將 `dist/` 設為發布目錄，並設定自訂 404 頁面為 `404.html`；請依正式網域修改 `config/site.json` 的 `baseUrl` 再重新建置。

GitHub Pages 使用 `main` 分支的 `/docs` 目錄，更新內容後執行：

```powershell
npm run build:pages
git add .
git commit -m "Update website"
git push
```

`build:pages` 會使用 `https://opalchien.github.io` 產生正確的 canonical、RSS 與 sitemap。GitHub Pages 支援 HTML / CSS / JavaScript，本網站的動畫會正常保留。

## 字體與捲動動畫

全站文字優先使用微軟正黑體；未安裝該字型的系統使用繁體中文黑體替代。程式碼區塊保留等寬字型，維持縮排可讀性。

`config/site.json` 的 `motion` 可控制動畫開關、淡入時間、位移距離、固定場景捲動長度與視差強度。特效包含原生捲動的三段固定視窗轉場、抽象影像圖層視差、內容逐段淡入、毛玻璃導覽及頁面閱讀進度。沒有攔截滾輪，也沒有常駐動畫迴圈。

系統啟用「減少動態效果」時，會顯示完整靜態內容；較矮的視窗同樣改用一般排版，避免固定區塊超出可視範圍。

配色偏好只保存在訪客瀏覽器的 localStorage。此網站沒有資料庫、登入系統、追蹤程式或外部字型依賴。
