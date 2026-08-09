import { notFound, redirect } from 'next/navigation';
import { execute } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { canCreateRoom } from '@/lib/admin';
import AppBar from '@/components/AppBar';
import { Button, Caption, Field, Input, Notice, PageTitle } from '@/components/ui';

// 오픈 전까지 방은 운영자만 만든다 (lib/admin.ts).
// 방이 무분별하게 늘면 각 방이 임계 인원을 못 채워 전부 빈 방이 된다.

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser('/rooms/new');
  if (!canCreateRoom(user.id)) notFound();

  const { error } = await searchParams;

  async function create(formData: FormData) {
    'use server';

    const me = await requireUser();
    if (!canCreateRoom(me.id)) notFound();

    const name = String(formData.get('name') ?? '').trim();
    if (name.length < 2 || name.length > 100) redirect('/rooms/new?error=name');

    const room = await execute('INSERT INTO room (name, owner_user_id) VALUES (?, ?)', [
      name,
      me.id,
    ]);

    // 방을 만든 사람은 초대한 사람이 없으므로 invited_by_user_id가 NULL이다.
    // 열람 게이트도 처음부터 통과한다 — 잠글 대상이 없다.
    await execute(
      `INSERT INTO room_member (room_id, user_id, invited_by_user_id, role, unlocked_at)
       VALUES (?, ?, NULL, 'OWNER', UTC_TIMESTAMP())`,
      [room.insertId, me.id],
    );

    redirect(`/rooms/${room.insertId}`);
  }

  return (
    <>
      <AppBar title="방 만들기" back="/" userId={user.id} />

      <main className="px-6 pt-2 pb-16">
        <PageTitle sub="동창회, 회사, 동호회처럼 이미 아는 사람들이 모인 단위로 만들면 좋아요. 방에 들어온 사람끼리만 서로 보여요.">
          어떤 모임인가요?
        </PageTitle>

        {error === 'name' && (
          <div className="mb-5">
            <Notice>방 이름은 2자 이상 100자 이하로 지어주세요.</Notice>
          </div>
        )}

        <form action={create} className="space-y-7">
          <Field label="방 이름" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="00대학교 00학번"
            />
          </Field>

          <Button type="submit">만들기</Button>
        </form>

        <Caption className="mt-5">
          만들면 바로 방장이 되고, 초대 링크를 하나씩 만들어 친구를 부를 수 있어요.
        </Caption>
      </main>
    </>
  );
}
