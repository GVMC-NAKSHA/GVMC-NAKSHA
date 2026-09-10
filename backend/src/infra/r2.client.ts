import { Injectable } from '@nestjs/common';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2 {
  private readonly s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  private readonly bucket = process.env.R2_BUCKET_NAME!;

  presignPut(key: string, contentType: string, expiresIn = 300) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn });
  }
  presignGet(key: string, expiresIn = 3600) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
  async putObject(key: string, body: Buffer | string, contentType = 'application/octet-stream') {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async ping(): Promise<'ok' | 'down'> {
    try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); return 'ok'; }
    catch { return 'down'; }
  }
}
