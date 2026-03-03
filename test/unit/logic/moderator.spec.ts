import { createModeratorComponent } from '../../../src/logic/moderator'
import { IModeratorComponent } from '../../../src/logic/moderator/types'

describe('moderator-component', () => {
  let mockLogs: any

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
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createMockContext(auth?: string) {
    return {
      verification: auth !== undefined ? { auth } : undefined
    } as any
  }

  describe('when an allowlisted address makes a request', () => {
    let component: IModeratorComponent
    let moderatorAddress: string
    let next: jest.Mock

    beforeEach(async () => {
      moderatorAddress = '0x1234567890abcdef1234567890abcdef12345678'
      component = await createModeratorComponent([moderatorAddress], mockLogs)
      next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
    })

    it('should call next() and return its response', async () => {
      const result = await component.moderatorAuthMiddleware(createMockContext(moderatorAddress), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { ok: true } })
    })
  })

  describe('when a non-allowlisted address makes a request', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      component = await createModeratorComponent(['0x1234567890abcdef1234567890abcdef12345678'], mockLogs)
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
        component = await createModeratorComponent(['0x1234567890abcdef1234567890abcdef12345678'], mockLogs)
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
        component = await createModeratorComponent(['0x1234567890ABCDEF1234567890ABCDEF12345678'], mockLogs)
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

  describe('when the allowlist is empty', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      component = await createModeratorComponent([], mockLogs)
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
      component = await createModeratorComponent(['0x1234567890abcdef1234567890abcdef12345678'], mockLogs)
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
      component = await createModeratorComponent(['0x1234567890abcdef1234567890abcdef12345678'], mockLogs)
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

  describe('when invalid addresses are in the constructor', () => {
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
      component = await createModeratorComponent([validAddress, 'not-an-address', ''], mockLogs)
    })

    it('should log a warning for non-empty invalid addresses and not for empty strings', () => {
      expect(logger.warn).toHaveBeenCalledWith('Filtering out invalid moderator address: not-an-address')
      expect(logger.warn).toHaveBeenCalledTimes(1)
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
