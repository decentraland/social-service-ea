import { IDatabaseComponent } from '../src/adapters/db'
import { Action } from '../src/types'

export async function createFriendshipRequest(
  db: IDatabaseComponent,
  users: [string, string],
  metadata?: Record<string, string>
) {
  const newFriendshipId = await db.createFriendship(users, false)
  await db.recordFriendshipAction(newFriendshipId, users[0], Action.REQUEST, metadata || null)
  return newFriendshipId
}

export async function createActiveFriendship(db: IDatabaseComponent, users: [string, string]) {
  const id = await db.createFriendship(users, true)
  await db.recordFriendshipAction(id, users[0], Action.REQUEST, null)
  await db.recordFriendshipAction(id, users[1], Action.ACCEPT, null)
}
