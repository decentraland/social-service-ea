import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../../types'
import { errorHandler } from '@dcl/platform-server-commons'
import { getCommunityHandler } from '../handlers/get-community-handler'
import { deleteCommunityHandler } from '../handlers/delete-community-handler'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'

export async function setupHttpRoutes(context: GlobalContext): Promise<Router<GlobalContext>> {
  const {
    components: { fetcher }
  } = context

  const router = new Router<GlobalContext>()

  const signedFetchMiddleware = (optional: boolean = false) =>
    wellKnownComponents({
      fetcher,
      optional,
      onError: (err: any) => ({
        error: err.message,
        message: 'This endpoint requires a signed fetch request. See ADR-44.'
      })
    })

  router.use(errorHandler)

  router.get('/v1/communities/:id', signedFetchMiddleware(false), getCommunityHandler)
  router.delete('/v1/communities/:id', signedFetchMiddleware(false), deleteCommunityHandler)

  return router
}
