import { getPaginationParams } from '@dcl/platform-server-commons'
import { HandlerContextWithPath } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { IHttpServerComponent } from '@well-known-components/interfaces'

export async function getUserMutesHandler(
  context: Pick<HandlerContextWithPath<'userMutes' | 'logs', '/v1/mutes'>, 'components' | 'url' | 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userMutes, logs },
    verification,
    url
  } = context

  const logger = logs.getLogger('get-user-mutes-handler')

  try {
    const muterAddress = verification!.auth.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)

    // Optional filters
    const address = url.searchParams.get('address') || undefined
    const addresses = url.searchParams.getAll('addresses').filter(Boolean)

    const { mutes, total } = await userMutes.getMutedUsers(muterAddress, paginationParams, {
      address,
      addresses: addresses.length > 0 ? addresses : undefined
    })

    return {
      status: 200,
      body: {
        data: {
          results: mutes,
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting muted users, error: ${message}`)

    throw error
  }
}
