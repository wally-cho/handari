import { redirect } from 'next/navigation';
import { execute, query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import { newToken, linkExpiry, isExpired, remainingText } from '@/lib/tokens';
import { baseUrl } from '@/lib/url';
import AppBar from '@/components/AppBar';
import ShareLink from '@/components/ShareLink';
import { Badge, Box, Button, Caption, EmptyState, ListRow, SectionTitle } from '@/components/ui';

// 초대 링크는 방 멤버 누구나 각자 발급한다 (PRODUCT 7).
// 방장만의 권한이 아니다 — 내가 부른 사람과 나 사이에 관계가 생겨야 다리 수가 계산되기 때문이다.
//
// 링크 하나는 한 명만 쓸 수 있고 24시간 뒤 만료된다. 재사용되면 단톡방에 뿌려지고,
// 그러면 누가 누구를 데려왔는지 알 수 없어져 폐쇄성과 다리 수가 동시에 무너진다.

interface InviteListRow {
  id: number;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  used_by_nickname: string | null;
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const roomId = Number(id);
  const user = await requireUser(`/rooms/${id}/invite`);
  const { room } = await requireRoomAccess(roomId, user.id);
  const { t: highlighted } = await searchParams;

  async function issue() {
    'use server';

    const me = await requireUser();
    await requireRoomAccess(roomId, me.id);

    const token = newToken();
    await execute(
      'INSERT INTO room_invite (room_id, inviter_user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [roomId, me.id, token, linkExpiry()],
    );
    redirect(`/rooms/${roomId}/invite?t=${token}`);
  }

  /** 아직 아무도 안 쓴 링크를 지금 즉시 못 쓰게 만든다. 잘못 보냈을 때 회수용 */
  async function revoke(formData: FormData) {
    'use server';

    const me = await requireUser();
    const inviteId = Number(formData.get('invite_id'));

    // 내가 만든 링크만 만료시킬 수 있다
    await execute(
      `UPDATE room_invite SET revoked_at = UTC_TIMESTAMP()
        WHERE id = ? AND inviter_user_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
      [inviteId, me.id],
    );
    redirect(`/rooms/${roomId}/invite`);
  }

  const invites = await query<InviteListRow>(
    `SELECT i.id, i.token, i.expires_at, i.used_at, i.revoked_at, u.nickname AS used_by_nickname
       FROM room_invite i
       LEFT JOIN \`user\` u ON u.id = i.used_by_user_id
      WHERE i.room_id = ? AND i.inviter_user_id = ?
      ORDER BY i.created_at DESC
      LIMIT 30`,
    [roomId, user.id],
  );

  const base = await baseUrl();
  const active = invites.find((i) => i.token === highlighted);

  return (
    <>
      <AppBar title="친구 초대" back={`/rooms/${roomId}`} userId={user.id} />

      <main className="px-6 pt-2 pb-16">
        {active && (
          <section className="mb-8">
            <Box tone="brand">
              <p className="text-[15px] font-bold">링크가 만들어졌어요</p>
              <Caption className="mt-1">
                한 명만 쓸 수 있어요 · {remainingText(active.expires_at)}
              </Caption>
              <div className="mt-4">
                <ShareLink
                  url={`${base}/join/${active.token}`}
                  message={
                    `"${room.name}" 방으로 초대할게. 한다리라는 데야.\n` +
                    `아는 사람 건너 아는 사람만 있는 곳이라 편해.\n\n` +
                    `이 링크는 너 한 명만 쓸 수 있고 24시간 뒤에 만료돼.\n${base}/join/${active.token}`
                  }
                />
              </div>
            </Box>
          </section>
        )}

        <form action={issue}>
          <Button type="submit">초대 링크 만들기</Button>
        </form>
        <Caption className="mt-2.5 text-center">
          한 명당 하나씩 만들어주세요. 여러 명을 부르려면 여러 번 눌러요.
        </Caption>

        <div className="mt-10">
          <SectionTitle count={invites.length}>내가 만든 링크</SectionTitle>

          {invites.length === 0 ? (
            <EmptyState>아직 만든 링크가 없어요.</EmptyState>
          ) : (
            <ul className="divide-haze divide-y">
              {invites.map((invite) => {
                const revoked = invite.revoked_at != null;
                const expired = isExpired(invite.expires_at);
                const alive = !invite.used_at && !revoked && !expired;

                return (
                  <li key={invite.id}>
                    <ListRow
                      title={
                        <span className="mark text-ink-3 font-mono text-[13px] font-normal">
                          …{invite.token.slice(-8)}
                        </span>
                      }
                      sub={
                        invite.used_at
                          ? `${invite.used_by_nickname ?? '누군가'}님이 사용했어요`
                          : revoked
                            ? '직접 만료시켰어요'
                            : expired
                              ? '시간이 지나 만료됐어요'
                              : remainingText(invite.expires_at)
                      }
                      right={
                        invite.used_at ? (
                          <Badge tone="good">사용됨</Badge>
                        ) : alive ? (
                          <form action={revoke}>
                            <input type="hidden" name="invite_id" value={invite.id} />
                            <Button type="submit" tone="ghost" small>
                              만료시키기
                            </Button>
                          </form>
                        ) : (
                          <Badge>만료</Badge>
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Caption className="mt-8">
          잘못 보냈거나 더 이상 필요 없으면 만료시켜 주세요. 만료한 링크는 되살릴 수 없고, 새로
          만들면 돼요.
        </Caption>
      </main>
    </>
  );
}
