import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types/system'
import {
  ICommunityPostsComponent,
  CommunityPost,
  CommunityPostWithProfile,
  GetCommunityPostsOptions,
  CommunityPrivacyEnum
} from './types'
import {
  CommunityNotFoundError,
  CommunityPostNotFoundError,
  PostContentTooLongError,
  PostContentEmptyError
} from './errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
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
      throw new PostContentEmptyError()
    }

    if (trimmedContent.length > MAX_POST_CONTENT_LENGTH) {
      throw new PostContentTooLongError(trimmedContent.length, MAX_POST_CONTENT_LENGTH)
    }
  }

  async function aggregatePostsWithProfiles(posts: CommunityPost[]): Promise<CommunityPostWithProfile[]> {
    if (posts.length === 0) {
      return []
    }

    // Extract unique author addresses
    const authorAddresses = [...new Set(posts.map((post) => post.authorAddress))]

    // Fetch profiles from Catalyst
    const list = await catalystClient.getProfiles(authorAddresses)

    // Build map from profiles array using userId as key
    const byAddr = new Map(list.map((p) => [getProfileUserId(p), p]))

    // Map posts with profile data
    return posts.map((post) => {
      const profile = byAddr.get(normalizeAddress(post.authorAddress))

      return {
        ...post,
        authorName: profile ? getProfileName(profile) : post.authorAddress,
        authorProfilePictureUrl: profile ? getProfilePictureUrl(profile) : '',
        authorHasClaimedName: profile ? getProfileHasClaimedName(profile) : false
      }
    })
  }

  return {
    async createPost(communityId: string, authorAddress: EthAddress, content: string): Promise<CommunityPost> {
      // Validate community exists
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      // Validate user has permission to create posts
      await communityRoles.validatePermissionToCreatePost(communityId, authorAddress)

      // Validate content
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
      // Fetch community to get privacy information
      const community = await communitiesDb.getCommunity(communityId)
      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      // Branch on privacy
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
      // If community.privacy === 'public': do not perform membership checks

      try {
        // Fetch posts and total count in parallel
        const [posts, total] = await Promise.all([
          communitiesDb.getPosts(communityId, options.pagination),
          communitiesDb.getPostsCount(communityId)
        ])

        // Aggregate posts with author profiles
        const postsWithProfiles = await aggregatePostsWithProfiles(posts)

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
      // Fetch post to get community ID
      const post = await communitiesDb.getPost(postId)
      if (!post) {
        throw new CommunityPostNotFoundError(postId)
      }

      // Validate user has permission to delete posts
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
    }
  }
}
