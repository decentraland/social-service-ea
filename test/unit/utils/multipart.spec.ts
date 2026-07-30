import { InvalidRequestError } from '@dcl/http-commons'
import { multipartParserWrapper, sanitizeFilename, MAX_MULTIPART_BYTES } from '../../../src/utils/multipart'

function buildContext(request: Request): any {
  return {
    request,
    components: {},
    url: new URL(request.url),
    params: {}
  }
}

describe('when wrapping a handler with the multipart parser', () => {
  let handler: jest.Mock
  let wrapped: (ctx: any) => Promise<unknown>
  let context: any

  beforeEach(() => {
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    wrapped = multipartParserWrapper(handler as any) as (ctx: any) => Promise<unknown>
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the request carries valid multipart form data', () => {
    beforeEach(() => {
      const form = new FormData()
      form.append('name', 'My Community')
      form.append('thumbnail', new File([Buffer.from('imagebytes')], 'pic.png', { type: 'image/png' }))
      context = buildContext(new Request('http://localhost/v1/communities', { method: 'POST', body: form }))
    })

    it('should expose text fields as { fieldname, value } on ctx.formData.fields', async () => {
      await wrapped(context)

      expect(handler.mock.calls[0][0].formData.fields.name).toEqual({ fieldname: 'name', value: 'My Community' })
    })

    it('should expose file parts as buffers on ctx.formData.files', async () => {
      await wrapped(context)

      expect(handler.mock.calls[0][0].formData.files.thumbnail.value).toEqual(Buffer.from('imagebytes'))
    })

    it('should preserve the upstream context for the wrapped handler', async () => {
      await wrapped(context)

      expect(handler.mock.calls[0][0].params).toBe(context.params)
    })
  })

  describe('and a file is uploaded with a path-bearing filename', () => {
    beforeEach(() => {
      const form = new FormData()
      form.append('thumbnail', new File([Buffer.from('x')], '../../../etc/passwd', { type: 'image/png' }))
      context = buildContext(new Request('http://localhost/v1/communities', { method: 'POST', body: form }))
    })

    it('should sanitize the filename down to its basename', async () => {
      await wrapped(context)

      expect(handler.mock.calls[0][0].formData.files.thumbnail.filename).toBe('passwd')
    })
  })

  describe('and the same field name appears more than once', () => {
    beforeEach(() => {
      const form = new FormData()
      form.append('name', 'first')
      form.append('name', 'second')
      context = buildContext(new Request('http://localhost/v1/communities', { method: 'POST', body: form }))
    })

    it('should keep the last value deterministically', async () => {
      await wrapped(context)

      expect(handler.mock.calls[0][0].formData.fields.name.value).toBe('second')
    })
  })

  describe('and the declared body size exceeds the limit', () => {
    beforeEach(() => {
      const oversized = Buffer.alloc(MAX_MULTIPART_BYTES + 1, 0x61)
      context = buildContext(
        new Request('http://localhost/v1/communities', {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
          body: oversized
        })
      )
    })

    it('should reject with an InvalidRequestError', async () => {
      await expect(wrapped(context)).rejects.toThrow(InvalidRequestError)
    })

    it('should not invoke the wrapped handler', async () => {
      await wrapped(context).catch(() => undefined)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('and the body is not valid multipart form data', () => {
    beforeEach(() => {
      context = buildContext(
        new Request('http://localhost/v1/communities', {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
          body: 'this is definitely not a valid multipart payload'
        })
      )
    })

    it('should reject with an InvalidRequestError instead of surfacing a 500', async () => {
      await expect(wrapped(context)).rejects.toThrow(InvalidRequestError)
    })
  })
})

describe('when sanitizing an uploaded filename', () => {
  describe('and the filename has no path components', () => {
    it('should return the name unchanged', () => {
      expect(sanitizeFilename('thumbnail.png')).toBe('thumbnail.png')
    })
  })

  describe('and the filename contains a POSIX path', () => {
    it('should return only the basename', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd')
    })
  })

  describe('and the filename contains a Windows path', () => {
    it('should return only the basename', () => {
      expect(sanitizeFilename('C:\\Windows\\system32\\evil.png')).toBe('evil.png')
    })
  })

  describe('and the filename hides a separator after a newline', () => {
    it('should still strip the directory components', () => {
      expect(sanitizeFilename('evil\n../../secret.png')).toBe('secret.png')
    })
  })
})
