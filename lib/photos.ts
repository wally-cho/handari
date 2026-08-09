import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// 사진 저장. 백엔드가 둘이다.
//   개발  — 로컬 파일 (./uploads). AWS 자격증명이 필요 없다
//   운영  — S3 (handari-uploads). EC2 인스턴스 역할로 붙는다
//
// S3_BUCKET 환경변수가 있으면 S3, 없으면 로컬이다.
//
// 사진은 CDN으로 직접 공개하지 않고 항상 앱을 거쳐 서빙한다 (app/api/photos/[...key]).
// 그래야 신고로 HIDDEN된 카드의 사진이 즉시 막히고, 버킷을 비공개로 둘 수 있다.

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION ?? 'ap-northeast-2';
const PREFIX = process.env.S3_PREFIX ?? 'profiles/';
const LOCAL_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

/** 프로필 사진 최대 2MB (tium의 file-size.profile과 같은 값) */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export class PhotoError extends Error {}

export function isS3(): boolean {
  return Boolean(BUCKET);
}

/** 업로드된 파일을 저장하고 photo_key를 돌려준다 */
export async function savePhoto(file: File): Promise<string> {
  const ext = ALLOWED.get(file.type);
  if (!ext) throw new PhotoError('JPG, PNG, WEBP만 올릴 수 있어요.');
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoError('사진은 2MB까지 올릴 수 있어요.');
  if (file.size === 0) throw new PhotoError('빈 파일이에요.');

  const key = `${PREFIX}${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  if (BUCKET) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: REGION });
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buf,
        ContentType: file.type,
      }),
    );
  } else {
    const path = join(LOCAL_DIR, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buf);
  }

  return key;
}

/** 서빙용. 없으면 null */
export async function readPhoto(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isSafeKey(key)) return null;

  const ext = key.split('.').pop() ?? '';
  const contentType =
    [...ALLOWED.entries()].find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';

  try {
    if (BUCKET) {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: REGION });
      const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const body = Buffer.from(await out.Body!.transformToByteArray());
      return { body, contentType };
    }
    const body = await readFile(join(LOCAL_DIR, key));
    return { body, contentType };
  } catch {
    return null;
  }
}

/**
 * 사진을 지운다. 프로필 삭제, 사진 교체 시 반드시 부른다.
 * 교체할 때 안 지우면 내려간 사진이 스토리지에 계속 남는다.
 */
export async function deletePhoto(key: string | null): Promise<void> {
  if (!key || !isSafeKey(key)) return;

  try {
    if (BUCKET) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: REGION });
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } else {
      await unlink(join(LOCAL_DIR, key));
    }
  } catch {
    // 이미 없으면 그만이다. 삭제 실패로 상위 흐름을 막지 않는다
  }
}

/** 경로 탈출 방지. key는 우리가 만든 것만 통과시킨다 */
function isSafeKey(key: string): boolean {
  return /^[A-Za-z0-9_\-/]+\.(jpg|png|webp)$/.test(key) && !key.includes('..');
}

export function photoUrl(key: string | null): string | null {
  return key ? `/api/photos/${key}` : null;
}
