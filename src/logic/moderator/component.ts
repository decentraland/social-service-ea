import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { ComponentsWithLogger } from '@dcl/platform-server-commons/dist/types'
import { EthAddress } from '@dcl/schemas'
import { IHttpServerComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { IModeratorComponent } from './types'

export async function createModeratorComponent(
  addresses: string[],
  logs: ILoggerComponent
): Promise<IModeratorComponent> {
  const logger = logs.getLogger('moderator-component')

  const trimmedAddresses = addresses.map((address) => address.trim().toLowerCase())

  for (const address of trimmedAddresses) {
    if (address.length > 0 && !EthAddress.validate(address)) {
      // Only log warnings for non-empty invalid addresses
      logger.warn(`Filtering out invalid moderator address: ${address}`)
    }
  }

  const MODERATOR_ADDRESSES = trimmedAddresses.filter(EthAddress.validate)

  async function moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<ComponentsWithLogger & DecentralandSignatureContext<any>>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    const { verification } = context
    const address = verification?.auth?.toLowerCase()

    if (!EthAddress.validate(address) || !MODERATOR_ADDRESSES.includes(address)) {
      return {
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      }
    }

    return next()
  }

  return { moderatorAuthMiddleware }
}
