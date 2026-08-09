import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { queryOne } from '@/lib/db';
import type { UserRow } from '@/lib/types';

// 현재 로그인한 사용자를 가져오는 유일한 경로다.
//
// 세션(JWT)에는 uid만 담고 나머지는 매번 DB에서 읽는다.
// JWT는 로그인 시점에 굳어서, 온보딩을 마쳐도 토큰의 값은 그대로 남는다.
// 출처를 DB 하나로 두면 그런 어긋남이 생기지 않는다.
//
// 한 요청 안에서 페이지와 AppBar와 서버 액션이 각각 부르므로 cache()로 감싼다.
// 같은 요청에서 몇 번을 불러도 쿼리는 한 번만 나간다.

export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const session = await auth();
  if (!session?.user?.uid) return null;

  return queryOne<UserRow>('SELECT * FROM `user` WHERE id = ? AND deleted_at IS NULL', [
    session.user.uid,
  ]);
});

/** 로그인 + 온보딩까지 마친 사용자를 요구한다. 아니면 해당 화면으로 보낸다 */
export async function requireUser(nextPath?: string): Promise<UserRow> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login');
  }
  if (!isOnboarded(user)) {
    redirect('/onboarding');
  }

  return user;
}

/** 출생연도·성별 입력을 마쳤는지 (PRODUCT 3) */
export function isOnboarded(user: UserRow): boolean {
  return user.birth_year != null && user.gender != null;
}
