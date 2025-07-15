import { createUpdateHandlerComponent } from '../../../src/logic/updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { mockCatalystClient, mockFriendsDB, mockLogs } from '../../mocks/components'
import mitt, { Emitter } from 'mitt'
import {
  Action,
  IUpdateHandlerComponent,
  ISubscribersContext,
  SubscriptionEventsEmitter,
  RpcServerContext
} from '../../../src/types'
import { sleep } from '../../../src/utils/timer'
import { mockProfile } from '../../mocks/profile'
import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import { VoiceChatStatus } from '../../../src/logic/voice/types'
import { ICommunityMembersComponent } from '../../../src/logic/community/types'
import { createMockCommunityMembersComponent } from '../../mocks/communities'

describe('Updates Handlers', () => {
  const logger = mockLogs.getLogger('test')
  let subscribersContext: ISubscribersContext
  let updateHandler: IUpdateHandlerComponent
  let mockCommunityMembers: jest.Mocked<ICommunityMembersComponent>

  beforeEach(() => {
    subscribersContext = createSubscribersContext()
    subscribersContext.addSubscriber('0x456', mitt<SubscriptionEventsEmitter>())
    subscribersContext.addSubscriber('0x789', mitt<SubscriptionEventsEmitter>())

    mockCommunityMembers = createMockCommunityMembersComponent({})

    updateHandler = createUpdateHandlerComponent({
      logs: mockLogs,
      subscribersContext,
      friendsDb: mockFriendsDB,
      catalystClient: mockCatalystClient,
      communityMembers: mockCommunityMembers
    })
  })

  describe('when handling friendship updates', () => {
    describe('and the target subscriber exists', () => {
      it('should emit friendship update to the target subscriber', () => {
        const subscriber = subscribersContext.getOrAddSubscriber('0x456')
        const emitSpy = jest.spyOn(subscriber, 'emit')

        const update = {
          id: 'update-1',
          from: '0x123',
          to: '0x456',
          action: Action.REQUEST,
          timestamp: Date.now(),
          metadata: { message: 'Hello!' }
        }

        updateHandler.friendshipUpdateHandler(JSON.stringify(update))

        expect(emitSpy).toHaveBeenCalledWith('friendshipUpdate', update)
      })
    })

    describe('and the target subscriber does not exist', () => {
      it('should not emit any updates', () => {
        const nonExistentUpdate = {
          id: 'update-1',
          from: '0x123',
          to: '0xNONEXISTENT',
          action: Action.REQUEST,
          timestamp: Date.now()
        }

        expect(updateHandler.friendshipUpdateHandler(JSON.stringify(nonExistentUpdate))).resolves.toBeUndefined()
      })
    })

    describe('and the update format is invalid', () => {
      it('should log an error with invalid JSON message', () => {
        const errorSpy = jest.spyOn(logger, 'error')

        updateHandler.friendshipUpdateHandler('invalid json')

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ message: 'invalid json' })
        )
      })
    })
  })

  describe('when handling friendship accepted updates', () => {
    describe('and the action is accept', () => {
      it('should emit friend connectivity updates to both users with ONLINE status', () => {
        const subscriber123 = subscribersContext.getOrAddSubscriber('0x123')
        const subscriber456 = subscribersContext.getOrAddSubscriber('0x456')
        const emitSpy123 = jest.spyOn(subscriber123, 'emit')
        const emitSpy456 = jest.spyOn(subscriber456, 'emit')

        const update = {
          id: 'update-1',
          from: '0x123',
          to: '0x456',
          action: Action.ACCEPT,
          timestamp: Date.now(),
          metadata: { message: 'Hello!' }
        }

        updateHandler.friendshipAcceptedUpdateHandler(JSON.stringify(update))

        expect(emitSpy123).toHaveBeenCalledWith('friendConnectivityUpdate', {
          address: '0x456',
          status: ConnectivityStatus.ONLINE
        })

        expect(emitSpy456).toHaveBeenCalledWith('friendConnectivityUpdate', {
          address: '0x123',
          status: ConnectivityStatus.ONLINE
        })
      })
    })

    describe.each([Action.DELETE, Action.REQUEST, Action.REJECT, Action.CANCEL])('and the action is %s', (action) => {
      it('should ignore the update', () => {
        const nonExistentUpdate = {
          id: 'update-1',
          from: '0x123',
          to: '0x456',
          action,
          timestamp: Date.now()
        }

        expect(
          updateHandler.friendshipAcceptedUpdateHandler(JSON.stringify(nonExistentUpdate))
        ).resolves.toBeUndefined()
      })
    })

    describe('and the target subscriber does not exist', () => {
      it('should not emit any updates', () => {
        const nonExistentUpdate = {
          id: 'update-1',
          from: '0x123',
          to: '0xNONEXISTENT',
          action: Action.REQUEST,
          timestamp: Date.now()
        }

        expect(
          updateHandler.friendshipAcceptedUpdateHandler(JSON.stringify(nonExistentUpdate))
        ).resolves.toBeUndefined()
      })
    })

    describe('and the update format is invalid', () => {
      it('should log an error with invalid JSON message', () => {
        const errorSpy = jest.spyOn(logger, 'error')

        updateHandler.friendshipAcceptedUpdateHandler('invalid json')

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ message: 'invalid json' })
        )
      })
    })
  })

  describe('when handling friend connectivity updates', () => {
    describe('and there are online friends', () => {
      it('should emit connectivity update to all online friends', async () => {
        const subscriber456 = subscribersContext.getOrAddSubscriber('0x456')
        const subscriber789 = subscribersContext.getOrAddSubscriber('0x789')
        const emitSpy456 = jest.spyOn(subscriber456, 'emit')
        const emitSpy789 = jest.spyOn(subscriber789, 'emit')

        const onlineFriends = [{ address: '0x456' }, { address: '0x789' }]
        mockFriendsDB.getOnlineFriends.mockResolvedValueOnce(onlineFriends)

        const update = {
          address: '0x123',
          status: ConnectivityStatus.ONLINE
        }

        await updateHandler.friendConnectivityUpdateHandler(JSON.stringify(update))

        expect(mockFriendsDB.getOnlineFriends).toHaveBeenCalledWith('0x123', ['0x456', '0x789'])
        expect(emitSpy456).toHaveBeenCalledWith('friendConnectivityUpdate', update)
        expect(emitSpy789).toHaveBeenCalledWith('friendConnectivityUpdate', update)
      })
    })

    describe('and there are no online friends', () => {
      it('should not emit any updates', async () => {
        mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([])

        const update = {
          address: '0x123',
          status: ConnectivityStatus.ONLINE
        }

        await updateHandler.friendConnectivityUpdateHandler(JSON.stringify(update))

        expect(mockFriendsDB.getOnlineFriends).toHaveBeenCalled()
      })
    })

    describe('and the update format is invalid', () => {
      it('should log an error with invalid JSON message', async () => {
        const errorSpy = jest.spyOn(logger, 'error')

        await updateHandler.friendConnectivityUpdateHandler('invalid json')

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ message: 'invalid json' })
        )
      })
    })

    describe('and the database throws an error', () => {
      it('should log an error and handle database errors gracefully', async () => {
        const errorSpy = jest.spyOn(logger, 'error')
        const error = new Error('Database error')

        mockFriendsDB.getOnlineFriends.mockRejectedValueOnce(error)

        const update = {
          address: '0x123',
          status: ConnectivityStatus.ONLINE
        }

        await updateHandler.friendConnectivityUpdateHandler(JSON.stringify(update))

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({
            error,
            message: JSON.stringify(update)
          })
        )
      })
    })
  })

  describe('when handling community member connectivity updates', () => {
    let subscriber456: Emitter<SubscriptionEventsEmitter>
    let subscriber789: Emitter<SubscriptionEventsEmitter>
    let emitSpy456: jest.SpyInstance
    let emitSpy789: jest.SpyInstance

    beforeEach(() => {
      subscriber456 = subscribersContext.getOrAddSubscriber('0x456')
      subscriber789 = subscribersContext.getOrAddSubscriber('0x789')

      emitSpy456 = jest.spyOn(subscriber456, 'emit')
      emitSpy789 = jest.spyOn(subscriber789, 'emit')
    })

    describe('when the user is not a member of any community', () => {
      beforeEach(() => {
        // Mock the generator to return no batches
        const mockGenerator = (async function* () {
          // No batches to yield
        })()
        mockCommunityMembers.getOnlineMembersFromUserCommunities.mockReturnValue(mockGenerator)
      })

      it('should not emit any updates', async () => {
        const update = {
          memberAddress: '0x123',
          status: ConnectivityStatus.ONLINE
        }

        await updateHandler.communityMemberConnectivityUpdateHandler(JSON.stringify(update))

        expect(mockCommunityMembers.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith('0x123', [
          '0x456',
          '0x789'
        ])
        expect(emitSpy456).not.toHaveBeenCalled()
        expect(emitSpy789).not.toHaveBeenCalled()
      })
    })

    describe('when the user is a member of a community', () => {
      describe('and there are no online members in the community', () => {
        beforeEach(() => {
          // Mock the generator to return no batches
          const mockGenerator = (async function* () {
            // No batches to yield
          })()
          mockCommunityMembers.getOnlineMembersFromUserCommunities.mockReturnValue(mockGenerator)
        })

        it('should not emit any updates', async () => {
          const update = {
            memberAddress: '0x123',
            status: ConnectivityStatus.ONLINE
          }

          await updateHandler.communityMemberConnectivityUpdateHandler(JSON.stringify(update))

          expect(mockCommunityMembers.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith('0x123', [
            '0x456',
            '0x789'
          ])
          expect(emitSpy456).not.toHaveBeenCalled()
          expect(emitSpy789).not.toHaveBeenCalled()
        })
      })

      describe('and there are online members in the community', () => {
        beforeEach(() => {
          // Mock the generator to return one batch
          const mockGenerator = (async function* () {
            yield [
              { communityId: '1', memberAddress: '0x456' },
              { communityId: '2', memberAddress: '0x789' }
            ]
          })()
          mockCommunityMembers.getOnlineMembersFromUserCommunities.mockReturnValue(mockGenerator)
        })

        it('should emit connectivity update to all online members of the communities', async () => {
          const update = {
            memberAddress: '0x123',
            status: ConnectivityStatus.ONLINE
          }

          await updateHandler.communityMemberConnectivityUpdateHandler(JSON.stringify(update))

          expect(mockCommunityMembers.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith('0x123', [
            '0x456',
            '0x789'
          ])
          expect(emitSpy456).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
            ...update,
            communityId: '1'
          })
          expect(emitSpy789).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
            ...update,
            communityId: '2'
          })
        })
      })

      describe('and there are multiple batches of online members', () => {
        beforeEach(() => {
          // Mock the generator to return multiple batches
          const mockGenerator = (async function* () {
            yield [
              { communityId: '1', memberAddress: '0x456' },
              { communityId: '2', memberAddress: '0x789' }
            ]
            yield [{ communityId: '3', memberAddress: '0x999' }]
          })()
          mockCommunityMembers.getOnlineMembersFromUserCommunities.mockReturnValue(mockGenerator)
        })

        it('should emit connectivity update to all online members across multiple batches', async () => {
          const update = {
            memberAddress: '0x123',
            status: ConnectivityStatus.ONLINE
          }

          // Add the third subscriber for the test
          const subscriber999 = subscribersContext.getOrAddSubscriber('0x999')
          const emitSpy999 = jest.spyOn(subscriber999, 'emit')

          await updateHandler.communityMemberConnectivityUpdateHandler(JSON.stringify(update))

          expect(mockCommunityMembers.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith('0x123', [
            '0x456',
            '0x789',
            '0x999'
          ])
          expect(emitSpy456).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
            ...update,
            communityId: '1'
          })
          expect(emitSpy789).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
            ...update,
            communityId: '2'
          })
          expect(emitSpy999).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
            ...update,
            communityId: '3'
          })
        })
      })
    })

    describe('when the update format is invalid', () => {
      it('should log an error', () => {
        const errorSpy = jest.spyOn(logger, 'error')

        updateHandler.communityMemberConnectivityUpdateHandler('invalid json')

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ message: 'invalid json' })
        )
      })
    })

    describe('when the community members logic component throws an error', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Cannot get online members from user communities')
        // Mock the generator to throw an error
        const mockGenerator = (async function* () {
          throw error
        })()
        mockCommunityMembers.getOnlineMembersFromUserCommunities.mockReturnValue(mockGenerator)
      })

      it('should log an error and not emit any updates', async () => {
        const errorSpy = jest.spyOn(logger, 'error')

        const update = {
          memberAddress: '0x123',
          status: ConnectivityStatus.ONLINE
        }

        await updateHandler.communityMemberConnectivityUpdateHandler(JSON.stringify(update))

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ error, message: JSON.stringify(update) })
        )

        expect(emitSpy456).not.toHaveBeenCalled()
        expect(emitSpy789).not.toHaveBeenCalled()
      })
    })
  })

  describe('when handling community member status updates', () => {
    let subscriber456: Emitter<SubscriptionEventsEmitter>
    let subscriber789: Emitter<SubscriptionEventsEmitter>
    let subscriber123: Emitter<SubscriptionEventsEmitter>
    let emitSpy456: jest.SpyInstance
    let emitSpy789: jest.SpyInstance
    let emitSpy123: jest.SpyInstance

    beforeEach(() => {
      subscriber456 = subscribersContext.getOrAddSubscriber('0x456')
      subscriber789 = subscribersContext.getOrAddSubscriber('0x789')
      subscriber123 = subscribersContext.getOrAddSubscriber('0x123')

      emitSpy456 = jest.spyOn(subscriber456, 'emit')
      emitSpy789 = jest.spyOn(subscriber789, 'emit')
      emitSpy123 = jest.spyOn(subscriber123, 'emit')
    })

    describe.each([
      { description: 'online', status: ConnectivityStatus.ONLINE },
      { description: 'offline', status: ConnectivityStatus.OFFLINE }
    ])('when the status is $description', ({ status }) => {
      describe('and there are no online members in the community', () => {
        beforeEach(() => {
          // Mock the generator to return no batches
          const mockGenerator = (async function* () {
            // No batches to yield
          })()
          mockCommunityMembers.getOnlineMembersFromCommunity.mockReturnValue(mockGenerator)
        })

        describe('and the affected member is subscribed', () => {
          it('should not emit any updates to other members but notify the affected member', async () => {
            const update = {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            }

            await updateHandler.communityMemberStatusHandler(JSON.stringify(update))

            expect(mockCommunityMembers.getOnlineMembersFromCommunity).toHaveBeenCalledWith('community-1', [
              '0x456',
              '0x789'
            ])
            expect(emitSpy456).not.toHaveBeenCalled()
            expect(emitSpy789).not.toHaveBeenCalled()
            expect(emitSpy123).toHaveBeenCalledWith('communityMemberConnectivityUpdate', update)
          })
        })

        describe('and the affected member is not subscribed', () => {
          beforeEach(() => {
            // Remove the affected member from subscribers
            subscribersContext.removeSubscriber('0x123')
          })

          it('should not emit any updates to other members or the affected member', async () => {
            const update = {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            }

            await updateHandler.communityMemberStatusHandler(JSON.stringify(update))

            expect(mockCommunityMembers.getOnlineMembersFromCommunity).toHaveBeenCalledWith('community-1', [
              '0x456',
              '0x789'
            ])
            expect(emitSpy456).not.toHaveBeenCalled()
            expect(emitSpy789).not.toHaveBeenCalled()
            expect(emitSpy123).not.toHaveBeenCalled()
          })
        })
      })

      describe('and there are online members in the community', () => {
        beforeEach(() => {
          // Mock the generator to return one batch
          const mockGenerator = (async function* () {
            yield [{ memberAddress: '0x456' }, { memberAddress: '0x789' }]
          })()
          mockCommunityMembers.getOnlineMembersFromCommunity.mockReturnValue(mockGenerator)
        })

        describe('and the affected member is not subscribed', () => {
          beforeEach(() => {
            // Remove the affected member from subscribers
            subscribersContext.removeSubscriber('0x123')
          })

          it('should emit connectivity update to all online members but not notify the affected member', async () => {
            const update = {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            }

            await updateHandler.communityMemberStatusHandler(JSON.stringify(update))

            expect(mockCommunityMembers.getOnlineMembersFromCommunity).toHaveBeenCalledWith('community-1', [
              '0x456',
              '0x789'
            ])
            expect(emitSpy456).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy789).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy123).not.toHaveBeenCalled()
          })
        })
      })

      describe('and there are multiple batches of online members', () => {
        beforeEach(() => {
          // Mock the generator to return multiple batches
          const mockGenerator = (async function* () {
            yield [{ memberAddress: '0x456' }, { memberAddress: '0x789' }]
            yield [{ memberAddress: '0x999' }]
          })()
          mockCommunityMembers.getOnlineMembersFromCommunity.mockReturnValue(mockGenerator)
        })

        describe('and the affected member is subscribed', () => {
          it('should emit connectivity update to all online members across multiple batches and notify the affected member', async () => {
            const update = {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            }

            // Add the third subscriber for the test
            const subscriber999 = subscribersContext.getOrAddSubscriber('0x999')
            const emitSpy999 = jest.spyOn(subscriber999, 'emit')

            await updateHandler.communityMemberStatusHandler(JSON.stringify(update))

            expect(mockCommunityMembers.getOnlineMembersFromCommunity).toHaveBeenCalledWith('community-1', [
              '0x456',
              '0x789',
              '0x999'
            ])
            expect(emitSpy456).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy789).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy999).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy123).toHaveBeenCalledWith('communityMemberConnectivityUpdate', update)
          })
        })

        describe('and the affected member is not subscribed', () => {
          beforeEach(() => {
            // Remove the affected member from subscribers
            subscribersContext.removeSubscriber('0x123')
          })

          it('should emit connectivity update to all online members across multiple batches but not notify the affected member', async () => {
            const update = {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            }

            // Add the third subscriber for the test
            const subscriber999 = subscribersContext.getOrAddSubscriber('0x999')
            const emitSpy999 = jest.spyOn(subscriber999, 'emit')

            await updateHandler.communityMemberStatusHandler(JSON.stringify(update))

            expect(mockCommunityMembers.getOnlineMembersFromCommunity).toHaveBeenCalledWith('community-1', [
              '0x456',
              '0x789',
              '0x999'
            ])
            expect(emitSpy456).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy789).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy999).toHaveBeenCalledWith('communityMemberConnectivityUpdate', {
              communityId: 'community-1',
              memberAddress: '0x123',
              status
            })
            expect(emitSpy123).not.toHaveBeenCalled()
          })
        })
      })
    })

    describe('when the update format is invalid', () => {
      it('should log an error', () => {
        const errorSpy = jest.spyOn(logger, 'error')

        updateHandler.communityMemberStatusHandler('invalid json')

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ message: 'invalid json' })
        )
      })
    })

    describe('when the community members logic component throws an error', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Cannot get online members from community')
        // Mock the generator to throw an error
        const mockGenerator = (async function* () {
          throw error
        })()
        mockCommunityMembers.getOnlineMembersFromCommunity.mockReturnValue(mockGenerator)
      })

      it('should log an error and not emit any updates', async () => {
        const errorSpy = jest.spyOn(logger, 'error')

        const update = {
          communityId: 'community-1',
          memberAddress: '0x123',
          status: ConnectivityStatus.OFFLINE
        }

        await updateHandler.communityMemberStatusHandler(JSON.stringify(update))

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ error, message: JSON.stringify(update) })
        )

        expect(emitSpy456).not.toHaveBeenCalled()
        expect(emitSpy789).not.toHaveBeenCalled()
      })
    })
  })

  describe('when handling block updates', () => {
    describe('and the blocked user is subscribed', () => {
      it('should emit block update to the blocked user', () => {
        const subscriber = subscribersContext.getOrAddSubscriber('0x456')
        const emitSpy = jest.spyOn(subscriber, 'emit')

        const update = {
          blockerAddress: '0x123',
          blockedAddress: '0x456',
          isBlocked: true
        }

        updateHandler.blockUpdateHandler(JSON.stringify(update))

        expect(emitSpy).toHaveBeenCalledWith('blockUpdate', update)
      })
    })

    describe('and the blocked user is not subscribed', () => {
      it('should not emit any updates', () => {
        const nonExistentUpdate = {
          id: 'update-1',
          from: '0x123',
          to: '0xNONEXISTENT',
          action: Action.REQUEST,
          timestamp: Date.now()
        }

        expect(updateHandler.blockUpdateHandler(JSON.stringify(nonExistentUpdate))).resolves.toBeUndefined()
      })
    })

    describe('and the update format is invalid', () => {
      it('should log an error with invalid JSON message', () => {
        const errorSpy = jest.spyOn(logger, 'error')

        updateHandler.blockUpdateHandler('invalid json')

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error handling update:'),
          expect.objectContaining({ message: 'invalid json' })
        )
      })
    })
  })

  describe('when handling private voice chat updates', () => {
    let callerAddress: string
    let calleeAddress: string
    let callId: string
    let callerEmitSpy: jest.SpyInstance
    let calleeEmitSpy: jest.SpyInstance
    let update: any

    beforeEach(() => {
      callerAddress = '0x123'
      calleeAddress = '0x456'
      callId = 'voice-call-1'

      const caller = subscribersContext.getOrAddSubscriber(callerAddress)
      const callee = subscribersContext.getOrAddSubscriber(calleeAddress)
      callerEmitSpy = jest.spyOn(caller, 'emit')
      calleeEmitSpy = jest.spyOn(callee, 'emit')

      // Reset update object for each test
      update = {
        id: callId,
        callerAddress,
        calleeAddress,
        credentials: {
          connectionUrl: 'livekit:https://voice.decentraland.org?access_token=1234567890'
        },
        status: VoiceChatStatus.REQUESTED, // Default status, will be overridden in specific tests
        timestamp: Date.now()
      }
    })

    describe('and the voice chat status is REQUESTED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.REQUESTED
      })

      describe('and the calleeAddress is present', () => {
        it('should emit the update to the callee', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and the calleeAddress is missing', () => {
        beforeEach(() => {
          update.calleeAddress = undefined
        })

        it('should not emit the update to any subscriber', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).not.toHaveBeenCalled()
          expect(calleeEmitSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the voice chat status is ACCEPTED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.ACCEPTED
      })

      describe('and the callerAddress is present', () => {
        it('should emit the update to the caller', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and the callerAddress is missing', () => {
        beforeEach(() => {
          update.callerAddress = undefined
        })

        it('should not emit the update to any subscriber', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).not.toHaveBeenCalled()
          expect(calleeEmitSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the voice chat status is REJECTED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.REJECTED
      })

      describe('and the callerAddress is present', () => {
        it('should emit the update to the caller', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and the callerAddress is missing', () => {
        beforeEach(() => {
          update.callerAddress = undefined
        })

        it('should not emit the update to any subscriber', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).not.toHaveBeenCalled()
          expect(calleeEmitSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the voice chat status is ENDED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.ENDED
      })

      describe('and both callerAddress and calleeAddress are present', () => {
        it('should emit the update to both the caller and the callee', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
          expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and only callerAddress is present', () => {
        beforeEach(() => {
          update.calleeAddress = undefined
        })

        it('should emit the update only to the caller', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and only calleeAddress is present', () => {
        beforeEach(() => {
          update.callerAddress = undefined
        })

        it('should emit the update only to the callee', () => {
          updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

          expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })
    })

    describe('and the voice chat status is EXPIRED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.EXPIRED
      })

      it('should emit the update to both the caller and the callee', () => {
        updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

        expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
      })
    })

    describe('and the voice chat status is unknown', () => {
      beforeEach(() => {
        update.status = 'unknown' as VoiceChatStatus
      })

      it('should not emit the update to any subscriber', () => {
        updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))

        expect(callerEmitSpy).not.toHaveBeenCalled()
        expect(calleeEmitSpy).not.toHaveBeenCalled()
      })
    })

    describe('and the subscriber does not exist', () => {
      beforeEach(() => {
        update.callerAddress = '0xNONEXISTENT'
        update.status = VoiceChatStatus.ACCEPTED
      })

      it('should resolve without emitting to any subscriber', () => {
        expect(updateHandler.privateVoiceChatUpdateHandler(JSON.stringify(update))).resolves.toBeUndefined()
      })
    })
  })

  describe('when handling subscription updates', () => {
    let eventEmitter: Emitter<SubscriptionEventsEmitter>
    let parser: jest.Mock
    let rpcContext: RpcServerContext
    let subscribersContext: ISubscribersContext

    const friendshipUpdate = { id: '1', to: '0x456', from: '0x123', action: Action.REQUEST, timestamp: Date.now() }
    const blockUpdate = { blockerAddress: '0x456', blockedAddress: '0x123', isBlocked: true }

    beforeEach(() => {
      eventEmitter = mitt<SubscriptionEventsEmitter>()
      parser = jest.fn()
      mockCatalystClient.getProfile.mockResolvedValue(mockProfile)

      subscribersContext = createSubscribersContext()
      subscribersContext.addSubscriber('0x123', eventEmitter)

      rpcContext = {
        address: '0x123',
        subscribersContext
      }
    })

    describe('and the emitter exists in context', () => {
      it('should use existing emitter from context', async () => {
        parser.mockResolvedValueOnce({ parsed: true })

        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
          shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
          parser
        })

        const resultPromise = generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

        const result = await resultPromise
        expect(result.value).toEqual({ parsed: true })
      })
    })

    describe('and the parser returns valid data', () => {
      it('should yield parsed updates', async () => {
        parser.mockResolvedValueOnce({ parsed: true })

        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
          shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
          parser
        })

        const resultPromise = generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

        const result = await resultPromise
        expect(result.value).toEqual({ parsed: true })
        expect(parser).toHaveBeenCalledWith(friendshipUpdate, mockProfile)
      })

      it('should yield multiple updates', async () => {
        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
          shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
          parser
        })

        for (let i = 0; i < 2; i++) {
          parser.mockResolvedValueOnce({ parsed: i })
          const resultPromise = generator.next()
          rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)
          const result = await resultPromise
          expect(result.value).toEqual({ parsed: i })
          expect(parser).toHaveBeenCalledWith(friendshipUpdate, mockProfile)
        }
      })
    })

    describe('and the parser returns null', () => {
      it('should log error if parser returns null', async () => {
        parser.mockResolvedValueOnce(null)
        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
          shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
          parser
        })

        generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

        await sleep(100)

        expect(logger.error).toHaveBeenCalledWith(`Unable to parse friendshipUpdate`, {
          update: JSON.stringify(friendshipUpdate)
        })
      })
    })

    describe('and shouldHandleUpdate returns false', () => {
      it('should skip update if shouldHandleUpdate returns false', async () => {
        parser.mockResolvedValueOnce({ parsed: true })

        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
          shouldHandleUpdate: () => false,
          parser
        })

        const resultPromise = generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

        await sleep(100)

        expect(resultPromise).resolves.toBeUndefined()
      })
    })

    describe('and an error occurs in the generator loop', () => {
      it('should handle errors in the generator loop', async () => {
        const error = new Error('Test error')
        parser.mockRejectedValueOnce(error)

        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
          shouldHandleUpdate: () => true,
          parser
        })

        const resultPromise = generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

        await expect(resultPromise).rejects.toThrow('Test error')
        expect(logger.error).toHaveBeenCalledWith('Error in generator loop', {
          error: JSON.stringify(error),
          address: '0x123',
          event: 'friendshipUpdate'
        })
      })
    })

    describe('and shouldRetrieveProfile is false', () => {
      it('should skip retrieving profile if shouldRetrieveProfile is false', async () => {
        parser.mockResolvedValueOnce({ parsed: true })

        const generator = updateHandler.handleSubscriptionUpdates({
          rpcContext,
          eventName: 'blockUpdate',
          shouldRetrieveProfile: false,
          getAddressFromUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) => update.blockerAddress,
          shouldHandleUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) => update.blockedAddress === '0x123',
          parser
        })

        const resultPromise = generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('blockUpdate', blockUpdate)

        const result = await resultPromise
        expect(result.value).toEqual({ parsed: true })
        expect(parser).toHaveBeenCalledWith(blockUpdate, null)
        expect(mockCatalystClient.getProfile).not.toHaveBeenCalled()
      })
    })
  })
})
