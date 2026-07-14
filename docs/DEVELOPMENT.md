# AI Canvas 开发指南

本文档面向继续开发 AI Canvas 的工程协作者，重点说明当前架构边界、开发约定、验证方式和代码清理规则。

相关长期文档：

- `PROJECT_STRUCTURE.md`：目录职责和依赖方向。
- `ROADMAP.md`：当前阶段和后续优先级。
- `DESKTOP.md`：Electron 环境、构建和桌面手测。
- `PERFORMANCE.md`：画布预算、交互约束和性能回归。

## 项目定位

AI Canvas 是一个基于 React Flow 的画布式 AI 创作工具。当前仓库是单包 Vite + React + TypeScript 应用，核心体验围绕节点编排、图片/视频生成、LLM 辅助处理、多项目工作区和本地文件持久化展开。

企业级目标不是单纯增加节点数量，而是让画布在大项目、多人交付、可恢复任务、可审计配置、长期可维护扩展方面稳定运行。

## 入口链路

- 浏览器入口：`index.html` -> `src/main.tsx` -> `src/App.tsx`
- Electron 入口：`electron/main.mjs` -> 本地静态/代理服务器 -> `dist/index.html`
- Electron preload：`electron/preload.cjs` 只提供隔离的运行时标记，不向渲染器暴露 Node.js。
- 应用启动：`src/App.tsx` 渲染 `ThemeProvider`、`ProjectBootstrap`、`ReactFlowProvider`、工具栏、任务队列、画布和项目管理弹层。
- 画布主体：`src/components/Canvas.tsx`
- 节点注册：`src/nodes/nodeRegistry.ts`
- 手动创建节点入口：`src/components/FloatingToolbar.tsx` 与 `src/features/nodeLibrary/catalog.tsx`

`Canvas` 必须在 `ReactFlowProvider` 内部渲染。新增 React Flow 节点时，同时检查类型、节点数据构造、注册表、创建入口和连线派生逻辑。

## 核心状态边界

- `src/store/useCanvasStore.ts`：画布节点、边、选择、复制粘贴、删除、分组、布局、节点数据更新和连线派生数据的主状态源。
- `src/store/useHistoryStore.ts`：撤销/重做事务层。用户可感知的画布编辑动作应通过 `runTracked()` 或显式事务包裹。
- `src/store/useProjectStore.ts`：多项目、当前项目、脏状态、保存、自动保存、快照恢复。
- `src/store/useTaskQueueStore.ts`：生成任务队列。任务状态属于本地项目快照，不是临时 UI 状态。
- `src/store/useSettingsStore.ts`：模型、存储、工作区配置和旧配置迁移。

优先把业务行为放在 store 或 feature orchestrator 中，组件负责展示、输入事件和调用已有行为。

组件和节点必须使用显式 Zustand selector 订阅需要的字段，不要直接写 `useCanvasStore()`、`useSettingsStore()` 这类整仓订阅。需要一次取多个字段时使用 `useShallow((state) => ({ ... }))`，避免无关 store 状态变化触发画布常驻组件重渲染。`scripts/storeSelectorConvergence.test.mjs` 会扫描 `src/components` 和 `src/nodes` 防止回退。

## 快照与持久化

完整项目快照结构为 `{ canvas, taskQueue }`，由 `src/features/projectManager/runtime.ts` 定义和组装。

当前 Web 持久化层位于 `src/platform/web/browserPlatform.ts`，基于 File System Access API 管理：

- 工作区清单和项目 JSON 文件
- `.config/config.json` 工作区配置
- `images/` 下的导入/生成图片资源

Electron 持久化由 `electron/nativeWorkspace.mjs` 和 `electron/nativeWorkspaceDatabase.mjs` 实现，`electron/main.mjs` 注册白名单 IPC，`electron/preload.cjs` 暴露逐项调用，`src/platform/desktop/desktopPlatform.ts` 负责 Blob/ArrayBuffer 和对象 URL 转换。原生服务必须保持与 Web 端相同的 `platformBridge` 和目录包契约。

长期兼容样本集中在 `test-fixtures/`：`snapshots/` 保存历史项目快照，`workspaces/` 保存旧单体清单和当前分项目工作区。迁移或持久化格式变更必须用新增 fixture 表达新旧边界，不要只在测试函数中临时拼对象；已提交的历史 fixture 只能追加迁移支持，不能静默改写为当前格式。Provider HTTP 契约由 `src/api/providerContracts.test.ts` 使用 mock fetch 固定端点、鉴权、请求体、同步/异步返回和错误细节。

桌面文件改动至少运行 `npm run desktop:smoke`；涉及目录选择、项目保存、目录包或重启恢复时还要运行 `npm run desktop:smoke:ui`。UI 冒烟必须使用隔离临时工作区，不得读写用户的正式工作区。项目卡片会被自动保存状态刷新替换，smoke 不得在菜单动作之间长期持有卡片或按钮元素引用；项目切换后应等待项目管理弹层关闭再开始下一步。

桌面端和网页端的长期存储方向记录在 `docs/ROADMAP.md`。共享 store 和组件只能通过 `platformBridge` 访问持久化能力；SQLite、OPFS、File System Access API、Electron IPC/Node 文件 API 和绝对路径都不应直接进入业务 store 或节点组件。

### 网站端仓库边界

账号、个人空间、PostgreSQL 关系化项目图、对象存储和服务端任务位于独立仓库 [ai-canvas-cloud](https://github.com/136909482/ai-canvas-cloud)。本仓库不引入 Cloud API、数据库 schema、Redis、Worker 或账号状态。

两仓库只共享版本化 `ProjectRecord`、目录包和 Provider 契约。网站端通过显式导入读取本仓库导出内容；登录、退出或网络恢复不得自动上传本地工作区。Cloud 内部架构以其 `docs/DEVELOPMENT.md`、`docs/DATA_MODEL.md`、`docs/API.md` 和 `docs/ROADMAP.md` 为准，本文件不复制维护。

### 桌面 SQLite 工作区

桌面工作区数据库位于用户所选目录的 `.ai-canvas/workspace.sqlite`，而不是 Electron `userData`；`userData/desktop-workspace.json` 仍只记录工作区路径。

- schema 版本使用 SQLite `user_version`，当前为 2。未来升级必须先写显式迁移，再提升版本；不得只修改 `CREATE TABLE IF NOT EXISTS` 假设旧表会自动变化。
- 数据库保存项目摘要、整体项目 JSON、快照字节数和节点/边/任务数量，并派生任务、资产、设置和审计索引。节点与边第一阶段不拆表。
- 图片、视频、缩略图和预览图仍位于 `images/`；数据库资产表只保存相对路径、角色和 MIME 类型，不保存 blob。
- 首次选择含 `ai-canvas-workspace.json` 的 Web/旧桌面目录时，将项目和 `.config/config.json` 导入数据库。旧文件作为迁移来源保留，但后续桌面写入只以数据库为准。
- 数据库 schema 升级和工作区目录包替换导入前会复制到 `.ai-canvas/backups/`。备份文件不进入跨平台导出包。
- 桌面目录包导出从数据库读取当前项目和设置，再输出稳定的 `workspace.json`、`projects/*.json`、脱敏配置和文件资产；Web 端不需要理解 SQLite。
- `audit_log` 只记录事件类型、实体 ID、数量和时间等元数据，不得写入正文、提示词、完整配置或 API Key。
- 桌面服务商设置和 Provider API Key 均保存在 SQLite 的 `settings` 表。当前产品不引入系统密钥链；数据库和数据库备份属于敏感工作区数据，不应公开分享。

`platformBridge` 已提供项目级接口：`listWorkspaceProjects()`、`loadWorkspaceProject()`、`saveWorkspaceProject()`、`deleteWorkspaceProject()`、`exportProjectBundle()`、`prepareProjectBundleImport()`、`commitProjectBundleImport()`。启动和项目切换优先走项目摘要 + 单项目加载；自动保存、手动保存、创建、复制、重命名和删除都应优先写单个项目。整包 `loadWorkspaceData()` / `saveWorkspaceData()` 只保留给旧工作区兼容和迁移流程。磁盘资产治理通过 `inspectWorkspaceAssets()` 和 `cleanupUnusedWorkspaceAssets()` 完成，扫描必须先持久化活动项目并读取完整工作区数据，不能用组件闭包里的局部项目列表判断未引用文件。

### 桌面保存响应性

Electron 主进程只负责窗口、IPC 路由和生命周期。SQLite 请求经 `electron/nativeWorkspaceDatabaseClient.mjs` 转发到 `electron/nativeWorkspaceDatabaseWorker.mjs`，`node:sqlite` 的 `DatabaseSync` 打开、事务、索引更新和项目 JSON 序列化都不在主进程事件循环执行。SQLite 锁等待、慢盘写入、Defender 扫描或大快照提交不会再阻塞窗口事件循环。

- 保存按项目 ID 串行；同一项目、相同 `updatedAt` 的排队自动保存采用 latest-wins 合并，只写首个在途快照和最新排队快照。不同项目使用独立队列键，不会互相覆盖。
- 工作区路径和数据库初始化在服务生命周期内按绝对路径复用；保存热路径不得重复读取 `desktop-workspace.json` 或执行目录 `stat`，当前 schema 也不再重复执行建表或全库搜索索引重建，搜索索引回填只在显式 schema 升级事务中执行。
- 渲染进程发起保存后立即进入可见的保存中状态。Worker 返回成功、失败或 30 秒请求超时后再更新保存状态和诊断，不使用同步 IPC 等待磁盘完成。
- SQLite 的 `busy_timeout` 为 100 ms；数据库忙碌只在 Worker 内进行 50/100/200/400 ms 的有上限退避重试，超过预算返回可重试错误和非敏感操作名。
- 图片等大文件仍使用异步文件 API 写入工作区；数据库只写相对路径和元数据。保存任务必须保证项目快照提交与其引用的资产状态一致。
- 改造不得改变 `platformBridge`、项目快照、SQLite schema 或目录包格式。首次迁移前必须保留数据库备份，并兼容现有 `desktop-workspace.json` 路径记录。
- 验证除 `npm run test`、`npm run lint`、`npm run build` 外，必须运行 `npm run desktop:smoke` 与 `npm run desktop:smoke:ui`；新增测试应覆盖数据库忙碌、连续自动保存合并、保存失败可重试和窗口仍可响应。

项目归档使用 `ProjectRecord.archivedAt` 和项目摘要中的同名字段，不移动或删除项目文件。启动 fallback、最近项目、活动项目切换和普通项目列表都必须排除已归档项目；当所有项目均已归档时保留归档记录并清空活动画布，恢复后再由用户显式打开。

注意两类保存语义：

- `saveActiveProject()` 更新项目 saved snapshot，用于判断手动保存状态。
- `persistWorkspaceFile()` 更新 working snapshot 和 autosave 基线，用于自动保存。

导入/导出工作流只包含画布 `nodes` 和 `edges`，不包含项目元数据和任务队列。

### 工作区目录包

跨平台工作区迁移通过 `platformBridge.exportWorkspaceBundle()` 和 `platformBridge.importWorkspaceBundle()` 完成。当前稳定格式是目录包，不是 ZIP：

```text
workspace.json
projects/<project-id>.json
.config/config.json      # provider API keys blanked
images/<referenced paths>
```

- 导出前会持久化当前活动项目，并包含完整项目记录、任务队列、非敏感设置以及所有项目快照引用的原图、缩略图、预览图和视频。
- `.config/config.json` 中所有 `providerProfiles[].apiKey` 在导出时强制清空；导入后需要重新填写密钥。
- 工作区整包导入会在明确确认后替换当前已配置工作区，不执行项目合并；需要追加单个项目时使用项目目录包。
- 导入会先校验 manifest、全部项目 JSON 和全部引用资产，再复制资产，最后提交活动工作区 manifest。
- ZIP 仅作为未来可能增加的外层封装，不能改变上述目录 schema。

### 项目目录包

单项目迁移通过 `exportProjectBundle()`、`prepareProjectBundleImport()` 和 `commitProjectBundleImport()` 两阶段完成。预检阶段只读取并校验目录包，不写工作区；提交阶段会重新检查 ID 冲突。稳定格式为：

```text
project.json
projects/<project-id>.json
images/<referenced paths>
```

- 无冲突时使用 `preserve` 保留项目 ID；UI 仍需明确确认后提交。
- 冲突时 `copy` 生成新项目 ID 和“（导入）”名称，并把资产重映射到 `images/imports/<new-project-id>/`，不得覆盖原项目资产。
- 冲突时 `replace` 保留项目 ID 并替换项目内容；替换产生的旧未引用资产不自动删除，交给磁盘资产扫描和清理流程。
- 导入项目统一恢复为未归档状态。已有活动项目保持不变；空工作区才把导入项目设为活动项目。
- 项目目录包缺少清单、项目 JSON 或任一引用资产时必须在预检阶段失败。

项目保存状态统一从 `src/features/projectManager/persistenceStatus.ts` 派生。画布顶部状态区和项目管理弹层的当前项目 badge 都应复用该状态，不要在 UI 里重新推断“已保存/未保存”。项目管理弹层的短标签映射位于 `src/features/projectManager/projectManagerStatus.ts`。

### 工作区图片资产

工作区图片、视频、缩略图和预览图统一存放在 `images/` 下，节点和任务队列通过 `WorkspaceImageAsset.relativePath`、`thumbnailRelativePath`、`previewRelativePath` 引用这些文件。

新写入的项目资产使用稳定项目 ID 分目录，路径规则集中在 `src/features/projectManager/projectAssetPaths.ts`：

```text
images/projects/<project-id>/
  uploads/
  generated/<yyyy-mm-dd>/
  edits/
  crops/<crop-node-id>/
  migrated/images/
  migrated/videos/
  thumbnails/<mirrored asset path>/
```

- 项目名不参与路径，重命名项目不移动资产。
- 生成任务在创建时固化 `projectId`；切换项目不得改变运行中任务的资产归属。
- 旧工作区的日期目录、`manual-uploads`、`manual-edits` 等历史路径保持可读，不在启动或保存时强制搬迁。
- 复制项目可以共享已有的不可变资产引用；副本中的新资产写入副本自己的项目目录。
- 删除项目不得直接递归删除 `images/projects/<project-id>/`，必须继续通过全工作区引用扫描清理未引用文件。

- 前端引用统计入口：`src/features/projectManager/assetInventory.ts`
- 存储设置摘要入口：`src/components/StorageSettingsDialog.tsx`
- 实际未引用文件清理入口：`src/platform/web/browserPlatform.ts`

存储设置里的“图片资产引用”展示快照引用统计；“磁盘资产扫描”通过 platform bridge 实际枚举 `images/` 文件并统计字节数、未引用文件和缺失引用。清理确认必须展示文件数、可释放空间和路径样例，且只能删除扫描时未被完整工作区数据引用的文件。
执行“清理未引用文件”前会先提交当前项目快照，使已从画布删除的节点不再被旧 saved snapshot 保护；普通“扫描磁盘”只持久化 working snapshot，不改变手动保存基线。任务队列中仍保留的结果资产继续受保护。

### 快照体积控制

项目快照体积诊断和持久化前裁剪位于 `src/features/projectManager/snapshotSize.ts`。

- `analyzeProjectSnapshotSize()` 统计当前项目 JSON 体积、嵌入式 image/video data URL 数量和大字符串位置。
- `sanitizeProjectSnapshotForPersistence()` 只裁剪过长 `errorMsg`，避免 API 巨型错误详情撑爆项目 JSON。
- 用户正文、提示词、LLM 输出、文本节点内容和文本附件不做自动截断。文本附件只执行 2 MB 的显式上传上限，接受后保留完整文件正文。
- 存储设置里的“当前快照”“嵌入媒体”和“大文本条目”来自该诊断工具；大文本报告包含节点/任务来源、字段标签和字节数，不提供自动删除或裁剪操作。

### 历史栈治理

历史栈体积诊断位于 `src/features/history/historyDiagnostics.ts`，统计撤销、重做和待提交快照的条数、UTF-8 序列化字节数及最大单快照。50 MB 起提示警告，200 MB 起提示高风险。

- 历史记录不按固定条数静默淘汰，避免用户在不知情时丢失较早的撤销路径。
- 存储设置的“历史与大文本”区域展示当前历史内存估算，并提供带影响说明和二次确认的“清空撤销记录”。
- 清空历史只释放当前项目的会话级撤销/重做快照，不修改当前画布、项目正文或落盘快照；切换和恢复项目仍会清空历史，避免跨项目撤销。
- 大文本治理保持诊断优先。需要减少项目体积时，由用户定位对应节点后显式编辑，或使用已有项目归档/导出能力，不得在持久化或模型调用前静默截断正文。

## 模型执行链路

图片生成：

`src/nodes/GenerateNode/index.tsx` -> `src/features/generateQueue/orchestrator.ts` -> `src/store/useTaskQueueStore.ts` / `src/components/TaskQueueRunner.tsx` -> `src/api/imageAdapter.ts`

LLM 执行：

`src/nodes/LLMFileNode/index.tsx` -> `src/features/llm/orchestrator.ts` -> `src/api/chatAdapter.ts`

视频生成：

`src/nodes/VideoGenerateNode/index.tsx` -> `src/features/generateQueue/orchestrator.ts` -> `src/api/videoAdapter.ts`

LLM 结果会创建 `llmOutputTextNode`。生成图片会创建或更新 `generatedPreviewNode`，并在工作区已配置时尽量持久化为资源文件。

## 节点注册协议

节点能力的单一注册入口位于 `src/features/nodeRegistry/protocol.ts`。每个 `AppNodeType` 必须声明稳定 ID 前缀、渲染兼容别名、连接输入/输出类型和输出布局策略；支持手动创建的节点还必须声明默认尺寸、创建工厂和可选节点库元数据。

- `src/nodes/nodeRegistry.ts` 只维护 React 组件实现映射，最终 `nodeTypes` 按协议展开；`llmNode` 和 `experimentalGenerateNode` 等旧类型通过 `rendererType` 显式兼容。
- `useCanvasStore.addNodeByType()` 根据协议生成 ID、默认数据、尺寸和选中状态；旧 `addTextNode()` 等方法只保留为兼容代理。
- `createCanvasNodeCatalog()` 从协议生成工具栏、节点库和画布右键目录，禁止在组件中复制节点名称、分类、关键词和创建元数据。
- 画布快捷连线通过协议的 `connection.output`、`connection.inputs` 和 `quickCreateTargetHandle` 过滤候选；专属数量上限等运行时约束仍留在 Canvas/store。
- 自动生成预览、视频和 LLM 输出前必须匹配源节点的 `outputLayout`，避免节点类型与输出布局实现脱节。
- 新增节点时先补协议和 `AppNodeDataMap`，再补 React 组件映射；协议完整性测试必须同步覆盖新类型。

## 工作流模板

工作流模板运行时位于 `src/features/workflowTemplates/runtime.ts`，工作区状态位于 `src/store/useWorkflowTemplateStore.ts`。模板只截取选中节点和选区内部连线，保存前以左上角为原点归一化坐标；插入时通过节点注册协议重新分配 ID，并重映射内部节点引用。模板插入必须由 `runTracked()` 包装为一次撤销/重做事务。

- Web 工作区保存到 `.config/workflow-templates.json`；Electron 保存到 SQLite `settings.workflow_templates`，两端统一通过 `platformBridge.loadWorkflowTemplates()` / `saveWorkflowTemplates()` 访问。
- 模板文件类型为 `ai-canvas-workflow-templates`、版本为 `1`。格式变更必须新增显式迁移，不能静默覆盖旧模板。
- 工作区目录包 v1 通过可选 `includesTemplates` 标记携带模板文件；缺少该标记的旧目录包按无模板处理。
- 模板保留节点配置和工作区资产相对引用，但不包含任务队列，也不保留指向选区外节点的连接关系。

## 工作区搜索与资产索引

共享搜索文档提取与 Web 查询位于 `src/features/workspaceSearch/runtime.ts`。搜索文档分为 `project`、`text`、`asset` 三类，覆盖项目名、节点标题、文本、提示词、LLM 输出、模型、分辨率、标签、来源和工作区资产相对路径；不得索引 API Key、附件正文、data URL、任务请求或完整响应。

- Electron SQLite schema v2 新增 `search_documents` 表和项目/类型/节点索引。v1 工作区首次打开时必须先备份数据库，再回填现有项目的搜索文档。
- 项目写入、重命名、归档、恢复和导入通过既有 `upsertProject()` / 工作区替换事务同步刷新索引；归档项目不进入搜索结果。
- `platformBridge.searchWorkspace()` 是唯一跨平台查询入口。桌面端查询 SQLite，Web 端读取工作区项目并使用共享纯函数查询。
- 中文使用包含匹配，空格分隔的多个关键词必须全部命中；结果按标题相关度、项目更新时间和稳定文档 ID 排序。
- 全局搜索结果打开后先调用 `useProjectStore.loadProject()`，节点结果再由 Canvas store 选中并居中，不能由搜索组件直接读取原生文件或数据库。

## Provider 密钥治理

Provider 运行时校验集中在 `src/features/settings/providerConfig.ts`，浏览器配置缓存脱敏集中在 `src/features/settings/providerSecrets.ts`。

- Web 工作区 `.config/config.json` 保存完整 API Key；桌面工作区改由 SQLite `settings` 表保存完整服务商配置和 API Key。
- `localStorage["ai-canvas-workspace-config-cache"]` 只作为工作区配置读取失败时的非敏感 fallback，写入前会清空 `providerProfiles[].apiKey`。
- 工作区目录包中的 `.config/config.json` 同样会清空 `providerProfiles[].apiKey`，不得把导出包当作密钥备份。
- 出厂配置必须保持模型库、服务商库和默认模型为空；安装包不得预置测试模型、服务商配置或 API Key。删除最后一个模型或服务商后必须保持为空，不能自动补回示例配置。已有工作区配置只按用户操作和显式迁移更新，不得在升级时静默清空。

## 错误与诊断

统一诊断模型位于 `src/features/diagnostics/runtime.ts`，会话级诊断中心位于 `src/store/useDiagnosticsStore.ts`。保存、模型调用、网络和资源恢复失败必须通过 `reportDiagnostic()` 写入诊断中心，并继续在节点或状态栏保留就地错误状态；不要只 `console.error`、静默 `catch` 或只显示无法追溯的 toast。

- 诊断记录包含 area、kind、code、可重试标记、时间和非敏感上下文，最多保留当前会话 50 条，不进入项目快照。
- 同一 code 和 message 在短时间内自动去重，避免自动保存与轮询失败刷屏。
- 上下文不得包含 API Key、完整 data URL、文件正文或提示词正文；只记录项目、节点、任务、模型、Provider 和相对资产路径等定位信息。
- 用户可以从顶部工具区或错误 toast 打开诊断面板，并复制当前会话的脱敏报告。

桌面端本地审计复用同一个诊断抽屉，通过 `platformBridge.queryWorkspaceAudit()` 查询 SQLite `audit_log`。查询只接受固定分类、关键词、时间范围、分页大小和偏移量，原生层必须使用参数绑定；Web bridge 明确返回 `supported: false`。

- 审计覆盖工作区迁移/替换、项目保存/删除、设置保存和模板库保存，最多保留最近 5,000 条。
- `details_json` 只允许字符串、数字、布尔值和 null；不得写入 API Key、提示词、文件正文、模型输出或完整请求/响应。
- 审计查询默认按 `created_at DESC, id DESC` 稳定排序，单页最多返回 100 条；UI 当前使用每页 30 条。
- 会话诊断仍只保存在内存中，审计日志只记录用户和持久化操作，两者不能互相替代。

## 键盘与可访问性

弹层焦点管理集中在 `src/hooks/useDialogFocus.ts`，菜单方向键行为集中在 `src/utils/menuKeyboard.ts`。新增工具栏、弹层、菜单和节点图标按钮时必须满足以下约束：

- 模态弹层使用 `role="dialog"`、`aria-modal="true"` 和稳定名称；打开后聚焦首个有效控件，Tab/Shift+Tab 不得离开弹层，Escape 关闭后焦点返回触发控件。
- 嵌套弹层只处理最内层的 Escape 和 Tab，不得同时关闭父弹层。
- 工具条使用带名称的 `role="toolbar"`；纯图标按钮必须提供 `aria-label`，切换按钮同步 `aria-pressed`，弹出按钮同步 `aria-haspopup`、`aria-expanded` 和 `aria-controls`。
- `menu`、`listbox` 支持 ArrowUp、ArrowDown、Home、End 和 Escape；打开后聚焦当前项或第一项，关闭后返回触发按钮。
- 视觉隐藏、未选中节点的悬浮操作不得进入 Tab 顺序；输入框和开关不能只依赖 placeholder 或相邻视觉文本提供名称。
- 强交互改动除暗色/浅色和移动端可读性外，还要用 Playwright 快照确认无未命名按钮，并实际走一遍 Tab、Shift+Tab、方向键和 Escape。
- 设置面板里的 API Key 输入框默认以 password 显示，显式点击可见按钮才会展示明文。
- API Key 允许写入用户明确选择的 Web 工作区配置或桌面 SQLite；不得进入浏览器缓存、诊断上下文、审计详情和导出目录包。

## 主题与 UI 约定

项目支持 `dark`、`light`、`system` 三种主题模式，通过根节点 `data-theme` 和 CSS 变量驱动。
设置弹层的“外观设置”是主题、画布网格和连线样式的完整入口；画布左上角的主题按钮是快捷入口，必须与设置弹层保持同步。画布性能模式、高清图片预览和拖拽对齐参考线归入“画布与性能”。

新增 UI 优先复用：

- `src/styles/themeClasses.ts`
- `src/nodes/nodeShellClassName.ts`
- `src/nodes/nodeShell.tsx`

常用 token：

- `--canvas-bg`
- `--panel-bg`
- `--panel-bg-strong`
- `--node-bg`
- `--node-border`
- `--border-subtle`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--control-bg`
- `--control-bg-hover`
- `--shadow-panel`
- `--flow-grid`

主交互色使用 violet 体系。语义色保留 emerald、amber、red。新增节点、弹层和菜单不要硬编码 `text-white`、`text-zinc-*`、`bg-zinc-*` 或单一暗色样式。

## 画布性能约定

大图和多图是当前 P1 性能重点。新增图片展示入口时优先使用 `src/components/CanvasImagePreview.tsx`，不要直接在画布节点里渲染原始 `<img>`，这样性能模式、拖动期和平移期才能自动切换到缓存缩略图。

完整预算、拖拽结束 flush 约束、缩放后首次交互策略和边动画结论统一维护在 `docs/PERFORMANCE.md`。

性能策略集中在 `src/features/canvasPerformance/rendering.ts`。Canvas 性能渲染只由设置里的性能模式开关启用，不再根据节点数量、图片数量、图片自然尺寸或内嵌 data URL 体积自动切换。导入图片仍需要保留 `imageNaturalWidth` / `imageNaturalHeight`，这些数据用于诊断、缩略图策略和局部渲染保护。

拖动相关改动要避免每帧写 React 状态或扫描全量节点。需要对齐线、MiniMap、背景、边动画、节点阴影这类高成本效果时，先检查 `Canvas` 的 interaction lite rendering 分支。

浏览器级大图拖动采样使用：

```bash
npm run perf:canvas
```

该命令不属于轻量单测，会启动 Vite 和 Chromium，并把报告写入 `output/performance/`。需要按预算失败时运行 `npm run perf:canvas:enforce`。

## 新增节点检查清单

1. 在 `src/types/index.ts` 增加节点数据类型。
2. 在 `src/store/canvasNodeData.ts` 增加默认数据构造。
3. 在 `src/store/canvasNodeCreation.ts` 增加节点构造和默认尺寸。
4. 在 `src/nodes/nodeRegistry.ts` 注册节点组件。
5. 在 `src/features/nodeLibrary/catalog.tsx` 或对应工具入口加入创建动作。
6. 如涉及连线输入，更新 `src/store/canvasConnectionSources.ts` 与 `src/store/canvasConnectionDerivedData.ts`。
7. 如涉及自动输出节点，更新 `src/store/canvasOutputLayout.ts`。
8. 补充 `scripts/` 或 `src/**/*.test.ts` 下的轻量测试。
9. 运行 `npm run test`、`npm run lint`、`npm run build`。

## 验证命令

```bash
npm run test
npm run test:smoke
npm run lint
npm run build
```

交互或 UI 改动还需要运行：

```bash
npm run dev
```

开发服务器默认不启用 React StrictMode，避免大画布交互更新在开发环境重复渲染。需要专项检查 Effect 清理和副作用时，设置 `VITE_REACT_STRICT_MODE=true` 后再运行 `npm run dev`。

`npm run test:smoke` 是独立的浏览器级冒烟验证，不并入轻量 `npm run test`。它会启动本地 Vite 和 Chromium，并用脚本内置的假工作区验证项目创建、节点创建、连线同步、生成任务入队、保存、项目切换、重命名、复制、删除、刷新恢复，以及工作区目录包的导出和替换导入。

然后在浏览器里检查对应流程。主题相关改动至少检查暗色、浅色和跟随系统三种模式。

## 清理规则

可以清理：

- 未被入口链路引用、也没有测试或兼容价值的旧组件。
- Vite 模板遗留素材。
- `dist`、`output`、`test-results`、`.playwright-cli` 等生成产物。
- 根目录临时日志。

谨慎保留：

- 全局类型声明，例如 `src/types/file-system-access.d.ts`。
- 历史快照兼容相关类型和节点类型。
- 已有测试覆盖但暂未接入主链路的模块，先记录为待接入能力。

当前图片适配器没有独立“上传图片并得到可复用 URL”的运行路径：OpenAI 兼容图片编辑使用 multipart `FormData` 直传，阿里路径把本地图片转为 data URL 放入 JSON。旧上传缓存模块及对应单测已经删除，不要重新引入没有运行调用方的缓存层。
