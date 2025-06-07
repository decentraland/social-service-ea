import SQL, { SQLStatement } from 'sql-template-strings'
import { IPgComponent } from '@well-known-components/pg-component'
import {
  IReferralDatabaseComponent,
  ReferralProgress,
  ReferralProgressFilter,
  ReferralProgressStatus,
  ReferralTierSeen
} from '../types/referral-db.type'
import { AppComponents } from '../types/system'

export async function createReferralDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): Promise<IReferralDatabaseComponent> {
  const { pg, logs } = components as { pg: IPgComponent; logs: AppComponents['logs'] }
  const logger = logs.getLogger('database')

  const createReferral = async (referralInput: {
    referrer: string
    invited_user: string
  }): Promise<ReferralProgress> => {
    logger.debug(`Creating referral_progress for ${referralInput.referrer} and ${referralInput.invited_user}`)
    const now = Date.now()
    const result = await pg.query<ReferralProgress>(
      SQL`INSERT INTO referral_progress (id, referrer, invited_user, status, created_at, updated_at)
          VALUES (gen_random_uuid(), ${referralInput.referrer.toLowerCase()}, ${referralInput.invited_user.toLowerCase()}, ${
            ReferralProgressStatus.PENDING
          }, ${now}, ${now})
          RETURNING *`
    )
    return result.rows[0]
  }

  const findReferralProgress = async (filter: ReferralProgressFilter): Promise<ReferralProgress[]> => {
    const limit = typeof filter.limit === 'number' && filter.limit > 0 ? filter.limit : 100
    const offset = typeof filter.offset === 'number' && filter.offset >= 0 ? filter.offset : 0
    logger.debug(
      `Finding referral_progress${filter.referrer ? ' for referrer ' + filter.referrer : ''}${
        filter.invited_user ? ' and invited_user ' + filter.invited_user : ''
      } with limit ${limit} and offset ${offset}`
    )
    const where: SQLStatement[] = []
    if (filter.referrer) where.push(SQL`referrer = ${filter.referrer.toLowerCase()}`)
    if (filter.invited_user) where.push(SQL`invited_user = ${filter.invited_user.toLowerCase()}`)
    let query = SQL`SELECT * FROM referral_progress`
    if (where.length > 0) {
      query = query.append(SQL` WHERE `)
      where.forEach((w, i) => {
        if (i > 0) query = query.append(SQL` AND `)
        query = query.append(w)
      })
    }
    query = query.append(SQL` LIMIT ${limit} OFFSET ${offset}`)
    const result = await pg.query<ReferralProgress>(query)
    return result.rows
  }

  const updateReferralProgress = async (
    invited_user: string,
    status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
  ): Promise<void> => {
    logger.debug(`Updating referral_progress for invited_user ${invited_user} with ${status}`)
    const fields: SQLStatement[] = []
    const now = Date.now()
    fields.push(SQL`status = ${status}`)
    if (status === ReferralProgressStatus.SIGNED_UP) {
      fields.push(SQL`signed_up_at = ${now}`)
    } else if (status === ReferralProgressStatus.TIER_GRANTED) {
      fields.push(SQL`tier_granted = true, tier_granted_at = ${now}`)
    }

    fields.push(SQL`updated_at = ${now}`)
    let query = SQL`UPDATE referral_progress SET `
    fields.forEach((f, i) => {
      if (i > 0) query = query.append(SQL`, `)
      query = query.append(f)
    })
    query = query.append(SQL` WHERE invited_user = ${invited_user.toLowerCase()}`)

    await pg.query(query)
  }

  async function hasReferralProgress(invited_user: string): Promise<boolean> {
    logger.debug('Checking existence of referral_progress', { invited_user })
    const result = await pg.query(
      SQL`SELECT 1 FROM referral_progress WHERE invited_user = ${invited_user.toLowerCase()} LIMIT 1`
    )
    return result.rowCount > 0
  }

  async function listAllReferralProgress(
    filter: Pick<ReferralProgressFilter, 'limit' | 'offset'> = {}
  ): Promise<ReferralProgress[]> {
    const limit = typeof filter.limit === 'number' && filter.limit > 0 ? filter.limit : 100
    const offset = typeof filter.offset === 'number' && filter.offset >= 0 ? filter.offset : 0
    logger.debug(`Listing all referral_progress with limit ${limit} and offset ${offset}`)
    const result = await pg.query<ReferralProgress>(
      SQL`SELECT * FROM referral_progress LIMIT ${limit} OFFSET ${offset}`
    )
    return result.rows
  }

  async function countAcceptedInvitesByReferrer(referrer: string): Promise<number> {
    logger.debug('Getting tier_granted for referrer', { referrer })
    const result = await pg.query<{ max_tier: number | null }>(
      SQL`SELECT COUNT(*) as max_tier FROM referral_progress WHERE tier_granted is true AND referrer = ${referrer.toLowerCase()}`
    )
    return result.rows[0]?.max_tier ? Number(result.rows[0].max_tier) : 0
  }

  async function getLastViewedProgressByReferrer(referrer: string): Promise<number> {
    logger.debug('Getting referral_progress_viewed by referrer', { referrer })
    const result = await pg.query<ReferralTierSeen>(
      SQL`SELECT invites_accepted_viewed FROM referral_progress_viewed WHERE referrer = ${referrer.toLowerCase()}`
    )
    return result.rows[0] ? Number(result.rows[0].invites_accepted_viewed) : 0
  }

  async function setLastViewedProgressByReferrer(referrer: string, invitedUsersSeen: number): Promise<void> {
    logger.debug(`Setting ${invitedUsersSeen} invited users accepted seen by referrer ${referrer}`)
    const now = Date.now()

    await pg.query(SQL`
      INSERT INTO referral_progress_viewed (referrer, invites_accepted_viewed, updated_at)
      VALUES (${referrer.toLowerCase()}, ${invitedUsersSeen}, ${now})
      ON CONFLICT (referrer) 
      DO UPDATE SET 
        invites_accepted_viewed = ${invitedUsersSeen},
        updated_at = ${now}
    `)
  }

  return {
    createReferral,
    findReferralProgress,
    updateReferralProgress,
    hasReferralProgress,
    listAllReferralProgress,
    countAcceptedInvitesByReferrer,
    getLastViewedProgressByReferrer,
    setLastViewedProgressByReferrer
  }
}
