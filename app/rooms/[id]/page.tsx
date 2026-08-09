import Link from 'next/link';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import { distancesFrom, degreeToProfile } from '@/lib/graph';
import AppBar from '@/components/AppBar';
import ProfileCard, { type CardData } from '@/components/ProfileCard';
import { Box, ButtonLink, Caption, EmptyState, Tabs } from '@/components/ui';
import type { ProfileRow } from '@/lib/types';

// 방 홈 = 카드 목록.
//
// 한 목록으로 쭉 내려간다. 다리 수는 섹션으로 가르지 않고 카드마다 라벨로 붙는다 —
// 방이 작을 때 섹션으로 쪼개면 한두 장짜리 토막이 여럿 생겨 오히려 읽기 어렵다.
// 정렬은 다리 수가 가까운 순이다 (PRODUCT 31).
//
// 열람 게이트를 통과하지 못했으면 카드 대신 등록 유도 화면을 보여준다 (PRODUCT 9~12).

type GenderFilter = 'ALL' | 'MALE' | 'FEMALE';

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ g?: string }>;
}) {
  const { id } = await params;
  const { g } = await searchParams;
  const filter: GenderFilter = g === 'MALE' || g === 'FEMALE' ? g : 'ALL';
  const roomId = Number(id);
  const user = await requireUser(`/rooms/${id}`);
  const { room, unlocked, isOwner } = await requireRoomAccess(roomId, user.id);

  // 잠긴 상태에서도 규모와 성비는 보여준다. 등록할 가치가 있는 방인지 판단할 수 있어야 한다.
  //
  // 카드 수와 참여자 수는 다르다. 카드 없이 들어온 사람이 있고(주선자로만 참여),
  // 본인이 아직 안 들어온 카드도 있다(본인 미확인). 합이 맞는 건 카드끼리라
  // 남/여 옆에는 카드 합계를 놓고, 참여자 수는 따로 적는다.
  const stats = await queryOne<{
    members: number;
    male: number;
    female: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM room_member WHERE room_id = ? AND status = 'ACTIVE') AS members,
       (SELECT COUNT(*) FROM profile WHERE room_id = ? AND status = 'ACTIVE' AND gender='MALE'   AND deleted_at IS NULL) AS male,
       (SELECT COUNT(*) FROM profile WHERE room_id = ? AND status = 'ACTIVE' AND gender='FEMALE' AND deleted_at IS NULL) AS female`,
    [roomId, roomId, roomId],
  );

  const manageLink = isOwner ? (
    <Link href={`/rooms/${roomId}/manage`} className="text-ink-3 px-2 text-[14px] font-medium">
      관리
    </Link>
  ) : null;

  if (!unlocked) {
    return (
      <>
        <AppBar title={room.name} back="/" userId={user.id} action={manageLink} />
        <main className="px-6 pt-4 pb-16">
          <Box tone="brand" className="text-center">
            <p className="text-[17px] font-bold">아직 카드가 안 보여요</p>
            <p className="text-ink-2 kr mt-2 text-[14px] leading-relaxed">
              본인이든 친구든 한 명 등록하면 방이 열려요.
            </p>
          </Box>

          <Caption className="mt-4 mb-2 text-center">참여자 {stats?.members ?? 0}명</Caption>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ['카드', (stats?.male ?? 0) + (stats?.female ?? 0)],
              ['남성', stats?.male ?? 0],
              ['여성', stats?.female ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="bg-fill-2 rounded-2xl py-4">
                <dt className="text-ink-3 text-[12px] font-medium">{label}</dt>
                <dd className="mark mt-1 text-[20px] font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 space-y-2.5">
            <ButtonLink href={`/rooms/${roomId}/register`}>등록하기</ButtonLink>
            <ButtonLink href={`/rooms/${roomId}/invite`} tone="ghost">
              친구 초대하기
            </ButtonLink>
          </div>
        </main>
      </>
    );
  }

  // 품절된 카드는 목록에서 빠진다 (PRODUCT 49). 내가 등록한 카드는 그대로 보인다 (PRODUCT 32).
  const profiles = await query<ProfileRow & { author_nickname: string }>(
    `SELECT p.*, u.nickname AS author_nickname
       FROM profile p
       JOIN \`user\` u ON u.id = p.author_user_id
      WHERE p.room_id = ? AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
      ORDER BY p.updated_at DESC`,
    [roomId],
  );

  const dist = await distancesFrom(roomId, user.id);
  const cards: CardData[] = profiles
    .map((p) => ({ ...p, degree: degreeToProfile(dist, p) }))
    .sort((a, b) => a.degree - b.degree);

  // 탭 카운트는 전체 기준으로 세야 하므로 필터링은 표시 직전에 한다
  const visible = filter === 'ALL' ? cards : cards.filter((c) => c.gender === filter);

  return (
    <>
      <AppBar title={room.name} back="/" userId={user.id} action={manageLink} />

      <main className="px-6 pt-1 pb-32">
        <Caption className="mb-3">참여자 {stats?.members ?? 0}명</Caption>

        <ButtonLink href={`/rooms/${roomId}/invite`} tone="ghost" small className="!w-full">
          초대 링크 만들기
        </ButtonLink>

        <div className="mt-6">
          <Tabs
            items={[
              {
                href: `/rooms/${roomId}`,
                label: '전체',
                count: cards.length,
                active: filter === 'ALL',
              },
              {
                href: `/rooms/${roomId}?g=MALE`,
                label: '남성',
                count: cards.filter((c) => c.gender === 'MALE').length,
                active: filter === 'MALE',
              },
              {
                href: `/rooms/${roomId}?g=FEMALE`,
                label: '여성',
                count: cards.filter((c) => c.gender === 'FEMALE').length,
                active: filter === 'FEMALE',
              },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState>
            {cards.length === 0 ? '아직 등록된 카드가 없어요.' : '이 조건에 맞는 카드가 없어요.'}
          </EmptyState>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {visible.map((card, i) => (
              <li
                key={card.id}
                className="rise"
                style={{ animationDelay: `${Math.min(i * 35, 280)}ms` }}
              >
                <ProfileCard card={card} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[460px] bg-gradient-to-t from-white via-white to-transparent px-6 pt-6 pb-6">
        <ButtonLink href={`/rooms/${roomId}/register`}>등록하기</ButtonLink>
      </div>
    </>
  );
}
