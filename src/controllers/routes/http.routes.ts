import { Router } from '@dcl/http-server'
import { GlobalContext } from '../../types'
import { bearerTokenMiddleware, errorHandler } from '@dcl/platform-server-commons'
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
  updateCommunityPartiallyHandler,
  addReferralEmailHandler,
  getActiveCommunityVoiceChatsHandler,
  getMemberRequestsHandler,
  getCommunityRequestsHandler,
  getManagedCommunitiesHandler,
  createCommunityRequestHandler,
  updateCommunityRequestStatusHandler,
  getCommunityInvitesHandler,
  getAllCommunitiesForModerationHandler,
  createCommunityPostHandler,
  getCommunityPostsHandler,
  deleteCommunityPostHandler,
  likeCommunityPostHandler,
  unlikeCommunityPostHandler,
  searchCommunitiesHandler,
  getMemberCommunitiesByIdsHandler
} from '../handlers/http'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'
import { communitiesErrorsHandler } from '../middlewares/communities-errors'
import {
  UpdateMemberRoleSchema,
  UpdateCommunityPartiallySchema,
  AddCommunityPlacesSchema,
  CreateCommunityPostSchema,
  CreateReferralSchema,
  AddReferralEmailSchema,
  CreateCommunityRequestSchema,
  UpdateCommunityRequestStatusSchema,
  GetMemberCommunitiesByIdsSchema
} from '../handlers/http/schemas'

export async function setupHttpRoutes(context: GlobalContext): Promise<Router<GlobalContext>> {
  const {
    components: { fetcher, config, schemaValidator }
  } = context

  const API_ADMIN_TOKEN = await config.getString('API_ADMIN_TOKEN')
  const router = new Router<GlobalContext>()

  const signedFetchMiddleware = ({ optional = false }: { optional?: boolean } = {}) =>
    wellKnownComponents({
      fetcher,
      optional,
      onError: (err: any) => ({
        error: err.message,
        message: 'This endpoint requires a signed fetch request. See ADR-44.'
      }),
      metadataValidator: (metadata) => metadata?.signer !== 'decentraland-kernel-scene' // prevent requests from scenes
    })

  router.use(errorHandler)
  router.use(communitiesErrorsHandler)

  if (API_ADMIN_TOKEN) {
    router.get('/v1/communities/:address/managed', bearerTokenMiddleware(API_ADMIN_TOKEN), getManagedCommunitiesHandler)
  }

  router.get('/v1/communities/search', signedFetchMiddleware({ optional: true }), searchCommunitiesHandler)
  router.get('/v1/communities/:id', signedFetchMiddleware({ optional: true }), getCommunityHandler)
  router.get('/v1/communities', signedFetchMiddleware({ optional: true }), getCommunitiesHandler)
  router.get('/v1/communities/:id/members', signedFetchMiddleware({ optional: true }), getCommunityMembersHandler)

  router.post('/v1/communities/:id/members', signedFetchMiddleware(), addMemberToCommunityHandler)
  router.delete('/v1/communities/:id/members/:memberAddress', signedFetchMiddleware(), removeMemberFromCommunityHandler)
  router.patch(
    '/v1/communities/:id/members/:address',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(UpdateMemberRoleSchema),
    updateMemberRoleHandler
  )

  router.get('/v1/communities/:id/bans', signedFetchMiddleware(), getBannedMembersHandler)
  router.post('/v1/communities/:id/members/:memberAddress/bans', signedFetchMiddleware(), banMemberHandler)
  router.delete('/v1/communities/:id/members/:memberAddress/bans', signedFetchMiddleware(), unbanMemberHandler)

  router.get('/v1/members/:address/communities', signedFetchMiddleware(), getMemberCommunitiesHandler)
  router.post(
    '/v1/members/:address/communities',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(GetMemberCommunitiesByIdsSchema),
    getMemberCommunitiesByIdsHandler
  )
  router.get('/v1/members/:address/requests', signedFetchMiddleware(), getMemberRequestsHandler)
  router.get('/v1/communities/:id/requests', signedFetchMiddleware(), getCommunityRequestsHandler)

  router.get('/v1/members/:address/invites', signedFetchMiddleware(), getCommunityInvitesHandler)

  router.post('/v1/communities', signedFetchMiddleware(), multipartParserWrapper(createCommunityHandler))
  router.put('/v1/communities/:id', signedFetchMiddleware(), multipartParserWrapper(updateCommunityHandler))
  router.patch(
    '/v1/communities/:id',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(UpdateCommunityPartiallySchema),
    updateCommunityPartiallyHandler
  )
  router.delete('/v1/communities/:id', signedFetchMiddleware(), deleteCommunityHandler)

  router.get('/v1/communities/:id/places', signedFetchMiddleware({ optional: true }), getCommunityPlacesHandler)
  router.post(
    '/v1/communities/:id/places',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(AddCommunityPlacesSchema),
    addCommunityPlacesHandler
  )
  router.delete('/v1/communities/:id/places/:placeId', signedFetchMiddleware(), removeCommunityPlaceHandler)

  // Community Posts
  router.get('/v1/communities/:id/posts', signedFetchMiddleware({ optional: true }), getCommunityPostsHandler)
  router.post(
    '/v1/communities/:id/posts',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(CreateCommunityPostSchema),
    createCommunityPostHandler
  )
  router.delete('/v1/communities/:id/posts/:postId', signedFetchMiddleware(), deleteCommunityPostHandler)
  router.post('/v1/communities/:id/posts/:postId/like', signedFetchMiddleware(), likeCommunityPostHandler)
  router.delete('/v1/communities/:id/posts/:postId/like', signedFetchMiddleware(), unlikeCommunityPostHandler)

  router.post(
    '/v1/referral-progress',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(CreateReferralSchema),
    createReferralHandler
  )
  router.patch('/v1/referral-progress', signedFetchMiddleware(), updateReferralSignedUpHandler)
  router.get('/v1/referral-progress', signedFetchMiddleware(), getInvitedUsersAcceptedHandler)
  router.post(
    '/v1/referral-email',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(AddReferralEmailSchema),
    addReferralEmailHandler
  )

  router.post(
    '/v1/communities/:id/requests',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(CreateCommunityRequestSchema),
    createCommunityRequestHandler
  )
  router.patch(
    '/v1/communities/:id/requests/:requestId',
    signedFetchMiddleware(),
    schemaValidator.withSchemaValidatorMiddleware(UpdateCommunityRequestStatusSchema),
    updateCommunityRequestStatusHandler
  )

  // Community voice chats
  router.get('/v1/community-voice-chats/active', signedFetchMiddleware(), getActiveCommunityVoiceChatsHandler)

  // Moderation endpoints
  router.get('/v1/moderation/communities', signedFetchMiddleware(), getAllCommunitiesForModerationHandler)

  return router
}
