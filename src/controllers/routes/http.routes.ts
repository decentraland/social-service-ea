import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../../types'
import { errorHandler } from '@dcl/platform-server-commons'
import { getCommunityHandler } from '../handlers/get-community-handler'
import { getCommunitiesHandler } from '../handlers/get-communities-handler'
import { deleteCommunityHandler } from '../handlers/delete-community-handler'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getCommunityMembersHandler } from '../handlers/get-community-members-handlers'

export async function setupHttpRoutes(context: GlobalContext): Promise<Router<GlobalContext>> {
  const {
    components: { fetcher }
  } = context

  const router = new Router<GlobalContext>()

  const signedFetchMiddleware = ({ optional = false }: { optional?: boolean } = {}) =>
    wellKnownComponents({
      fetcher,
      optional,
      onError: (err: any) => ({
        error: err.message,
        message: 'This endpoint requires a signed fetch request. See ADR-44.'
      })
    })

  router.use(errorHandler)

  router.get('/v1/communities/:id', signedFetchMiddleware(), getCommunityHandler)
  router.get('/v1/communities', signedFetchMiddleware({ optional: true }), getCommunitiesHandler)
  router.delete('/v1/communities/:id', signedFetchMiddleware(), deleteCommunityHandler)

  router.get('/v1/communities/:id/members', signedFetchMiddleware(), getCommunityMembersHandler)

  return router
}
