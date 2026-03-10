import { FeatureFlag, IFeatureFlagsAdapter } from '../../../src/adapters/feature-flags'
import { createModeratorComponent } from '../../../src/logic/moderator'
import { IModeratorComponent } from '../../../src/logic/moderator/types'

describe('moderator-component', () => {
  let mockLogs: any
  let mockFeatureFlags: jest.Mocked<IFeatureFlagsAdapter>

  beforeEach(() => {
    mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        log: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      })
    }
    mockFeatureFlags = {
      isEnabled: jest.fn(),
      getVariants: jest.fn()
    } as any
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createMockContext(auth?: string) {
    return {
      verification: auth !== undefined ? { auth } : undefined
    } as any
  }

  function createMockFeatureFlags(addresses: string[]): jest.Mocked<IFeatureFlagsAdapter> {
    mockFeatureFlags.getVariants.mockResolvedValue(addresses)
    return mockFeatureFlags
  }

  describe('when an allowlisted address makes a request', () => {
    let component: IModeratorComponent
    let moderatorAddress: string
    let next: jest.Mock

    beforeEach(async () => {
      moderatorAddress = '0x1234567890abcdef1234567890abcdef12345678'
      component = await createModeratorComponent({ featureFlags: createMockFeatureFlags([moderatorAddress]), logs: mockLogs })
      next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
    })

    it('should call next() and return its response', async () => {
      const result = await component.moderatorAuthMiddleware(createMockContext(moderatorAddress), next)

      expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.PLATFORM_USER_MODERATORS)
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { ok: true } })
    })
  })

  describe('when a non-allowlisted address makes a request', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      component = await createModeratorComponent({
        featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
        logs: mockLogs
      })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        createMockContext('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when the address has different casing', () => {
    describe('and the allowlist uses lowercase but the request uses uppercase', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
          logs: mockLogs
      })
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should pass the request through', async () => {
        const result = await component.moderatorAuthMiddleware(
          createMockContext('0x1234567890ABCDEF1234567890ABCDEF12345678'),
          next
        )

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })

    describe('and the allowlist uses uppercase but the request uses lowercase', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags(['0x1234567890ABCDEF1234567890ABCDEF12345678']),
          logs: mockLogs
      })
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should pass the request through', async () => {
        const result = await component.moderatorAuthMiddleware(
          createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
          next
        )

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })
  })

  describe('when the feature flag returns no addresses', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      component = await createModeratorComponent({ featureFlags: createMockFeatureFlags([]), logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when the feature flag returns undefined', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      mockFeatureFlags.getVariants.mockResolvedValue(undefined)
      component = await createModeratorComponent({ featureFlags: mockFeatureFlags, logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when verification is undefined', () => {
    let component: IModeratorComponent
    let next: jest.Mock
    let context: any

    beforeEach(async () => {
      component = await createModeratorComponent({
        featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
        logs: mockLogs
      })
      next = jest.fn()
      context = { verification: undefined }
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(context, next)

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when verification.auth is undefined', () => {
    let component: IModeratorComponent
    let next: jest.Mock
    let context: any

    beforeEach(async () => {
      component = await createModeratorComponent({
        featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
        logs: mockLogs
      })
      next = jest.fn()
      context = { verification: { auth: undefined } }
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(context, next)

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when invalid addresses are in the feature flag', () => {
    let logger: any
    let component: IModeratorComponent
    let validAddress: string

    beforeEach(async () => {
      validAddress = '0x1234567890abcdef1234567890abcdef12345678'
      logger = {
        log: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      }
      mockLogs.getLogger.mockReturnValue(logger)
      component = await createModeratorComponent({
        featureFlags: createMockFeatureFlags([validAddress, 'not-an-address', '']),
        logs: mockLogs
      })
    })

    describe('and a valid address makes a request', () => {
      let next: jest.Mock

      beforeEach(() => {
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should pass the request through', async () => {
        const result = await component.moderatorAuthMiddleware(createMockContext(validAddress), next)

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })
  })
})
