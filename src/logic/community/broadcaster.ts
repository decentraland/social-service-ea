import {
  CommunityDeletedEvent,
  CommunityInviteReceivedEvent,
  CommunityMemberBannedEvent,
  CommunityMemberRemovedEvent,
  CommunityRenamedEvent,
  CommunityRequestToJoinAcceptedEvent,
  CommunityRequestToJoinReceivedEvent,
  CommunityDeletedContentViolationEvent,
  Events
} from '@dcl/schemas'
import { AppComponents, CommunityRole } from '../../types'
import { ICommunityBroadcasterComponent } from './types'

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

export function createCommunityBroadcasterComponent(
  components: Pick<AppComponents, 'sns' | 'communitiesDb'>
): ICommunityBroadcasterComponent {
  const { sns, communitiesDb } = components

  async function getAllCommunityMembersAddresses(
    communityId: string,
    filters: { roles?: CommunityRole[] } = {}
  ): Promise<string[]> {
    const allMemberAddresses: string[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const communityMembers = await communitiesDb.getCommunityMembers(communityId, {
        pagination: {
          limit: MEMBER_FETCH_BATCH_SIZE,
          offset
        },
        ...filters
      })

      const memberAddresses = communityMembers.map((member) => member.memberAddress)
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

  /**
   * Publishes an event to all members of a community.
   * @param event - The event to publish.
   * @returns A promise that resolves when the event is published.
   */
  async function publishToAllMembers(
    event: CommunityDeletedEventReducedMetadata | CommunityRenamedEventReducedMetadata
  ): Promise<void> {
    const allMemberAddresses = await getAllCommunityMembersAddresses(event.metadata.id)
    const memberBatches = createMemberBatches(allMemberAddresses)

    await sns.publishMessagesInBatch(
      memberBatches.map(
        (batch, i) =>
          ({
            ...event,
            key: `${event.key}-batch-${i + 1}`,
            metadata: {
              ...event.metadata,
              memberAddresses: batch
            }
          }) as CommunityDeletedEvent | CommunityRenamedEvent
      )
    )
  }

  /**
   * Publishes an event to all moderators and owners of a community.
   * @param event - The event to publish.
   * @returns A promise that resolves when the event is published.
   */
  async function publishToOwnersAndModerators(
    event: CommunityRequestToJoinReceivedEventReducedMetadata
  ): Promise<void> {
    const moderatorsAndOwners: string[] = await getAllCommunityMembersAddresses(event.metadata.communityId, {
      roles: [CommunityRole.Moderator, CommunityRole.Owner]
    })

    await sns.publishMessage({
      type: Events.Type.COMMUNITY,
      subType: event.subType,
      key: event.key,
      timestamp: event.timestamp,
      metadata: {
        ...event.metadata,
        addressesToNotify: moderatorsAndOwners
      }
    } as CommunityRequestToJoinReceivedEvent)
  }

  /**
   * Publishes an event to all members of a community but the owner.
   * @param event - The event to publish.
   * @returns A promise that resolves when the event is published.
   */
  async function publishToAllMembersButOwner(event: CommunityDeletedEventReducedMetadata): Promise<void> {
    const addressesToNotify = await getAllCommunityMembersAddresses(event.metadata.id, {
      roles: [CommunityRole.Moderator, CommunityRole.Member]
    })

    const memberBatches = createMemberBatches(addressesToNotify)
    await sns.publishMessagesInBatch(
      memberBatches.map((batch, i) => ({
        ...event,
        key: `${event.key}-batch-${i + 1}`,
        metadata: {
          ...event.metadata,
          memberAddresses: batch
        }
      }))
    )
  }

  async function broadcast(
    event:
      | CommunityDeletedEventReducedMetadata
      | CommunityRenamedEventReducedMetadata
      | CommunityMemberRemovedEvent
      | CommunityMemberBannedEvent
      | CommunityRequestToJoinAcceptedEvent
      | CommunityRequestToJoinReceivedEventReducedMetadata
      | CommunityInviteReceivedEvent
      | CommunityDeletedContentViolationEvent
  ) {
    const shouldReportEventToAllMembers =
      event.subType === Events.SubType.Community.DELETED || event.subType === Events.SubType.Community.RENAMED

    const shouldReportEventToOwnersAndModerators = event.subType === Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED

    if (shouldReportEventToAllMembers) {
      await publishToAllMembers(event as CommunityDeletedEventReducedMetadata | CommunityRenamedEventReducedMetadata)
    } else if (shouldReportEventToOwnersAndModerators) {
      await publishToOwnersAndModerators(event as CommunityRequestToJoinReceivedEventReducedMetadata)
    } else if (event.subType === Events.SubType.Community.DELETED_CONTENT_VIOLATION) {
      // Notify the owner
      await sns.publishMessage(event)

      // Send a different notification to the rest of the community members
      const communityDeletedEvent = {
        ...event,
        subType: Events.SubType.Community.DELETED,
        metadata: {
          id: event.metadata.id,
          name: event.metadata.name,
          thumbnailUrl: event.metadata.thumbnailUrl
        }
      } as CommunityDeletedEventReducedMetadata
      await publishToAllMembersButOwner(communityDeletedEvent)
    } else {
      await sns.publishMessage(event)
    }
  }

  return {
    broadcast
  }
}
