import v8 from 'v8'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { ILoggerComponent } from '@well-known-components/interfaces'

const BYTES_TO_MB = 1024 * 1024

interface MemoryStats {
  [key: string]: string
  rss: string
  heapTotal: string
  heapUsed: string
  external: string
  arrayBuffers: string
  heapSizeLimit: string
  totalAvailableSize: string
  usedHeapPercentage: string
}

export function getMemoryStats(): MemoryStats {
  const memUsage = process.memoryUsage()
  const heapStats = v8.getHeapStatistics()

  return {
    rss: `${(memUsage.rss / BYTES_TO_MB).toFixed(2)} MB`,
    heapTotal: `${(memUsage.heapTotal / BYTES_TO_MB).toFixed(2)} MB`,
    heapUsed: `${(memUsage.heapUsed / BYTES_TO_MB).toFixed(2)} MB`,
    external: `${(memUsage.external / BYTES_TO_MB).toFixed(2)} MB`,
    arrayBuffers: `${(memUsage.arrayBuffers / BYTES_TO_MB).toFixed(2)} MB`,
    heapSizeLimit: `${(heapStats.heap_size_limit / BYTES_TO_MB).toFixed(2)} MB`,
    totalAvailableSize: `${(heapStats.total_available_size / BYTES_TO_MB).toFixed(2)} MB`,
    usedHeapPercentage: `${((heapStats.used_heap_size / heapStats.heap_size_limit) * 100).toFixed(2)}%`
  }
}

/**
 * Takes a V8 heap snapshot and writes it to disk.
 * The resulting .heapsnapshot file can be loaded in Chrome DevTools (Memory tab)
 * to inspect object allocations, retainers, and find memory leaks.
 *
 * @see https://www.toptal.com/developers/nodejs/debugging-memory-leaks-node-js-applications
 */
export function takeHeapSnapshot(outputDir = 'heapdumps'): string {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `heapdump-${timestamp}.heapsnapshot`
  const filepath = join(outputDir, filename)

  const snapshotStream = v8.writeHeapSnapshot(filepath)

  return snapshotStream || filepath
}

/**
 * Starts periodic memory stats logging.
 * Useful for identifying gradual memory growth patterns typical of leaks.
 *
 * Run the server with --trace-gc to also see GC activity in the console:
 *   node --trace-gc --inspect dist/index.js
 */
export function startMemoryMonitoring(
  logger: ILoggerComponent.ILogger,
  intervalMs = 30_000
): { stop: () => void } {
  let previous = process.memoryUsage()

  const intervalId = setInterval(() => {
    const current = process.memoryUsage()
    const stats = getMemoryStats()
    const heapDelta = ((current.heapUsed - previous.heapUsed) / BYTES_TO_MB).toFixed(2)
    const rssDelta = ((current.rss - previous.rss) / BYTES_TO_MB).toFixed(2)

    logger.info('Memory stats', {
      ...stats,
      heapDelta: `${heapDelta} MB`,
      rssDelta: `${rssDelta} MB`
    })

    previous = current
  }, intervalMs)

  // Log initial stats immediately
  logger.info('Memory monitoring started', getMemoryStats())

  return {
    stop: () => clearInterval(intervalId)
  }
}
