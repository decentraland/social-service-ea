import { EthAddress, Events } from '@dcl/schemas'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError, CommunityPostNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockCatalystClient, createLogsMockedComponent } from '../../mocks/components'
import { createCommunityPostsComponent } from '../../../src/logic/community/posts'
import {
  ICommunityPostsComponent,
  ICommunityRolesComponent,
  ICommunityBroadcasterComponent,
  ICommunityThumbnailComponent,
  CommunityPost,
  CommunityPostWithLikes,
  CommunityPostWithProfile,
  GetCommunityPostsOptions,
  CommunityPrivacyEnum,
  CommunityVisibilityEnum
} from '../../../src/logic/community/types'
import { CommunityRole } from '../../../src/types/entities'
import {
  createMockCommunityRolesComponent,
  createMockCommunityBroadcasterComponent,
  createMockCommunityThumbnailComponent
} from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('Community Posts Component', () => {
  let postsComponent: ICommunityPostsComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockCommunityBroadcaster: jest.Mocked<ICommunityBroadcasterComponent>
  let mockCommunityThumbnail: jest.Mocked<ICommunityThumbnailComponent>
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
    visibility: CommunityVisibilityEnum.All,
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

  const mockPostWithLikes: CommunityPostWithLikes = {
    ...mockPost,
    likesCount: 0,
    isLikedByUser: false
  }

  beforeEach(() => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityId = 'test-community'
    mockPostId = 'test-post'

    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockCommunityBroadcaster = createMockCommunityBroadcasterComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
    mockLogs = createLogsMockedComponent({})

    mockCommunityThumbnail.buildThumbnailUrl.mockReturnValue(`https://cdn.example.com/communities/${mockCommunityId}/thumbnail.png`)

    postsComponent = createCommunityPostsComponent({
      communitiesDb: mockCommunitiesDB,
      communityRoles: mockCommunityRoles,
      communityBroadcaster: mockCommunityBroadcaster,
      communityThumbnail: mockCommunityThumbnail,
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
    let mockAuthorProfile: ReturnType<typeof createMockProfile>

    beforeEach(() => {
      mockAuthorProfile = createMockProfile(authorAddress)
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
        mockCommunityRoles.validatePermissionToCreatePost.mockResolvedValue()
        mockCommunitiesDB.createPost.mockResolvedValue(mockPost)
        mockCatalystClient.getProfile.mockResolvedValue(mockAuthorProfile)
      })

      it('should create post successfully with author profile', async () => {
        const result = await postsComponent.createPost(mockCommunityId, authorAddress, content)

        expect(result).toMatchObject({
          ...mockPost,
          authorName: expect.any(String),
          authorProfilePictureUrl: expect.any(String),
          authorHasClaimedName: expect.any(Boolean)
        })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, authorAddress)
        expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
        expect(mockCommunitiesDB.createPost).toHaveBeenCalledWith({
          communityId: mockCommunityId,
          authorAddress,
          content: content.trim()
        })
        expect(mockCatalystClient.getProfile).toHaveBeenCalledWith(authorAddress)
      })

      it('should broadcast POST_ADDED event', async () => {
        await postsComponent.createPost(mockCommunityId, authorAddress, content)

        // Wait for setImmediate callback to execute
        await new Promise((resolve) => setImmediate(resolve))

        expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
          type: Events.Type.COMMUNITY,
          subType: Events.SubType.Community.POST_ADDED,
          key: mockPost.id,
          timestamp: expect.any(Number),
          metadata: {
            postId: mockPost.id,
            communityId: mockCommunityId,
            communityName: mockCommunity.name,
            thumbnailUrl: expect.stringContaining(mockCommunityId),
            authorAddress: authorAddress.toLowerCase(),
            addressesToNotify: []
          }
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
        expect(mockCatalystClient.getProfile).toHaveBeenCalledWith(authorAddress)
      })

      describe('and the user does not have permission to create posts', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
          mockCommunityRoles.validatePermissionToCreatePost.mockRejectedValue(
            new NotAuthorizedError(`The user ${authorAddress} doesn't have permission to create posts in the community`)
          )
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(postsComponent.createPost(mockCommunityId, authorAddress, content)).rejects.toThrow(
            new NotAuthorizedError(`The user ${authorAddress} doesn't have permission to create posts in the community`)
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, authorAddress)
          expect(mockCommunityRoles.validatePermissionToCreatePost).toHaveBeenCalledWith(mockCommunityId, authorAddress)
          expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
          expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalled()
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
          mockCommunityRoles.validatePermissionToCreatePost.mockResolvedValue()
          mockCommunitiesDB.createPost.mockRejectedValue(new Error('Database error'))
        })

        it('should throw database error', async () => {
          await expect(postsComponent.createPost(mockCommunityId, authorAddress, content)).rejects.toThrow(
            'Database error'
          )
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(postsComponent.createPost(mockCommunityId, authorAddress, content)).rejects.toThrow(
          new CommunityNotFoundError(mockCommunityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, authorAddress)
        expect(mockCommunityRoles.validatePermissionToCreatePost).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.createPost).not.toHaveBeenCalled()
        expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalled()
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
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: CommunityPrivacyEnum.Public,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getPosts.mockResolvedValue([mockPostWithLikes])
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
            authorHasClaimedName: expect.any(Boolean),
            likesCount: expect.any(Number),
            isLikedByUser: expect.any(Boolean)
          })

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, options.userAddress)
          expect(mockCommunitiesDB.getPosts).toHaveBeenCalledWith(mockCommunityId, options)
          expect(mockCommunitiesDB.getPostsCount).toHaveBeenCalledWith(mockCommunityId)
          expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([mockUserAddress])
        })

        it('should work without userAddress for public communities', async () => {
          const optionsWithoutUser = { pagination: { limit: 10, offset: 0 } }

          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
          mockCommunitiesDB.getPosts.mockResolvedValue([
            {
              ...mockPostWithLikes,
              isLikedByUser: undefined
            }
          ])
          mockCommunitiesDB.getPostsCount.mockResolvedValue(1)

          const result = await postsComponent.getPosts(mockCommunityId, optionsWithoutUser)

          expect(result.posts).toHaveLength(1)
          expect(result.total).toBe(1)
          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, undefined)
          expect(mockCommunitiesDB.getPosts).toHaveBeenCalledWith(mockCommunityId, optionsWithoutUser)
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
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.Member
            })
          })

          it('should return posts with profiles for members', async () => {
            const result = await postsComponent.getPosts(mockCommunityId, options)

            expect(result.posts).toHaveLength(1)
            expect(result.total).toBe(1)
            expect(result.posts[0]).toMatchObject({
              ...mockPost,
              authorName: expect.any(String),
              authorProfilePictureUrl: expect.any(String),
              authorHasClaimedName: expect.any(Boolean),
              likesCount: expect.any(Number),
              isLikedByUser: expect.any(Boolean)
            })

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, options.userAddress)
            expect(mockCommunitiesDB.getPosts).toHaveBeenCalledWith(mockCommunityId, options)
            expect(mockCommunitiesDB.getPostsCount).toHaveBeenCalledWith(mockCommunityId)
            expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([mockUserAddress])
          })
        })

        describe('and user is not a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.None
            })
          })

          it('should throw NotAuthorizedError for non-members', async () => {
            await expect(postsComponent.getPosts(mockCommunityId, options)).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, options.userAddress)
            expect(mockCommunitiesDB.getPosts).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.getPostsCount).not.toHaveBeenCalled()
          })
        })

        describe('and no userAddress is provided', () => {
          const optionsWithoutUser = { pagination: { limit: 10, offset: 0 } }

          beforeEach(() => {
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.None
            })
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(postsComponent.getPosts(mockCommunityId, optionsWithoutUser)).rejects.toThrow(
              NotAuthorizedError
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, undefined)
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
        const mockPosts: CommunityPostWithLikes[] = [
          mockPostWithLikes,
          {
            ...mockPostWithLikes,
            id: 'test-post-2',
            authorAddress: secondAuthor,
            content: 'Second post content',
            likesCount: 0,
            isLikedByUser: false
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

        it('should throw profile service error', async () => {
          await expect(postsComponent.getPosts(mockCommunityId, options)).rejects.toThrow('Profile service error')
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

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunityId, options.userAddress)
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
        expect(mockCommunityRoles.validatePermissionToDeletePost).toHaveBeenCalledWith(mockPost, deleterAddress)
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
          expect(mockCommunityRoles.validatePermissionToDeletePost).toHaveBeenCalledWith(mockPost, deleterAddress)
          expect(mockCommunitiesDB.deletePost).not.toHaveBeenCalled()
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
          mockCommunityRoles.validatePermissionToDeletePost.mockResolvedValue()
          mockCommunitiesDB.deletePost.mockRejectedValue(new Error('Database error'))
        })

        it('should throw database error', async () => {
          await expect(postsComponent.deletePost(mockPostId, deleterAddress)).rejects.toThrow('Database error')
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
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: CommunityPrivacyEnum.Public,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.isMemberBanned.mockResolvedValue(false)
        mockCommunitiesDB.likePost.mockResolvedValue()
      })

      describe('and the community is public', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
        })

        it('should like post successfully', async () => {
          await postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
          expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
          expect(mockCommunitiesDB.likePost).toHaveBeenCalledWith(mockPostId, likerAddress)
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
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.Member
            })
          })

          it('should like post successfully for members', async () => {
            await postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
            expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
            expect(mockCommunitiesDB.likePost).toHaveBeenCalledWith(mockPostId, likerAddress)
          })
        })

        describe('and user is not a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.None
            })
          })

          it('should throw NotAuthorizedError for non-members', async () => {
            await expect(postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)).rejects.toThrow(
              NotAuthorizedError
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
            expect(mockCommunitiesDB.getPost).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the user is banned', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)
        })

        it('should throw NotAuthorizedError for banned users', async () => {
          await expect(postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `${likerAddress} is banned from community ${mockPost.communityId}. You cannot like/unlike posts in this community.`
            )
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
          expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
          expect(mockCommunitiesDB.getPost).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(false)
          mockCommunitiesDB.likePost.mockRejectedValue(new Error('Database error'))
        })

        it('should throw database error', async () => {
          await expect(postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)).rejects.toThrow(
            'Database error'
          )
        })
      })
    })

    describe('and the post does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: CommunityPrivacyEnum.Public,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getPost.mockResolvedValue(null)
      })

      it('should throw CommunityPostNotFoundError', async () => {
        await expect(postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)).rejects.toThrow(
          new CommunityPostNotFoundError(mockPostId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(postsComponent.likePost(mockPost.communityId, mockPostId, likerAddress)).rejects.toThrow(
          new CommunityNotFoundError(mockPost.communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, likerAddress)
        expect(mockCommunitiesDB.getPost).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.likePost).not.toHaveBeenCalled()
      })
    })
  })

  describe('when unliking a post', () => {
    const unlikerAddress = '0x1234567890123456789012345678901234567890'

    describe('and the post exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getPost.mockResolvedValue(mockPost)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: CommunityPrivacyEnum.Public,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.isMemberBanned.mockResolvedValue(false)
        mockCommunitiesDB.unlikePost.mockResolvedValue()
      })

      describe('and the community is public', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
        })

        it('should unlike post successfully', async () => {
          await postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
          expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
          expect(mockCommunitiesDB.unlikePost).toHaveBeenCalledWith(mockPostId, unlikerAddress)
        })

        it('should log successful post unlike', async () => {
          await postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)

          const logger = mockLogs.getLogger('community-posts-component')
          expect(logger.info).toHaveBeenCalledWith('Post unliked successfully', {
            postId: mockPostId,
            userAddress: unlikerAddress.toLowerCase(),
            communityId: mockPost.communityId
          })
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
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.Member
            })
          })

          it('should unlike post successfully for members', async () => {
            await postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
            expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
            expect(mockCommunitiesDB.unlikePost).toHaveBeenCalledWith(mockPostId, unlikerAddress)
          })
        })

        describe('and user is not a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunity.mockResolvedValue({
              ...mockCommunity,
              privacy: CommunityPrivacyEnum.Private,
              role: CommunityRole.None
            })
          })

          it('should throw NotAuthorizedError for non-members', async () => {
            await expect(postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)).rejects.toThrow(
              NotAuthorizedError
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
            expect(mockCommunitiesDB.getPost).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.unlikePost).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the user is banned', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)
        })

        it('should throw NotAuthorizedError for banned users', async () => {
          await expect(postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `${unlikerAddress} is banned from community ${mockPost.communityId}. You cannot like/unlike posts in this community.`
            )
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
          expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
          expect(mockCommunitiesDB.getPost).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.unlikePost).not.toHaveBeenCalled()
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue({
            ...mockCommunity,
            privacy: CommunityPrivacyEnum.Public,
            role: CommunityRole.Member
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(false)
          mockCommunitiesDB.unlikePost.mockRejectedValue(new Error('Database error'))
        })

        it('should throw database error', async () => {
          await expect(postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)).rejects.toThrow(
            'Database error'
          )
        })
      })
    })

    describe('and the post does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: CommunityPrivacyEnum.Public,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getPost.mockResolvedValue(null)
      })

      it('should throw CommunityPostNotFoundError', async () => {
        await expect(postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)).rejects.toThrow(
          new CommunityPostNotFoundError(mockPostId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
        expect(mockCommunitiesDB.getPost).toHaveBeenCalledWith(mockPostId)
        expect(mockCommunitiesDB.unlikePost).not.toHaveBeenCalled()
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(postsComponent.unlikePost(mockPost.communityId, mockPostId, unlikerAddress)).rejects.toThrow(
          new CommunityNotFoundError(mockPost.communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockPost.communityId, unlikerAddress)
        expect(mockCommunitiesDB.getPost).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.unlikePost).not.toHaveBeenCalled()
      })
    })
  })
})
