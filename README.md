# AI Canvas

AI Canvas 是一个基于 React Flow 的画布式 AI 创作工具，使用 Vite、React、TypeScript 和 Zustand 构建。应用支持图片/视频生成、LLM 节点、富文本图片引用、持久化任务队列、多项目工作区，以及 Web/Electron 双运行时入口。

## 文档

- [开发指南](docs/DEVELOPMENT.md)：架构边界、状态模型、持久化和开发约定。
- [项目结构](docs/PROJECT_STRUCTURE.md)：目录职责、依赖方向和拆分规则。
- [开发路线](docs/ROADMAP.md)：已完成基线、近期优先级和长期方向。
- [桌面开发](docs/DESKTOP.md)：Electron 环境、命令、发布范围和手测清单。
- [性能指南](docs/PERFORMANCE.md)：画布性能预算、实现约束和回归方法。
- [Agent 指引](AGENTS.md)：自动化开发协作者在本仓库中的工作规则。

## 技术栈

- React 19、TypeScript 6、Vite 8
- `@xyflow/react`、Zustand
- Tailwind CSS 4、Lucide React
- TipTap 3
- Electron、Node.js SQLite

## 快速开始

```bash
npm install
npm run dev
```

生产构建预览：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

## 验证

常规代码改动依次运行：

```bash
npm run test
npm run lint
npm run build
```

涉及项目、存储、任务队列或关键交互时额外运行：

```bash
npm run test:smoke
```

`npm run test` 使用 Node 内置 test runner。`npm run build` 先执行 `tsc -b`，再执行 Vite 构建，因此也是当前类型检查入口。仓库没有 `npm run typecheck` 或 `npm run test:e2e`。

画布性能相关改动使用：

```bash
npm run perf:canvas
npm run perf:canvas:enforce
npm run validate:canvas-internal-drag
```

性能报告写入被 Git 忽略的 `output/performance/`。

## 桌面端

```bash
npm run desktop:check
npm run desktop:dev
npm run desktop:build
npm run desktop:build:installer
```

桌面开发和打包只要求 Node.js 与 npm，不需要 Rust、Cargo、MSVC 或 Windows SDK。`desktop:build` 生成 Windows 便携版，`desktop:build:installer` 生成可选择安装目录并创建快捷方式的 NSIS 安装版。详细说明见[桌面开发指南](docs/DESKTOP.md)。

## 数据模型

Web 端通过 File System Access API 使用用户选择的工作区目录，项目采用项目级 JSON 读写。桌面端在所选工作区使用 `.ai-canvas/workspace.sqlite` 保存项目整体 JSON、设置和派生索引。两端媒体都存放在 `images/`，新资产按 `images/projects/<project-id>/` 归属项目，完整项目快照均为 `{ canvas, taskQueue }`。

账号网站、PostgreSQL 项目图、对象存储和服务端任务在独立仓库 [ai-canvas-cloud](https://github.com/136909482/ai-canvas-cloud) 开发。本仓库继续维护本地 Web/Electron；两端只通过版本化 `ProjectRecord` 和目录包显式迁移，不共享运行时数据库，也不自动上传本地工作区。

跨平台迁移使用稳定的工作区目录包：

```text
workspace.json
projects/<project-id>.json
.config/config.json
images/<referenced assets>
```

导出时 Provider API Key 会被清空。首版导入在明确确认后替换整个目标工作区，不执行项目合并或冲突处理。
