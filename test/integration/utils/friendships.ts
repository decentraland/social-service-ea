import { IFriendsDatabaseComponent, PrivateMessagesPrivacy } from '../../../src/types'
import { Action } from '../../../src/types'

export async function createFriendshipRequest(
  friendsDb: IFriendsDatabaseComponent,
  users: [string, string],
  metadata?: Record<string, string>
) {
  const { id } = await friendsDb.createFriendship(users, false)
  await friendsDb.recordFriendshipAction(id, users[0], Action.REQUEST, metadata || null)
  return id
}

export async function createOrUpsertActiveFriendship(friendsDb: IFriendsDatabaseComponent, users: [string, string]) {
  let id: string | undefined
  const existingFriendship = await friendsDb.getFriendship(users)

  if (existingFriendship) {
    id = existingFriendship.id
    await friendsDb.updateFriendshipStatus(id, true)
  } else {
    const friendship = await friendsDb.createFriendship(users, true)
    id = friendship.id
  }

  await friendsDb.recordFriendshipAction(id, users[0], Action.REQUEST, null)
  await friendsDb.recordFriendshipAction(id, users[1], Action.ACCEPT, null)

  return id
}

export async function createPendingFriendshipRequest(friendsDb: IFriendsDatabaseComponent, users: [string, string]) {
  const { id } = await friendsDb.createFriendship(users, false)
  await friendsDb.recordFriendshipAction(id, users[0], Action.REQUEST, null)
  return id
}

export async function removeFriendship(friendsDb: IFriendsDatabaseComponent, id: string, actingUser: string) {
  await friendsDb.updateFriendshipStatus(id, false)
  await friendsDb.recordFriendshipAction(id, actingUser, Action.DELETE, null)
}

export async function createOrUpdateSocialSettings(
  friendsDb: IFriendsDatabaseComponent,
  address: string,
  privacySettings: PrivateMessagesPrivacy
) {
  await friendsDb.upsertSocialSettings(address, {
    private_messages_privacy: privacySettings
  })
}

export function removeSocialSettings(friendsDb: IFriendsDatabaseComponent, address: string): Promise<void> {
  return friendsDb.deleteSocialSettings(address)
}
