import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import type { ComponentsWithLogger } from '@dcl/platform-server-commons/dist/types'
import type { IHttpServerComponent } from '@well-known-components/interfaces'

export interface IModeratorComponent {
  moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<ComponentsWithLogger & DecentralandSignatureContext<any>>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse>
}
