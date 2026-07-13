import {
  Brush,
  HardDrive,
  ImageIcon,
  Layers3,
  MessageSquare,
  Music2,
  Palette,
  SlidersHorizontal,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { inferProviderFromApiUrl, DEFAULT_ALIYUN_BASE_URL } from '@/config/modelCatalog'
import type { SettingsCategoryId } from '@/store/useSettingsDialogStore'
import type { CanvasPerformanceMode, CustomImageModelConfig, CustomModelKind, EdgeStyle, ProviderProfileConfig, ThemeMode } from '@/types'

export type DraftModelCard = CustomImageModelConfig
export type DraftProviderProfile = ProviderProfileConfig

const DEFAULT_ASYNC_CONFIG_JSON = JSON.stringify({
  enabled: false,
  submitPath: 'images/generations',
  submitQuery: { async: 'true' },
  taskIdPath: 'data',
  pollPath: 'images/tasks/{task_id}',
  pollIntervalSeconds: 5,
  statusPath: 'data.status',
  successValues: ['SUCCESS', 'completed', 'succeeded'],
  failureValues: ['FAILURE', 'failed', 'cancelled', 'error'],
  errorPath: 'data.fail_reason',
  imageUrlPaths: ['data.data.data.*.url', 'data.data.*.url', 'data.result.images.*.url', 'data.result.images.*.url.*'],
  b64JsonPaths: ['data.data.data.*.b64_json', 'data.data.*.b64_json', 'data.*.b64_json'],
}, null, 2)

export const UI_TEXT = {
  addImageNode: '图像节点',
  settingsTitle: '设置',
  settingsHint: '模型、存储、画布与任务队列的统一配置入口。',
  addModel: '添加模型',
  addProvider: '添加服务商',
  modelKind: '模型类型',
  modelId: '模型 ID',
  apiKey: 'API Key',
  apiUrl: 'API 请求地址',
  provider: '接口来源',
  providerProfile: '服务商接口',
  requestMode: '请求模式',
  requestModeDefault: '默认同步',
  search: '搜索模型 ID',
  itemUnit: '项',
  test: '测试出图',
  testLink: '测试连接',
  testing: '测试中',
  save: '保存',
  saved: '已保存',
  unsaved: '未保存',
  close: '关闭',
  delete: '删除',
  deleteProvider: '\u5220\u9664\u670d\u52a1\u5546',
  deleteProviderConfirmTitle: '\u5220\u9664\u670d\u52a1\u5546\u63a5\u53e3',
  deleteProviderConfirmMessage: '\u5220\u9664\u540e\uff0c\u5df2\u7ed1\u5b9a\u8fd9\u4e2a\u63a5\u53e3\u7684\u6a21\u578b\u4f1a\u81ea\u52a8\u56de\u9000\u5230\u5206\u7c7b\u9ed8\u8ba4\u63a5\u53e3\u3002\u786e\u5b9a\u5220\u9664\u5417\uff1f',
  setDefault: '设为默认模型',
  setActiveProvider: '设为当前接口',
  defaultBadge: '默认',
  emptyModelId: '请先填写模型 ID',
  emptyApiKey: '请先填写 API Key',
  emptyApiUrl: '请先填写 API 请求地址',
  testSuccess: '测试成功，模型可以正常出图。',
  testLinkSuccess: '测试成功，模型连接可正常访问。',
  unsupportedTest: '当前仅支持测试 Chat 和 Image 类型模型。',
  emptyTab: '这个分类下还没有模型，点击左下角“添加模型”开始创建。',
  emptySearch: '没有匹配的模型。',
  emptySelection: '从左侧选择一个模型，或者先添加新模型。',
  fillHint: '模型 ID 在节点里使用；服务商接口在这里统一切换。',
  pendingApiUrl: '待填写 API 请求地址',
  providerAliyun: '阿里百炼 / DashScope',
  providerCompatible: 'OpenAI Compatible',
  requestModeSync: '同步',
  requestModeAsync: '异步',
  requestModeHint: '同步适合大多数接口；异步适合你自己接的轮询型生图服务。',
  asyncConfig: '高级异步配置',
  asyncConfigHint: '开启 enabled 后，会按 JSON 里的 taskIdPath / pollPath / statusPath / 图片路径解析第三方异步接口。',
  modelLibrary: '模型库',
  modelDetails: '模型详情',
  configCenter: '配置中心',
  currentKind: '当前分类',
} as const

export const MODEL_NAME_LABEL = '显示名称'

export const API_URL_HELP_TEXT =
  '推荐填写站点根地址或 /v1。系统会按文生图 / 图生图 / 图像编辑自动选择接口后缀，也兼容完整接口地址。'

export const CANVAS_EXPERIENCE_TEXT = {
  section: '\u753b\u5e03\u4f53\u9a8c',
  performanceMode: '\u753b\u5e03\u6027\u80fd\u6a21\u5f0f',
  performanceModeHint: '\u9ad8\u8d28\u91cf\u4fdd\u7559\u5b8c\u6574\u753b\u5e03\u4f53\u9a8c\uff1b\u9ad8\u6027\u80fd\u51cf\u5c11\u5c0f\u5730\u56fe\u3001\u8fb9\u52a8\u753b\u548c\u91cd\u9634\u5f71\u7b49\u975e\u6838\u5fc3\u89c6\u89c9\u3002',
  canvasGrid: '\u753b\u5e03\u7f51\u683c',
  canvasGridHint: '\u663e\u793a\u753b\u5e03\u80cc\u666f\u7f51\u683c\uff1b\u9ad8\u6027\u80fd\u6a21\u5f0f\u4e0b\u4f1a\u81ea\u52a8\u9690\u85cf\u4ee5\u51cf\u5c11\u6e32\u67d3\u8d1f\u62c5\u3002',
  lowQualityPreview: '\u9ad8\u6e05\u56fe\u7247\u9884\u89c8',
  lowQualityPreviewHint: '\u5f00\u542f\u65f6\u753b\u5e03\u56fe\u7247\u59cb\u7ec8\u663e\u793a\u539f\u56fe\uff1b\u5173\u95ed\u65f6\u59cb\u7ec8\u4f7f\u7528\u8f83\u5c0f\u7684\u672c\u5730\u7f29\u7565\u56fe\uff0c\u964d\u4f4e\u5927\u56fe\u6e32\u67d3\u8d1f\u62c5\u3002',
  alignmentGuides: '\u62d6\u62fd\u5bf9\u9f50\u53c2\u8003\u7ebf',
  alignmentGuidesHint: '\u79fb\u52a8\u5230\u9644\u8fd1\u8282\u70b9\u5e76\u63a5\u8fd1\u5bf9\u9f50\u65f6\u663e\u793a\u8f85\u52a9\u7ebf',
  edgeStyle: '节点连线样式',
  edgeStyleHint: '蚂蚁线带流动动画，更直观；实线静态显示，节点多时更稳定省性能。',
  appearanceTheme: '外观主题',
  appearanceThemeHint: '和画布左上角工具栏的主题按钮同步。',
} as const

export const CANVAS_PERFORMANCE_OPTIONS: Array<{
  id: CanvasPerformanceMode
  label: string
  description: string
}> = [
  { id: 'quality', label: '\u9ad8\u8d28\u91cf', description: '\u5b8c\u6574\u663e\u793a\u548c\u52a8\u6548' },
  { id: 'performance', label: '\u9ad8\u6027\u80fd', description: '\u8282\u70b9\u591a\u65f6\u66f4\u6d41\u7545' },
]

export const EDGE_STYLE_OPTIONS: Array<{
  id: EdgeStyle
  label: string
  description: string
}> = [
  { id: 'animated', label: '\u8682\u8681\u7ebf', description: '\u6d41\u52a8\u865a\u7ebf\u52a8\u753b' },
  { id: 'solid', label: '\u5b9e\u7ebf', description: '\u9759\u6001\u5b9e\u7ebf' },
]

export const THEME_MODE_OPTIONS: Array<{ id: ThemeMode; label: string }> = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
  { id: 'system', label: '跟随系统' },
]

export const MODEL_TABS: Array<{ id: CustomModelKind; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'music', label: 'Music' },
  { id: 'tool', label: '工具' },
]

export const MODEL_TAB_ICONS: Record<CustomModelKind, LucideIcon> = {
  chat: MessageSquare,
  image: ImageIcon,
  video: Video,
  music: Music2,
  tool: Wrench,
}

export const SETTINGS_CATEGORIES: Array<{
  id: SettingsCategoryId
  label: string
  description: string
  Icon: LucideIcon
}> = [
  { id: 'models', label: '模型管理', description: 'API、模型库与默认模型', Icon: SlidersHorizontal },
  { id: 'storage', label: '存储与保存', description: '工作区目录和自动保存', Icon: HardDrive },
  { id: 'canvas', label: '画布管理', description: '对齐辅助和画布体验', Icon: Layers3 },
  { id: 'appearance', label: '外观主题', description: '明暗主题与显示偏好', Icon: Palette },
  { id: 'tasks', label: '任务队列', description: '生成任务和恢复策略', Icon: Brush },
  { id: 'tools', label: '工具与诊断', description: '工作区搜索和诊断记录', Icon: Wrench },
]

export const FIELD_INPUT_CLASS =
  'h-8.5 w-full rounded-[9px] border border-[var(--border-subtle)] bg-[var(--control-bg)] px-3 text-[13px] text-[var(--text-primary)] transition placeholder:text-[var(--text-muted)] focus:border-violet-400/60 focus:bg-[var(--control-bg-hover)] focus:outline-none'

export const FIELD_SELECT_CLASS = `${FIELD_INPUT_CLASS} [&_option]:bg-[var(--panel-bg-strong)] [&_option]:text-[var(--text-primary)]`

export const READONLY_FIELD_CLASS =
  'rounded-[9px] border border-[color-mix(in_srgb,var(--border-subtle)_72%,transparent)] bg-[color-mix(in_srgb,var(--panel-bg-strong)_78%,var(--control-bg)_22%)] px-3 py-2 text-[13px] text-[var(--text-secondary)]'

export const SWITCH_OPTION_CLASS = 'inline-flex items-center justify-center rounded-[7px] text-[11px] font-medium transition'

export const CANVAS_OPTION_GROUP_CLASS = 'flex shrink-0 flex-wrap items-center justify-end gap-1.5'
export const CANVAS_OPTION_BUTTON_CLASS =
  'inline-flex h-7 min-w-16 items-center justify-center rounded-[9px] px-3 text-xs font-medium leading-none transition-colors'
export const CANVAS_SETTINGS_ROW_CLASS =
  'flex min-h-16 items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 last:border-b-0'

export const MODEL_SETTINGS_PANEL_CLASS =
  'relative overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--control-bg)]'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function createDraftId() {
  return `draft-model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createProviderDraftId() {
  return `draft-provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyDraft(kind: CustomModelKind): DraftModelCard {
  return {
    id: createDraftId(),
    name: 'New Model',
    modelId: '',
    kind,
    enabled: true,
    testStatus: 'idle',
    testMessage: '',
    lastTestedAt: null,
  }
}

export function toDraftModel(model: CustomImageModelConfig): DraftModelCard {
  return { ...model }
}

export function createEmptyProviderDraft(kind: CustomModelKind): DraftProviderProfile {
  return {
    id: createProviderDraftId(),
    name: 'New Provider',
    kind,
    apiKey: '',
    apiUrl: '',
    provider: inferProviderFromApiUrl(DEFAULT_ALIYUN_BASE_URL),
    requestMode: 'sync',
    asyncConfig: JSON.parse(DEFAULT_ASYNC_CONFIG_JSON) as DraftProviderProfile['asyncConfig'],
    enabled: true,
    testStatus: 'idle',
    testMessage: '',
    lastTestedAt: null,
  }
}

export function toDraftProviderProfile(profile: ProviderProfileConfig): DraftProviderProfile {
  return { ...profile }
}

export function formatTimestamp(value: number | null) {
  if (!value) {
    return ''
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function getKindLabel(kind: CustomModelKind) {
  return MODEL_TABS.find((tab) => tab.id === kind)?.label ?? kind
}

export function sanitizeDraftModel(model: DraftModelCard): DraftModelCard {
  const name = model.name.trim()
  const modelId = model.modelId.trim()

  return {
    ...model,
    name: name || modelId || 'New Model',
    modelId,
  }
}

export function sanitizeProviderProfile(profile: DraftProviderProfile): DraftProviderProfile {
  const apiUrl = profile.apiUrl.trim()
  const provider = inferProviderFromApiUrl(apiUrl || DEFAULT_ALIYUN_BASE_URL)

  return {
    ...profile,
    name: profile.name.trim() || (provider === 'aliyun' ? UI_TEXT.providerAliyun : UI_TEXT.providerCompatible),
    apiKey: profile.apiKey.trim(),
    apiUrl,
    provider,
    requestMode: provider === 'openai' ? profile.requestMode : 'sync',
    asyncConfig: profile.asyncConfig ?? null,
  }
}

export function getProviderLabel(profile: Pick<DraftProviderProfile, 'apiUrl' | 'provider'>) {
  if (!profile.apiUrl.trim()) {
    return ''
  }

  return profile.provider === 'aliyun' ? UI_TEXT.providerAliyun : UI_TEXT.providerCompatible
}

export function formatAsyncConfigJson(profile: DraftProviderProfile) {
  return JSON.stringify(profile.asyncConfig ?? JSON.parse(DEFAULT_ASYNC_CONFIG_JSON), null, 2)
}

export function getStatusTone(status: DraftModelCard['testStatus'], active: boolean) {
  if (status === 'success') {
    return 'bg-emerald-400'
  }
  if (status === 'error') {
    return 'bg-red-400'
  }
  if (status === 'testing') {
    return 'bg-amber-300'
  }
  return active ? 'bg-violet-300' : 'bg-[var(--text-muted)]'
}
