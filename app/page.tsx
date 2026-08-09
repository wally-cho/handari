import { query } from '@/lib/db';
import { getCurrentUser, isOnboarded } from '@/lib/session';
import { canCreateRoom } from '@/lib/admin';
import Logo from '@/components/Logo';
import { NotificationBell } from '@/components/AppBar';
import { Box, ButtonLink, Caption, Card, PageTitle, SectionTitle, Users } from '@/components/ui';
import Link from 'next/link';
import type { RoomRow } from '@/lib/types';

// 랜딩. 초대 링크가 없으면 여기서 막힌다 (PRODUCT 1).
// 회원가입 버튼은 없다 - 초대 링크로만 들어올 수 있다.

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 pb-16">
        <Logo height={44} />
        <p className="text-ink-3 kr mt-4 mb-8 text-[15px] leading-relaxed">
          한 다리 건너 아는 사람을,
          <br />
          아는 사람이 보증해서 소개합니다.
        </p>

        <Box>
          <p className="text-[15px] font-bold">초대 링크가 필요해요</p>
          <Caption className="mt-1.5">
            한다리는 아는 사람의 초대로만 들어올 수 있어요. 받으신 링크를 열어주세요.
          </Caption>
        </Box>

        <Link
          href="/login"
          className="text-ink-3 mt-5 text-center text-[14px] font-medium underline underline-offset-4"
        >
          이미 가입했어요
        </Link>
      </main>
    );
  }

  if (!isOnboarded(user)) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 pb-16">
        <PageTitle sub="소개를 주고받으려면 두 가지만 더 필요해요.">거의 다 됐어요</PageTitle>
        <ButtonLink href="/onboarding">계속하기</ButtonLink>
      </main>
    );
  }

  const rooms = await query<RoomRow & { member_count: number }>(
    `SELECT r.*, (
       SELECT COUNT(*) FROM room_member m2
        WHERE m2.room_id = r.id AND m2.status = 'ACTIVE'
     ) AS member_count
       FROM room r
       JOIN room_member m ON m.room_id = r.id
      WHERE m.user_id = ? AND m.status = 'ACTIVE'
      ORDER BY r.created_at DESC`,
    [user.id],
  );

  return (
    <>
      <header className="flex h-14 items-center justify-end gap-1 px-4">
        <Link href="/me" className="text-ink-2 px-2 text-[14px] font-medium">
          내 정보
        </Link>
        <NotificationBell userId={user.id} />
      </header>

      <main className="px-6 pb-16">
        <div className="mb-7">
          <Logo height={32} />
          <p className="text-ink-3 mt-2.5 text-[15px]">{user.nickname}님</p>
        </div>

        <SectionTitle count={rooms.length}>내 방</SectionTitle>

        {rooms.length === 0 ? (
          <Box>
            <Caption>아직 들어간 방이 없어요. 초대 링크를 열면 방에 들어갈 수 있어요.</Caption>
          </Box>
        ) : (
          <ul className="space-y-2.5">
            {rooms.map((room) => (
              <li key={room.id}>
                <Card href={`/rooms/${room.id}`}>
                  <div className="flex items-center gap-3 p-4">
                    <div className="bg-brand-soft text-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                      <Users size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-bold tracking-[-0.03em]">
                        {room.name}
                      </p>
                      <p className="text-ink-3 mark mt-0.5 text-[13px]">
                        멤버 {room.member_count}명
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {canCreateRoom(user.id) && (
          <ButtonLink href="/rooms/new" tone="ghost" className="mt-3">
            방 만들기
          </ButtonLink>
        )}

        <Caption className="mt-8">
          방은 초대 링크로만 들어올 수 있어요. 링크는 멤버 누구나 각자 만들 수 있고, 한 명이 쓰면
          만료돼요.
        </Caption>
      </main>
    </>
  );
}
