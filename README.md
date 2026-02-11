# 多人連線吃角子老虎機

## 啟動方式

```bash
npm install
ADMIN_TOKEN=請換成你的密碼 npm run dev
```

預設啟動於 `http://localhost:3000`

- 前台：`http://localhost:3000/player`
- 後台：`http://localhost:3000/admin`

> `ADMIN_TOKEN` 為後台登入 token，未設定時後台無法登入。  
> 可選：`ADMIN_SESSION_TTL_MS`（預設 12 小時）設定 admin session 有效時間。  
> 可選：`ADMIN_SESSION_COOKIE_SECURE`（`auto` / `true` / `false`，預設 `auto`）。`auto` 會依請求是否為 HTTPS 決定 cookie 是否加上 `Secure`。

## React 前台（Vite）

```bash
npm run client:dev
```

預設啟動於 `http://localhost:5173`，可透過 `VITE_SOCKET_URL` 指到後端位址。

## 功能對應

- 前台先填姓名，再進入四欄滾輪拉霸。
- 轉動時使用單一「停止」按鈕，依序由左到右停下 Reel1 -> Reel4。
- 第 4 欄停下後，後端結算最終結果（`finalReels`、`isWin`、`resultText`）並回傳。
- 每停一欄會即時送出 `stopReel` 到後端，後台可即時看到目前已停欄位。
- 四欄內容與方向：
  - Reel1 上往下 `[複,0,1,2,3]`
  - Reel2 下往上 `[象,10,11,12,13]`
  - Reel3 上往下 `[公,20,21,22,23]`
  - Reel4 下往上 `[場,30,31,32,33]`
- 後台可切換全域 `practice / official` 模式並廣播。
- 練習模式：前台可自行 `Reset`。
- 正式模式：前台無法自行開始轉動與 `Reset`，需由後台「全體開始」同步啟動；轉完會鎖定玩家，需後台 `Reset 此人 / 全部 Reset`。
- 中獎條件：四欄都停在 index `0`（`複 象 公 場`）。
- 後台可看到所有玩家狀態，依排序由上到下顯示（不分頁）。
- 有人中獎時後台會收到 `server:confetti` 並灑紙花，每次中獎都觸發（同輪可多次）。

## 測試

```bash
npm test
```

## 建置

```bash
npm run build
npm start
```
