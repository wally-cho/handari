import { notFound, redirect } from 'next/navigation';
import { execute, query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import AppBar from '@/components/AppBar';
import {
  Badge,
  Button,
  Caption,
  Field,
  Input,
  ListRow,
  Notice,
  SectionTitle,
} from '@/components/ui';

// 방 관리. 방장만 들어온다 (PRODUCT 8).
//
// 강퇴하면 그 사람 카드는 방에서 사라지지만, 그 사람이 주선자로 등록한 카드는 남는다.
// 등록당한 쪽에게는 잘못이 없기 때문이다.

interface MemberRow {
  member_id: number;
  user_id: number;
  nickname: string;
  role: string;
  invited_by_nickname: string | null;
  card_count: number;
}

export default async function ManageRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const roomId = Number(id);
  const user = await requireUser(`/rooms/${id}/manage`);
  const { room, isOwner } = await requireRoomAccess(roomId, user.id);
  if (!isOwner) notFound();

  const { saved, error } = await searchParams;

  const members = await query<MemberRow>(
    `SELECT m.id AS member_id, m.user_id, u.nickname, m.role,
            iu.nickname AS invited_by_nickname,
            (SELECT COUNT(*) FROM profile p
              WHERE p.room_id = m.room_id AND p.subject_user_id = m.user_id
                AND p.deleted_at IS NULL) AS card_count
       FROM room_member m
       JOIN \`user\` u ON u.id = m.user_id
       LEFT JOIN \`user\` iu ON iu.id = m.invited_by_user_id
      WHERE m.room_id = ? AND m.status = 'ACTIVE'
      ORDER BY FIELD(m.role,'OWNER') DESC, m.joined_at ASC`,
    [roomId],
  );

  async function rename(formData: FormData) {
    'use server';

    const me = await requireUser();
    const access = await requireRoomAccess(roomId, me.id);
    if (!access.isOwner) notFound();

    const name = String(formData.get('name') ?? '').trim();
    if (name.length < 2 || name.length > 100) {
      redirect(`/rooms/${roomId}/manage?error=name`);
    }

    await execute('UPDATE room SET name = ? WHERE id = ?', [name, roomId]);
    redirect(`/rooms/${roomId}/manage?saved=1`);
  }

  async function kick(formData: FormData) {
    'use server';

    const me = await requireUser();
    const access = await requireRoomAccess(roomId, me.id);
    if (!access.isOwner) notFound();

    const targetUserId = Number(formData.get('user_id'));
    if (targetUserId === me.id) redirect(`/rooms/${roomId}/manage`);

    await execute(
      "UPDATE room_member SET status='KICKED' WHERE room_id = ? AND user_id = ? AND role <> 'OWNER'",
      [roomId, targetUserId],
    );

    // 본인 카드는 방에서 내린다. 주선자로 등록한 카드는 그대로 둔다
    await execute(
      `UPDATE profile SET status='DELETED', deleted_at=UTC_TIMESTAMP()
        WHERE room_id = ? AND subject_user_id = ? AND deleted_at IS NULL`,
      [roomId, targetUserId],
    );
    await execute(
      `UPDATE interest SET status='EXPIRED'
        WHERE room_id = ? AND from_user_id = ? AND status='PENDING'`,
      [roomId, targetUserId],
    );

    redirect(`/rooms/${roomId}/manage`);
  }

  return (
    <>
      <AppBar title="방 관리" back={`/rooms/${roomId}`} userId={user.id} />

      <main className="px-6 pt-2 pb-16">
        {saved && (
          <div className="mb-5">
            <Notice tone="good">방 이름을 바꿨어요.</Notice>
          </div>
        )}
        {error === 'name' && (
          <div className="mb-5">
            <Notice>방 이름은 2자 이상 100자 이하로 지어주세요.</Notice>
          </div>
        )}

        <form action={rename}>
          <Field label="방 이름" htmlFor="name">
            <div className="flex gap-2">
              <Input
                id="name"
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={room.name}
              />
              <Button type="submit" tone="ghost" small className="shrink-0 !px-4">
                저장
              </Button>
            </div>
          </Field>
        </form>
        <Caption className="mt-2">
          이름을 바꿔도 초대 링크와 카드는 그대로예요. 멤버 화면에 바로 반영돼요.
        </Caption>

        <div className="mt-10">
          <SectionTitle count={members.length}>멤버</SectionTitle>

          <ul className="divide-haze divide-y">
            {members.map((m) => (
              <li key={m.member_id}>
                <ListRow
                  title={
                    <span className="flex items-center gap-1.5">
                      {m.nickname}
                      {m.role === 'OWNER' && <Badge>방장</Badge>}
                    </span>
                  }
                  sub={`${m.invited_by_nickname ? `${m.invited_by_nickname}님 초대` : '방을 만든 사람'} · 카드 ${m.card_count}개`}
                  right={
                    m.role !== 'OWNER' ? (
                      <form action={kick}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <Button type="submit" tone="ghost" small>
                          내보내기
                        </Button>
                      </form>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </div>

        <Caption className="mt-8">
          내보내면 그 사람 카드는 방에서 사라져요. 다만 그 사람이 소개해준 다른 사람의 카드는
          남아요.
        </Caption>
      </main>
    </>
  );
}
