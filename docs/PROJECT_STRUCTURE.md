# 项目结构约定

本文档用于约定 AI Canvas 代码应该放在哪里，避免功能增长后目录变得难以判断。

## 仓库目录

```text
build/       Electron 发布图标等构建资源
electron/    Electron main 与 preload
scripts/     单测、冒烟、性能、桌面启动和预检脚本
src/         React 应用、业务逻辑和平台桥接
test-fixtures/ 长期保留的快照和工作区兼容样本
```

`dist/`、`release/`、`output/` 和 `test-results/` 都是生成目录，不作为源码入口，也不进入 Git。

账号网站位于独立仓库 <https://github.com/136909482/ai-canvas-cloud>。本仓库不新增 Cloud 服务端目录。

## 顶层目录

```text
src/
  api/          外部模型、图片、视频、聊天接口适配
  components/   应用级 UI 组件、画布外壳、弹层、工具栏
  config/       静态模型目录、provider 定义等配置
  constants/    跨模块共享常量
  features/     业务能力编排与纯运行时逻辑
  nodes/        React Flow 自定义节点
  platform/     Web / Desktop 平台能力抽象
  store/        Zustand store 与画布状态辅助逻辑
  styles/       主题 class 和全局样式辅助
  types/        跨模块共享类型
  utils/        与具体业务无关的通用工具
```

## 放置规则

- `components/` 放应用外壳和可复用 UI，避免塞入模型请求、项目持久化等业务流程。
- `nodes/` 只放 React Flow 节点组件和节点专属 UI。新增节点必须同步注册到 `src/nodes/nodeRegistry.ts`。
- `features/` 放某个业务能力的运行时、编排、解析和测试，例如生成队列、项目管理、LLM、富文本提示词。
- `features/nodeRegistry/protocol.ts` 是节点类型、默认创建、连接能力、输出布局和节点库元数据的统一协议；组件和 store 不得各自维护平行注册表。
- `features/workflowTemplates/runtime.ts` 负责局部图截取、坐标归一化、ID/引用重映射和模板 schema 校验；平台读写与 UI 状态不得反向进入该纯运行时。
- `features/workspaceSearch/runtime.ts` 负责可搜索字段提取、Web 兼容查询、相关度和摘要；SQLite 索引实现留在 `electron/nativeWorkspaceDatabase.mjs`。
- `store/` 放 Zustand store。复杂 store 的纯函数应拆到同目录辅助文件，避免把所有逻辑塞进 `use*Store.ts`。
- `api/` 只负责外部 API 协议、请求、响应解析和错误归一化，不直接操作画布节点。
- `platform/` 负责浏览器和桌面端差异，业务代码应通过 `platformBridge` 调用平台能力。
- `electron/` 只负责桌面进程、窗口、内部静态/代理服务器、原生工作区文件/SQLite 服务和 preload。Node.js 文件与数据库能力必须通过受控 IPC 暴露，不得启用 renderer `nodeIntegration`；目录包和资产行为集中在 `electron/nativeWorkspace.mjs`，Worker RPC 与按项目保存队列位于 `electron/nativeWorkspaceDatabaseClient.mjs`，Worker 入口位于 `electron/nativeWorkspaceDatabaseWorker.mjs`，数据库 schema、事务、索引和备份集中在 `electron/nativeWorkspaceDatabase.mjs`。
- SQLite 审计写入、保留上限和参数化查询集中在 `electron/nativeWorkspaceDatabase.mjs`；渲染进程只能通过 `platformBridge.queryWorkspaceAudit()` 读取脱敏结果。
- `scripts/` 中的桌面启动器负责选择空闲 Vite 端口和清理子进程；不要把这类进程管理逻辑放进 React 应用。
- `types/` 只放真正跨多个模块共享的类型；模块内部类型优先放在对应 feature 或节点目录。

## Import 规则

- 跨目录引用优先使用 `@/` 别名，例如 `@/store/useCanvasStore`。
- 同一目录或同一小模块内部可以使用 `./runtime`、`./types` 这样的相对路径。
- 避免跨多层的 `../../`，它会让文件搬迁成本变高，也让依赖方向不清楚。
- 当前 `npm run test` 直接使用 Node 内置 test runner，没有配置 `@/` 运行时别名解析；被 `.test.ts` 直接执行到的源码可以保留相对路径，或者先为测试 runner 增加别名解析能力。
- 普通应用源码 import 不带 `.ts` / `.tsx` 后缀；Node runner 直接执行的测试入口及其运行时被测模块如需明确解析目标，可以保留 `.ts` 后缀。

## 文件大小建议

- 超过 500 行的组件或 store，应优先检查是否能拆出纯函数、子组件或局部 hooks。
- 超过 1000 行的文件不是必须立刻拆，但应进入重构候选清单。
- 拆分时先抽无状态、可测试的运行时逻辑，再拆 UI；不要为了目录漂亮而改变行为边界。

## 当前重构候选

截至 2026-07-11，以下文件已经完成第一轮低风险抽取，但主文件仍然较大：

- `src/components/Toolbar.tsx`：设置元数据和展示组件已迁到 `src/components/toolbar/`。
- `src/components/ImageFullscreenEditor.tsx`：纯画布运行时逻辑已迁到 `src/components/imageEditor/runtime.ts`。
- `src/store/useCanvasStore.ts`：节点创建、删除、布局、剪贴板、连接派生数据和 selector 等已拆为多个 `src/store/canvas*.ts` 模块。
- `src/features/generateQueue/orchestrator.ts`：生成资产持久化已迁到 `src/features/generateQueue/generatedAssets.ts`。
- `src/platform/web/browserPlatform.ts`：工作区文件与资产辅助逻辑已迁到 `src/platform/web/workspaceFiles.ts`。
- `src/nodes/GenerateNode/index.tsx`：模型选项、设置和参考图辅助逻辑已迁到同目录模块。
- `src/store/useProjectStore.ts`：项目记录与资产迁移逻辑已迁到 `projectRecords.ts`、`projectAssetMigration.ts`。
- `src/components/ProjectManagerDialog.tsx`：筛选模型与展示子组件已迁到 `src/components/projectManager/`。
- `src/store/useSettingsStore.ts`：配置规范化与 workspace 转换已迁到 `settingsConfig.ts`，legacy/localStorage 缓存边界已迁到 `settingsCache.ts`。

当前没有必须立即继续拆分的固定候选。其余已完成首轮抽取的文件，只有在出现新的稳定职责边界、测试保护或明确维护问题时再继续拆，不以降低行数为唯一目标。

建议每次只拆一个文件，并在拆完后运行：

```bash
npm run test
npm run lint
npm run build
```
