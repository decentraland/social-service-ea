import { IBaseComponent } from '@well-known-components/interfaces'

export interface IMessageConsumerComponent extends IBaseComponent {
  getStatus(): {
    isRunning: boolean
    lastPullAt: number
  }
}
