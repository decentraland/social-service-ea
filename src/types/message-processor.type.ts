import { IBaseComponent } from '@well-known-components/interfaces'
import { Event } from '@dcl/schemas'

export interface IMessageProcessorComponent extends IBaseComponent {
  processMessage: (message: Event) => Promise<void>
}
