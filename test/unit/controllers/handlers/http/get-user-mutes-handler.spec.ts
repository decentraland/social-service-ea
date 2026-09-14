import { getUserMutesHandler } from '../../../../../src/controllers/handlers/http/get-user-mutes-handler'
import { createUserMutesMockedComponent } from '../../../../mocks/components/user-mutes'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'

let mockUserMutes: ReturnType<typeof createUserMutesMockedComponent>
let mockLogs: ReturnType<typeof createLogsMockedComponent>

beforeEach(() => {
  mockUserMutes = createUserMutesMockedComponent()
  mockLogs = createLogsMockedComponent()
})

describe('when there are muted users', () => {
  const mockMutes = [
    { address: '0xaaaa000000000000000000000000000000000001', muted_at: new Date('2024-01-01') },
    { address: '0xaaaa000000000000000000000000000000000002', muted_at: new Date('2024-01-02') }
  ]

  beforeEach(() => {
    mockUserMutes.getMutedUsers.mockResolvedValue({ mutes: mockMutes, total: 2 })
  })

  it('should return 200 with muted users', async () => {
    const url = new URL('http://localhost/v1/mutes?limit=10&offset=0')

    const result = await getUserMutesHandler({
      components: { userMutes: mockUserMutes, logs: mockLogs },
      url,
      verification: { auth: '0x1234567890123456789012345678901234567890' } as any
    })

    expect(result.status).toBe(200)
    expect((result.body as any).data.results).toEqual(mockMutes)
    expect((result.body as any).data.total).toBe(2)
  })
})

describe('when filtering by single address', () => {
  beforeEach(() => {
    mockUserMutes.getMutedUsers.mockResolvedValue({
      mutes: [{ address: '0xaaaa000000000000000000000000000000000001', muted_at: new Date() }],
      total: 1
    })
  })

  it('should pass the address filter', async () => {
    const url = new URL('http://localhost/v1/mutes?address=0xaaaa000000000000000000000000000000000001')

    await getUserMutesHandler({
      components: { userMutes: mockUserMutes, logs: mockLogs },
      url,
      verification: { auth: '0x1234567890123456789012345678901234567890' } as any
    })

    expect(mockUserMutes.getMutedUsers).toHaveBeenCalledWith(
      '0x1234567890123456789012345678901234567890',
      expect.anything(),
      expect.objectContaining({
        address: '0xaaaa000000000000000000000000000000000001'
      })
    )
  })
})

describe('when filtering by multiple addresses', () => {
  beforeEach(() => {
    mockUserMutes.getMutedUsers.mockResolvedValue({ mutes: [], total: 0 })
  })

  it('should use getAll to parse array-based addresses parameter', async () => {
    const url = new URL(
      'http://localhost/v1/mutes?addresses=0xaaaa000000000000000000000000000000000001&addresses=0xaaaa000000000000000000000000000000000002'
    )

    await getUserMutesHandler({
      components: { userMutes: mockUserMutes, logs: mockLogs },
      url,
      verification: { auth: '0x1234567890123456789012345678901234567890' } as any
    })

    expect(mockUserMutes.getMutedUsers).toHaveBeenCalledWith(
      '0x1234567890123456789012345678901234567890',
      expect.anything(),
      expect.objectContaining({
        addresses: ['0xaaaa000000000000000000000000000000000001', '0xaaaa000000000000000000000000000000000002']
      })
    )
  })
})

describe('when there are no muted users', () => {
  beforeEach(() => {
    mockUserMutes.getMutedUsers.mockResolvedValue({ mutes: [], total: 0 })
  })

  it('should return 200 with empty results', async () => {
    const url = new URL('http://localhost/v1/mutes')

    const result = await getUserMutesHandler({
      components: { userMutes: mockUserMutes, logs: mockLogs },
      url,
      verification: { auth: '0x1234567890123456789012345678901234567890' } as any
    })

    expect(result.status).toBe(200)
    expect((result.body as any).data.results).toEqual([])
    expect((result.body as any).data.total).toBe(0)
  })
})

describe('when the component throws an error', () => {
  beforeEach(() => {
    mockUserMutes.getMutedUsers.mockRejectedValue(new Error('Unexpected error'))
  })

  it('should throw the error', async () => {
    const url = new URL('http://localhost/v1/mutes')

    await expect(
      getUserMutesHandler({
        components: { userMutes: mockUserMutes, logs: mockLogs },
        url,
        verification: { auth: '0x1234567890123456789012345678901234567890' } as any
      })
    ).rejects.toThrow('Unexpected error')
  })
})
