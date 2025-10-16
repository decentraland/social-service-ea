import { IHttpServerComponent } from '@well-known-components/interfaces'
import { GlobalContext } from '../../types'

export async function profilingMiddleware(
  context: IHttpServerComponent.DefaultContext<GlobalContext>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  const { profiling } = context.components
  const { method, url, headers } = context.request

  // Create a profiler name based on method and path
  const urlObj = new URL(url, 'http://localhost')
  const profilerName = `${method} ${urlObj.pathname}`

  // Extract context information for profiling
  const profilingContext = {
    method,
    path: urlObj.pathname,
    userAgent: headers.get('user-agent') || 'unknown',
    address: headers.get('x-forwarded-for') || 'unknown'
  }

  await profiling.withProfiling(profilerName, next, profilingContext)

  return next()
}
