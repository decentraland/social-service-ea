import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

import { AppComponents, IStorageComponent } from '../types'

export async function createS3Adapter({ config }: Pick<AppComponents, 'config'>): Promise<IStorageComponent> {
  const bucket = await config.requireString('AWS_S3_BUCKET')
  const bucketEndpoint = (await config.getString('AWS_S3_BUCKET_ENDPOINT')) || 'https://s3.amazonaws.com'
  const region = (await config.getString('AWS_REGION')) || 'us-east-1'
  const bucketPrefix = (await config.getString('AWS_S3_BUCKET_PREFIX')) || 'social' // service only has access to social directory

  const s3 = new S3Client({ region, endpoint: bucketEndpoint })

  async function storeFile(file: Buffer, key: string): Promise<string> {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: `${bucketPrefix}/${key}`,
        Body: file,
        ContentType: 'image/png'
      }
    })

    return await upload.done().then(() => `${bucketEndpoint}/${bucket}/${bucketPrefix}/${key}`)
  }

  async function exists(key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: `${bucketPrefix}/${key}`
    })

    try {
      await s3.send(command) // throws if file doesn't exist
      return true
    } catch (error: any) {
      return false
    }
  }

  return { storeFile, exists }
}
