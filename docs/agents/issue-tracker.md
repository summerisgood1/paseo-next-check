# 工作追蹤

spec 同 tickets 一律放喺 GitHub Issues，用 `gh` 操作。

GitHub repo 由 `git remote -v` 確定。
未有 remote 嗰陣，先確認目標 repo，唔好估。

多行 issue 內容用 `--body-file` 提交。
讀 ticket 用 `gh issue view <number> --comments`。

PRs as a request surface: no.
