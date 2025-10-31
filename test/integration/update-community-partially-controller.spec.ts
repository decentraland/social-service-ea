import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest, createAuthHeaders } from './utils/auth'
import { randomUUID } from 'crypto'
import FormData from 'form-data'

test('Update Community Partially Controller', async function ({ components, stubComponents, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when updating a community partially', () => {
    let identity: Identity
    let communityId: string

    beforeEach(async () => {
      identity = await createTestIdentity()

      spyComponents.communityComplianceValidator.validateCommunityContent.mockResolvedValue()

      spyComponents.catalystClient.getOwnedNames.mockResolvedValue([
        {
          id: '1',
          name: 'testOwnedName',
          contractAddress: '0x0000000000000000000000000000000000000000',
          tokenId: '1'
        }
      ])

      spyComponents.catalystClient.getProfile.mockResolvedValue({
        avatars: [{ name: 'Owner Test Name' }]
      })

      const createForm = new FormData()
      createForm.append('name', 'Original Community')
      createForm.append('description', 'Original Description')

      const createHeaders = {
        ...createAuthHeaders('POST', '/v1/communities', {}, identity)
      }

      const createResponse = await components.localHttpFetch.fetch('/v1/communities', {
        method: 'POST',
        headers: createHeaders,
        body: createForm as any
      })

      const createBody = await createResponse.json()
      if (!createBody || !createBody.data || !createBody.data.id) {
        throw new Error(
          `Failed to create community in beforeEach. Status: ${createResponse.status}, Body: ${JSON.stringify(createBody)}`
        )
      }
      communityId = createBody.data.id
    })

    afterEach(async () => {
      if (communityId) {
        await components.communitiesDb.deleteCommunity(communityId)
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [identity.realAccount.address])
      }
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}`, { method: 'PATCH' })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe("when updating Editor's Choice", () => {
        describe('and the user is the community owner', () => {
          it("should respond with a 401 status code when owner tries to update Editor's Choice", async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}`, 'PATCH', {
              editorsChoice: true
            })

            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body.error).toBe('Not Authorized')
          })
        })

        describe('and the user is a regular member', () => {
          let memberIdentity: Identity
          let memberAddress: string

          beforeEach(async () => {
            memberIdentity = await createTestIdentity()
            memberAddress = memberIdentity.realAccount.address.toLowerCase()

            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress,
              role: CommunityRole.Member
            })
          })

          afterEach(async () => {
            if (memberAddress) {
              await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [memberAddress])
            }
          })

          it("should respond with a 401 status code when regular member tries to update Editor's Choice", async () => {
            const response = await makeRequest(memberIdentity, `/v1/communities/${communityId}`, 'PATCH', {
              editorsChoice: true
            })

            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body.error).toBe('Not Authorized')
          })
        })

        describe('and the user is a community moderator', () => {
          let moderatorIdentity: Identity
          let moderatorAddress: string

          beforeEach(async () => {
            moderatorIdentity = await createTestIdentity()
            moderatorAddress = moderatorIdentity.realAccount.address.toLowerCase()

            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: moderatorAddress,
              role: CommunityRole.Moderator
            })
          })

          afterEach(async () => {
            if (moderatorAddress) {
              await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [moderatorAddress])
            }
          })

          it("should respond with a 401 status code when community moderator tries to update Editor's Choice", async () => {
            const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}`, 'PATCH', {
              editorsChoice: true
            })

            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body.error).toBe('Not Authorized')
          })
        })

        describe('and the user is a global moderator', () => {
          let globalModeratorIdentity: Identity
          let globalModeratorAddress: string

          beforeEach(async () => {
            globalModeratorIdentity = await createTestIdentity()
            globalModeratorAddress = globalModeratorIdentity.realAccount.address.toLowerCase()

            spyComponents.featureFlags.getVariants.mockResolvedValue([globalModeratorAddress, '0xanother-moderator'])
          })

          it.each([true, false])(
            "should set Editor's Choice to %s when global moderator updates it",
            async (editorsChoice) => {
              const response = await makeRequest(globalModeratorIdentity, `/v1/communities/${communityId}`, 'PATCH', {
                editorsChoice
              })

              expect(response.status).toBe(204)
            }
          )
        })

        describe('and global moderators feature flag returns malformed data', () => {
          let globalModeratorIdentity: Identity

          beforeEach(async () => {
            globalModeratorIdentity = await createTestIdentity()
            spyComponents.featureFlags.getVariants.mockResolvedValue(['  ', '  ', 'invalid-address', '  '])
          })

          it('should respond with a 401 status code when global moderators feature flag returns malformed data', async () => {
            const response = await makeRequest(globalModeratorIdentity, `/v1/communities/${communityId}`, 'PATCH', {
              editorsChoice: true
            })

            expect(response.status).toBe(401)
          })
        })
      })

      describe('and invalid data is provided', () => {
        it('should respond with a 400 status code when editorsChoice is not a boolean', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}`, 'PATCH', {
            editorsChoice: 'not-a-boolean'
          })

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code when no fields are provided', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}`, 'PATCH', {})

          expect(response.status).toBe(400)
        })
      })

      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}`, 'PATCH', {
            editorsChoice: true
          })

          expect(response.status).toBe(404)
        })
      })

      describe('and the user is not authorized', () => {
        let otherIdentity: Identity

        beforeEach(async () => {
          otherIdentity = await createTestIdentity()
        })

        it('should respond with a 401 status code', async () => {
          const response = await makeRequest(otherIdentity, `/v1/communities/${communityId}`, 'PATCH', {
            editorsChoice: true
          })

          expect(response.status).toBe(401)
        })
      })
    })
  })
})
