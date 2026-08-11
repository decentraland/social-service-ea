import { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError, NotFoundError, NotAuthorizedError } from '@dcl/http-commons'
import { ITracingComponent } from '../../types'

type ReportingContext = IHttpServerComponent.DefaultContext<{
  components: { tracing: ITracingComponent }
}> & {
  verification?: { auth?: string }
}

/**
 * The errors the shared `errorHandler` maps to a 4xx. They describe a caller mistake rather than a
 * fault of ours, so they stay out of Sentry — the same split the WebSocket auth path draws between
 * rejected credentials and server-side failures.
 */
function isExpectedRequestFailure(error: unknown): boolean {
  return error instanceof InvalidRequestError || error instanceof NotFoundError || error instanceof NotAuthorizedError
}

/**
 * Reports to Sentry the errors that end up as a 500.
 *
 * `errorHandler` from `@dcl/http-commons` swallows every unhandled error into a `logger.warn` and a
 * generic 500, so nothing downstream of it can see what failed — which left all HTTP routes of this
 * service invisible in Sentry. This middleware restores that visibility without changing any
 * response: it observes the error on its way up and rethrows it untouched.
 *
 * Position in the chain matters, and it only works in one place:
 *
 *   errorHandler                 ← builds the response; never rethrows
 *     └─ reportUnhandledErrors   ← here
 *         └─ communitiesErrorsHandler
 *             └─ routes
 *
 * Outside `errorHandler` it would only ever see a finished 500 response, with the error long gone.
 * Inside `communitiesErrorsHandler` it would also catch the community errors that handler maps to
 * 4xx, forcing us to duplicate that list; sitting above it means those never reach us at all.
 */
export async function reportUnhandledErrors(
  ctx: ReportingContext,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: unknown) {
    if (!isExpectedRequestFailure(error)) {
      ctx.components.tracing.captureException(error, {
        address: ctx.verification?.auth,
        method: ctx.request.method,
        // Path only — the query string on these routes carries caller-supplied values.
        url: ctx.url.pathname
      })
    }

    throw error
  }
}
