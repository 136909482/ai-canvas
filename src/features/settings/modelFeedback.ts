import type { FeedbackToastTone } from '@/store/useFeedbackStore'

export type ModelSettingsFeedback = {
  tone: FeedbackToastTone
  title: string
  message: string
}

function getModelDisplayName(name: string) {
  return name.trim() || '当前模型'
}

export function getModelSaveSuccessFeedback(name: string): ModelSettingsFeedback {
  return {
    tone: 'success',
    title: '模型已保存',
    message: `${getModelDisplayName(name)} 的配置已写入工作区。`,
  }
}

export function getModelSaveErrorFeedback(name: string): ModelSettingsFeedback {
  return {
    tone: 'error',
    title: '模型保存失败',
    message: `${getModelDisplayName(name)} 的配置未能写入工作区，请稍后重试。`,
  }
}

export function getModelDeleteSuccessFeedback(name: string): ModelSettingsFeedback {
  return {
    tone: 'success',
    title: '模型已删除',
    message: `${getModelDisplayName(name)} 已从模型库移除。`,
  }
}

export function getModelDeleteErrorFeedback(name: string): ModelSettingsFeedback {
  return {
    tone: 'error',
    title: '模型删除失败',
    message: `${getModelDisplayName(name)} 的删除结果未能写入工作区，请稍后重试。`,
  }
}
