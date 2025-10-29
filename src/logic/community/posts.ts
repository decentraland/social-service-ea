import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types/system'
import {
  ICommunityPostsComponent,
  CommunityPost,
  CommunityPostWithLikes,
  CommunityPostWithProfile,
  GetCommunityPostsOptions,
  CommunityPrivacyEnum
} from './types'
import { CommunityNotFoundError, CommunityPostNotFoundError } from './errors'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { normalizeAddress } from '../../utils/address'
import { getProfileName, getProfileUserId, getProfileHasClaimedName, getProfilePictureUrl } from '../profiles'
import { CommunityRole } from '../../types/entities'

const MAX_POST_CONTENT_LENGTH = 1000
const MIN_POST_CONTENT_LENGTH = 1

export function createCommunityPostsComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'communityRoles' | 'catalystClient' | 'logs'>
): ICommunityPostsComponent {
  const { communitiesDb, communityRoles, catalystClient, logs } = components
  const logger = logs.getLogger('community-posts-component')

  function validatePostContent(content: string): void {
    const trimmedContent = content.trim()

    if (trimmedContent.length < MIN_POST_CONTENT_LENGTH) {
      throw new InvalidRequestError('Post content is too short')
    }

    if (trimmedContent.length > MAX_POST_CONTENT_LENGTH) {
      throw new InvalidRequestError('Post content is too long')
    }
  }

  async function aggregatePostsWithProfiles(posts: CommunityPostWithLikes[]): Promise<CommunityPostWithProfile[]> {
    if (posts.length === 0) {
      return []
    }

    const authorAddresses = Array.from(new Set(posts.map((post) => post.authorAddress)))
    const authorProfiles = await catalystClient.getProfiles(authorAddresses)
    const authorProfilesByAddress = new Map(authorProfiles.map((p) => [getProfileUserId(p), p]))

    return posts.map((post) => {
      const profile = authorProfilesByAddress.get(normalizeAddress(post.authorAddress))

      return {
        ...post,
        authorName: profile ? getProfileName(profile) : post.authorAddress,
        authorProfilePictureUrl: profile ? getProfilePictureUrl(profile) : '',
        authorHasClaimedName: profile ? getProfileHasClaimedName(profile) : false
      }
    })
  }

  async function validatePermissionsToLikeAndUnlikePost(
    communityId: string,
    postId: string,
    userAddress: EthAddress
  ): Promise<void> {
    const community = await communitiesDb.getCommunity(communityId, userAddress)
    if (!community) {
      throw new CommunityNotFoundError(communityId)
    }

    if (community.privacy === CommunityPrivacyEnum.Private && community.role === CommunityRole.None) {
      throw new NotAuthorizedError(
        `${userAddress} is not a member of private community ${communityId}. You need to be a member to like/unlike posts in this community.`
      )
    }

    const post = await communitiesDb.getPost(postId)
    if (!post) {
      throw new CommunityPostNotFoundError(postId)
    }
  }

  return {
    async createPost(communityId: string, authorAddress: EthAddress, content: string): Promise<CommunityPost> {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToCreatePost(communityId, authorAddress)

      validatePostContent(content)

      const post = await communitiesDb.createPost({
        communityId,
        authorAddress,
        content: content.trim()
      })

      logger.info('Post created successfully', {
        postId: post.id,
        communityId,
        authorAddress: authorAddress.toLowerCase()
      })

      return post
    },

    async getPosts(
      communityId: string,
      options: GetCommunityPostsOptions
    ): Promise<{ posts: CommunityPostWithProfile[]; total: number }> {
      const community = await communitiesDb.getCommunity(communityId, options.userAddress)
      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      if (community.privacy === CommunityPrivacyEnum.Private && community.role === CommunityRole.None) {
        throw new NotAuthorizedError(
          `${options.userAddress} is not a member of private community ${communityId}. You need to be a member to get posts in this community.`
        )
      }

      const [posts, total] = await Promise.all([
        communitiesDb.getPosts(communityId, options),
        communitiesDb.getPostsCount(communityId)
      ])

      const postsWithProfiles = await aggregatePostsWithProfiles(posts)

      return {
        posts: postsWithProfiles,
        total
      }
    },

    async deletePost(postId: string, deleterAddress: EthAddress): Promise<void> {
      const post = await communitiesDb.getPost(postId)

      if (!post) {
        throw new CommunityPostNotFoundError(postId)
      }

      await communityRoles.validatePermissionToDeletePost(post.communityId, deleterAddress)

      await communitiesDb.deletePost(postId)

      logger.info('Post deleted successfully', {
        postId,
        communityId: post.communityId,
        deleterAddress: deleterAddress.toLowerCase()
      })
    },

    async likePost(communityId: string, postId: string, userAddress: EthAddress): Promise<void> {
      const normalizedUserAddress = normalizeAddress(userAddress)
      await validatePermissionsToLikeAndUnlikePost(communityId, postId, normalizedUserAddress)

      await communitiesDb.likePost(postId, normalizedUserAddress)

      logger.info('Post liked successfully', {
        postId,
        userAddress: normalizedUserAddress,
        communityId
      })
    },

    async unlikePost(communityId: string, postId: string, userAddress: EthAddress): Promise<void> {
      const normalizedUserAddress = normalizeAddress(userAddress)
      await validatePermissionsToLikeAndUnlikePost(communityId, postId, normalizedUserAddress)

      await communitiesDb.unlikePost(postId, normalizedUserAddress)

      logger.info('Post unliked successfully', {
        postId,
        userAddress: normalizedUserAddress,
        communityId
      })
    }
  }
}
