// 운영자 판정.
//
// 오픈 전까지 방은 운영자만 만든다. 방이 무분별하게 늘면 초기에 관찰할 대상이 흩어지고,
// 각 방이 임계 인원을 못 채워서 전부 빈 방이 된다.
// 오픈 시점에 이 제한을 풀려면 canCreateRoom을 항상 true로 바꾸면 된다.
//
// ADMIN_USER_IDS 환경변수가 없으면 1번(첫 가입자 = 만든 사람)만 운영자다.

export function isAdmin(userId: number): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? '1')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Number.isInteger);
  return ids.includes(userId);
}

/** 방 생성 권한. 오픈 후에는 이 함수만 고치면 된다 */
export function canCreateRoom(userId: number): boolean {
  return isAdmin(userId);
}
