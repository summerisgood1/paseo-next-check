# Next check

呢個 project 幫用戶喺多個 agent 嘅對話之間，按回覆完成時間由舊到新逐個查看。

## 詞彙

**Chat room**：
一個 agent 同用戶之間嘅對話。

**回覆完成時間**：
agent 完成一輪回覆嘅時間。

**Next check**：
喺同一部 Paseo daemon 所有 workspaces 嘅對話之間，跳去下一個待睇 Chat room 嘅操作，次序按回覆完成時間由舊到新排列。

**待睇回覆**：
agent 已完成、但用戶仲未開過所屬 Chat room 嘅回覆，亦包括用戶手動標成 unread 嘅對話。

**已睇回覆**：
用戶開咗所屬 Chat room 嘅回覆；一開就算已睇，唔使另外確認。

**手動 unread**：
用戶將已睇 Chat room 標返做待睇嘅操作；之後開返嗰個 Chat room 就再算已睇。
