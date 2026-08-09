import Link from 'next/link';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import { distancesFrom, degreeToProfile } from '@/lib/graph';
import AppBar from '@/components/AppBar';
import ProfileCard, { type CardData } from '@/components/ProfileCard';
import { Box, ButtonLink, Caption, EmptyState, SectionTitle } from '@/components/ui';
import type { ProfileRow } from '@/lib/types';

// 방 홈 = 카드 목록.
//
// 다리 수가 바뀌는 지점마다 섹션이 갈린다. 정렬 순서(다리 수 오름차순, PRODUCT 31)가
// 그대로 화면 구조가 된다 — 내려갈수록 나에게서 멀어진다.
//
// 열람 게이트를 통과하지 못했으면 카드 대신 등록 유도 화면을 보여준다 (PRODUCT 9~12).

function groupLabel(degree: number): { title: string; hint?: string } {
  if (!Number.isFinite(degree)) return { title: '먼 사이' };
  if (degree === 0) return { title: '내 카드' };
  if (degree === 1) return { title: '1다리', hint: '직접 아는 사이' };
  if (degree === 2) return { title: '2다리', hint: '친구의 친구' };
  return { title: `${degree}다리` };
}

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = Number(id);
  const user = await requireUser(`/rooms/${id}`);
  const { room, unlocked, isOwner } = await requireRoomAccess(roomId, user.id);

  // 잠긴 상태에서도 규모와 성비는 보여준다. 등록할 가치가 있는 방인지 판단할 수 있어야 한다
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

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['멤버', stats?.members ?? 0],
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

  const groups: { degree: number; cards: CardData[] }[] = [];
  for (const card of cards) {
    const last = groups.at(-1);
    if (last && last.degree === card.degree) last.cards.push(card);
    else groups.push({ degree: card.degree, cards: [card] });
  }

  let index = 0;

  return (
    <>
      <AppBar title={room.name} back="/" userId={user.id} action={manageLink} />

      <main className="px-6 pt-2 pb-32">
        <div className="mb-6 flex gap-2">
          {[
            ['멤버', stats?.members ?? 0],
            ['남성', stats?.male ?? 0],
            ['여성', stats?.female ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="bg-fill-2 flex-1 rounded-2xl py-3 text-center">
              <div className="text-ink-3 text-[12px] font-medium">{label}</div>
              <div className="mark mt-0.5 text-[18px] font-bold">{value}</div>
            </div>
          ))}
        </div>

        <ButtonLink href={`/rooms/${roomId}/invite`} tone="ghost" small className="!w-full">
          초대 링크 만들기
        </ButtonLink>

        {cards.length === 0 ? (
          <EmptyState>아직 등록된 카드가 없어요.</EmptyState>
        ) : (
          <div className="mt-8 space-y-8">
            {groups.map((group) => {
              const { title, hint } = groupLabel(group.degree);
              return (
                <section key={group.degree}>
                  <SectionTitle
                    count={group.cards.length}
                    action={hint ? <Caption>{hint}</Caption> : undefined}
                  >
                    {title}
                  </SectionTitle>

                  <ul className="space-y-2.5">
                    {group.cards.map((card) => {
                      index += 1;
                      return (
                        <li
                          key={card.id}
                          className="rise"
                          style={{
                            animationDelay: `${Math.min(index * 35, 280)}ms`,
                          }}
                        >
                          <ProfileCard card={card} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[460px] bg-gradient-to-t from-white via-white to-transparent px-6 pt-6 pb-6">
        <ButtonLink href={`/rooms/${roomId}/register`}>등록하기</ButtonLink>
      </div>
    </>
  );
}
