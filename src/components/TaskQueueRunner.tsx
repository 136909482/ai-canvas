import { useEffect, useMemo, useRef } from 'react'
import { runGenerateTask } from '@/features/generateQueue/orchestrator'
import { useProjectStore } from '@/store/useProjectStore'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import type { GenerateTask } from '@/types'

const IMAGE_TASK_LANE_KEY = 'image-parallel'
const IMAGE_TASK_LANE_LIMIT = 8
const VIDEO_TASK_LANE_KEY = 'video-serial'
const VIDEO_TASK_LANE_LIMIT = 1

function getTaskLane(task: GenerateTask) {
  if (task.kind === 'video') {
    return {
      key: VIDEO_TASK_LANE_KEY,
      limit: VIDEO_TASK_LANE_LIMIT,
    }
  }

  return {
    key: IMAGE_TASK_LANE_KEY,
    limit: IMAGE_TASK_LANE_LIMIT,
  }
}

export function TaskQueueRunner() {
  const tasks = useTaskQueueStore((s) => s.tasks)
  const taskQueueRuntimeVersion = useTaskQueueStore((s) => s.runtimeVersion)
  const isProjectReady = useProjectStore((s) => s.isReady)
  const inFlightTaskIdsRef = useRef<Set<string>>(new Set())
  const runningTasks = useMemo(
    () => tasks.filter((task) => task.status === 'running'),
    [tasks],
  )
  const nextQueuedTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status === 'queued')
        .sort((left, right) => left.createdAt - right.createdAt),
    [tasks],
  )

  useEffect(() => {
    inFlightTaskIdsRef.current.clear()
  }, [taskQueueRuntimeVersion])

  useEffect(() => {
    if (!isProjectReady) {
      return
    }

    if (nextQueuedTasks.length === 0) {
      return
    }

    const laneUsage = new Map<string, number>()

    for (const task of runningTasks) {
      const lane = getTaskLane(task)
      laneUsage.set(lane.key, (laneUsage.get(lane.key) ?? 0) + 1)
    }

    const launchableTasks = nextQueuedTasks.filter((task) => {
      if (inFlightTaskIdsRef.current.has(task.id)) {
        return false
      }

      const lane = getTaskLane(task)
      const currentUsage = laneUsage.get(lane.key) ?? 0

      if (currentUsage >= lane.limit) {
        return false
      }

      laneUsage.set(lane.key, currentUsage + 1)
      return true
    })

    if (launchableTasks.length === 0) {
      return
    }

    for (const task of launchableTasks) {
      inFlightTaskIdsRef.current.add(task.id)
      void runGenerateTask(task.id).finally(() => {
        inFlightTaskIdsRef.current.delete(task.id)
      })
    }
  }, [isProjectReady, nextQueuedTasks, runningTasks])

  return null
}
