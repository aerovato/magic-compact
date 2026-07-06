# Magic Compact

[English](./README.md) | 中文

(注：AI翻译)

OpenCode 的无损上下文压缩机制。

<p align="center">
  <img src=".github/assets/preview.png" alt="Magic Compact Preview" />
</p>

## 为什么需要

OpenCode 内置的压缩功能会把整段对话替换成一个摘要块。用户消息、助手的推理、工具调用、设计决策和工作流程,统统被压平成一个通用模板(目标、进展、关键决策……)。助手醒来时仿佛失忆,只能从一个只捕捉到一小部分关键信息的抽象中,重新构建自己的工作状态。

Magic Compact 采用了不同的方式:保留对话骨架,把每个旧的助手回合压缩成各自的摘要,修剪臃肿的工具 I/O,并让所有内容都可检索。助手依然记得自己做过什么、为什么做,以及下一步该做什么。

## 工作原理

Magic Compact 不会把整段会话折叠成一个通用摘要,而是用高保真摘要替换旧的助手回合,同时保留用户消息和工具调用。

助手的思考过程、决策和动作,连同你的所有命令,都保留在上下文中,同时剔除掉不必要的冗余。长工具调用会被积极地修剪,但可通过自定义的 `read_omitted_content` 工具检索。

<p align="center">
  <img src=".github/assets/visualization.png" alt="Compaction Comparison" />
</p>

## 特性

- 无损上下文压缩 — 完整保留工作记忆,而不是把历史压平成一个回顾。
- 零压缩开销 — 压缩在你下达命令时一次性完成,不发生在 agent 循环中。最大化 token 节省,最小化缓存失效。
- 保留用户消息 — 确切的需求和指导逐字保留,助手始终可见。
- 智能工具调用修剪 — 臃肿的已完成工具 I/O 被替换为省略提示,原始内容会被缓存,可通过 `read_omitted_content` 按需检索。
- 可重新压缩 — 之后再次运行 `/magic-compact` 可压缩新的回合,同时保留之前的摘要。

## 安装

从 CLI 安装:

```bash
opencode plugin magic-compact --global

# If you are encountering "No versions available:
NPM_CONFIG_MIN_RELEASE_AGE=0 opencode plugin magic-compact --global
```

这会安装该包,并将其添加到你的全局 OpenCode 配置中。

## 用法

### `/magic-compact`

要压缩,运行 `/magic-compact [N]`,可选参数表示要保留多少个回合。

- `N` 是要原样保留的最近助手回合数。默认:`0`(全部摘要)。
- 在当前对话被压缩之前,会创建一个备份会话。如果压缩失败,你会回到备份。

示例:

- `/magic-compact` — 摘要所有旧的助手回合。
- `/magic-compact 3` — 保留最近 3 个助手回合,其余摘要。

### `/magic-stats`

运行 `/magic-stats` 显示当前对话累计的 token 节省:修剪的 token、节省的缓存 token、估算节省的金额,以及其他统计信息。

### 省略内容工具

Magic Compact 注册了一个 `read_omitted_content` 工具,助手可以调用它来检索压缩期间被修剪的任何工具输入或输出。

对话中的每个省略提示都包含一个 Content ID(例如 `omitted-001`)。助手在需要无法通过新工具调用重现的旧信息时,会使用该 ID 获取原始内容。

## 修剪规则

修剪仅适用于被摘要的回合。

保留:

- 用户消息(逐字)
- 每回合摘要
- 工具调用(结构保留)
- 选定的高价值合成消息(shell 包装器、后台任务结果、工作目录变更提醒)

移除或精简:

- 助手推理、文本和步骤标记 — 由每回合摘要替换
- 大多数合成/注入消息(文件展开、计划提醒、之前的压缩提示等)
- 臃肿的已完成工具 I/O — 替换为指向缓存的省略提示

### 工具 I/O 规则

默认情况下,超过 128 个单词或 1024 个字符的已完成工具输出会被省略。少数工具有特殊处理:

- `read` — 输出总是被省略(陈旧的文件内容可重新加载)
- `write` / `edit` / `apply_patch` — 大文件内容被省略
- `bash` — 超过 1024 个字符的命令会被截断
- `task` — 输出在更高的阈值(512 单词 / 4096 字符)以上被省略
- `question` — 输入和输出保留
- `todowrite` / `skill` — 输出被丢弃且不缓存(冗余或可重新加载)

待处理、运行中和出错的工具调用总是原样保留。

## 与 DCP 插件对比

OpenCode-DCP 是一个运行时上下文管理系统,会在模型请求时重写消息。Magic Compact 采用了不同的方式。

Magic Compact 提供:

- 简单 — 一个命令,零配置。
- 无损质量 — 逐回合的流程保持完整。所有用户命令都被保留。所有过去的工具调用都被保留。
- 最大化 token 节省 — 整段对话通过一次请求完成摘要。长工具调用被积极修剪。
- 无缓存搅动 — 压缩一次性完成且对缓存友好,而 DCP 可能在一次请求内多次使整段对话失效。
- 零助手开销 — 没有要求助手压缩的提示注入。你的助手专注于它的任务。

如果你想要模型驱动的压缩,并接受更多的缓存失效和 token 消耗,可以考虑使用 DCP。

## 与 Magic Context 对比

Magic Context 是一个更完整的运行时上下文管理系统:它会持续运行 historian 和 dreamer 后台流程,维护项目记忆,并在后续回合里不断把记忆和历史重新注入到提示词中。这很强大,但也意味着更高的 token 消耗和更频繁的缓存失效。

Magic Compact 提供:

- 高效率 — 只在你主动执行时进行一次压缩,没有后台摘要循环,没有常驻的记忆 RAG,也没有持续的提示注入。
- 更低的 token 消耗 — 上下文压缩只在命令触发时发生,不会在每个回合持续烧 token。
- 更少的缓存失效 — 会话只在压缩时重写一次,而不是不断重渲染波动的后台状态。
- 对话结构无损 — 用户消息逐字保留,工具结构保留,被摘要的助手回合仍然可检索。
- 只做压缩这件事 — 插件只负责压缩对话,而不是把自己扩展成一整套记忆系统。

如果你想要的是一个轻量、由用户主动触发、运行开销很低的压缩工具,Magic Compact 更合适。如果你想要的是一个带后台维护的长期记忆系统,Magic Context 是更重的方案。

## 开发

```bash
bun install
bun run typecheck   # TypeScript 类型检查
bun run lint        # ESLint
bun run format      # Prettier
```

`src/`

- `index.ts` — 插件入口:注册 `/magic-compact`、`/magic-stats`、`read_omitted_content`,以及统计事件记账
- `magic-compact.ts` — `/magic-compact` 命令编排:备份优先的压缩流程、修剪、统计记账、故障恢复
- `magic-stats.ts` — `/magic-stats` 命令执行:统计读取和提示注入
- `api.ts` — SDK 辅助层:V2 客户端构造、响应解包、toast 辅助、会话清理
- `util.ts` — 共享辅助:`isRecord` 类型守卫、`unwrapString`

`src/compact/`

- `compact.ts` — 核心压缩编排:计划创建、临时会话摘要、摘要注入
- `plan.ts` — 压缩规划:消息获取、回合分组、被摘要/下一回合选择
- `prune.ts` — 工具 I/O 修剪:省略分配、按工具的输出/输入阈值、省略提示
- `session.ts` — 备份和会话辅助:fork 备份、缓存/统计复制、边界提示注入、压缩后清理
- `template.ts` — 压缩提示构建器:用于临时会话的 XML 摘要模板
- `constants.ts` — 压缩常量:part ID 辅助、省略提示格式、边界元数据

`src/storage/`

- `store.ts` — 文件系统辅助:插件存储目录、Zod 校验的 JSON 读写
- `omission.ts` — 省略缓存:Content ID 分配、按会话条目的存储和检索
- `stats.ts` — 统计存储:按对话的统计持久化 schema 和读/写/复制

`src/stats/`

- `events.ts` — 实时事件记账:助手消息完成处理、缓存 token 节省
- `tokenize.ts` — Token 计数:基于 GPT 分词器的 part/消息 token 估算
- `pricing.ts` — 缓存读取定价表:按模型的每百万 token 美元查找
- `constants.ts` — 统计格式化:压缩和摘要消息构建器、统计元数据
