# 多人連線吃角子老虎機

## 啟動方式

```bash
npm install
npm run dev
```

預設啟動於 `http://localhost:3000`

- 前台：`http://localhost:3000/player`
- 後台：`http://localhost:3000/admin`
- 後台預設 token：`admin`（可用 `ADMIN_TOKEN` 環境變數覆蓋）

## 功能對應

- 前台先填姓名，再進入四欄拉霸。
- 四欄內容與方向：
  - Reel1 上往下 `[複,0,1,2,3]`
  - Reel2 下往上 `[象,10,11,12,13]`
  - Reel3 上往下 `[公,20,21,22,23]`
  - Reel4 下往上 `[場,30,31,32,33]`
- 後台可切換練習 / 正式模式。
- 練習模式：前台可自行 `Reset`。
- 正式模式：前台 `Reset` 無效，轉完顯示結果訊息（`恭喜中獎` / `太可惜了><`），由後台 `Round Reset`。
- 中獎條件：四欄都停在 index `0`（`複 象 公 場`）。
- 後台可看到所有玩家狀態，依人數自動切格，單頁最多 30 人，超過自動分頁。
- 有人中獎時後台高亮該玩家並灑紙花，同輪可多次觸發。

## 測試

```bash
npm test
```

## 建置

```bash
npm run build
npm start
```
