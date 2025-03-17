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

export async function createActiveFriendship(db: IDatabaseComponent, users: [string, string]) {
  const { id } = await db.createFriendship(users, true)
  await db.recordFriendshipAction(id, users[0], Action.REQUEST, null)
  await db.recordFriendshipAction(id, users[1], Action.ACCEPT, null)

  return id
}

export async function removeFriendship(db: IDatabaseComponent, id: string, actingUser: string) {
  await db.updateFriendshipStatus(id, false)
  await db.recordFriendshipAction(id, actingUser, Action.DELETE, null)
}
