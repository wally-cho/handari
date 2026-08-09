import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { queryOne, execute } from '@/lib/db';
import type { RoomRow, RoomMemberRow } from '@/lib/types';

// 방 접근 판정. 화면마다 다시 짜지 않도록 여기 모은다.

export interface RoomAccess {
  room: RoomRow;
  member: RoomMemberRow;
  /** 열람 게이트 통과 여부. false면 남의 카드가 안 보인다 (PRODUCT 9~11) */
  unlocked: boolean;
  isOwner: boolean;
}

/**
 * 방 멤버가 아니면 404. 방이 있다는 사실 자체를 알려주지 않는다.
 *
 * 방과 멤버십은 서로 의존이 없으므로 같이 기다린다.
 * 페이지와 서버 액션이 같은 요청에서 각각 부르므로 cache()로 감싼다.
 */
export const requireRoomAccess = cache(
  async (roomId: number, userId: number): Promise<RoomAccess> => {
    const [room, member] = await Promise.all([
      queryOne<RoomRow>('SELECT * FROM room WHERE id = ?', [roomId]),
      queryOne<RoomMemberRow>(
        "SELECT * FROM room_member WHERE room_id = ? AND user_id = ? AND status = 'ACTIVE'",
        [roomId, userId],
      ),
    ]);

    if (!room || !member) notFound();

    return {
      room,
      member,
      unlocked: member.unlocked_at != null,
      isOwner: member.role === 'OWNER',
    };
  },
);

/** 카드 목록처럼 게이트 통과가 필요한 화면에서 쓴다 */
export async function requireUnlockedRoom(roomId: number, userId: number): Promise<RoomAccess> {
  const access = await requireRoomAccess(roomId, userId);
  if (!access.unlocked) redirect(`/rooms/${roomId}`);
  return access;
}

/**
 * 열람 게이트를 연다.
 * 등록 행위 자체가 게이트를 연다 — 친구의 승인을 기다리지 않는다 (PRODUCT 10).
 * 한 번 열리면 다시 잠기지 않는다 (PRODUCT 11).
 */
export async function unlockRoom(roomId: number, userId: number): Promise<void> {
  await execute(
    `UPDATE room_member SET unlocked_at = UTC_TIMESTAMP()
      WHERE room_id = ? AND user_id = ? AND unlocked_at IS NULL`,
    [roomId, userId],
  );
}
