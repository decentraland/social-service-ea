import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../../types'
import { errorHandler } from '@dcl/platform-server-commons'
import { getCommunityHandler } from '../handlers/get-community-handler'
import { getCommunitiesHandler } from '../handlers/get-communities-handler'
import { deleteCommunityHandler } from '../handlers/delete-community-handler'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getCommunityMembersHandler } from '../handlers/get-community-members-handlers'
import { getMemberCommunitiesHandler } from '../handlers/get-member-communities-handlers'
import { kickMemberHandler } from '../handlers/kick-member-handler'
import { createCommunityHandler } from '../handlers/create-community-handler'

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
  router.get('/v1/communities/:id/members', signedFetchMiddleware(), getCommunityMembersHandler)
  router.delete('/v1/communities/:id/members/:memberAddress', signedFetchMiddleware(), kickMemberHandler)

  router.get('/v1/members/:address/communities', signedFetchMiddleware(), getMemberCommunitiesHandler)

  router.post('/v1/communities', signedFetchMiddleware(), createCommunityHandler)
  router.delete('/v1/communities/:id', signedFetchMiddleware(), deleteCommunityHandler)

  return router
}
