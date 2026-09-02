# dsh-token-speed

DSH 客户端插件：固定在 Web GUI 右下角的**可拖拽环形表盘**，实时显示模型输出速度（tok/s），点击展开详情面板。

纯浏览器端插件，不修改任何宿主状态，只读订阅会话数据。

<img width="246" height="275" alt="image" src="https://github.com/user-attachments/assets/29e2f3e7-d711-42f8-978d-ef8e1b0d7162" />


## 功能

- **实时速度**：生成期间，表盘指针 + 中央数字随流式输出实时爬升（按输出文本量 × 实测字符/token 比率估算）。
- **每步精确校准**：每一步结束后，用 provider 上报的 `usage.outputTokens` 和 `timing`（firstToken → completed）计算真实 tok/s，并据此校准字符/token 比率。
- **详情面板**（点击表盘展开）：
  - 实时速度（估算）
  - 上一步（精确）
  - 上一步输出（tokens）
  - 上一步 TTFT
  - 累计输出（当前加载窗口内）
- **状态指示**：生成中 / 工具执行中 / 空闲。
- **可拖拽**：按住表盘拖动调整位置，位置记忆在 `localStorage`。

## 安装

插件以 `link:` 依赖安装进 DSH profile（以 desktop profile 为例）：

```jsonc
// ~/.dsh/profiles/desktop/package.json
{
  "dependencies": {
    "dsh-token-speed": "link:/Users/<you>/Documents/DSH/dsh-token-speed"
  }
}
```

```bash
cd ~/.dsh/profiles/desktop
pnpm install
```

`cordis.patch.yml` 里的 insert 行由 profile 的 HMR watcher 热加载；改 `lib/client.js` 源码后**整页刷新**（Cmd+R）即可生效。

## 卸载

从 profile 的 `package.json` 删除 `dsh-token-speed` 依赖，删除 `cordis.patch.yml` 里对应的 insert 行，然后 `pnpm install`。不留任何残留。

## 结构

```
dsh-token-speed/
├── package.json        # 插件清单（name/version/exports/dsh 配置）
├── cordis.patch.yml    # 挂载补丁（声明插件 id）
├── lib/
│   ├── index.js        # host 侧入口（no-op，插件纯浏览器端）
│   └── client.js       # 浏览器端主体：UI + 速度采样器 + 数据订阅
└── README.md
```

## 数据源（关键架构）

root 作用域的 slot 插件**不能**读 session snapshot（它只有 `.subagent`/`.queue`/`.value`，没有 `.partial`/`.nodes`），也**不能**用 session 作用域的 `useChat`/`useProjection`。

正确入口（与 host Chat 视图同一份数据）：

```js
const target = ctx.uiConversation.binding(sessionId).target('chat');
target.getSnapshot();   // { legacy: { partial, nodes, runningCalls, ... } }
target.subscribe(fn);   // 返回 unsubscribe
```

- `legacy.partial` — 进行中的步骤 `{turn, step, blocks}`，blocks 为 `{kind:'text'|'reasoning', text}`，随流式增长 → 实时速度来源。
- `legacy.nodes` — 已结算节点；assistant 节点带 `usage.outputTokens` + `timing{stepStartTime, firstTokenTime, completedTime}` → 精确 tok/s 来源。
- `legacy.runningCalls` 非空 = 工具执行中。

`useSessions` 是全局 hook，root/session 作用域都可用，用来取当前会话 id。

## 依赖服务

- `slots` — 槽位注册（`shell.overlay`）
- `uiConversation` — 会话聊天数据（dsh-client-ui-conversation）

`package.json` 的 `dsh.client.inject` 声明到达顺序依赖：
`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-conversation`。

## License

MIT
