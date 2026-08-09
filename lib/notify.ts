import { execute } from '@/lib/db';
import type { NotificationType } from '@/lib/types';

// 알림은 앱 안 알림함으로만 온다. 실시간 푸시는 없고, 화면을 새로고침할 때 갱신된다 (PRODUCT 54).
// 모바일 웹이라 푸시를 쓸 수 없고, 카카오 알림톡은 비즈 앱 전환과 템플릿 심사가 필요하다.

export async function notify(
  userId: number,
  type: NotificationType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await execute('INSERT INTO notification (user_id, type, payload) VALUES (?, ?, ?)', [
    userId,
    type,
    JSON.stringify(payload),
  ]);
}

/**
 * 알림 문구. 알림함과 배지에서 같은 문구를 쓴다.
 * payload에 이름이 있으면 넣는다 — "누가"가 빠지면 열어봐야만 알 수 있다.
 */
export function notificationText(
  type: NotificationType,
  payload?: Record<string, unknown> | null,
): { title: string } {
  const who = typeof payload?.nickname === 'string' ? payload.nickname : null;

  switch (type) {
    case 'INVITE_ACCEPTED':
      return { title: who ? `${who}님이 초대를 받고 들어왔어요` : '초대한 친구가 들어왔어요' };
    case 'CARD_CLAIMED':
      return { title: who ? `${who}님이 카드를 가져갔어요` : '친구분이 카드를 가져갔어요' };
    case 'CARD_DROPPED':
      return { title: '친구분이 카드를 내렸어요' };
    case 'INTEREST_RECEIVED':
      return { title: who ? `${who}님이 관심을 표시했어요` : '관심이 왔어요' };
    case 'INTEREST_UNCLAIMED':
      return { title: '친구분이 아직 카드를 안 가져갔어요. 링크를 보내주세요' };
    case 'MATCHMAKER_COMMENT':
      return { title: '주선자가 한마디 남겼어요' };
    case 'INTEREST_ACCEPTED':
      return { title: '수락했어요' };
    case 'INTEREST_DECLINED':
      return { title: '지금은 어려울 것 같대요' };
    case 'INTEREST_EXPIRED':
      return { title: '응답이 없어 만료됐어요' };
    case 'CONNECTION_PENDING':
      return { title: '연결 준비 중이에요' };
    case 'CONNECTION_DONE':
      return { title: '연결됐어요! 카톡 확인해보세요' };
    case 'PAUSED_BY_MATCHMAKER':
      return { title: '주선자가 소개를 잠시 멈췄어요. 아니면 되돌려주세요' };
    case 'CLAIM_REMINDER':
      return { title: '친구분이 아직 카드를 안 가져갔어요' };
    default:
      return { title: '알림' };
  }
}
