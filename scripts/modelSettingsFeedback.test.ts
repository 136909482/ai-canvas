import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getModelDeleteErrorFeedback,
  getModelDeleteSuccessFeedback,
  getModelSaveErrorFeedback,
  getModelSaveSuccessFeedback,
} from '../src/features/settings/modelFeedback.ts'

test('builds clear feedback for model settings save and delete actions', () => {
  assert.deepEqual(getModelSaveSuccessFeedback('glm-5'), {
    tone: 'success',
    title: '模型已保存',
    message: 'glm-5 的配置已写入工作区。',
  })

  assert.deepEqual(getModelSaveErrorFeedback('glm-5'), {
    tone: 'error',
    title: '模型保存失败',
    message: 'glm-5 的配置未能写入工作区，请稍后重试。',
  })

  assert.deepEqual(getModelDeleteSuccessFeedback('gpt-5.4'), {
    tone: 'success',
    title: '模型已删除',
    message: 'gpt-5.4 已从模型库移除。',
  })

  assert.deepEqual(getModelDeleteErrorFeedback('gpt-5.4'), {
    tone: 'error',
    title: '模型删除失败',
    message: 'gpt-5.4 的删除结果未能写入工作区，请稍后重试。',
  })
})
