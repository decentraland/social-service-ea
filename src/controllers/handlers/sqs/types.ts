import { Events, Event } from '@dcl/schemas'

export type EventHandler = {
  type: Events.Type
  subTypes: Event['subType'][]
  handle: (message: Event) => Promise<void>
}
