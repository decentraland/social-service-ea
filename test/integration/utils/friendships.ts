import { IDatabaseComponent } from '../../../src/types'
import { Action } from '../../../src/types'

export async function createFriendshipRequest(
  db: IDatabaseComponent,
  users: [string, string],
  metadata?: Record<string, string>
) {
  const { id } = await db.createFriendship(users, false)
  await db.recordFriendshipAction(id, users[0], Action.REQUEST, metadata || null)
  return id
}

export async function createOrUpsertActiveFriendship(db: IDatabaseComponent, users: [string, string]) {
  let id: string | undefined
  const existingFriendship = await db.getFriendship(users)

  if (existingFriendship) {
    id = existingFriendship.id
    await db.updateFriendshipStatus(id, true)
  } else {
    const friendship = await db.createFriendship(users, true)
    id = friendship.id
  }

  await db.recordFriendshipAction(id, users[0], Action.REQUEST, null)
  await db.recordFriendshipAction(id, users[1], Action.ACCEPT, null)

  return id
}

export async function createPendingFriendshipRequest(db: IDatabaseComponent, users: [string, string]) {
  const { id } = await db.createFriendship(users, false)
  await db.recordFriendshipAction(id, users[0], Action.REQUEST, null)
  return id
}

export async function removeFriendship(db: IDatabaseComponent, id: string, actingUser: string) {
  await db.updateFriendshipStatus(id, false)
  await db.recordFriendshipAction(id, actingUser, Action.DELETE, null)
}
