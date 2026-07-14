# AGENTS.md

  本文档为在此仓库中工作的自动化开发协作者提供指引。

  这个项目是一个基于 React Flow 构建的 AI Canvas 单包 Vite + React + TypeScript 应用。

  默认使用中文回复用户，每个回复都要加上琨哥这个昵称，除非用户明确要求使用其他语言。

  长期文档入口：`README.md`、`docs/DEVELOPMENT.md`、`docs/PROJECT_STRUCTURE.md`、`docs/ROADMAP.md`、`docs/DESKTOP.md`、`docs/PERFORMANCE.md`。不要重新创建完成态计划或一次性复盘文档；需要保留的结论应写回这些长期入口。

  ## 常用命令

  - 安装依赖：`npm install`
  - 启动开发服务器：`npm run dev`
  - 运行 Lint：`npm run lint`
  - 运行轻量单测：`npm run test`
  - 构建并进行类型检查：`npm run build`
  - 预览生产构建：`npm run preview -- --host 127.0.0.1 --port 4173`
  - 运行浏览器冒烟：`npm run test:smoke`
  - 检查 Electron 环境：`npm run desktop:check`
  - 启动 Electron：`npm run desktop:dev`
  - 构建 Electron 便携版：`npm run desktop:build`

  此仓库已有 `npm run test`，用于运行 `scripts/` 与 `src/` 下的 Node 内置 test runner 轻量单测。仓库没有 `npm run typecheck`、`npm run test:e2e`，当前类型检查入口是 `npm run build`，因为它会先执行 `tsc -b`，再执行 `vite build`。

  ## 架构概览

  - 浏览器入口链路：`index.html` → `src/main.tsx` → `src/App.tsx`。
  - Electron 入口链路：`electron/main.mjs` → 本地静态/代理服务器 → `dist/index.html`；`electron/preload.cjs` 只暴露运行时标记，不暴露 Node API。
  - `src/platform/index.ts` 根据 preload 标记选择 Web bridge 或 desktop bridge。当前 desktop bridge 仍委托 Web 工作区实现，后续原生文件能力必须通过 Electron IPC 接入 `platformBridge`。
  - `src/App.tsx` 会先渲染 `ProjectBootstrap`，再组合 `ReactFlowProvider`、`Toolbar`、`FloatingToolbar`、`TaskQueueRunner`、`Canvas` 以及存储/项目管理相关对话框。`Canvas` 必须保持在 `ReactFlowProvider` 内部。
  - 这个应用是以 store 驱动的。大多数行为都位于 Zustand store 和 feature orchestrator 中，而不是 React 组件本地状态中。

  ### 核心状态层

  - `src/store/useCanvasStore.ts`：节点/边以及大部分图编辑行为的单一事实来源，包括节点创建、边变更、复制粘贴、删除、分组、布局、预览/输出节点创建，以及把连线派生出的数据同步回节点数据。
  - `src/store/useHistoryStore.ts`：画布变更的撤销/重做事务层。UI 动作通常通过 `runTracked()` 包装 store 更新。
  - `src/store/useProjectStore.ts`：多项目状态、当前项目切换、脏状态追踪、自动保存持久化、手动保存、工作区重载与快照恢复。
  - `src/store/useTaskQueueStore.ts`：持久化的图片生成任务队列。任务状态是项目快照的一部分，而不是临时 UI 状态。
  - `src/store/useSettingsStore.ts`：模型与存储设置。优先使用工作区配置，其次回退到缓存的工作区配置，最后再处理 legacy localStorage 迁移。

  ### 快照与持久化模型

  - 完整项目快照结构为 `{ canvas, taskQueue }`，定义和组装位于 `src/features/projectManager/runtime.ts`。
  - `src/components/ProjectBootstrap.tsx` 是启动与自动保存的协调器。它负责加载工作区状态、hydrate 设置、初始化项目、恢复排队中/运行中的生成任务，并在工作区存储已配置时调度自动保存。
  - `src/platform/web/browserPlatform.ts` 是 Web 端真正的持久化层，基于 File System Access API 存储以下内容：
    - 工作区清单和每个项目的 JSON 文件
    - `.config/config.json` 下的工作区配置
    - `images/` 目录下的导入/生成图片资源
  - 新项目资产按 `images/projects/<project-id>/` 存放，统一路径入口是 `src/features/projectManager/projectAssetPaths.ts`。项目名不参与路径，旧资产路径保持可读，删除项目时不得直接删项目资产目录，仍按全工作区引用扫描清理。
  - `saveActiveProject()` 更新项目的 saved snapshot；`persistWorkspaceFile()` 更新 working snapshot 和 autosave 基线。这个差异会直接影响未保存变更的判定行为。
  - 工作流导入/导出只包含画布数据（`nodes` + `edges`），不包含完整项目或任务队列持久化内容。
  - 跨平台工作区迁移使用目录包：`workspace.json`、`projects/*.json`、脱敏后的 `.config/config.json` 和 `images/` 中被引用的资产。首版导入会在确认后替换整个工作区，不执行项目合并。

  ### 模型执行流程

  - 图片生成链路：`src/nodes/GenerateNode/index.tsx` → `src/features/generateQueue/orchestrator.ts` → `src/store/useTaskQueueStore.ts` / `src/components/TaskQueueRunner.tsx` → `src/api/imageAdapter.ts`。
  - 生成任务会创建或更新 `generatedPreviewNode`，并且可以把返回图片持久化为工作区资源文件。
  - `TaskQueueRunner` 采用基于 lane 的执行模型：默认任务串行执行，而 OpenAI 兼容异步图片任务可以以更高并发运行。
  - LLM 执行链路：`src/nodes/LLMFileNode/index.tsx` → `src/features/llm/orchestrator.ts` → `src/api/chatAdapter.ts`。历史 `llmNode` 类型仍在 `nodeRegistry` 中映射到 `LLMFileNode` 以兼容旧快照。
  - LLM 运行结果会创建同级的 `llmOutputTextNode` 结果节点，而不是只把最终输出渲染在源节点内部。

  ### 主题系统

  - 当前主题模式为 `dark`、`light`、`system`，通过根节点 `data-theme` 与 CSS 变量驱动，不建议在组件里用大量 `dark:` 分支维护两套样式。
  - 完整主题设置位于设置弹层的“外观设置”，画布左上角保留快速切换入口，两处状态必须同步。
  - 主题样式优先从 `src/styles/themeClasses.ts` 复用；如果新增跨组件通用样式，先扩展 `themeClasses`，再在组件中引用。
  - 节点外壳主题集中在 `src/nodes/nodeShellClassName.ts` 和 `src/nodes/nodeShell.tsx`，新增节点应复用 `getNodeShellClassName({ selected })`、`NodeHeader`、`NodeDeleteButton`、`NodeResizerPreset` 等节点外壳基础组件。
  - 主题和 UI 的长期约束统一维护在 `docs/DEVELOPMENT.md` 与本文件，不再保留单次主题改造完成记录。

  ### 节点图行为

  - `src/components/FloatingToolbar.tsx` 是手动创建节点的主要入口。
  - `src/nodes/nodeRegistry.ts` 是 React Flow 节点类型注册表。新增节点类型时必须在这里注册。
  - `src/types/index.ts` 是共享类型边界，覆盖节点数据、任务快照、项目快照、工作区配置与资源元数据。
  - 连线变化不只是视觉层面的变化：`useCanvasStore` 会自动把上游文本同步到 `generateNode.prompt`、LLM 输入文本和 splitter 输入文本，同时也会维护 generate/LLM 节点的有序图片引用数组。

  ## 验证方式

  - 常规代码改动后，运行 `npm run test`、`npm run lint`，然后运行 `npm run build`。
  - 项目、存储、任务队列或关键工作流改动还要运行 `npm run test:smoke`。
  - Electron 入口、代理或打包配置改动还要运行 `npm run desktop:check`、`npm run desktop:dev` 和 `npm run desktop:build`。
  - 如果改动涉及较强交互行为，需要通过 `npm run dev` 在浏览器中手动验证对应流程；仓库当前没有可维护的 E2E 套件。
  - 主题/UI 改动除了 lint/build 外，还应检查暗色、浅色、跟随系统三种模式下的可读性和交互状态；重点关注左上角工具栏、任务列表、存储设置、项目管理、图片全屏编辑器和常用节点。

  ## UI 与主题统一规范

  - 当前项目支持暗色、浅色和跟随系统三种主题模式。新增 UI 时必须优先使用主题 CSS 变量和 `src/styles/themeClasses.ts`，不要重新写死单一暗色样式。
  - 常用主题 token 包括：`--canvas-bg`、`--panel-bg`、`--panel-bg-strong`、`--node-bg`、`--node-border`、`--border-subtle`、`--text-primary`、`--text-secondary`、`--text-muted`、`--control-bg`、`--control-bg-hover`、`--shadow-panel`、`--flow-grid`。
  - 整体视觉保持画布工具风格：细边框、轻量 backdrop blur、低对比阴影、小字号与紧凑间距；节点、弹层、下拉和浮动工具应复用现有密度，避免孤立的大面积中灰或亮色面板。
  - 主交互色统一使用 violet 体系。节点 hover、selected、active、focus、resize 和主操作按钮优先使用 `violet-*`，不要回退到 `sky-*`、`blue-*` 或 `cyan-*` 作为主交互色。
  - 语义色可以保留：成功使用 emerald，警告/排队使用 amber，错误/删除使用 red。
  - 文本颜色必须使用 `--text-primary`、`--text-secondary`、`--text-muted` 或 `themeClasses`，避免 `text-white` / `text-zinc-*` 导致浅色模式不可读。
  - 面板、输入框、按钮、工具条优先复用 `themeClasses.floatingPanel`、`themeClasses.strongPanel`、`themeClasses.input`、`themeClasses.secondaryButton`、`themeClasses.iconButton`、`themeClasses.nodeInput`、`themeClasses.nodeTextarea`、`themeClasses.nodeToolbarPanel`、`themeClasses.nodeToolbarButton`、`themeClasses.nodeActionButton`、`themeClasses.nodePrimaryButton`。
  - 弹出菜单必须看起来属于节点系统：主题化玻璃底、细分隔、紧凑分组标题（小号 uppercase tracking），避免厚重卡片、过大圆角和与项目不一致的控件形态。
  - 做主题相关改动后，至少扫描常见残留：`bg-zinc`、`text-zinc`、`border-zinc`、`border-white`、`bg-white/`、`hover:bg-white`、`hover:text-white`、`bg-[#`、`sky-*`、`blue-*`、`cyan-*`。

  ## 注意事项

  - 旧版 CLAUDE 指引里关于 `GenerateNode` 只做本地预览的说法已经过时。当前主生成流程已经接入持久化任务队列，并通过 `src/features/generateQueue/orchestrator.ts` 驱动。
  - `src/nodes/nodeRegistry.ts` 里 `llmNode` 和 `llmFileNode` 当前都映射到 `LLMFileNode`，并且 `useCanvasStore.addLLMNode()` 现在实际创建的是 `llmFileNode`。如果要修改 LLM 节点行为，先同时检查两个节点组件和对应 store 辅助逻辑。
  - `useCanvasStore.updateNodeData()` 在 patch 中包含 `width` 或 `height` 时也会更新节点尺寸，并可能触发预览/输出节点的自动重新布局。
  - 生成预览节点和 LLM 输出节点默认会自动排布在源节点旁边；一旦用户手动拖动，这些节点就会切换为手动布局模式。
  - `useCanvasStore` 中的分组行为本质上更偏视觉和边界计算；在持久化/历史快照前会先做归一化，因此落盘后的节点是顶层绝对坐标，而不是依赖 React Flow 的嵌套 parent 关系。
  - 节点 ID 使用进程内计数器生成，常见前缀包括 `img-`、`text-`、`gen-`、`preview-`、`llmfile-`、`task-`。
  - 如果工作区存储未配置，生成图片可能会保留为 data URL，而不是写成工作区资源文件。
  - `src/features/projectManager/legacyStorage.ts` 是旧工作区兼容层，不是新的持久化入口；修改或删除前必须先检查迁移测试。
  - `@` 路径别名同时定义在 `vite.config.ts` 和 `tsconfig.app.json` 中，修改时要保持同步。
