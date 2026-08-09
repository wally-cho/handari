import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { readPhoto } from '@/lib/photos';

// 사진은 스토리지에서 직접 공개하지 않고 항상 여기를 거친다.
// 그래야 신고로 HIDDEN된 카드의 사진이 즉시 막히고, 버킷을 비공개로 둘 수 있다.

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { key: segments } = await params;
  const key = segments.join('/');

  // 이 사진이 붙은 카드를 찾아 볼 자격이 있는지 본다
  const owner = await queryOne<{ room_id: number; status: string }>(
    'SELECT room_id, status FROM profile WHERE photo_key = ? AND deleted_at IS NULL',
    [key],
  );
  if (!owner) return new NextResponse('Not Found', { status: 404 });
  if (owner.status === 'HIDDEN' || owner.status === 'DELETED') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const member = await queryOne<{ id: number }>(
    "SELECT id FROM room_member WHERE room_id = ? AND user_id = ? AND status = 'ACTIVE'",
    [owner.room_id, user.id],
  );
  if (!member) return new NextResponse('Forbidden', { status: 403 });

  const photo = await readPhoto(key);
  if (!photo) return new NextResponse('Not Found', { status: 404 });

  return new NextResponse(new Uint8Array(photo.body), {
    headers: {
      'Content-Type': photo.contentType,
      // 사적인 사진이다. 공용 캐시에 남기지 않는다
      'Cache-Control': 'private, max-age=300',
    },
  });
}
