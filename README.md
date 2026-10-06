# Next unread

喺 Paseo 多個 agent chats 之間，撳輸入框旁邊嘅 **Next unread**，就會開下一個待睇 chat，同時切去佢所屬嘅 workspace。

- 包含同一部 daemon 所有 workspaces 嘅非 archived chats。
- 按原生 `attentionTimestamp` 由舊到新排；開 chat 就跟 Paseo 原生操作算已睇。
- 手動 **Mark as unread** 會重新加入隊，按標 unread 嘅時間排。
- 包含 `attentionReason: "finished"` 嘅待睇回覆；permission 同 error 提示保留喺 Paseo 原生流程。
- 冇下一個待睇 chat 嗰陣，掣會 disabled。

Desktop／web 會喺 **Next unread** 隔離加 **Mark as unread**。呢粒掣沿用原生 workspace 選單，所以會標記目前 workspace 最新、符合原生規則嘅 chat；唔保證係目前開住嗰個 chat。手機版暫時只顯示 **Next unread**。

Paseo `0.11.0-beta.4` 嘅 plugin API 只提供 Tasks／Subagents 同一行嘅 composer pill。位置、外框同 icon 排法由 Paseo 控制，所以呢個版本未能完全複製 Conductor 輸入框右上方嘅 `Next unread ›` 擺位。

## 安裝

需要 app 同 daemon 都係 Paseo `0.11.0-beta.4` 或相容新版本，亦要開咗 plugins。開發測試用 Node `22.18+`。

```sh
npm ci
npm run typecheck
npm test
paseo plugin install "$PWD"
```

改 source 之後，用 `paseo plugin reload paseo-next-check`；唔使重新啟動 daemon。

## 點樣運作

plugin 用官方 `client.paseo.agents.list({ subscribe: {} })` 讀原生 unread 狀態，會補齊所有分頁，亦會喺 reconnect 嘅 fresh snapshot 重建隊列。唔另外儲存一份已讀清單。

撳掣會短暫經過 plugin screen，再用官方 `navigation.openAgent` 開目標 chat。呢條 navigation 會連所屬 workspace 一齊切換。跳轉前會重新讀隊列；讀取失敗會顯示 **Retry** 同 **Back to chat**。

新回覆喺目前開住嘅 chat 完成時，Paseo 會延後清除 unread，直到 input focus、send 或 blur。`Next unread` 會排除今次操作嘅來源 chat，避免已讀更新未到時又跳返自己。

SDK 暫時冇原生 Mark as unread 接口。`Mark as unread` 會按目前 host 同 workspace 嘅識別碼開原生選單，再揀原生操作；原生流程會先取消 pane focus，令 unread 保留。Sidebar 收埋或目標 workspace 未顯示時，請先打開 sidebar 同顯示該 workspace。Paseo 更新選單結構之後，呢個後備操作可能需要跟住更新；搵唔到目標操作會顯示錯誤，唔會揀其他 workspace 嘅同名操作。

## 驗證

`npm test` 驗證跨 workspace 次序、手動開 chat、手動 unread、新回覆、空隊列、分頁同 reconnect，亦會驗證原生選單嘅 host／workspace 配對、右鍵後備、取消、disabled 同 timeout。

舊設計原型喺 `client/next-check.prototype.html`，只係 mock 資料；已安裝 plugin 用真實 Paseo 狀態。
