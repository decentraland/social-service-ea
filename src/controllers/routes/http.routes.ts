import { IHttpServerComponent } from '@dcl/core-commons'
import { Router } from '@dcl/http-server'
import { GlobalContext } from '../../types'
import { bearerTokenMiddleware, errorHandler } from '@dcl/http-commons'
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
  getMemberCommunitiesByIdsHandler,
  addUserMuteHandler,
  removeUserMuteHandler,
  getUserMutesHandler,
  getCommunityV2Handler,
  getCommunitiesV2Handler,
  getCommunityMembersV2Handler,
  getBannedMembersV2Handler,
  getCommunityRequestsV2Handler,
  getMemberRequestsV2Handler,
  getCommunityPostsV2Handler
} from '../handlers/http'
import { wellKnownComponents } from '@dcl/crypto-middleware'
import { multipartParserWrapper } from '../../utils/multipart'
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

  router.get('/v1/members/:address/communities', signedFetchMiddleware({ optional: true }), getMemberCommunitiesHandler)

  if (API_ADMIN_TOKEN) {
    router.post(
      '/v1/members/:address/communities',
      bearerTokenMiddleware(API_ADMIN_TOKEN),
      schemaValidator.withSchemaValidatorMiddleware(GetMemberCommunitiesByIdsSchema),
      getMemberCommunitiesByIdsHandler
    )
  }
  router.get('/v1/members/:address/requests', signedFetchMiddleware(), getMemberRequestsHandler)
  router.get('/v1/communities/:id/requests', signedFetchMiddleware(), getCommunityRequestsHandler)

  router.get('/v1/members/:address/invites', signedFetchMiddleware(), getCommunityInvitesHandler)

  // The multipart wrapper enriches the context with the parsed form data but is otherwise
  // path/verification-agnostic, so cast to the route handler type expected by the router.
  router.post(
    '/v1/communities',
    signedFetchMiddleware(),
    multipartParserWrapper(createCommunityHandler) as unknown as IHttpServerComponent.IRequestHandler<GlobalContext>
  )
  router.put(
    '/v1/communities/:id',
    signedFetchMiddleware(),
    multipartParserWrapper(updateCommunityHandler) as unknown as IHttpServerComponent.IRequestHandler<GlobalContext>
  )
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

  // User mute routes
  router.get('/v1/mutes', signedFetchMiddleware(), getUserMutesHandler)
  router.post('/v1/mutes', signedFetchMiddleware(), addUserMuteHandler)
  router.delete('/v1/mutes', signedFetchMiddleware(), removeUserMuteHandler)

  // Community voice chats
  router.get('/v1/community-voice-chats/active', signedFetchMiddleware(), getActiveCommunityVoiceChatsHandler)

  // Moderation endpoints
  router.get('/v1/moderation/communities', signedFetchMiddleware(), getAllCommunitiesForModerationHandler)

  // v2 endpoints: same behavior as their v1 counterparts but the responses contain only
  // addresses (no Catalyst profile information). Same middleware as the v1 routes.
  router.get('/v2/communities/:id', signedFetchMiddleware({ optional: true }), getCommunityV2Handler)
  router.get('/v2/communities', signedFetchMiddleware({ optional: true }), getCommunitiesV2Handler)
  router.get('/v2/communities/:id/members', signedFetchMiddleware({ optional: true }), getCommunityMembersV2Handler)
  router.get('/v2/communities/:id/bans', signedFetchMiddleware(), getBannedMembersV2Handler)
  router.get('/v2/members/:address/requests', signedFetchMiddleware(), getMemberRequestsV2Handler)
  router.get('/v2/communities/:id/requests', signedFetchMiddleware(), getCommunityRequestsV2Handler)
  router.get('/v2/communities/:id/posts', signedFetchMiddleware({ optional: true }), getCommunityPostsV2Handler)

  return router
}
