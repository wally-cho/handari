import { randomBytes } from 'node:crypto';

// 초대 링크와 카드 가져가기 링크는 둘 다 1회성 + 24시간이다 (PRODUCT 7, 24).
//
// 1회성인 이유: 링크가 재사용되면 단톡방에 뿌려지고, 그러면 누가 누구를 데려왔는지
// 알 수 없어져서 폐쇄성과 다리 수가 동시에 무너진다.

export const LINK_TTL_HOURS = 24;

/** 관심 요청 만료 (PRODUCT 39) */
export const INTEREST_TTL_DAYS = 7;

export function newToken(): string {
  return randomBytes(24).toString('base64url'); // 32자
}

/** 지금부터 n시간 뒤 (UTC) */
export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3600_000);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86400_000);
}

export function linkExpiry(): Date {
  return hoursFromNow(LINK_TTL_HOURS);
}

/** 만료 판정은 항상 조회 시점에 한다. 배치가 늦게 돌아도 만료된 링크가 살아 있으면 안 된다 */
export function isExpired(at: Date | null): boolean {
  return at == null || at.getTime() <= Date.now();
}

/** "3시간 남음" 같은 표시용 */
export function remainingText(expiresAt: Date | null): string {
  if (!expiresAt) return '만료됨';
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return '만료됨';
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours}시간 남음`;
  return `${Math.max(1, Math.floor(ms / 60_000))}분 남음`;
}
