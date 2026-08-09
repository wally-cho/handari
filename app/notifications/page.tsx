import Link from 'next/link';
import { execute, query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificationText } from '@/lib/notify';
import AppBar from '@/components/AppBar';
import { Caption, EmptyState } from '@/components/ui';
import type { NotificationRow } from '@/lib/types';

// 알림함 (PRODUCT 54~57).
// 실시간 푸시는 없다. 이 화면을 열 때 읽음 처리된다.

export const dynamic = 'force-dynamic';

function timeAgo(date: Date): string {
  const min = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

/** 알림에서 어디로 보낼지 */
function hrefFor(n: NotificationRow): string {
  const profileId = (n.payload ?? {}).profileId as number | undefined;

  switch (n.type) {
    case 'INTEREST_RECEIVED':
    case 'MATCHMAKER_COMMENT':
    case 'INTEREST_ACCEPTED':
    case 'INTEREST_DECLINED':
    case 'INTEREST_EXPIRED':
    case 'CONNECTION_PENDING':
    case 'CONNECTION_DONE':
      return '/interests';
    case 'INTEREST_UNCLAIMED':
    case 'CLAIM_REMINDER':
      return profileId ? `/profiles/${profileId}/share` : '/me';
    default:
      return profileId ? `/profiles/${profileId}` : '/me';
  }
}

export default async function NotificationsPage() {
  const user = await requireUser('/notifications');

  const items = await query<NotificationRow>(
    'SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
    [user.id],
  );

  // 목록을 읽었으므로 읽음 처리한다
  await execute(
    'UPDATE notification SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL',
    [user.id],
  );

  return (
    <>
      <AppBar title="알림" back="/" />

      <main className="px-6 pt-2 pb-16">
        {items.length === 0 ? (
          <EmptyState>아직 알림이 없어요.</EmptyState>
        ) : (
          <ul className="divide-haze divide-y">
            {items.map((n) => {
              const unread = n.read_at == null;
              return (
                <li key={n.id}>
                  <Link
                    href={hrefFor(n)}
                    className="-mx-2 flex items-start gap-2.5 px-2 py-4 active:opacity-60"
                  >
                    <span
                      className={`mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full ${unread ? 'dot' : 'bg-transparent'}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`kr block text-[15px] leading-snug ${unread ? 'font-semibold' : 'text-ink-2'}`}
                      >
                        {notificationText(n.type).title}
                      </span>
                      <span className="text-ink-3 mark mt-1 block text-[13px]">
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Caption className="mt-8 text-center">알림은 90일까지 보관해요.</Caption>
      </main>
    </>
  );
}
