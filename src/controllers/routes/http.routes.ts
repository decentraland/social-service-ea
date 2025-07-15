import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../../types'
import { errorHandler } from '@dcl/platform-server-commons'
import {
  getCommunityHandler,
  getCommunitiesHandler,
  deleteCommunityHandler,
  getCommunityMembersHandler,
  getMemberCommunitiesHandler,
  removeMemberFromCommunityHandler,
  createCommunityHandler,
  addMemberToCommunityHandler,
  unbanMemberHandler,
  banMemberHandler,
  getBannedMembersHandler,
  createReferralHandler,
  updateReferralSignedUpHandler,
  getInvitedUsersAcceptedHandler,
  updateMemberRoleHandler,
  getCommunityPlacesHandler,
  addCommunityPlacesHandler,
  removeCommunityPlaceHandler,
  updateCommunityHandler,
  addReferralEmailHandler,
  requestToSpeakHandler,
  promoteSpeakerHandler,
  demoteSpeakerHandler,
  kickPlayerHandler
} from '../handlers/http'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'
import { communitiesErrorsHandler } from '../middlewares/communities-errors'

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
  router.use(communitiesErrorsHandler)

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
  router.post('/v1/referral-email', signedFetchMiddleware(), addReferralEmailHandler)

  // Community voice chat actions
  router.post('/v1/communities/:id/voice-chat/request-to-speak', signedFetchMiddleware(), requestToSpeakHandler)
  router.post('/v1/communities/:id/voice-chat/promote-speaker', signedFetchMiddleware(), promoteSpeakerHandler)
  router.post('/v1/communities/:id/voice-chat/demote-speaker', signedFetchMiddleware(), demoteSpeakerHandler)
  router.post('/v1/communities/:id/voice-chat/kick-player', signedFetchMiddleware(), kickPlayerHandler)

  return router
}
