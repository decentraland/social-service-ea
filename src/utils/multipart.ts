import { IHttpServerComponent } from '@dcl/core-commons'

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
export type File = {
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
    files: Record<string, File>
  }
}

/**
 * Wraps a handler so it receives the parsed `multipart/form-data` of the request in
 * `ctx.formData`.
 *
 * `@dcl/http-server` v2 exposes the incoming request as the native (undici) `Request`,
 * whose body is a web `ReadableStream` (it has no Node `.pipe`). We therefore parse the
 * body with the native `Request.formData()` instead of piping into a Node stream parser.
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
    const files: Record<string, File> = {}

    const parsed = await ctx.request.formData()

    for (const [name, value] of parsed.entries()) {
      if (typeof value === 'string') {
        fields[name] = { fieldname: name, value }
      } else {
        // `value` is a Blob/File (web standard). Materialize its contents into a Buffer.
        const blob = value as Blob & { name?: string }
        const buffer = Buffer.from(await blob.arrayBuffer())
        files[name] = {
          fieldname: name,
          value: buffer,
          filename: typeof blob.name === 'string' ? blob.name : undefined,
          mimeType: blob.type || undefined
        }
      }
    }

    const newContext = Object.assign(Object.create(ctx), { formData: { fields, files } }) as Ctx
    return handler(newContext)
  }
}
