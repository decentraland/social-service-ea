import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../../types'
import { errorHandler } from '@dcl/platform-server-commons'
import { getCommunityHandler } from '../handlers/http/get-community-handler'
import { getCommunitiesHandler } from '../handlers/http/get-communities-handler'
import { deleteCommunityHandler } from '../handlers/http/delete-community-handler'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getCommunityMembersHandler } from '../handlers/http/get-community-members-handlers'
import { getMemberCommunitiesHandler } from '../handlers/http/get-member-communities-handlers'
import { removeMemberFromCommunityHandler } from '../handlers/http/remove-member-from-community-handler'
import { createCommunityHandler } from '../handlers/http/create-community-handler'
import { addMemberToCommunityHandler } from '../handlers/http/add-member-to-community-handler'
import { unbanMemberHandler } from '../handlers/http/unban-member-handler'
import { banMemberHandler } from '../handlers/http/ban-member-handler'
import { getBannedMembersHandler } from '../handlers/http/get-banned-members-handler'
import { createReferralHandler } from '../handlers/http/create-referral-handler'
import { updateReferralSignedUpHandler } from '../handlers/http/update-referral-signed-up-handler'
import { getInvitedUsersAcceptedHandler } from '../handlers/http/get-invited-users-accepted-handler'
import { updateMemberRoleHandler } from '../handlers/http/update-member-role-handler'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'
import { getCommunityPlacesHandler } from '../handlers/http/get-community-places-handler'
import { addCommunityPlacesHandler } from '../handlers/http/add-community-places-handler'
import { removeCommunityPlaceHandler } from '../handlers/http/remove-community-place-handler'
import { updateCommunityHandler } from '../handlers/http/update-community-handler'

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
  router.get('/v1/communities/:id/members', signedFetchMiddleware({ optional: true }), getCommunityMembersHandler)

  router.post('/v1/communities/:id/members', signedFetchMiddleware(), addMemberToCommunityHandler)
  router.delete('/v1/communities/:id/members/:memberAddress', signedFetchMiddleware(), removeMemberFromCommunityHandler)
  router.patch('/v1/communities/:id/members/:address', signedFetchMiddleware(), updateMemberRoleHandler)

  router.get('/v1/communities/:id/bans', signedFetchMiddleware(), getBannedMembersHandler)
  router.post('/v1/communities/:id/members/:memberAddress/bans', signedFetchMiddleware(), banMemberHandler)
  router.delete('/v1/communities/:id/members/:memberAddress/bans', signedFetchMiddleware(), unbanMemberHandler)

  router.get('/v1/members/:address/communities', signedFetchMiddleware(), getMemberCommunitiesHandler)

  router.post('/v1/communities', signedFetchMiddleware(), multipartParserWrapper(createCommunityHandler))
  router.put('/v1/communities/:id', signedFetchMiddleware(), multipartParserWrapper(updateCommunityHandler))
  router.delete('/v1/communities/:id', signedFetchMiddleware(), deleteCommunityHandler)

  router.get('/v1/communities/:id/places', signedFetchMiddleware({ optional: true }), getCommunityPlacesHandler)
  router.post('/v1/communities/:id/places', signedFetchMiddleware(), addCommunityPlacesHandler)
  router.delete('/v1/communities/:id/places/:placeId', signedFetchMiddleware(), removeCommunityPlaceHandler)

  router.post('/v1/referral-progress', signedFetchMiddleware(), createReferralHandler)
  router.patch('/v1/referral-progress', signedFetchMiddleware(), updateReferralSignedUpHandler)
  router.get('/v1/referral-progress', signedFetchMiddleware(), getInvitedUsersAcceptedHandler)

  return router
}
