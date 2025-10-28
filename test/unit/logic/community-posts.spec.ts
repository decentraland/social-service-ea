import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError, CommunityPostNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockCatalystClient, createLogsMockedComponent } from '../../mocks/components'
import { createCommunityPostsComponent } from '../../../src/logic/community/posts'
import {
  ICommunityPostsComponent,
  ICommunityRolesComponent,
  CommunityPost,
  CommunityPostWithProfile,
  GetCommunityPostsOptions,
  CommunityPrivacyEnum
} from '../../../src/logic/community/types'
import { CommunityRole } from '../../../src/types/entities'
import { createMockCommunityRolesComponent } from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('Community Posts Component', () => {
  let postsComponent: ICommunityPostsComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockUserAddress: string
  let mockCommunityId: string
  let mockPostId: string

  const mockCommunity = {
    id: 'test-community',
    name: 'Test Community',
    description: 'Test Description',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    privacy: CommunityPrivacyEnum.Public,
    active: true,
    role: CommunityRole.Member
  }

  const mockPost: CommunityPost = {
    id: 'test-post',
    communityId: 'test-community',
    authorAddress: '0x1234567890123456789012345678901234567890',
    content: 'Test post content',
    createdAt: '2023-01-01T00:00:00Z'
  }

  beforeEach(() => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityId = 'test-community'
    mockPostId = 'test-post'

    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockLogs = createLogsMockedComponent({})

    postsComponent = createCommunityPostsComponent({
      communitiesDb: mockCommunitiesDB,
      communityRoles: mockCommunityRoles,
      catalystClient: mockCatalystClient,
      logs: mockLogs
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when creating a post', () => {
    const content = 'This is a test post content'
    const authorAddress = '0x1234567890123456789012345678901234567890'

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunityRoles.validatePermissionToCreatePost.mockResolvedValue()
        mockCommunitiesDB.createPost.mockResolvedValue(mockPost)
      })

      it('should create post successfully', async () => {
        const result = await postsComponent.createPost(mockCommunityId, authorAddress, content)

        expect(result).toEqual(mockPost)
        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(mockCommunityId)
        expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
        expect(mockCommunitiesDB.createPost).toHaveBeenCalledWith({
          communityId: mockCommunityId,
          authorAddress,
          content: content.trim()
        })
      })

      it('should trim content before creating post', async () => {
        const contentWithWhitespace = '  This is a test post content  '

        await postsComponent.createPost(mockCommunityId, authorAddress, contentWithWhitespace)

        expect(mockCommunitiesDB.createPost).toHaveBeenCalledWith({
          communityId: mockCommunityId,
          authorAddress,
          content: 'This is a test post content'
        })
      })

      describe('and the content is empty', () => {
        beforeEach(() => {
          mockCommunitiesDB.communityExists.mockResolvedValue(true)
          mockCommunityRoles.validatePermissionToCreatePost.mockResolvedValue()
        })

        it('should throw PostContentEmptyError for empty string', async () => {
          await expect(postsComponent.createPost(mockCommunityId, authorAddress, '')).rejects.toThrow(
            new InvalidRequestError('Post content is too short')
          )

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
          expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
        })

        it('should throw InvalidRequestError for whitespace only', async () => {
          await expect(postsComponent.createPost(mockCommunityId, authorAddress, '   ')).rejects.toThrow(
            new InvalidRequestError('Post content is too short')
          )

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
          expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
        })
      })

      describe('and the content is too long', () => {
        beforeEach(() => {
          mockCommunitiesDB.communityExists.mockResolvedValue(true)
          mockCommunityRoles.validatePermissionToCreatePost.mockResolvedValue()
        })

        it('should throw InvalidRequestError for content exceeding 1000 characters', async () => {
          const longContent = 'a'.repeat(1001)

          await expect(postsComponent.createPost(mockCommunityId, authorAddress, longContent)).rejects.toThrow(
            new InvalidRequestError('Post content is too long')
          )

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
          expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
        })

        it('should allow content with exactly 1000 characters', async () => {
          const maxContent = 'a'.repeat(1000)

          await postsComponent.createPost(mockCommunityId, authorAddress, maxContent)

          expect(mockCommunitiesDB.createPost).toHaveBeenCalledWith({
            communityId: mockCommunityId,
            authorAddress,
            content: maxContent
          })
        })
      })

      describe('and the user does not have permission to create posts', () => {
        beforeEach(() => {
          mockCommunitiesDB.communityExists.mockResolvedValue(true)
          mockCommunityRoles.validatePermissionToCreatePost.mockRejectedValue(
            new NotAuthorizedError(`The user ${authorAddress} doesn't have permission to create posts in the community`)
          )
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(postsComponent.createPost(mockCommunityId, authorAddress, content)).rejects.toThrow(
            new NotAuthorizedError(`The user ${authorAddress} doesn't have permission to create posts in the community`)
          )

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
          expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.communityExists.mockResolvedValue(true)
          mockCommunityRoles.validatePermissionToCreatePost.mockResolvedValue()
          mockCommunitiesDB.createPost.mockRejectedValue(new Error('Database error'))
        })

        it('should log error and rethrow', async () => {
          await expect(postsComponent.createPost(mockCommunityId, authorAddress, content)).rejects.toThrow(
            'Database error'
          )

          const logger = mockLogs.getLogger('community-posts-component')
          expect(logger.error).toHaveBeenCalledWith('Failed to create post', {
            error: 'Database error',
            communityId: mockCommunityId,
            authorAddress: authorAddress.toLowerCase()
          })
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(postsComponent.createPost(mockCommunityId, authorAddress, content)).rejects.toThrow(
          new CommunityNotFoundError(mockCommunityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(mockCommunityId)
        expect(mockCommunityRoles.validatePermissionToCreatePost).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting posts', () => {
    let options: GetCommunityPostsOptions

    describe('and the community exists', () => {
      beforeEach(() => {
        options = {
          pagination: { limit: 10, offset: 0 },
          userAddress: mockUserAddress
        }
        mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
        mockCommunitiesDB.getPosts.mockResolvedValue([mockPost])
        mockCommunitiesDB.getPostsCount.mockResolvedValue(1)
        mockCatalystClient.getProfiles.mockResolvedValue([createMockProfile(mockUserAddress)])
      })

      describe('and the community is public', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
        })

        it('should return posts with profiles without membership check', async () => {
          const result = await postsComponent.getPosts(mockCommunityId, options)

          expect(result.posts).toHaveLength(1)
          expect(result.total).toBe(1)
          expect(result.posts[0]).toMatchObject({
            ...mockPost,
            authorName: expect.any(String),
            authorProfilePictureUrl: expect.any(String),
            authorHasClaimedName: expect.any(Boolean)
          })

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.getPosts).toHaveBeenCalledWith(mockCommunityId, options.pagination)
          expect(mockCommunitiesDB.getPostsCount).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([mockUserAddress])
        })

        it('should work without userAddress for public communities', async () => {
          const optionsWithoutUser = { pagination: { limit: 10, offset: 0 } }

          const result = await postsComponent.getPosts(mockCommunityId, optionsWithoutUser)

          expect(result.posts).toHaveLength(1)
          expect(result.total).toBe(1)
          expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and the community is private', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Private,
            role: CommunityRole.Member
          })
        })

        describe('and user is a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)
          })

          it('should return posts with profiles for members', async () => {
            const result = await postsComponent.getPosts(mockCommunityId, options)

            expect(result.posts).toHaveLength(1)
            expect(result.total).toBe(1)
            expect(result.posts[0]).toMatchObject({
              ...mockPost,
              authorName: expect.any(String),
              authorProfilePictureUrl: expect.any(String),
              authorHasClaimedName: expect.any(Boolean)
            })

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(mockCommunityId, mockUserAddress)
            expect(mockCommunitiesDB.getPosts).toHaveBeenCalledWith(mockCommunityId, options.pagination)
            expect(mockCommunitiesDB.getPostsCount).toHaveBeenCalledWith(mockCommunityId)
            expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([mockUserAddress])
          })
        })

        describe('and user is not a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(false)
          })

          it('should throw NotAuthorizedError for non-members', async () => {
            await expect(postsComponent.getPosts(mockCommunityId, options)).rejects.toThrow(
              new NotAuthorizedError(`User ${mockUserAddress} is not a member of private community ${mockCommunityId}`)
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(mockCommunityId, mockUserAddress)
            expect(mockCommunitiesDB.getPosts).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.getPostsCount).not.toHaveBeenCalled()
          })
        })

        describe('and no userAddress is provided', () => {
          const optionsWithoutUser = { pagination: { limit: 10, offset: 0 } }

          it('should throw NotAuthorizedError', async () => {
            await expect(postsComponent.getPosts(mockCommunityId, optionsWithoutUser)).rejects.toThrow(
              new NotAuthorizedError('Membership required for private communities')
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.getPosts).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.getPostsCount).not.toHaveBeenCalled()
          })
        })
      })

      describe('and there are no posts', () => {
        beforeEach(() => {
          mockCommunitiesDB.getPosts.mockResolvedValue([])
          mockCommunitiesDB.getPostsCount.mockResolvedValue(0)
        })

        it('should return empty posts array', async () => {
          const result = await postsComponent.getPosts(mockCommunityId, options)

          expect(result.posts).toEqual([])
          expect(result.total).toBe(0)
          expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
        })
      })

      describe('and there are multiple posts from different authors', () => {
        const secondAuthor = '0x9876543210987654321098765432109876543210'
        const mockPosts: CommunityPost[] = [
          mockPost,
          {
            ...mockPost,
            id: 'test-post-2',
            authorAddress: secondAuthor,
            content: 'Second post content'
          }
        ]

        beforeEach(() => {
          mockCommunitiesDB.getPosts.mockResolvedValue(mockPosts)
          mockCommunitiesDB.getPostsCount.mockResolvedValue(2)
          mockCatalystClient.getProfiles.mockResolvedValue([
            createMockProfile(mockUserAddress),
            createMockProfile(secondAuthor)
          ])
        })

        it('should aggregate posts with profiles from multiple authors', async () => {
          const result = await postsComponent.getPosts(mockCommunityId, options)

          expect(result.posts).toHaveLength(2)
          expect(result.total).toBe(2)
          expect(result.posts[0]).toMatchObject({
            ...mockPosts[0],
            authorName: expect.any(String),
            authorProfilePictureUrl: expect.any(String),
            authorHasClaimedName: expect.any(Boolean)
          })
          expect(result.posts[1]).toMatchObject({
            ...mockPosts[1],
            authorName: expect.any(String),
            authorProfilePictureUrl: expect.any(String),
            authorHasClaimedName: expect.any(Boolean)
          })

          expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([mockUserAddress, secondAuthor])
        })
      })

      describe('and profile fetching fails', () => {
        beforeEach(() => {
          mockCatalystClient.getProfiles.mockRejectedValue(new Error('Profile service error'))
        })

        it('should log error and rethrow', async () => {
          await expect(postsComponent.getPosts(mockCommunityId, options)).rejects.toThrow('Profile service error')

          const logger = mockLogs.getLogger('community-posts-component')
          expect(logger.error).toHaveBeenCalledWith('Failed to get posts', {
            error: 'Profile service error',
            communityId: mockCommunityId
          })
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(postsComponent.getPosts(mockCommunityId, options)).rejects.toThrow(
          new CommunityNotFoundError(mockCommunityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getPosts).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getPostsCount).not.toHaveBeenCalled()
      })
    })
  })

  describe('when deleting a post', () => {
    const deleterAddress = '0x1234567890123456789012345678901234567890'

    describe('and the post exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
        mockCommunityRoles.validatePermissionToDeletePost.mockResolvedValue()
        mockCommunitiesDB.deletePost.mockResolvedValue()
      })

      it('should delete post successfully', async () => {
        await postsComponent.deletePost(mockPostId, deleterAddress)

        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunityRoles.validatePermissionToDeletePost).toHaveBeenCalledWith(
          mockPost.communityId,
          deleterAddress
        )
        expect(mockCommunitiesDB.deletePost).toHaveBeenCalledWith(mockPostId)
      })

      it('should log successful post deletion', async () => {
        await postsComponent.deletePost(mockPostId, deleterAddress)

        const logger = mockLogs.getLogger('community-posts-component')
        expect(logger.info).toHaveBeenCalledWith('Post deleted successfully', {
          postId: mockPostId,
          communityId: mockPost.communityId,
          deleterAddress: deleterAddress.toLowerCase()
        })
      })

      describe('and the user does not have permission to delete posts', () => {
        beforeEach(() => {
          mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
          mockCommunityRoles.validatePermissionToDeletePost.mockRejectedValue(
            new NotAuthorizedError(
              `The user ${deleterAddress} doesn't have permission to delete posts from the community`
            )
          )
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(postsComponent.deletePost(mockPostId, deleterAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${deleterAddress} doesn't have permission to delete posts from the community`
            )
          )

          expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
          expect(mockCommunityRoles.validatePermissionToDeletePost).toHaveBeenCalledWith(
            mockPost.communityId,
            deleterAddress
          )
          expect(mockCommunitiesDB.deletePost).not.toHaveBeenCalled()
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
          mockCommunityRoles.validatePermissionToDeletePost.mockResolvedValue()
          mockCommunitiesDB.deletePost.mockRejectedValue(new Error('Database error'))
        })

        it('should log error and rethrow', async () => {
          await expect(postsComponent.deletePost(mockPostId, deleterAddress)).rejects.toThrow('Database error')

          const logger = mockLogs.getLogger('community-posts-component')
          expect(logger.error).toHaveBeenCalledWith('Failed to delete post', {
            error: 'Database error',
            postId: mockPostId,
            deleterAddress: deleterAddress.toLowerCase()
          })
        })
      })
    })

    describe('and the post does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(null)
      })

      it('should throw CommunityPostNotFoundError', async () => {
        await expect(postsComponent.deletePost(mockPostId, deleterAddress)).rejects.toThrow(
          new CommunityPostNotFoundError(mockPostId)
        )

        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunityRoles.validatePermissionToDeletePost).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.deletePost).not.toHaveBeenCalled()
      })
    })
  })

  describe('when liking a post', () => {
    const likerAddress = '0x1234567890123456789012345678901234567890'

    describe('and the post exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
        mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
        mockCommunitiesDB.likePost.mockResolvedValue()
      })

      describe('and the community is public', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public
          })
        })

        it('should like post successfully', async () => {
          await postsComponent.likePost(mockPostId, likerAddress)

          expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId)
          expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.likePost).toHaveBeenCalledWith(mockPostId, likerAddress)
        })
      })

      describe('and the community is private', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Private
          })
        })

        describe('and user is a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)
          })

          it('should like post successfully for members', async () => {
            await postsComponent.likePost(mockPostId, likerAddress)

            expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
            expect(mockCommunitiesDB.likePost).toHaveBeenCalledWith(mockPostId, likerAddress)
          })
        })

        describe('and user is not a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(false)
          })

          it('should throw NotAuthorizedError for non-members', async () => {
            await expect(postsComponent.likePost(mockPostId, likerAddress)).rejects.toThrow(
              new NotAuthorizedError(
                `User ${likerAddress} is not a member of private community ${mockPost.communityId}`
              )
            )

            expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
            expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
          })
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public
          })
          mockCommunitiesDB.likePost.mockRejectedValue(new Error('Database error'))
        })

        it('should log error and rethrow', async () => {
          await expect(postsComponent.likePost(mockPostId, likerAddress)).rejects.toThrow('Database error')

          const logger = mockLogs.getLogger('community-posts-component')
          expect(logger.error).toHaveBeenCalledWith('Failed to like post', {
            error: 'Database error',
            postId: mockPostId,
            userAddress: likerAddress.toLowerCase()
          })
        })
      })
    })

    describe('and the post does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(null)
      })

      it('should throw CommunityPostNotFoundError', async () => {
        await expect(postsComponent.likePost(mockPostId, likerAddress)).rejects.toThrow(
          new CommunityPostNotFoundError(mockPostId)
        )

        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(postsComponent.likePost(mockPostId, likerAddress)).rejects.toThrow(
          new CommunityNotFoundError(mockPost.communityId)
        )

        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId)
        expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
      })
    })
  })

  describe('when unliking a post', () => {
    const unlikerAddress = '0x1234567890123456789012345678901234567890'

    describe('and the post exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
        mockCommunitiesDB.unlikePost.mockResolvedValue()
      })

      it('should unlike post successfully', async () => {
        await postsComponent.unlikePost(mockPostId, unlikerAddress)

        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunitiesDB.unlikePost).toHaveBeenCalledWith(mockPostId, unlikerAddress)
      })

      it('should log successful post unlike', async () => {
        await postsComponent.unlikePost(mockPostId, unlikerAddress)

        const logger = mockLogs.getLogger('community-posts-component')
        expect(logger.info).toHaveBeenCalledWith('Post unliked successfully', {
          postId: mockPostId,
          userAddress: unlikerAddress.toLowerCase(),
          communityId: mockPost.communityId
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.unlikePost.mockRejectedValue(new Error('Database error'))
        })

        it('should log error and rethrow', async () => {
          await expect(postsComponent.unlikePost(mockPostId, unlikerAddress)).rejects.toThrow('Database error')

          const logger = mockLogs.getLogger('community-posts-component')
          expect(logger.error).toHaveBeenCalledWith('Failed to unlike post', {
            error: 'Database error',
            postId: mockPostId,
            userAddress: unlikerAddress.toLowerCase()
          })
        })
      })
    })

    describe('and the post does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(null)
      })

      it('should throw CommunityPostNotFoundError', async () => {
        await expect(postsComponent.unlikePost(mockPostId, unlikerAddress)).rejects.toThrow(
          new CommunityPostNotFoundError(mockPostId)
        )

        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunitiesDB.unlikePost).not.toHaveBeenCalled()
      })
    })
  })
})
