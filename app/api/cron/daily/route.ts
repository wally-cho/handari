import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import type { InterestRow } from '@/lib/types';

// EC2 crontab이 하루 한 번 호출한다.
//   0 4 * * *  curl -fsS -H "x-cron-secret: $CRON_SECRET" https://handari.tium-care.com/api/cron/daily
//
// 멱등하게 짠다. 두 번 돌아도 결과가 같아야 한다.
//
// 만료 "판정"은 여기서 하지 않는다. 조회 시점에 expires_at으로 본다.
// 배치가 늦게 돌아도 만료된 링크가 살아 있으면 안 되기 때문이다.
// 여기서는 상태 전환과 청소만 한다.

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result: Record<string, number> = {};

  // 1. 만료된 관심 요청 → EXPIRED, 보낸 사람에게 알림 (PRODUCT 39)
  const expiring = await query<InterestRow>(
    "SELECT * FROM interest WHERE status = 'PENDING' AND expires_at <= UTC_TIMESTAMP()",
  );
  for (const it of expiring) {
    await execute("UPDATE interest SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", [
      it.id,
    ]);
    await execute('INSERT INTO notification (user_id, type, payload) VALUES (?, ?, ?)', [
      it.from_user_id,
      'INTEREST_EXPIRED',
      JSON.stringify({ interestId: it.id, profileId: it.to_profile_id }),
    ]);
  }
  result.expiredInterests = expiring.length;

  // 2. 90일 지난 알림 삭제 (PRODUCT 57)
  const oldNotifications = await execute(
    'DELETE FROM notification WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)',
  );
  result.deletedNotifications = oldNotifications.affectedRows;

  // 3. 등록 7일 지나도 안 가져간 카드 → 주선자에게 리마인드 (카드당 한 번만)
  const unclaimed = await query<{ id: number; author_user_id: number }>(
    `SELECT p.id, p.author_user_id
       FROM profile p
      WHERE p.claimed_at IS NULL
        AND p.deleted_at IS NULL
        AND p.status = 'ACTIVE'
        AND p.author_user_id <> COALESCE(p.subject_user_id, 0)
        AND p.created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
        AND NOT EXISTS (
          SELECT 1 FROM notification n
           WHERE n.user_id = p.author_user_id
             AND n.type = 'CLAIM_REMINDER'
             AND JSON_EXTRACT(n.payload, '$.profileId') = p.id
        )`,
  );
  for (const p of unclaimed) {
    await execute('INSERT INTO notification (user_id, type, payload) VALUES (?, ?, ?)', [
      p.author_user_id,
      'CLAIM_REMINDER',
      JSON.stringify({ profileId: p.id }),
    ]);
  }
  result.claimReminders = unclaimed.length;

  // 4. 만료된 지 30일 넘은 초대 링크 청소 (미사용 링크가 무한히 쌓이는 걸 막는다)
  const oldInvites = await execute(
    'DELETE FROM room_invite WHERE used_at IS NULL AND expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)',
  );
  result.deletedInvites = oldInvites.affectedRows;

  return NextResponse.json({ ok: true, ...result });
}
