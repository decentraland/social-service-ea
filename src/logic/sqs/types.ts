import { IBaseComponent } from '@well-known-components/interfaces'
import { Event } from '@dcl/schemas'

export interface IMessageConsumerComponent extends IBaseComponent {
  getStatus(): {
    isRunning: boolean
    lastPullAt: number
  }
}

export interface IMessageProcessorComponent extends IBaseComponent {
  processMessage: (message: Event) => Promise<void>
}
