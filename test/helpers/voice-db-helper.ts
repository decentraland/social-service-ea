import { IPgComponent } from '@well-known-components/pg-component'
import { PrivateVoiceChat } from '../../src/types'
import SQL from 'sql-template-strings'

export function createVoiceDbHelper(pg: IPgComponent) {
  return {
    async createPrivateVoiceChat(privateVoiceChat: PrivateVoiceChat) {
      await pg.query(
        SQL`INSERT INTO private_voice_chats (id, caller_address, callee_address, created_at) VALUES (${privateVoiceChat.id}, ${privateVoiceChat.caller_address}, ${privateVoiceChat.callee_address}, ${privateVoiceChat.created_at.toISOString()})`
      )
    }
  }
}
