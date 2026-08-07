import Ajv, { ValidateFunction } from 'ajv'
import { UpdateMemberRoleSchema } from '../../../../../src/controllers/handlers/http/schemas'
import { CommunityRole } from '../../../../../src/types'

describe('when validating an update member role payload', () => {
  let validate: ValidateFunction

  beforeEach(() => {
    validate = new Ajv({ allErrors: true }).compile(UpdateMemberRoleSchema)
  })

  describe('and the role is moderator', () => {
    it('should accept it', () => {
      expect(validate({ role: CommunityRole.Moderator })).toBe(true)
    })
  })

  describe('and the role is member', () => {
    it('should accept it', () => {
      expect(validate({ role: CommunityRole.Member })).toBe(true)
    })
  })

  describe('and the role is owner', () => {
    it('should accept it, since it routes to an ownership transfer', () => {
      expect(validate({ role: CommunityRole.Owner })).toBe(true)
    })
  })

  describe('and the role is none', () => {
    it('should reject it, since it is the absence of membership rather than an assignable role', () => {
      expect(validate({ role: CommunityRole.None })).toBe(false)
    })
  })

  describe('and the role is not a known role at all', () => {
    it('should reject it', () => {
      expect(validate({ role: 'administrator' })).toBe(false)
    })
  })
})
