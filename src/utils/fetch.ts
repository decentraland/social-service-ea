// Native fetch (undici) keeps the keep-alive socket pinned until the response body is
// consumed or cancelled. Any path that discards a response without reading its body
// (a non-ok early return/throw, a void success path, or a fire-and-forget request)
// must drain it first. Typed structurally so it accepts the global and undici Response.
export async function drainResponse(response: {
  bodyUsed: boolean
  body?: { cancel(): Promise<void> } | null
}): Promise<void> {
  if (!response.bodyUsed) {
    await response.body?.cancel().catch(() => undefined)
  }
}
