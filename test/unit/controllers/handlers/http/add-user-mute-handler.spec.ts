import { addUserMuteHandler } from '../../../../../src/controllers/handlers/http/add-user-mute-handler'
import { createUserMutesMockedComponent } from '../../../../mocks/components/user-mutes'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { SelfMuteError } from '../../../../../src/logic/user-mutes/errors'

let mockUserMutes: ReturnType<typeof createUserMutesMockedComponent>
let mockLogs: ReturnType<typeof createLogsMockedComponent>

beforeEach(() => {
  mockUserMutes = createUserMutesMockedComponent()
  mockLogs = createLogsMockedComponent()
})

describe('when the request is valid', () => {
  beforeEach(() => {
    mockUserMutes.muteUser.mockResolvedValue()
  })

  it('should return 204', async () => {
    const result = await addUserMuteHandler({
      components: { userMutes: mockUserMutes, logs: mockLogs },
      request: {
        json: jest.fn().mockResolvedValue({ muted_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' })
      } as any,
      verification: { auth: '0x1234567890123456789012345678901234567890' } as any
    })

    expect(result).toEqual({ status: 204 })
    expect(mockUserMutes.muteUser).toHaveBeenCalledWith(
      '0x1234567890123456789012345678901234567890',
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    )
  })
})

describe('when the muted_address is invalid', () => {
  it('should throw InvalidRequestError', async () => {
    await expect(
      addUserMuteHandler({
        components: { userMutes: mockUserMutes, logs: mockLogs },
        request: { json: jest.fn().mockResolvedValue({ muted_address: 'not-an-address' }) } as any,
        verification: { auth: '0x1234567890123456789012345678901234567890' } as any
      })
    ).rejects.toThrow(InvalidRequestError)
  })
})

describe('when the user tries to mute themselves', () => {
  beforeEach(() => {
    mockUserMutes.muteUser.mockRejectedValue(new SelfMuteError())
  })

  it('should throw InvalidRequestError', async () => {
    await expect(
      addUserMuteHandler({
        components: { userMutes: mockUserMutes, logs: mockLogs },
        request: {
          json: jest.fn().mockResolvedValue({
            muted_address: '0x1234567890123456789012345678901234567890'
          })
        } as any,
        verification: { auth: '0x1234567890123456789012345678901234567890' } as any
      })
    ).rejects.toThrow(InvalidRequestError)
  })
})
