import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../../types'
import { errorHandler } from '@dcl/platform-server-commons'
import { getCommunityHandler } from '../handlers/get-community-handler'
import { getCommunitiesHandler } from '../handlers/get-communities-handler'
import { deleteCommunityHandler } from '../handlers/delete-community-handler'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getCommunityMembersHandler } from '../handlers/get-community-members-handlers'
import { getMemberCommunitiesHandler } from '../handlers/get-member-communities-handlers'
import { removeMemberFromCommunityHandler } from '../handlers/remove-member-from-community-handler'
import { createCommunityHandler } from '../handlers/create-community-handler'
import { addMemberToCommunityHandler } from '../handlers/add-member-to-community-handler'
import { unbanMemberHandler } from '../handlers/unban-member-handler'
import { banMemberHandler } from '../handlers/ban-member-handler'
import { getBannedMembersHandler } from '../handlers/get-banned-members-handler'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'

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

  router.post('/v1/communities/:id/members', signedFetchMiddleware(), addMemberToCommunityHandler)
  router.delete('/v1/communities/:id/members/:memberAddress', signedFetchMiddleware(), removeMemberFromCommunityHandler)

  router.get('/v1/communities/:id/bans', signedFetchMiddleware(), getBannedMembersHandler)
  router.post('/v1/communities/:id/members/:memberAddress/bans', signedFetchMiddleware(), banMemberHandler)
  router.delete('/v1/communities/:id/members/:memberAddress/bans', signedFetchMiddleware(), unbanMemberHandler)

  router.get('/v1/members/:address/communities', signedFetchMiddleware(), getMemberCommunitiesHandler)

  router.post('/v1/communities', signedFetchMiddleware(), multipartParserWrapper(createCommunityHandler))
  router.delete('/v1/communities/:id', signedFetchMiddleware(), deleteCommunityHandler)

  return router
}
