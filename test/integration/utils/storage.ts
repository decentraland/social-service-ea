import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { AppComponents } from '../../../src/types'
import { IStorageHelperComponent } from '../../../src/types/components'

export async function createStorageHelper({ config }: Pick<AppComponents, 'config'>): Promise<IStorageHelperComponent> { 
    const bucket = await config.requireString('AWS_S3_BUCKET')
    const bucketEndpoint = (await config.getString('AWS_S3_BUCKET_ENDPOINT')) || 'https://s3.amazonaws.com'
    const region = (await config.getString('AWS_REGION')) || 'us-east-1'
    const bucketPrefix = (await config.getString('AWS_S3_BUCKET_PREFIX')) || 'social' // service only has access to social directory
  
    const s3 = new S3Client({ region, endpoint: bucketEndpoint })
    
    return {
        removeFile: async (key: string) => {
            const command = new DeleteObjectCommand({
                Bucket: bucket,
                Key: `${bucketPrefix}/${key}`
            })
            await s3.send(command)
        }
    }
}