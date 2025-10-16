import { HttpRequest, HttpResponse } from '@well-known-components/uws-http-server'
import { AppComponents, IHandler } from '../../types'

export function createProfilingWrapper(components: AppComponents) {
  return function wrapWithProfiling(h: IHandler) {
    return async (res: HttpResponse, req: HttpRequest) => {
      const { profiling } = components

      // Create a profiler name based on method and path
      const method = req.getMethod()
      const profilerName = `${method} ${h.path}`

      // Extract context information for profiling
      const profilingContext = {
        method,
        path: h.path,
        userAgent: req.getHeader('user-agent') || 'unknown',
        address: req.getHeader('x-forwarded-for') || 'unknown'
      }

      return await profiling.withProfiling(
        profilerName,
        async () => {
          return await h.f(res, req)
        },
        profilingContext
      )
    }
  }
}
