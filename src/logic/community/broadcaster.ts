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
  CommunityPostAddedEvent
} from '@dcl/schemas'
import { AppComponents, CommunityRole, ICommunitiesDatabaseComponent } from '../../types'
import { ICommunityBroadcasterComponent, CommunityMember } from './types'
import { IPublisherComponent } from '@dcl/sns-component'

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

/**
 * Context passed to broadcasting strategies
 */
type BroadcastingContext = {
  sns: IPublisherComponent
  communitiesDb: ICommunitiesDatabaseComponent
}

/**
 * Interface for broadcasting strategies
 */
interface IBroadcastingStrategy {
  /**
   * Executes the broadcasting strategy for a given event
   */
  execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void>
}

/**
 * Helper functions for broadcasting
 */
type BroadcastingHelpers = {
  getAllCommunityMembersAddresses: (
    context: BroadcastingContext,
    communityId: string,
    filters?: { roles?: CommunityRole[] }
  ) => Promise<string[]>
  createMemberBatches: (memberAddresses: string[]) => string[][]
}

/**
 * Creates helper functions for broadcasting operations
 */
function createBroadcastingHelpers(): BroadcastingHelpers {
  async function getAllCommunityMembersAddresses(
    context: BroadcastingContext,
    communityId: string,
    filters: { roles?: CommunityRole[] } = {}
  ): Promise<string[]> {
    const allMemberAddresses: string[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const communityMembers = await context.communitiesDb.getCommunityMembers(communityId, {
        pagination: {
          limit: MEMBER_FETCH_BATCH_SIZE,
          offset
        },
        ...filters
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

  function createMemberBatches(memberAddresses: string[]): string[][] {
    const batches: string[][] = []
    for (let i = 0; i < memberAddresses.length; i += MEMBER_BATCH_SIZE) {
      batches.push(memberAddresses.slice(i, i + MEMBER_BATCH_SIZE))
    }
    return batches
  }

  return {
    getAllCommunityMembersAddresses,
    createMemberBatches
  }
}

/**
 * Strategy: Broadcast to all community members in batches
 */
class BroadcastToAllMembersStrategy implements IBroadcastingStrategy {
  async execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void> {
    const helpers = createBroadcastingHelpers()
    const eventWithId = event as CommunityDeletedEventReducedMetadata | CommunityRenamedEventReducedMetadata
    const allMemberAddresses = await helpers.getAllCommunityMembersAddresses(context, eventWithId.metadata.id)
    const memberBatches = helpers.createMemberBatches(allMemberAddresses)

    await context.sns.publishMessages(
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
}

/**
 * Strategy: Broadcast to owners and moderators only
 */
class BroadcastToOwnersAndModeratorsStrategy implements IBroadcastingStrategy {
  async execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void> {
    const helpers = createBroadcastingHelpers()
    const eventWithCommunityId = event as CommunityRequestToJoinReceivedEventReducedMetadata
    const moderatorsAndOwners = await helpers.getAllCommunityMembersAddresses(
      context,
      eventWithCommunityId.metadata.communityId,
      {
        roles: [CommunityRole.Moderator, CommunityRole.Owner]
      }
    )

    await context.sns.publishMessage({
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
}

/**
 * Strategy: Broadcast to all members except the owner
 */
class BroadcastToAllMembersButOwnerStrategy implements IBroadcastingStrategy {
  async execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void> {
    const helpers = createBroadcastingHelpers()
    const eventWithId = event as CommunityDeletedEventReducedMetadata
    const addressesToNotify = await helpers.getAllCommunityMembersAddresses(context, eventWithId.metadata.id, {
      roles: [CommunityRole.Moderator, CommunityRole.Member]
    })

    const memberBatches = helpers.createMemberBatches(addressesToNotify)
    await context.sns.publishMessages(
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
}

/**
 * Strategy: Broadcast to all members except a specific excluded address
 * Looks for excludedAddress in metadata, or falls back to common field names like authorAddress, senderAddress, etc.
 */
class BroadcastToAllMembersButExcludedStrategy implements IBroadcastingStrategy {
  /**
   * Extracts the excluded address from event metadata
   * Checks multiple possible field names for backward compatibility
   */
  private getExcludedAddress(metadata: any): string | null {
    // Try common field names for excluded addresses
    const possibleFields = ['excludedAddress', 'authorAddress', 'senderAddress', 'creatorAddress', 'actorAddress']
    for (const field of possibleFields) {
      if (metadata[field] && typeof metadata[field] === 'string') {
        return metadata[field].toLowerCase()
      }
    }
    return null
  }

  /**
   * Gets the community ID from event metadata
   */
  private getCommunityId(metadata: any): string | null {
    return metadata.communityId || metadata.id || null
  }

  async execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void> {
    const helpers = createBroadcastingHelpers()
    const excludedAddress = this.getExcludedAddress(event.metadata)
    const communityId = this.getCommunityId(event.metadata)

    if (!excludedAddress) {
      throw new Error('Event metadata must contain an excluded address field (excludedAddress, authorAddress, etc.)')
    }

    if (!communityId) {
      throw new Error('Event metadata must contain a communityId or id field')
    }

    // Get all community members
    const allMemberAddresses = await helpers.getAllCommunityMembersAddresses(context, communityId)

    // Filter out the excluded address
    const addressesToNotify = allMemberAddresses.filter((address) => address.toLowerCase() !== excludedAddress)

    // Create batches and publish
    const memberBatches = helpers.createMemberBatches(addressesToNotify)

    await context.sns.publishMessages(
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
}

/**
 * Strategy: Broadcast deleted content violation - notify owner with original event,
 * then notify other members with a DELETED event
 */
class BroadcastDeletedContentViolationStrategy implements IBroadcastingStrategy {
  async execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void> {
    const violationEvent = event as CommunityDeletedContentViolationEvent

    // Notify the owner with the original content violation event
    await context.sns.publishMessage(violationEvent)

    // Send a different notification to the rest of the community members
    const communityDeletedEvent: CommunityDeletedEventReducedMetadata = {
      ...violationEvent,
      subType: Events.SubType.Community.DELETED,
      metadata: {
        id: violationEvent.metadata.id,
        name: violationEvent.metadata.name,
        thumbnailUrl: violationEvent.metadata.thumbnailUrl
      }
    }

    const strategy = new BroadcastToAllMembersButOwnerStrategy()
    await strategy.execute(context, communityDeletedEvent)
  }
}

/**
 * Strategy: Direct broadcast - publish event as-is without any modifications
 */
class DirectBroadcastStrategy implements IBroadcastingStrategy {
  async execute(context: BroadcastingContext, event: BroadcastableEvent): Promise<void> {
    await context.sns.publishMessage(event)
  }
}

/**
 * Registry mapping event subTypes to their broadcasting strategies
 */
type StrategyRegistry = Map<Events.SubType.Community, IBroadcastingStrategy>

/**
 * Creates the default strategy registry
 */
function createStrategyRegistry(): StrategyRegistry {
  const registry = new Map<Events.SubType.Community, IBroadcastingStrategy>()

  // Events that should be broadcasted to all members
  registry.set(Events.SubType.Community.DELETED, new BroadcastToAllMembersStrategy())
  registry.set(Events.SubType.Community.RENAMED, new BroadcastToAllMembersStrategy())

  // Events that should be broadcasted to owners and moderators only
  registry.set(Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED, new BroadcastToOwnersAndModeratorsStrategy())

  // Events that should be broadcasted to all members except a specific excluded address
  registry.set(Events.SubType.Community.POST_ADDED, new BroadcastToAllMembersButExcludedStrategy())

  // Events that need special handling
  registry.set(Events.SubType.Community.DELETED_CONTENT_VIOLATION, new BroadcastDeletedContentViolationStrategy())

  // Default strategy for all other events (direct broadcast)
  return registry
}

/**
 * Gets the broadcasting strategy for a given event subType
 */
function getStrategyForEvent(registry: StrategyRegistry, subType: Events.SubType.Community): IBroadcastingStrategy {
  return registry.get(subType) || new DirectBroadcastStrategy()
}

export function createCommunityBroadcasterComponent(
  components: Pick<AppComponents, 'sns' | 'communitiesDb'>
): ICommunityBroadcasterComponent {
  const strategyRegistry = createStrategyRegistry()

  async function broadcast(event: BroadcastableEvent): Promise<void> {
    const context: BroadcastingContext = {
      sns: components.sns,
      communitiesDb: components.communitiesDb
    }

    const strategy = getStrategyForEvent(strategyRegistry, event.subType)
    await strategy.execute(context, event)
  }

  return {
    broadcast
  }
}
