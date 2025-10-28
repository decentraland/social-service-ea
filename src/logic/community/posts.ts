import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types/system'
import {
  ICommunityPostsComponent,
  CommunityPost,
  CommunityPostWithProfile,
  GetCommunityPostsOptions,
  CommunityPrivacyEnum
} from './types'
import { CommunityNotFoundError, CommunityPostNotFoundError } from './errors'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { normalizeAddress } from '../../utils/address'
import { getProfileName, getProfileUserId, getProfileHasClaimedName, getProfilePictureUrl } from '../profiles'

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

  async function aggregatePostsWithProfiles(
    posts: CommunityPost[],
    userAddress?: EthAddress
  ): Promise<CommunityPostWithProfile[]> {
    if (posts.length === 0) {
      return []
    }

    const authorAddresses = [...new Set(posts.map((post) => post.authorAddress))]

    const list = await catalystClient.getProfiles(authorAddresses)

    const byAddr = new Map(list.map((p) => [getProfileUserId(p), p]))

    const postIds = posts.map((post) => post.id)
    const [likesCounts, userLikes] = await Promise.all([
      Promise.all(postIds.map((postId) => communitiesDb.getPostLikesCount(postId))),
      userAddress
        ? Promise.all(postIds.map((postId) => communitiesDb.isPostLikedByUser(postId, userAddress)))
        : Promise.resolve([])
    ])

    const likesCountMap = new Map(postIds.map((postId, index) => [postId, likesCounts[index]]))
    const userLikesMap = userAddress ? new Map(postIds.map((postId, index) => [postId, userLikes[index]])) : new Map()

    return posts.map((post) => {
      const profile = byAddr.get(normalizeAddress(post.authorAddress))

      return {
        ...post,
        authorName: profile ? getProfileName(profile) : post.authorAddress,
        authorProfilePictureUrl: profile ? getProfilePictureUrl(profile) : '',
        authorHasClaimedName: profile ? getProfileHasClaimedName(profile) : false,
        likesCount: likesCountMap.get(post.id) || 0,
        isLikedByUser: userAddress ? userLikesMap.get(post.id) : undefined
      }
    })
  }

  return {
    async createPost(communityId: string, authorAddress: EthAddress, content: string): Promise<CommunityPost> {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToCreatePost(communityId, authorAddress)

      validatePostContent(content)

      try {
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
      } catch (error) {
        logger.error('Failed to create post', {
          error: error instanceof Error ? error.message : String(error),
          communityId,
          authorAddress: authorAddress.toLowerCase()
        })
        throw error
      }
    },

    async getPosts(
      communityId: string,
      options: GetCommunityPostsOptions
    ): Promise<{ posts: CommunityPostWithProfile[]; total: number }> {
      const community = await communitiesDb.getCommunity(communityId)
      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      if (community.privacy === CommunityPrivacyEnum.Private) {
        if (!options.userAddress) {
          throw new NotAuthorizedError('Membership required for private communities')
        }
        const isMember = await communitiesDb.isMemberOfCommunity(communityId, options.userAddress)
        if (!isMember) {
          throw new NotAuthorizedError(
            `User ${options.userAddress} is not a member of private community ${communityId}`
          )
        }
      }

      try {
        const [posts, total] = await Promise.all([
          communitiesDb.getPosts(communityId, options.pagination),
          communitiesDb.getPostsCount(communityId)
        ])

        const postsWithProfiles = await aggregatePostsWithProfiles(posts, options.userAddress)

        return {
          posts: postsWithProfiles,
          total
        }
      } catch (error) {
        logger.error('Failed to get posts', {
          error: error instanceof Error ? error.message : String(error),
          communityId
        })
        throw error
      }
    },

    async deletePost(postId: string, deleterAddress: EthAddress): Promise<void> {
      const post = await communitiesDb.getPost(postId)
      if (!post) {
        throw new CommunityPostNotFoundError(postId)
      }

      await communityRoles.validatePermissionToDeletePost(post.communityId, deleterAddress)

      try {
        await communitiesDb.deletePost(postId)

        logger.info('Post deleted successfully', {
          postId,
          communityId: post.communityId,
          deleterAddress: deleterAddress.toLowerCase()
        })
      } catch (error) {
        logger.error('Failed to delete post', {
          error: error instanceof Error ? error.message : String(error),
          postId,
          deleterAddress: deleterAddress.toLowerCase()
        })
        throw error
      }
    },

    async likePost(postId: string, userAddress: EthAddress): Promise<void> {
      try {
        const post = await communitiesDb.getPost(postId)
        if (!post) {
          throw new CommunityPostNotFoundError(postId)
        }

        const community = await communitiesDb.getCommunity(post.communityId)
        if (!community) {
          throw new CommunityNotFoundError(post.communityId)
        }

        if (community.privacy === CommunityPrivacyEnum.Private) {
          const isMember = await communitiesDb.isMemberOfCommunity(post.communityId, userAddress)
          if (!isMember) {
            throw new NotAuthorizedError(`User ${userAddress} is not a member of private community ${post.communityId}`)
          }
        }

        await communitiesDb.likePost(postId, userAddress)

        logger.info('Post liked successfully', {
          postId,
          userAddress: userAddress.toLowerCase(),
          communityId: post.communityId
        })
      } catch (error) {
        logger.error('Failed to like post', {
          error: error instanceof Error ? error.message : String(error),
          postId,
          userAddress: userAddress.toLowerCase()
        })
        throw error
      }
    },

    async unlikePost(postId: string, userAddress: EthAddress): Promise<void> {
      try {
        const post = await communitiesDb.getPost(postId)
        if (!post) {
          throw new CommunityPostNotFoundError(postId)
        }

        await communitiesDb.unlikePost(postId, userAddress)

        logger.info('Post unliked successfully', {
          postId,
          userAddress: userAddress.toLowerCase(),
          communityId: post.communityId
        })
      } catch (error) {
        logger.error('Failed to unlike post', {
          error: error instanceof Error ? error.message : String(error),
          postId,
          userAddress: userAddress.toLowerCase()
        })
        throw error
      }
    }
  }
}
