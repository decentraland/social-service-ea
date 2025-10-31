import { IBaseComponent } from '@well-known-components/interfaces'
import { Event, Events } from '@dcl/schemas'

export interface IMessageConsumerComponent extends IBaseComponent {
  getStatus(): {
    isRunning: boolean
    lastPullAt: number
  }
}

export type EventHandler = {
  type: Events.Type
  subTypes: (typeof Events.SubType)[keyof typeof Events.SubType][]
  handler: (message: Event) => Promise<void>
}

export interface IMessageProcessorComponent extends IBaseComponent {
  processMessage: (message: Event) => Promise<void>
  registerHandler: (handler: EventHandler) => void
}
