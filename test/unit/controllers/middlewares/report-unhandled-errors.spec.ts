import { InvalidRequestError, NotFoundError, NotAuthorizedError } from '@dcl/http-commons'
import { reportUnhandledErrors } from '../../../../src/controllers/middlewares/report-unhandled-errors'
import { mockTracing } from '../../../mocks/components/tracing'

const PATH = '/v1/communities/8c1e8f2a/members'

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    components: { tracing: mockTracing },
    request: { method: 'POST' },
    url: new URL(`https://social.decentraland.org${PATH}?limit=10`),
    ...overrides
  } as any
}

describe('reportUnhandledErrors', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('when the route succeeds', () => {
    it('should return the response untouched', async () => {
      const response = { status: 200, body: { ok: true } }

      await expect(reportUnhandledErrors(buildContext(), async () => response)).resolves.toBe(response)
    })

    it('should report nothing', async () => {
      await reportUnhandledErrors(buildContext(), async () => ({ status: 200 }))

      expect(mockTracing.captureException).not.toHaveBeenCalled()
    })
  })

  describe('when the route throws an error the shared handler maps to a 4xx', () => {
    const expectedErrors = [
      ['an invalid request', new InvalidRequestError('bad input')],
      ['a missing resource', new NotFoundError('no such community')],
      ['an unauthorized caller', new NotAuthorizedError('not a member')]
    ] as const

    it.each(expectedErrors)('should not report %s', async (_case, error) => {
      await expect(
        reportUnhandledErrors(buildContext(), async () => {
          throw error
        })
      ).rejects.toBe(error)

      expect(mockTracing.captureException).not.toHaveBeenCalled()
    })
  })

  describe('when the route throws an error that becomes a 500', () => {
    let error: Error

    beforeEach(() => {
      error = new Error('connection terminated unexpectedly')
    })

    it('should report it to Sentry', async () => {
      await expect(
        reportUnhandledErrors(buildContext(), async () => {
          throw error
        })
      ).rejects.toBe(error)

      expect(mockTracing.captureException).toHaveBeenCalledWith(error, expect.anything())
    })

    it('should rethrow it so the shared handler still builds the response', async () => {
      await expect(
        reportUnhandledErrors(buildContext(), async () => {
          throw error
        })
      ).rejects.toBe(error)
    })

    it('should attach the method and path so the failing route is identifiable', async () => {
      await reportUnhandledErrors(buildContext(), async () => {
        throw error
      }).catch(() => undefined)

      expect(mockTracing.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ method: 'POST', url: PATH })
      )
    })

    it('should not leak the query string, which can carry user-supplied values', async () => {
      await reportUnhandledErrors(buildContext(), async () => {
        throw error
      }).catch(() => undefined)

      const [, context] = (mockTracing.captureException as jest.Mock).mock.calls[0]
      expect(context.url).not.toContain('limit=10')
    })

    it('should attach the caller address when the route was signed', async () => {
      const ctx = buildContext({ verification: { auth: '0xabc' } })

      await reportUnhandledErrors(ctx, async () => {
        throw error
      }).catch(() => undefined)

      expect(mockTracing.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ address: '0xabc' }))
    })

    it('should leave the address out on unauthenticated routes', async () => {
      await reportUnhandledErrors(buildContext(), async () => {
        throw error
      }).catch(() => undefined)

      const [, context] = (mockTracing.captureException as jest.Mock).mock.calls[0]
      expect(context.address).toBeUndefined()
    })

    it('should report a thrown non-error value too, rather than swallowing it', async () => {
      await expect(
        reportUnhandledErrors(buildContext(), async () => {
          throw 'string failure'
        })
      ).rejects.toBe('string failure')

      expect(mockTracing.captureException).toHaveBeenCalled()
    })
  })
})
