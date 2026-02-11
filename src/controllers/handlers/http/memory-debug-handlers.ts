import { HandlerContextWithPath, IHandlerResult } from '../../../types'
import { getMemoryStats, takeHeapSnapshot } from '../../../utils/memory-debug'

export async function getMemoryStatsHandler(
  context: Pick<HandlerContextWithPath<'logs', '/debug/memory'>, 'components'>
): Promise<IHandlerResult> {
  const {
    components: { logs }
  } = context
  const logger = logs.getLogger('memory-debug-handler')
  logger.info('Memory stats requested')

  return {
    status: 200,
    body: getMemoryStats()
  }
}

export async function takeHeapSnapshotHandler(
  context: Pick<HandlerContextWithPath<'logs', '/debug/heap-snapshot'>, 'components'>
): Promise<IHandlerResult> {
  const {
    components: { logs }
  } = context
  const logger = logs.getLogger('memory-debug-handler')

  logger.info('Heap snapshot requested')
  const filepath = takeHeapSnapshot()
  logger.info(`Heap snapshot written to ${filepath}`)

  return {
    status: 200,
    body: {
      message: 'Heap snapshot created. Load it in Chrome DevTools > Memory tab.',
      filepath
    }
  }
}

/**
 * Forces a garbage collection cycle (only works when Node.js is started with --expose-gc).
 * Useful before taking heap snapshots to ensure only live objects are captured.
 */
export async function forceGCHandler(
  context: Pick<HandlerContextWithPath<'logs', '/debug/gc'>, 'components'>
): Promise<IHandlerResult> {
  const {
    components: { logs }
  } = context
  const logger = logs.getLogger('memory-debug-handler')

  if (typeof global.gc === 'function') {
    logger.info('Forcing garbage collection')
    global.gc()
    return {
      status: 200,
      body: { message: 'Garbage collection triggered. Check --trace-gc output for details.' }
    }
  }

  return {
    status: 400,
    body: { message: 'GC not exposed. Start Node.js with --expose-gc flag to enable this endpoint.' }
  }
}
