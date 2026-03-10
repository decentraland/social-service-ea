import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { ComponentsWithLogger } from '@dcl/platform-server-commons/dist/types'
import { EthAddress } from '@dcl/schemas'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { FeatureFlag } from '../../adapters/feature-flags'
import { IModeratorComponent } from './types'
import { AppComponents } from '../../types'

export async function createModeratorComponent({
  featureFlags,
  logs
}: Pick<AppComponents, 'featureFlags' | 'logs'>): Promise<IModeratorComponent> {
  const logger = logs.getLogger('moderator-component')

  async function getModeratorAddresses(): Promise<string[]> {
    const addresses = (await featureFlags.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)) || []

    const trimmedAddresses = addresses.map((address) => address.trim().toLowerCase())

    for (const address of trimmedAddresses) {
      if (address.length > 0 && !EthAddress.validate(address)) {
        logger.warn(`Filtering out invalid moderator address: ${address}`)
      }
    }

    return trimmedAddresses.filter(EthAddress.validate)
  }

  async function moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<ComponentsWithLogger & DecentralandSignatureContext<any>>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    const { verification } = context
    const address = verification?.auth?.toLowerCase()

    const moderatorAddresses = await getModeratorAddresses()

    if (!EthAddress.validate(address) || !moderatorAddresses.includes(address)) {
      return {
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      }
    }

    return next()
  }

  return { moderatorAuthMiddleware }
}
