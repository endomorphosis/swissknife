// src/storage/vfs/backends/S3Backend.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { StorageBackend } from '../StorageBackend.js';

export class S3Backend extends StorageBackend {
  readonly name = 's3';
  readonly protocol = 's3://';
  private s3: S3Client;
  private bucket: string;

  async connect(config: S3Config): Promise<void> {
    this.s3 = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      endpoint: config.endpoint // Support S3-compatible services
    });
    this.bucket = config.bucket;
  }

  async write(path: string, data: Buffer): Promise<string> {
    const key = this.normalizePath(path);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: this.getContentType(path)
    });
    
    const result = await this.s3.send(command);
    return `s3://${this.bucket}/${key}`;
  }

  async read(path: string): Promise<Buffer> {
    const key = this.normalizePath(path);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    
    const response = await this.s3.send(command);
    const chunks: Uint8Array[] = [];
    
    // @ts-ignore - AWS SDK types issue
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  // S3-specific features
  async createBucket(name: string): Promise<void> {
    await this.s3.send(new CreateBucketCommand({ Bucket: name }));
  }

  async getBucketPolicy(): Promise<any> {
    const command = new GetBucketPolicyCommand({ Bucket: this.bucket });
    return await this.s3.send(command);
  }
}