import SQL, { SQLStatement } from 'sql-template-strings'
import { IPgComponent } from '@well-known-components/pg-component'
import { randomUUID } from 'node:crypto'
import {
  IReferralDatabaseComponent,
  ReferralProgress,
  ReferralProgressFilter,
  ReferralProgressStatus,
  ReferralTierSeen,
  ReferralEmail,
  ReferralRewardImage
} from '../types/referral-db.type'
import { AppComponents } from '../types/system'
import { MAX_IP_MATCHES } from '../logic/referral'

export async function createReferralDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): Promise<IReferralDatabaseComponent> {
  const { pg, logs } = components as { pg: IPgComponent; logs: AppComponents['logs'] }
  const logger = logs.getLogger('database')

  const createReferral = async (referralInput: {
    referrer: string
    invitedUser: string
    invitedUserIP: string
  }): Promise<ReferralProgress> => {
    logger.debug(`Creating referral_progress for ${referralInput.referrer} and ${referralInput.invitedUser}`)
    const now = Date.now()

    const query = SQL`
      WITH other_users_invited as (
        SELECT COUNT(*) as count 
        FROM referral_progress 
        WHERE invited_user_ip = ${referralInput.invitedUserIP} 
        AND referrer = ${referralInput.referrer.toLowerCase()}
      )
      INSERT INTO referral_progress 
        (
          id,
          referrer,
          invited_user,
          invited_user_ip,
          status,
          created_at,
          updated_at
        )
          SELECT
          ${randomUUID()},
          ${referralInput.referrer.toLowerCase()},
          ${referralInput.invitedUser.toLowerCase()},
          ${referralInput.invitedUserIP},
          CASE WHEN other_users_invited.count < ${MAX_IP_MATCHES} THEN ${ReferralProgressStatus.PENDING} ELSE ${ReferralProgressStatus.REJECTED_IP_MATCH} END,
          ${now},
          ${now}
          FROM other_users_invited
        RETURNING *
    `
    const result = await pg.query<ReferralProgress>(query)
    return result.rows[0]
  }

  const findReferralProgress = async (filter: ReferralProgressFilter): Promise<ReferralProgress[]> => {
    const limit = typeof filter.limit === 'number' && filter.limit > 0 ? filter.limit : 100
    const offset = typeof filter.offset === 'number' && filter.offset >= 0 ? filter.offset : 0
    logger.debug(
      `Finding referral_progress${filter.referrer ? ' for referrer ' + filter.referrer : ''}${
        filter.invitedUser ? ' and invited_user ' + filter.invitedUser : ''
      } with limit ${limit} and offset ${offset}`
    )
    const where: SQLStatement[] = []
    if (filter.referrer) where.push(SQL`referrer = ${filter.referrer.toLowerCase()}`)
    if (filter.invitedUser) where.push(SQL`invited_user = ${filter.invitedUser.toLowerCase()}`)
    let query = SQL`SELECT * FROM referral_progress`
    if (where.length > 0) {
      query = query.append(SQL` WHERE `)
      where.forEach((w, i) => {
        if (i > 0) query = query.append(SQL` AND `)
        query = query.append(w)
      })
    }
    query = query.append(SQL` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`)
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

  async function setReferralEmail(referralEmailInput: { referrer: string; email: string }): Promise<ReferralEmail> {
    logger.debug(`Setting referral email for ${referralEmailInput.referrer} with email ${referralEmailInput.email}`)
    const now = Date.now()
    const result = await pg.query<ReferralEmail>(
      SQL`INSERT INTO referral_emails (id, referrer, email, created_at, updated_at)
          VALUES (${randomUUID()}, ${referralEmailInput.referrer.toLowerCase()}, ${referralEmailInput.email}, ${now}, ${now})
          RETURNING *`
    )
    return result.rows[0]
  }

  async function setReferralRewardImage(referralRewardImageInput: {
    referrer: string
    rewardImageUrl: string
    tier: number
  }): Promise<ReferralRewardImage> {
    logger.debug(
      `Setting referral reward image for ${referralRewardImageInput.referrer} with tier ${referralRewardImageInput.tier}`
    )
    const now = Date.now()
    const result = await pg.query<ReferralRewardImage>(
      SQL`INSERT INTO referral_reward_images (id, referrer, reward_image_url, tier, created_at)
          VALUES (${randomUUID()}, ${referralRewardImageInput.referrer.toLowerCase()}, ${referralRewardImageInput.rewardImageUrl}, ${referralRewardImageInput.tier}, ${now})
          RETURNING *`
    )
    return result.rows[0]
  }

  async function getLastReferralEmailByReferrer(referrer: string): Promise<ReferralEmail | null> {
    logger.debug('Getting last referral email by referrer', { referrer })
    const result = await pg.query<ReferralEmail>(
      SQL`SELECT * FROM referral_emails 
          WHERE referrer = ${referrer.toLowerCase()} 
          ORDER BY updated_at DESC 
          LIMIT 1`
    )
    return result.rows[0] || null
  }

  async function getReferralRewardImage(referrer: string): Promise<ReferralRewardImage[] | null> {
    logger.debug('Getting referral reward image by referrer', { referrer })
    const result = await pg.query<ReferralRewardImage>(
      SQL`SELECT * FROM referral_reward_images WHERE referrer = ${referrer.toLowerCase()}`
    )
    return result.rows || null
  }

  async function setFirstLoginAtByInvitedUser(invitedUser: string): Promise<void> {
    logger.debug('Setting first login at by invited user', { invitedUser })
    const now = Date.now()
    await pg.query(
      SQL`UPDATE referral_progress SET first_login_at = ${now} WHERE invited_user = ${invitedUser.toLowerCase()}`
    )
  }

  return {
    createReferral,
    findReferralProgress,
    updateReferralProgress,
    hasReferralProgress,
    listAllReferralProgress,
    countAcceptedInvitesByReferrer,
    getLastViewedProgressByReferrer,
    setLastViewedProgressByReferrer,
    setReferralEmail,
    setReferralRewardImage,
    getLastReferralEmailByReferrer,
    getReferralRewardImage,
    setFirstLoginAtByInvitedUser
  }
}
