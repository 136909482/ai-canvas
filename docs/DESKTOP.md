# AI Canvas 桌面开发指南

AI Canvas 桌面端使用 Electron 复用现有 React/Vite 应用。开发和打包只需要 Node.js 与 npm，不需要 Rust、Cargo、MSVC、Windows SDK 或单独安装 WebView2。

## 当前实现

- Electron 主进程：`electron/main.mjs`
- 安全 preload：`electron/preload.cjs`
- 原生工作区文件服务：`electron/nativeWorkspace.mjs`
- SQLite Worker 客户端：`electron/nativeWorkspaceDatabaseClient.mjs`
- SQLite Worker 入口：`electron/nativeWorkspaceDatabaseWorker.mjs`
- SQLite 工作区存储：`electron/nativeWorkspaceDatabase.mjs`
- 桌面平台入口：`src/platform/desktop/desktopPlatform.ts`
- 开发启动器：`scripts/electronDev.mjs`
- 打包器：electron-builder
- 主窗口：`1440x960`，最小 `1100x720`
- 安全设置：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`

preload 通过 `ai-canvas:workspace:*` 白名单 IPC 暴露工作区操作，不暴露通用 `ipcRenderer` 或 Node.js。共享组件和 store 仍然只调用 `platformBridge`。

当前桌面 bridge 已使用 Electron IPC、Node 文件 API 和内置 `node:sqlite`，覆盖原生目录选择、项目/配置读写、图片资产、孤儿资产清理、工作流 JSON、工作区目录包和单项目目录包。所有同步 SQLite 操作都在独立持久化 Worker 中执行，主进程只进行异步 RPC 转发。项目和设置主数据位于所选工作区的 `.ai-canvas/workspace.sqlite`；媒体仍使用 `images/` 文件目录。Electron 用户数据目录只保存所选工作区路径，不保存项目正文。

首次启动且尚未配置工作区时，应用必须先要求用户选择项目保存位置，完成目录加载后才允许新建或导入项目。项目 Store 同样拒绝在未配置工作区时创建临时项目，避免随后选择目录并重载工作区时丢失内存项目。

## 环境要求

1. Node.js 22 或更新版本。
2. npm。
3. Node.js 构建需包含 `node:sqlite`；`npm run desktop:check` 会单独验证。
4. Windows 10/11、macOS 或主流 Linux 桌面环境。

安装项目依赖时会自动下载 Electron 运行时，下载体积约 200 MB：

```bash
npm install
```

检查环境：

```bash
npm run desktop:check
```

检查通过时会显示 Node、npm、Electron 和 electron-builder 版本。该命令不再检测 Rust 或 Visual Studio。

## 开发

```bash
npm run desktop:dev
```

这个命令会自动：

1. 从 `127.0.0.1:5173` 起自动选择一个空闲端口并启动 Vite。
2. 等待页面就绪。
3. 打开 Electron 桌面窗口。
4. 关闭窗口后停止本次 Vite 进程。

如果 `5173` 已被其他程序占用，启动器会自动尝试后续端口；Electron 始终连接到本次启动的 Vite，不会误连其他项目。

## 构建

生成 Windows 便携版 exe：

```bash
npm run desktop:build
```

默认产物：

```text
release/AI-Canvas-<version>-x64.exe
```

只生成解压目录、用于快速检查打包内容：

```bash
npm run desktop:build:dir
```

目录产物位于 `release/win-unpacked/`。`release/` 是生成目录，不进入 Git 或 Lint。

## 发布前验证

自动验证：

```bash
npm run test
npm run lint
npm run build
npm run test:smoke
npm run desktop:check
npm run desktop:smoke
npm run desktop:smoke:ui
npm run desktop:build
```

项目通过 `build.electronDist` 直接复用 `node_modules/electron/dist`，避免 electron-builder 再次下载同版本 Electron 运行时。Windows 资源编辑工具仍由 electron-builder 缓存管理；若日志出现 `ECONNREFUSED 127.0.0.1:443`，先检查 DNS、代理环境变量和本地代理状态；这不是可以通过关闭 TLS 校验解决的证书问题。electron-builder 当前使用 HTTP/HTTPS CONNECT 代理，不直接接受 SOCKS5 地址；代理软件同时提供 HTTP 或 Mixed 端口时，可通过该端口保持 HTTPS 校验并构建：

```bash
npx cross-env HTTPS_PROXY=http://<proxy-host>:<http-or-mixed-port> HTTP_PROXY=http://<proxy-host>:<http-or-mixed-port> npm run desktop:build
```

不得通过 `NODE_TLS_REJECT_UNAUTHORIZED=0` 或关闭 npm `strict-ssl` 生成发布产物。应用自身的 `tsc -b` 与 Vite 构建结果应单独确认。

桌面手测清单：

1. 启动窗口并检查最小尺寸、暗色、浅色和跟随系统主题。
2. 选择工作区，创建和切换项目。
3. 创建文本、图片生成和 LLM 节点并保存。
4. 导入图片，确认原图、缩略图和预览图在重启后恢复。
5. 创建生成任务，验证排队中/运行中任务的重启恢复。
6. 导出工作区目录包，确认 API Key 未被导出。
7. 确认危险替换提示后导入目录包，验证项目、设置、任务和资产恢复。
8. 导出单项目目录包，重复导入并分别验证“导入副本”和“替换现有项目”。
9. 拖动节点、平移画布，并验证拖动后立即按 `C`。

## 当前范围

当前桌面版提供：

- Electron 本地窗口。
- 与 Web 端一致的工作区、项目和媒体持久化。
- 当前项目管理、任务队列、工作区目录包和资源恢复主流程。
- Web/Desktop 一致的真实磁盘资产扫描、孤儿路径预览和清理影响确认。
- Web/Desktop 一致的单项目目录包、ID 冲突预检、副本导入和显式替换。
- 带版本、升级备份和目录包替换前备份的 SQLite 项目/设置主存储。
- Web/旧桌面 JSON 工作区首次打开导入数据库，以及数据库导出跨平台目录包。
- 完整服务商配置和 Provider API Key 随工作区保存在 SQLite；系统密钥链不进入产品范围，导出目录包仍强制清空 API Key。
- Windows 便携版 exe 打包。

P0 桌面文件闭环已经覆盖：

- 从未配置状态选择原生工作区目录，在窗口内创建节点并手动保存项目。
- 导出目录包并验证项目文件、被引用资产和 Provider API Key 脱敏。
- 验证危险替换提示的取消与继续分支，再恢复项目、设置和图片资产。
- 关闭并重启同一隔离工作区，验证活动项目和图片节点重新加载。
- 对源码 Electron 和 `release/win-unpacked/AI Canvas.exe` 分别执行完整 UI 往返。
- 在真实 Electron 窗口验证项目冲突弹层、副本新 ID、显式替换和引用资产导出。

暂不包含：

- 安装程序、代码签名、自动更新。
- 项目合并、冲突自动解决、ZIP 封装。
- 多端同步或团队协作。

后续顺序见 `ROADMAP.md`。
