import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('User Mutes Controller', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  let identity: Identity
  let muterAddress: string

  const mutedAddress1 = '0x0000000000000000000000000000000000000001'
  const mutedAddress2 = '0x0000000000000000000000000000000000000002'
  const mutedAddress3 = '0x0000000000000000000000000000000000000003'

  beforeEach(async () => {
    identity = await createTestIdentity()
    muterAddress = identity.realAccount.address.toLowerCase()
  })

  afterEach(async () => {
    await components.pg.query(`DELETE FROM user_mutes WHERE muter_address = '${muterAddress}'`)
  })

  describe('when muting a user (POST /v1/mutes)', () => {
    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch('/v1/mutes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted_address: mutedAddress1 })
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the request is valid', () => {
      it('should respond with a 204 status code', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'POST', {
          muted_address: mutedAddress1
        })

        expect(response.status).toBe(204)
      })

      it('should persist the mute in the database', async () => {
        await makeRequest(identity, '/v1/mutes', 'POST', { muted_address: mutedAddress1 })

        const result = await components.pg.query(
          `SELECT * FROM user_mutes WHERE muter_address = '${muterAddress}' AND muted_address = '${mutedAddress1}'`
        )

        expect(result.rowCount).toBe(1)
      })
    })

    describe('and the muted_address is invalid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'POST', {
          muted_address: 'not-an-address'
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the user tries to mute themselves', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'POST', {
          muted_address: muterAddress
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the mute already exists', () => {
      beforeEach(async () => {
        await makeRequest(identity, '/v1/mutes', 'POST', { muted_address: mutedAddress1 })
      })

      it('should respond with a 204 status code (idempotent)', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'POST', {
          muted_address: mutedAddress1
        })

        expect(response.status).toBe(204)
      })
    })
  })

  describe('when unmuting a user (DELETE /v1/mutes)', () => {
    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch('/v1/mutes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted_address: mutedAddress1 })
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the mute exists', () => {
      beforeEach(async () => {
        await makeRequest(identity, '/v1/mutes', 'POST', { muted_address: mutedAddress1 })
      })

      it('should respond with a 204 status code', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'DELETE', {
          muted_address: mutedAddress1
        })

        expect(response.status).toBe(204)
      })

      it('should remove the mute from the database', async () => {
        await makeRequest(identity, '/v1/mutes', 'DELETE', { muted_address: mutedAddress1 })

        const result = await components.pg.query(
          `SELECT * FROM user_mutes WHERE muter_address = '${muterAddress}' AND muted_address = '${mutedAddress1}'`
        )

        expect(result.rowCount).toBe(0)
      })
    })

    describe('and the mute does not exist', () => {
      it('should respond with a 204 status code', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'DELETE', {
          muted_address: mutedAddress1
        })

        expect(response.status).toBe(204)
      })
    })

    describe('and the muted_address is invalid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/mutes', 'DELETE', {
          muted_address: 'not-an-address'
        })

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when getting muted users (GET /v1/mutes)', () => {
    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch('/v1/mutes', {
          method: 'GET'
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and there are no muted users', () => {
      it('should respond with a 200 status code and empty results', async () => {
        const response = await makeRequest(identity, '/v1/mutes')

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.results).toEqual([])
        expect(body.data.total).toBe(0)
      })
    })

    describe('and there are muted users', () => {
      beforeEach(async () => {
        await makeRequest(identity, '/v1/mutes', 'POST', { muted_address: mutedAddress1 })
        await makeRequest(identity, '/v1/mutes', 'POST', { muted_address: mutedAddress2 })
        await makeRequest(identity, '/v1/mutes', 'POST', { muted_address: mutedAddress3 })
      })

      it('should respond with a 200 status code, all muted users, and results ordered by muted_at descending', async () => {
        const response = await makeRequest(identity, '/v1/mutes')

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.results).toHaveLength(3)
        expect(body.data.total).toBe(3)

        const addresses = body.data.results.map((m: any) => m.address)
        expect(addresses[0]).toBe(mutedAddress3)
        expect(addresses[2]).toBe(mutedAddress1)
      })

      describe('and pagination is used', () => {
        describe('and requesting the first page', () => {
          it('should return the correct page', async () => {
            const response = await makeRequest(identity, '/v1/mutes?limit=2&offset=0')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.results).toHaveLength(2)
            expect(body.data.total).toBe(3)
          })
        })

        describe('and requesting the second page', () => {
          it('should return the remaining results', async () => {
            const response = await makeRequest(identity, '/v1/mutes?limit=2&offset=2')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.results).toHaveLength(1)
            expect(body.data.total).toBe(3)
          })
        })
      })

      describe('and filtering by a single address', () => {
        describe('and the address is muted', () => {
          it('should return only the matching mute', async () => {
            const response = await makeRequest(identity, `/v1/mutes?address=${mutedAddress1}`)

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.results).toHaveLength(1)
            expect(body.data.results[0].address).toBe(mutedAddress1)
            expect(body.data.total).toBe(1)
          })
        })

        describe('and the address is not muted', () => {
          it('should return empty results', async () => {
            const response = await makeRequest(
              identity,
              '/v1/mutes?address=0x0000000000000000000000000000000000000099'
            )

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.results).toEqual([])
            expect(body.data.total).toBe(0)
          })
        })
      })

      describe('and filtering by multiple addresses', () => {
        it('should return only the matching mutes', async () => {
          const response = await makeRequest(
            identity,
            `/v1/mutes?addresses=${mutedAddress1}&addresses=${mutedAddress2}`
          )

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.results).toHaveLength(2)
          expect(body.data.total).toBe(2)

          const returnedAddresses = body.data.results.map((m: any) => m.address)
          expect(returnedAddresses).toContain(mutedAddress1)
          expect(returnedAddresses).toContain(mutedAddress2)
        })
      })
    })
  })
})
