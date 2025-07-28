import {
  CommunityDeletedEvent,
  CommunityMemberBannedEvent,
  CommunityMemberRemovedEvent,
  CommunityRenamedEvent,
  Events
} from '@dcl/schemas'
import { AppComponents } from '../../types'
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

export function createCommunityBroadcasterComponent(
  components: Pick<AppComponents, 'sns' | 'communitiesDb'>
): ICommunityBroadcasterComponent {
  const { sns, communitiesDb } = components

  async function getAllCommunityMembers(communityId: string): Promise<string[]> {
    const allMemberAddresses: string[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const communityMembers = await communitiesDb.getCommunityMembers(communityId, {
        pagination: {
          limit: MEMBER_FETCH_BATCH_SIZE,
          offset
        }
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
    const allMemberAddresses = await getAllCommunityMembers(event.metadata.id)
    const memberBatches = createMemberBatches(allMemberAddresses)

    for (let i = 0; i < memberBatches.length; i++) {
      const batch = memberBatches[i]

      const eventKey = `${event.key}-batch-${i + 1}`

      await sns.publishMessage({
        type: Events.Type.COMMUNITY,
        subType: event.subType,
        key: eventKey,
        timestamp: event.timestamp,
        metadata: {
          ...event.metadata,
          memberAddresses: batch
        }
      } as CommunityDeletedEvent | CommunityRenamedEvent)
    }
  }

  async function broadcast(
    event:
      | CommunityDeletedEventReducedMetadata
      | CommunityRenamedEventReducedMetadata
      | CommunityMemberRemovedEvent
      | CommunityMemberBannedEvent
  ) {
    const shouldReportEventToAllMembers =
      event.subType === Events.SubType.Community.DELETED || event.subType === Events.SubType.Community.RENAMED

    if (shouldReportEventToAllMembers) {
      await publishToAllMembers(event as CommunityDeletedEventReducedMetadata | CommunityRenamedEventReducedMetadata)
    } else {
      await sns.publishMessage(event)
    }
  }

  return {
    broadcast
  }
}
