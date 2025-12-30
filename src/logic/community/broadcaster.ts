import {
  CommunityDeletedEvent,
  CommunityInviteReceivedEvent,
  CommunityMemberBannedEvent,
  CommunityMemberRemovedEvent,
  CommunityRenamedEvent,
  CommunityRequestToJoinAcceptedEvent,
  CommunityRequestToJoinReceivedEvent,
  CommunityDeletedContentViolationEvent,
  Events,
  CommunityPostAddedEvent,
  CommunityOwnershipTransferredEvent,
  CommunityVoiceChatStartedEvent
} from '@dcl/schemas'
import { AppComponents, CommunityRole } from '../../types'
import { ICommunityBroadcasterComponent, CommunityMember } from './types'

const MEMBER_BATCH_SIZE = 100
const MEMBER_FETCH_BATCH_SIZE = 100

export type CommunityDeletedEventReducedMetadata = Omit<CommunityDeletedEvent, 'metadata'> & {
  metadata: {
    id: string
    name: string
    thumbnailUrl: string
  }
}

export type CommunityRenamedEventReducedMetadata = Omit<CommunityRenamedEvent, 'metadata'> & {
  metadata: {
    id: string
    thumbnailUrl: string
    oldName: string
    newName: string
  }
}

export type CommunityRequestToJoinReceivedEventReducedMetadata = Omit<
  CommunityRequestToJoinReceivedEvent,
  'metadata'
> & {
  metadata: {
    communityId: string
    communityName: string
    memberAddress: string
    memberName: string
    thumbnailUrl: string
  }
}

export type CommunityVoiceChatStartedEventReducedMetadata = Omit<CommunityVoiceChatStartedEvent, 'metadata'> & {
  metadata: {
    communityId: string
    communityName: string
    thumbnailUrl: string
  }
}

/**
 * Options for broadcasting events
 */
export type BroadcastOptions = {
  /**
   * Addresses to exclude from receiving the notification
   */
  excludeAddresses?: string[]
}

/**
 * Union type of all events that can be broadcasted
 */
export type BroadcastableEvent =
  | CommunityDeletedEventReducedMetadata
  | CommunityRenamedEventReducedMetadata
  | CommunityMemberRemovedEvent
  | CommunityMemberBannedEvent
  | CommunityRequestToJoinAcceptedEvent
  | CommunityRequestToJoinReceivedEventReducedMetadata
  | CommunityInviteReceivedEvent
  | CommunityDeletedContentViolationEvent
  | CommunityPostAddedEvent
  | CommunityOwnershipTransferredEvent
  | CommunityVoiceChatStartedEventReducedMetadata
/**
 * Type for event handlers that accept event and optional options
 */
type BroadcastingEventHandler = (event: BroadcastableEvent, options?: BroadcastOptions) => Promise<void>

/**
 * Registry mapping event subTypes to their broadcasting event handlers
 */
type BroadcastingRegistry = Map<Events.SubType.Community, BroadcastingEventHandler>

export function createCommunityBroadcasterComponent(
  components: Pick<AppComponents, 'sns' | 'communitiesDb' | 'peersStats'>
): ICommunityBroadcasterComponent {
  const { sns, communitiesDb, peersStats } = components

  /**
   * Gets community member addresses with pagination support
   * @param {string} communityId - The ID of the community
   * @param {Object} filters - Optional filters for member selection
   * @param {CommunityRole[]} [filters.roles] - Optional array of roles to filter by
   * @param {string[]} [filters.excludedAddresses] - Optional array of addresses to exclude
   * @param {boolean} [filters.onlyOnline] - Optional flag to only return online members
   * @returns {Promise<string[]>} Array of member addresses
   */
  async function getCommunityMemberAddresses(
    communityId: string,
    filters: { roles?: CommunityRole[]; excludedAddresses?: string[]; onlyOnline?: boolean } = {}
  ): Promise<string[]> {
    const allMemberAddresses: string[] = []
    const { onlyOnline, ...options } = filters

    let offset = 0
    let hasMore = true
    let filterByMembers: string[] | undefined

    if (onlyOnline) {
      filterByMembers = await peersStats.getConnectedPeers()
    }

    while (hasMore) {
      const communityMembers = await communitiesDb.getCommunityMembers(communityId, {
        pagination: {
          limit: MEMBER_FETCH_BATCH_SIZE,
          offset
        },
        filterByMembers,
        ...options
      })

      const memberAddresses = communityMembers.map((member: CommunityMember) => member.memberAddress)
      allMemberAddresses.push(...memberAddresses)

      if (memberAddresses.length < MEMBER_FETCH_BATCH_SIZE) {
        hasMore = false
      } else {
        offset += MEMBER_FETCH_BATCH_SIZE
      }
    }

    return allMemberAddresses
  }

  /**
   * Creates batches of member addresses
   * @param {string[]} memberAddresses - Array of member addresses to batch
   * @returns {string[][]} Array of batches, each containing up to MEMBER_BATCH_SIZE addresses
   */
  function createMemberBatches(memberAddresses: string[]): string[][] {
    const batches: string[][] = []
    for (let i = 0; i < memberAddresses.length; i += MEMBER_BATCH_SIZE) {
      batches.push(memberAddresses.slice(i, i + MEMBER_BATCH_SIZE))
    }
    return batches
  }

  /**
   * Broadcasts to all community members in batches
   * @param {BroadcastableEvent} event - The event to broadcast
   */
  async function broadcastToAllMembers(event: BroadcastableEvent): Promise<void> {
    const eventWithId = event as CommunityDeletedEventReducedMetadata | CommunityRenamedEventReducedMetadata
    const allMemberAddresses = await getCommunityMemberAddresses(eventWithId.metadata.id)
    const memberBatches = createMemberBatches(allMemberAddresses)

    await sns.publishMessages(
      memberBatches.map(
        (batch, i) =>
          ({
            ...event,
            key: `${event.key}-batch-${i + 1}`,
            metadata: {
              ...eventWithId.metadata,
              memberAddresses: batch
            }
          }) as CommunityDeletedEvent | CommunityRenamedEvent
      )
    )
  }

  /**
   * Broadcasts to owners and moderators only
   * @param {BroadcastableEvent} event - The event to broadcast
   */
  async function broadcastToOwnersAndModerators(event: BroadcastableEvent): Promise<void> {
    const eventWithCommunityId = event as CommunityRequestToJoinReceivedEventReducedMetadata
    const moderatorsAndOwners = await getCommunityMemberAddresses(eventWithCommunityId.metadata.communityId, {
      roles: [CommunityRole.Moderator, CommunityRole.Owner]
    })

    await sns.publishMessage({
      type: Events.Type.COMMUNITY,
      subType: event.subType,
      key: event.key,
      timestamp: event.timestamp,
      metadata: {
        ...eventWithCommunityId.metadata,
        addressesToNotify: moderatorsAndOwners
      }
    } as CommunityRequestToJoinReceivedEvent)
  }

  /**
   * Broadcasts to all members except the owner
   * @param {BroadcastableEvent} event - The event to broadcast
   */
  async function broadcastToAllMembersButOwner(event: BroadcastableEvent): Promise<void> {
    const eventWithId = event as CommunityDeletedEventReducedMetadata
    const addressesToNotify = await getCommunityMemberAddresses(eventWithId.metadata.id, {
      roles: [CommunityRole.Moderator, CommunityRole.Member]
    })

    const memberBatches = createMemberBatches(addressesToNotify)
    await sns.publishMessages(
      memberBatches.map((batch, i) => ({
        ...event,
        key: `${event.key}-batch-${i + 1}`,
        metadata: {
          ...eventWithId.metadata,
          memberAddresses: batch
        }
      }))
    )
  }

  /**
   * Broadcasts to all members except a specific excluded address
   * @param {BroadcastableEvent} event - The event to broadcast
   * @throws {Error} If excluded address or community ID is not found in metadata
   */
  async function broadcastToAllMembersButPostAuthor(event: BroadcastableEvent): Promise<void> {
    const {
      metadata: { authorAddress, communityId }
    } = event as CommunityPostAddedEvent

    const addressesToNotify = await getCommunityMemberAddresses(communityId, {
      excludedAddresses: [authorAddress.toLowerCase()]
    })
    const memberBatches = createMemberBatches(addressesToNotify)

    await sns.publishMessages(
      memberBatches.map((batch, i) => ({
        ...event,
        key: `${event.key}-batch-${i + 1}`,
        metadata: {
          ...event.metadata,
          addressesToNotify: batch
        }
      }))
    )
  }

  /**
   * Broadcasts voice chat started event to online community members
   * @param {BroadcastableEvent} event - The event to broadcast
   * @param {BroadcastOptions} options - Optional broadcast options (e.g., excludeAddresses)
   */
  async function broadcastVoiceChatStarted(event: BroadcastableEvent, options?: BroadcastOptions): Promise<void> {
    const { metadata } = event as CommunityVoiceChatStartedEventReducedMetadata

    const addressesToNotify = await getCommunityMemberAddresses(metadata.communityId, {
      onlyOnline: true,
      excludedAddresses: options?.excludeAddresses
    })

    if (addressesToNotify.length === 0) {
      return
    }

    const memberBatches = createMemberBatches(addressesToNotify)

    await sns.publishMessages(
      memberBatches.map((batch, i) => ({
        ...event,
        key: `${event.key}-batch-${i + 1}`,
        metadata: {
          ...event.metadata,
          addressesToNotify: batch
        }
      }))
    )
  }

  /**
   * Direct broadcast - publish event as-is without any modifications
   * @param {BroadcastableEvent} event - The event to broadcast
   */
  async function directBroadcast(event: BroadcastableEvent): Promise<void> {
    await sns.publishMessage(event)
  }

  /**
   * Creates the broadcasting registry with all strategies
   * @returns {BroadcastingRegistry} Map of event subTypes to their broadcasting handlers
   */
  function createBroadcastingRegistry(): BroadcastingRegistry {
    const registry = new Map<Events.SubType.Community, BroadcastingEventHandler>()

    registry.set(Events.SubType.Community.DELETED, broadcastToAllMembersButOwner)
    registry.set(Events.SubType.Community.RENAMED, broadcastToAllMembers)
    registry.set(Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED, broadcastToOwnersAndModerators)
    registry.set(Events.SubType.Community.POST_ADDED, broadcastToAllMembersButPostAuthor)
    registry.set(Events.SubType.Community.DELETED_CONTENT_VIOLATION, directBroadcast)
    registry.set(Events.SubType.Community.OWNERSHIP_TRANSFERRED, directBroadcast)
    registry.set(Events.SubType.Community.VOICE_CHAT_STARTED, broadcastVoiceChatStarted)

    return registry
  }

  const broadcastingRegistry = createBroadcastingRegistry()

  /**
   * Broadcasts an event to the appropriate recipients based on the event type
   * @param {BroadcastableEvent} event - The event to broadcast
   * @param {BroadcastOptions} options - Optional broadcast options
   */
  async function broadcast(event: BroadcastableEvent, options?: BroadcastOptions): Promise<void> {
    const broadcastingEventHandler = broadcastingRegistry.get(event.subType) || directBroadcast
    await broadcastingEventHandler(event, options)
  }

  return {
    broadcast
  }
}
