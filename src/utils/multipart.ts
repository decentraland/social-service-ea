import { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '@dcl/http-commons'

/**
 * Maximum accepted `multipart/form-data` body size, in bytes.
 *
 * The only file we accept is a community thumbnail, capped at 500KB by the community fields
 * validator; 1MB leaves comfortable room for that plus the text fields and the multipart
 * framing overhead, while keeping the in-memory buffer bounded.
 *
 * @public
 */
export const MAX_MULTIPART_BYTES = 1024 * 1024

/**
 * A parsed non-file form field.
 * @public
 */
export type Field = {
  fieldname: string
  value: string
}

/**
 * A parsed file form field. `value` holds the file contents as a Buffer.
 * @public
 */
export type MultipartFile = {
  fieldname: string
  value: Buffer
  filename?: string
  mimeType?: string
}

/**
 * The handler context, enriched with parsed `multipart/form-data`.
 * @public
 */
export type FormDataContext<T> = IHttpServerComponent.DefaultContext<T> & {
  formData: {
    fields: Record<string, Field>
    files: Record<string, MultipartFile>
  }
}

/**
 * Strips any directory components a client may have embedded in a filename so the value can
 * never be used to traverse the filesystem if a caller later derives a path from it.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/^.*[\\/]/, '')
}

/**
 * Wraps a handler so it receives the parsed `multipart/form-data` of the request in
 * `ctx.formData`.
 *
 * `@dcl/http-server` v2 exposes the incoming request as the native (undici) `Request`, whose
 * body is a web `ReadableStream` (it has no Node `.pipe`). We drain the body under a hard
 * size cap and parse it with the native FormData parser instead of piping into a Node stream
 * parser. A body over the limit, or one that is not valid `multipart/form-data`, is rejected
 * with a 400 (`InvalidRequestError`) instead of surfacing as a 500.
 *
 * Text fields are exposed as `{ fieldname, value }` (string) and file fields as
 * `{ fieldname, value }` (Buffer), matching the shape the handlers consume.
 *
 * @public
 */
export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const fields: Record<string, Field> = {}
    const files: Record<string, MultipartFile> = {}

    // Enforce a hard body-size cap. Reject an oversized declared Content-Length up front,
    // then re-check while draining so a missing or dishonest length (e.g. chunked
    // transfer-encoding) cannot exhaust memory.
    const declaredLength = Number(ctx.request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
      throw new InvalidRequestError('Request body too large')
    }

    const chunks: Uint8Array[] = []
    const body = ctx.request.body
    if (body) {
      const reader = body.getReader()
      let total = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          total += value.byteLength
          if (total > MAX_MULTIPART_BYTES) {
            throw new InvalidRequestError('Request body too large')
          }
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    }

    let parsed: FormData
    try {
      parsed = await new Response(Buffer.concat(chunks), {
        headers: { 'content-type': ctx.request.headers.get('content-type') ?? '' }
      }).formData()
    } catch {
      throw new InvalidRequestError('Invalid multipart/form-data body')
    }

    for (const [name, value] of parsed.entries()) {
      // If a field name repeats, the last occurrence wins (deterministic); the handlers only
      // consume single-valued fields.
      if (typeof value === 'string') {
        fields[name] = { fieldname: name, value }
      } else {
        // `value` is a web File/Blob (web standard). Materialize its contents into a Buffer.
        const blob = value as Blob & { name?: string }
        files[name] = {
          fieldname: name,
          value: Buffer.from(await blob.arrayBuffer()),
          filename: typeof blob.name === 'string' ? sanitizeFilename(blob.name) : undefined,
          mimeType: blob.type || undefined
        }
      }
    }

    // Preserve the upstream context (including middleware-populated fields such as
    // `verification`) through the prototype chain, adding only `formData` as an own property.
    const newContext = Object.assign(Object.create(ctx), { formData: { fields, files } }) as Ctx
    return handler(newContext)
  }
}
