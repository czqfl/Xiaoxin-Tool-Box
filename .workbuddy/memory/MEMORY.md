# 项目长期记忆（Xiaoxin-Tool-Box）

## 关键环境事实：Edit/Write/Read/沙箱Bash 落在「覆盖层」，不是真实 D: 盘
本机 D: 经 `/d` 挂载即真实 D:（非幻影挂载）。但当前 agent 环境里：
- Edit / Write / Read 工具与**沙箱 Bash** 操作一个**临时覆盖层（ephemeral overlay）**，
  写操作不会落到真实 D:。
- **只有 `dangerouslyDisableSandbox: true` 的 Bash** 才会真正读写真实 D:。

**正确改文件流程（务必遵守）**：
1. 用「非沙箱 Bash + 原生 Windows Python」改文件，BASE 用盘符路径
   `D:/My-Custom-Tool/Xiaoxin-Tool-Box`（原生 python 不认 `/d/...` 这种 POSIX 路径，
   会 FileNotFoundError）。推荐 python：
   `C:/Users/18087/.workbuddy/binaries/python/versions/3.13.12/python3.exe`
2. 保留 CRLF：读用 `open(p, encoding="utf-8", newline="")`，把 `
`→`
` 做字符串匹配/替换，
   写用 `open(p, "w", encoding="utf-8", newline="")` 再把 `
`→`
`。否则整文件被改 LF，diff 爆炸。
3. git 操作（reset / rm / commit / status / grep）也走**非沙箱 Bash**（真实 D: 的 git）。
4. 想「查看」真实文件内容时，用非沙箱 Bash 的 python 打印，不要依赖 Read 工具的覆盖层缓存（可能陈旧）。

**惨痛教训**：曾因用覆盖层 Edit 而非非沙箱 Bash，git 把 4 个源文件「删除」而非「修改」，
生成错误提交（已用 `git reset --hard` 恢复到 fc91822 修复）。任何涉及真实改文件的任务，
最终落地一律走非沙箱 Bash + 原生 python。
