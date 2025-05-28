import { Router } from '@well-known-components/http-server'
import { errorHandler } from '@dcl/platform-server-commons'
import { GlobalContext } from '../../types'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getCommunityMembersHandler } from '../handlers/get-community-members-handler'

export async function setupHttpRoutes(context: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  const {
    components: { fetcher }
  } = context

  const signedFetchMiddleware = wellKnownComponents({
    fetcher,
    optional: false,
    onError: (err: any) => ({
      error: err.message,
      message: 'This endpoint requires a signed fetch request. See ADR-44.'
    })
  })

  router.use(errorHandler)

  router.get('/communities/:communityId/members', signedFetchMiddleware, getCommunityMembersHandler)

  return router
}
