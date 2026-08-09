import Link from 'next/link';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { signOut } from '@/auth';
import AppBar from '@/components/AppBar';
import { ageOf } from '@/lib/age';
import {
  Badge,
  Button,
  ButtonLink,
  ChevronRight,
  EmptyState,
  ListRow,
  Notice,
  SectionTitle,
} from '@/components/ui';
import type { ProfileRow } from '@/lib/types';

// 마이페이지. 내 카드, 내가 소개한 사람, 관심 현황.
// 알림은 상단 종 아이콘으로 어디서든 갈 수 있어서 여기 메뉴로 두지 않는다.

interface MyCard extends ProfileRow {
  room_name: string;
}

export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser('/me');
  const { saved } = await searchParams;

  // 서로 의존이 없으므로 같이 기다린다
  const [myCards, registered] = await Promise.all([
    query<MyCard>(
      `SELECT p.*, r.name AS room_name
       FROM profile p JOIN room r ON r.id = p.room_id
      WHERE p.subject_user_id = ? AND p.deleted_at IS NULL AND p.status <> 'DELETED'
      ORDER BY p.updated_at DESC`,
      [user.id],
    ),
    query<MyCard>(
      `SELECT p.*, r.name AS room_name
       FROM profile p JOIN room r ON r.id = p.room_id
      WHERE p.author_user_id = ?
        AND (p.subject_user_id IS NULL OR p.subject_user_id <> ?)
        AND p.deleted_at IS NULL AND p.status <> 'DELETED'
      ORDER BY p.created_at DESC`,
      [user.id, user.id],
    ),
  ]);

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  const age = user.birth_year ? ageOf(user.birth_year) : null;

  return (
    <>
      <AppBar title="내 정보" back="/" userId={user.id} />

      <main className="px-6 pt-2 pb-16">
        {saved && (
          <div className="mb-5">
            <Notice tone="good">저장했어요. 내 카드에도 반영했어요.</Notice>
          </div>
        )}

        <Link
          href="/me/edit"
          className="-mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-1 active:opacity-60"
        >
          {user.kakao_profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.kakao_profile_image_url}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="bg-fill h-16 w-16 rounded-full" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold tracking-[-0.03em]">{user.nickname}</p>
            <p className="text-ink-3 mark mt-0.5 text-[14px]">
              {age && `${age}세`}
              {user.gender && ` · ${user.gender === 'MALE' ? '남성' : '여성'}`}
            </p>
          </div>
          <ChevronRight size={20} className="text-ink-3 shrink-0" />
        </Link>

        <ButtonLink href="/interests" tone="ghost" className="mt-6">
          주고받은 관심 보기
        </ButtonLink>

        <div className="mt-10">
          <SectionTitle count={myCards.length}>내 카드</SectionTitle>
          {myCards.length === 0 ? (
            <EmptyState>아직 등록한 카드가 없어요.</EmptyState>
          ) : (
            <ul className="divide-haze divide-y">
              {myCards.map((card) => (
                <li key={card.id}>
                  <ListRow
                    href={`/profiles/${card.id}`}
                    title={card.display_name}
                    sub={card.room_name}
                    right={
                      card.status === 'PAUSED' ? (
                        <Badge>쉬는 중</Badge>
                      ) : card.status === 'HIDDEN' ? (
                        <Badge tone="alert">신고됨</Badge>
                      ) : (
                        <Badge tone="good">찾는 중</Badge>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-10">
          <SectionTitle count={registered.length}>내가 소개한 사람</SectionTitle>
          {registered.length === 0 ? (
            <EmptyState>아직 소개한 사람이 없어요.</EmptyState>
          ) : (
            <ul className="divide-haze divide-y">
              {registered.map((card) => (
                <li key={card.id}>
                  <ListRow
                    href={card.claimed_at ? `/profiles/${card.id}` : `/profiles/${card.id}/share`}
                    title={card.display_name}
                    sub={card.room_name}
                    right={
                      card.claimed_at ? (
                        <Badge tone="good">가져갔어요</Badge>
                      ) : (
                        <Badge tone="warn">링크 보내기</Badge>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <form action={logout} className="mt-14">
          <Button type="submit" tone="ghost" small className="!w-full">
            로그아웃
          </Button>
        </form>
      </main>
    </>
  );
}
