import type { IFetchComponent } from '@dcl/core-commons'

// The Response type returned by the fetch component (the global/undici Response shipped with Node).
type FetchResponse = Awaited<ReturnType<IFetchComponent['fetch']>>

// Native fetch (undici) keeps the keep-alive socket pinned until the response body is
// consumed or cancelled. Any path that discards a response without reading its body
// (a non-ok early return/throw, a void success path, or a fire-and-forget request)
// must release it first. This cancels the body (aborts it without reading) rather than
// reading it to completion. Typed structurally so it accepts the global and undici Response.
export async function discardResponseBody(response: {
  bodyUsed: boolean
  body?: { cancel(): Promise<void> } | null
}): Promise<void> {
  if (!response.bodyUsed) {
    await response.body?.cancel().catch(() => undefined)
  }
}

/**
 * Fetches and parses JSON, ALWAYS releasing the body so the socket can't leak: on a non-ok
 * response it discards the body and throws (a generic "Server responded with status N" error
 * by default, or the error returned by `onError`); on ok it reads and returns the JSON.
 * Prefer this over a raw fetch + manual discardResponseBody for request/response calls.
 */
export async function fetchJson<T>(
  doFetch: () => Promise<FetchResponse>,
  onError?: (response: FetchResponse) => Error | Promise<Error>
): Promise<T> {
  const response = await doFetch()
  if (!response.ok) {
    const error = onError ? await onError(response) : new Error(`Server responded with status ${response.status}`)
    await discardResponseBody(response)
    throw error
  }
  return (await response.json()) as T
}

/**
 * Like fetchJson, but for endpoints whose response body is never read. Releases the body on
 * EVERY path (success and failure) and throws on a non-ok response.
 */
export async function fetchVoid(
  doFetch: () => Promise<FetchResponse>,
  onError?: (response: FetchResponse) => Error | Promise<Error>
): Promise<void> {
  const response = await doFetch()
  if (!response.ok) {
    const error = onError ? await onError(response) : new Error(`Server responded with status ${response.status}`)
    await discardResponseBody(response)
    throw error
  }
  await discardResponseBody(response)
}
