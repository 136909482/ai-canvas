import type { ProjectPersistenceStatus } from './persistenceStatus'

export type ProjectManagerStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface ProjectManagerStatusView {
  label: string
  title: string
  tone: ProjectManagerStatusTone
}

export function getProjectManagerStatusView(status: ProjectPersistenceStatus): ProjectManagerStatusView {
  switch (status.kind) {
    case 'no-project':
      return {
        label: '无项目',
        title: '当前没有打开项目。',
        tone: 'neutral',
      }
    case 'restoring':
      return {
        label: '恢复中',
        title: '正在恢复项目画布和任务队列。',
        tone: 'info',
      }
    case 'storage-required':
      return {
        label: '未配置存储',
        title: '需要先选择缓存目录，项目才能写入本地工作区。',
        tone: 'warning',
      }
    case 'saving':
      return {
        label: '保存中',
        title: '正在写入当前项目文件。',
        tone: 'info',
      }
    case 'error':
      return {
        label: '保存失败',
        title: status.message,
        tone: 'danger',
      }
    case 'pending-autosave':
      return {
        label: '待自动保存',
        title: '当前改动尚未写入工作区，等待下一次自动保存。',
        tone: 'warning',
      }
    case 'auto-saved-manual-dirty':
      return {
        label: '已自动保存',
        title: `已在 ${new Date(status.at).toLocaleString('zh-CN')} 自动写入工作区，但尚未手动保存为项目保存点。`,
        tone: 'warning',
      }
    case 'auto-saved':
      return {
        label: '已自动保存',
        title: `已在 ${new Date(status.at).toLocaleString('zh-CN')} 自动写入工作区。`,
        tone: 'success',
      }
    case 'manual-saved':
      return {
        label: '已手动保存',
        title: `已在 ${new Date(status.at).toLocaleString('zh-CN')} 手动保存。`,
        tone: 'success',
      }
    case 'not-saved':
      return {
        label: '尚未保存',
        title: '当前项目还没有写入记录。',
        tone: 'neutral',
      }
  }
}
