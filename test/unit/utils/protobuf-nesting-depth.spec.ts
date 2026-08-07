import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'

describe('when a protobuf message exceeds the maximum structural depth', () => {
  let nestedPayload: Buffer
  let decodeError: unknown

  beforeEach(() => {
    const nestingDepth = 10_000
    nestedPayload = Buffer.concat([Buffer.alloc(nestingDepth, 0x0b), Buffer.alloc(nestingDepth, 0x0c)])
    decodeError = undefined

    try {
      Empty.decode(nestedPayload)
    } catch (error) {
      decodeError = error
    }
  })

  afterEach(() => {
    nestedPayload = Buffer.alloc(0)
    decodeError = undefined
  })

  it('should reject decoding with the protobuf nesting-depth guard', () => {
    expect(decodeError).toMatchObject({ message: 'maximum nesting depth exceeded' })
  })
})
