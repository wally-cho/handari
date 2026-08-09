import Link from 'next/link';
import { redirect } from 'next/navigation';
import { queryOne, transaction } from '@/lib/db';
import { getCurrentUser, isOnboarded } from '@/lib/session';
import { isExpired } from '@/lib/tokens';
import { notify } from '@/lib/notify';
import type { RoomInviteRow } from '@/lib/types';

// 초대 링크 진입 (PRODUCT 7).
// 링크 하나 = 사람 한 명. 이 링크를 준 사람이 곧 그 사람의 초대 엣지가 된다.

interface InviteView extends RoomInviteRow {
  room_name: string;
  inviter_nickname: string;
  member_count: number;
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await queryOne<InviteView>(
    `SELECT i.*, r.name AS room_name, u.nickname AS inviter_nickname,
            (SELECT COUNT(*) FROM room_member m WHERE m.room_id = i.room_id AND m.status='ACTIVE') AS member_count
       FROM room_invite i
       JOIN room r ON r.id = i.room_id
       JOIN \`user\` u ON u.id = i.inviter_user_id
      WHERE i.token = ?`,
    [token],
  );

  // 만료 판정은 조회 시점에 한다. 배치를 기다리지 않는다.
  const dead =
    !invite || invite.used_at != null || invite.revoked_at != null || isExpired(invite.expires_at);

  if (dead) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-8">
        <h1 className="text-2xl font-bold tracking-tight">만료된 링크예요</h1>
        <p className="text-ink-2 mt-3 text-sm leading-relaxed">
          초대 링크는 한 번만 쓸 수 있고 24시간 뒤에 만료돼요. 초대해주신 분께 새 링크를 요청해
          주세요.
        </p>
      </main>
    );
  }

  const user = await getCurrentUser();

  // 로그인 전에는 방 정보만 보여주고 로그인시킨다
  if (!user) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-8">
        <p className="text-ink-3 text-sm">{invite.inviter_nickname}님의 초대</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{invite.room_name}</h1>
        <p className="text-ink-2 mt-3 text-sm leading-relaxed">
          지금 {invite.member_count}명이 있어요.
          <br />한 다리 건너 아는 사람을, 아는 사람이 보증해서 소개해요.
        </p>

        <Link
          href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
          className="btn btn-kakao mt-9 block text-center"
        >
          카카오로 시작하기
        </Link>
        <p className="text-ink-3 mt-6 text-center text-xs">만 19세 이상만 이용할 수 있어요.</p>
      </main>
    );
  }

  if (!isOnboarded(user)) redirect(`/onboarding?next=${encodeURIComponent(`/join/${token}`)}`);

  // 이미 그 방 멤버면 링크를 소모하지 않는다. 다른 사람이 쓸 수 있게 남겨둔다
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM room_member WHERE room_id = ? AND user_id = ? AND status = 'ACTIVE'",
    [invite.room_id, user.id],
  );
  if (existing) redirect(`/rooms/${invite.room_id}`);

  // 본인이 만든 링크로는 못 들어간다
  if (invite.inviter_user_id === user.id) redirect(`/rooms/${invite.room_id}`);

  await transaction(async (tx) => {
    // 같은 링크로 두 명이 동시에 들어오는 경쟁을 막는다.
    // 영향 행 수가 1일 때만 진행한다.
    const claimed = await tx.execute(
      `UPDATE room_invite
          SET used_by_user_id = ?, used_at = UTC_TIMESTAMP()
        WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
      [user.id, token],
    );
    if (claimed.affectedRows !== 1) throw new Error('LINK_TAKEN');

    await tx.execute(
      `INSERT INTO room_member (room_id, user_id, invited_by_user_id, role)
       VALUES (?, ?, ?, 'MEMBER')`,
      [invite.room_id, user.id, invite.inviter_user_id],
    );
  }).catch((e: Error) => {
    if (e.message === 'LINK_TAKEN') redirect(`/join/${token}`); // 만료 화면으로 다시
    throw e;
  });

  // 초대한 사람에게 알린다. 링크를 보내놓고 들어왔는지 몰라서
  // 계속 물어보게 되는 걸 막는다
  await notify(invite.inviter_user_id, 'INVITE_ACCEPTED', {
    roomId: invite.room_id,
    nickname: user.nickname,
  });

  redirect(`/rooms/${invite.room_id}`);
}
