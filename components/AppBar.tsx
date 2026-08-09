import Link from 'next/link';
import { queryOne } from '@/lib/db';
import { Bell, ChevronLeft } from '@/components/ui';

// 상단 바. 알림은 항상 종 아이콘이고 텍스트로 쓰지 않는다.
// 안 읽은 게 있으면 빨간 점이 붙는다 (PRODUCT 55). 실시간이 아니라 화면을 새로 그릴 때 갱신된다.

export async function NotificationBell({ userId }: { userId: number }) {
  const row = await queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM notification WHERE user_id = ? AND read_at IS NULL',
    [userId],
  );
  const unread = row?.c ?? 0;

  return (
    <Link href="/notifications" className="text-ink-2 relative -mr-1 p-2">
      <Bell size={22} />
      {unread > 0 && (
        <span
          className="dot mark absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full px-1 text-center text-[11px] leading-[18px] font-bold text-white ring-2 ring-white"
          aria-label={`안 읽은 알림 ${unread}개`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      <span className="sr-only">알림</span>
    </Link>
  );
}

export default function AppBar({
  title,
  back,
  userId,
  action,
}: {
  title?: string;
  back?: string;
  userId?: number;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-white/90 px-4 backdrop-blur-md">
      {back && (
        <Link href={back} aria-label="뒤로" className="text-ink -ml-2 p-2">
          <ChevronLeft size={24} />
        </Link>
      )}
      <h1 className="flex-1 truncate text-[17px] font-bold tracking-[-0.03em]">{title}</h1>
      {action}
      {userId != null && <NotificationBell userId={userId} />}
    </header>
  );
}
