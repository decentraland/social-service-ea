import { IFetchComponent } from '@dcl/core-commons'
import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import {
  createCommsGatekeeperComponent,
  InvalidGatekeeperIdentifierError
} from '../../../src/adapters/comms-gatekeeper'
import { ICommsGatekeeperComponent } from '../../../src/types'
import { createLogsMockedComponent, createMockConfigComponent } from '../../mocks/components'

describe('when Gatekeeper identifiers cross the privileged service boundary', () => {
  let commsGatekeeper: ICommsGatekeeperComponent
  let fetchMock: jest.Mock

  beforeEach(async () => {
    fetchMock = jest.fn()

    const fetcher: IFetchComponent = { fetch: fetchMock }
    const logs: ILoggerComponent = createLogsMockedComponent()
    const config: IConfigComponent = createMockConfigComponent({
      requireString: jest.fn().mockImplementation((name: string) => {
        return name === 'COMMS_GATEKEEPER_URL' ? 'https://comms-gatekeeper.org' : 'comms-gatekeeper-token'
      })
    })

    commsGatekeeper = await createCommsGatekeeperComponent({ logs, config, fetcher })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and a community ID contains path traversal characters', () => {
    let maliciousCommunityId: string
    let caughtError: unknown

    beforeEach(async () => {
      maliciousCommunityId = '550e8400-e29b-41d4-a716-446655440000/../active'
      caughtError = undefined

      try {
        await commsGatekeeper.getCommunityVoiceChatStatus(maliciousCommunityId)
      } catch (error) {
        caughtError = error
      }
    })

    afterEach(() => {
      caughtError = undefined
    })

    it('should reject the identifier with a typed validation error', () => {
      expect(caughtError).toBeInstanceOf(InvalidGatekeeperIdentifierError)
    })

    it('should not issue a bearer-authenticated outbound request', () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('and a user address contains a path separator', () => {
    let maliciousAddress: string
    let caughtError: unknown

    beforeEach(async () => {
      maliciousAddress = '0x1234567890123456789012345678901234567890/active'
      caughtError = undefined

      try {
        await commsGatekeeper.isUserInAVoiceChat(maliciousAddress)
      } catch (error) {
        caughtError = error
      }
    })

    afterEach(() => {
      caughtError = undefined
    })

    it('should reject the identifier with a typed validation error', () => {
      expect(caughtError).toBeInstanceOf(InvalidGatekeeperIdentifierError)
    })

    it('should not issue a bearer-authenticated outbound request', () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('and a private call ID contains an encoded separator', () => {
    let maliciousCallId: string
    let validAddress: string
    let caughtError: unknown

    beforeEach(async () => {
      maliciousCallId = '550e8400-e29b-41d4-a716-446655440000%2factive'
      validAddress = '0x1234567890123456789012345678901234567890'
      caughtError = undefined

      try {
        await commsGatekeeper.endPrivateVoiceChat(maliciousCallId, validAddress)
      } catch (error) {
        caughtError = error
      }
    })

    afterEach(() => {
      caughtError = undefined
    })

    it('should reject the identifier with a typed validation error', () => {
      expect(caughtError).toBeInstanceOf(InvalidGatekeeperIdentifierError)
    })

    it('should not issue a bearer-authenticated outbound request', () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
