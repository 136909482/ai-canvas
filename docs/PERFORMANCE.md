# AI Canvas 画布性能指南

本文档是画布性能预算、实现约束和回归方法的唯一维护入口。历史排查记录已合并为可执行规则，不再保留绑定个人工作区和单次采样报告的分析文档。

## 性能预算

| 场景 | 预算 | 约束 |
| --- | ---: | --- |
| 含 4 张大图时拖动一个图片节点 | 拖动窗口平均帧 `<= 17 ms`，p95 `<= 16.8 ms` | 白色占位必须为 0，性能模式下优先使用缩略图 |
| 单张图片边长 `>= 1800 px` 或面积 `>= 2 MP` | 拖动窗口平均帧 `<= 17 ms`，p95 `<= 16.8 ms` | 性能模式由用户开启，不自动切换 |
| 含图片节点的画布平移/缩放 | 平均帧 `<= 17 ms`，避免重复 `> 32 ms` 帧 | 图片内容必须持续可见 |
| 300 个混合节点 | 交互帧 `<= 24 ms` | 性能模式可以降低非内容效果 |
| 800 个混合节点 | 交互帧 `<= 40 ms` | 作为阶段性测量目标 |
| 1500 个混合节点 | 仅测量 | 应保持可恢复和可保存 |

不同机器存在波动，日常 `perf:canvas` 默认只测量；需要强制预算时使用 `perf:canvas:enforce`。

## 当前实现规则

- 性能模式只由用户手动开启。节点数、图片数、自然尺寸和 data URL 体积只用于诊断与局部保护。
- 不通过白色占位、隐藏节点内容或松手后才显示图片来提高测量结果。
- 画布图片入口优先使用 `CanvasImagePreview`。工作区缩略图优先于运行时缓存，缩略图未就绪时继续显示原图。
- 生成节点、视频节点、LLM 节点和富文本图片 mention 的内联预览也必须走 `CanvasImagePreview`，避免小尺寸 DOM 解码超大原图。
- active drag 的位置变化先写 `CanvasFlowLayer` 本地交互状态，结束后再同步到 `useCanvasStore`。
- 对齐、resize、选择、删除、创建、分组和连线变化仍走正常 store 路径。
- 高频组件使用精确 Zustand selector，禁止整仓订阅。
- 节点浮动工具条只在节点已选中时挂载，由 `StableNodeToolbar` 处理单选显隐；平移时直接同步工具条 transform，不让 React 订阅每一帧 viewport 变化。不要通过 React Context 向全部节点广播选择数量，否则点击一个节点会让所有图片节点同步重渲染。
- 用户可见的背景、MiniMap、边动画、阴影只在手动性能模式或有明确测量依据时降级。

## 关键交互约束

### 拖拽结束

拖拽结束后的最终位置可能处于延迟提交队列。以下动作执行前必须 flush 挂起变更：

- Delete
- `C` 整理连通图
- Ctrl+C、Ctrl+D、粘贴

快速短拖期间需要保持刚拖节点的 selected 状态，避免节点外壳边框和阴影短暂闪回未选中态。

节点选择后立即平移时，普通选择变化只写业务节点状态；不要同步更新未参与渲染的本地拖拽节点副本。浮动工具条也不能通过 React Flow `NodeToolbar` 订阅每一帧 `x/y/zoom`，否则节点选择提交会与 viewport 更新叠在首帧。

### 缩放后的首次交互

小型但图片密集的画布在缩放后立即平移或拖动时，主要风险是 React Flow 可见元素裁剪重新启用导致的挂载/卸载成本。

当前策略：

- 节点数 `<= 80` 且图片/预览节点数 `>= 8` 时，持续保持有界元素热状态，避免首次平移为了切换裁剪策略触发 React 重渲染。
- 元素热状态下关闭可见元素裁剪，避免节点、图片和边在视口边界反复挂载；显式诊断开关仍可强制启用裁剪。
- 稳定渲染层在项目加载时一次性暂停动画边与节点连接点光效，并降低未选中节点阴影和非工具条 backdrop filter；不在平移/缩放开始时切换样式，不隐藏图片，也不自动切换图片质量模式。
- 大画布继续保持裁剪，避免无限 DOM 成本。
- workspace asset 已存在但浏览器 URL 尚未解析时，仍计入图片性能统计。

排查时先区分：持续拖动卡顿、缩放过程卡顿、缩放后第一次交互卡顿。三者的根因和优化入口不同。

### 连线动画

当前连线使用 React Flow 内置 CSS/SVG `animated`，不是 React 每帧状态更新。普通项目应保留动画，不因一般首帧卡顿直接关闭。

启发式观察范围：

- 少于约 50 条可见动画边：通常无需处理。
- 50-150 条：测量拖动、缩放和空闲 GPU repaint。
- 超过 150 条：评估只保留活动边动画或全部关闭。

降级应作为渲染层策略，不修改持久化边数据。需要同时尊重 `prefers-reduced-motion`。

## 自动验证

```bash
npm run test
npm run lint
npm run build
npm run perf:canvas
npm run validate:canvas-internal-drag
```

强制预算：

```bash
npm run perf:canvas:enforce
```

常用采样参数：

```bash
npm run perf:canvas -- --image-count 6 --image-width 3000 --image-height 2200
npm run perf:canvas -- --runs 3 --gesture zoom --zoom-from 0.8 --zoom-to 0.24
npm run perf:canvas -- --workspace-dir <工作区路径> --project-name <项目名> --gesture select-pan --runs 3
npm run perf:canvas -- --server-mode preview --canvas-performance-mode performance --runs 1
npm run perf:canvas -- --headed
```

关注报告字段：

- `summary.averageFrameMs`
- `summary.p95FrameMs`
- `summary.framesOver16ms`
- `summary.framesOver32ms`
- `summary.longTaskTotalMs`
- `summary.maxLowQualityPlaceholderCount`
- `summary.maxWorkspaceThumbnailPreviewCount`
- `aggregate.renderCounts`
- `aggregate.traceSummary`

## 手动回归

性能或拖拽链路改动至少检查：

1. 普通拖动和快速短拖，节点持续跟随指针且 selected 外壳不闪烁。
2. 拖动结束后立即平移画布。
3. 拖动结束后立即按 `C`，第一次即可整理连通图。
4. 缩放后立即平移和拖动节点。
5. 对齐参考线开启与关闭。
6. 多张大图交互时图片不白屏，性能模式下使用缩略图。
7. 质量模式不自动切换成性能模式。

只有自动指标和视觉回归同时通过，性能改动才算完成。
