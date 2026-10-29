export type StreamClientMessage =
  | { type: 'subscribe'; id: string; stream: string }
  | { type: 'unsubscribe'; id: string }
  | { type: 'ping' }

type ParseResult =
  | { ok: true; message: StreamClientMessage }
  | { ok: false; code: string; message: string; id?: string; receivedType: 'subscribe' | 'unsubscribe' | 'invalid' }

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate untrusted JSON once, retaining the existing protocol error codes. */
export function parseStreamMessage(raw: ArrayBuffer): ParseResult {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return { ok: false, code: 'invalid_message', message: 'Messages must be valid JSON', receivedType: 'invalid' }
  }
  if (!isObject(value))
    return { ok: false, code: 'invalid_message', message: 'Messages must be JSON objects', receivedType: 'invalid' }
  switch (value.type) {
    case 'ping':
      return { ok: true, message: { type: 'ping' } }
    case 'subscribe':
      if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 64) {
        return {
          ok: false,
          code: 'invalid_message',
          message: 'id must be a string of 1 to 64 characters',
          receivedType: 'subscribe'
        }
      }
      if (typeof value.stream !== 'string')
        return { ok: false, code: 'unknown_stream', message: 'Unknown stream', id: value.id, receivedType: 'subscribe' }
      return { ok: true, message: { type: 'subscribe', id: value.id, stream: value.stream } }
    case 'unsubscribe':
      if (typeof value.id !== 'string')
        return {
          ok: false,
          code: 'unknown_subscription',
          message: 'No subscription with this id',
          receivedType: 'unsubscribe'
        }
      return { ok: true, message: { type: 'unsubscribe', id: value.id } }
    default:
      return { ok: false, code: 'invalid_message', message: 'Unknown message type', receivedType: 'invalid' }
  }
}
