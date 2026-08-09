import { query } from '@/lib/db';

// 다리 수 계산 (PRODUCT 27~33).
//
// 방 안의 관계 엣지는 두 종류다. 둘 다 무방향으로 본다.
//   1. 초대 엣지 - room_member.invited_by_user_id ↔ user_id
//   2. 등록 엣지 - profile.author_user_id ↔ profile.subject_user_id (가져간 카드만)
//
// SQL 재귀 CTE를 쓰지 않는다. 방 하나의 엣지를 전부 읽어 메모리에서 BFS를 돌린다.
// 방이 수백 명이면 엣지도 수백 개라 쿼리 한 번 + O(V+E) 순회로 끝나고,
// 재귀 CTE보다 훨씬 단순하고 디버깅이 쉽다. 수만 명이 되면 그때 다시 본다.

export const UNREACHABLE = Number.POSITIVE_INFINITY;

export type Distances = Map<number, number>;

interface Edge {
  a: number;
  b: number;
}

/** 방의 관계 그래프를 인접 리스트로 만든다 */
async function loadEdges(roomId: number): Promise<Edge[]> {
  const [inviteEdges, registerEdges] = await Promise.all([
    query<Edge>(
      `SELECT invited_by_user_id AS a, user_id AS b
         FROM room_member
        WHERE room_id = ? AND status = 'ACTIVE' AND invited_by_user_id IS NOT NULL`,
      [roomId],
    ),
    query<Edge>(
      `SELECT author_user_id AS a, subject_user_id AS b
         FROM profile
        WHERE room_id = ?
          AND subject_user_id IS NOT NULL
          AND author_user_id <> subject_user_id
          AND deleted_at IS NULL
          AND status IN ('ACTIVE','PAUSED')`,
      [roomId],
    ),
  ]);

  return [...inviteEdges, ...registerEdges];
}

/**
 * 나로부터 방 안 모든 사람까지의 최단 거리.
 * 반환값에 없는 user는 연결이 끊긴 것이다 (UNREACHABLE로 취급).
 */
export async function distancesFrom(roomId: number, meUserId: number): Promise<Distances> {
  const edges = await loadEdges(roomId);

  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const { a, b } of edges) {
    link(a, b);
    link(b, a);
  }

  const dist: Distances = new Map([[meUserId, 0]]);
  let frontier = [meUserId];
  let depth = 0;

  while (frontier.length > 0) {
    depth += 1;
    const next: number[] = [];
    for (const node of frontier) {
      for (const neighbor of adj.get(node) ?? []) {
        if (!dist.has(neighbor)) {
          dist.set(neighbor, depth);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  return dist;
}

/**
 * 카드까지의 다리 수.
 *
 * 아직 아무도 가져가지 않은 카드는 대응하는 user 노드가 없다.
 * 이때는 주선자를 경유해서 센다 - 주선자까지의 거리 + 1.
 * 내가 등록한 미확인 카드는 dist(me,me)+1 = 1다리가 되어 의도대로 나온다.
 */
export function degreeToProfile(
  dist: Distances,
  profile: { subject_user_id: number | null; author_user_id: number },
): number {
  if (profile.subject_user_id != null) {
    return dist.get(profile.subject_user_id) ?? UNREACHABLE;
  }
  const authorDist = dist.get(profile.author_user_id);
  return authorDist == null ? UNREACHABLE : authorDist + 1;
}

/** "2다리" / "직접 아는 사이" */
export function degreeLabel(degree: number): string {
  if (!Number.isFinite(degree)) return '먼 사이';
  if (degree <= 0) return '나';
  if (degree === 1) return '1다리';
  return `${degree}다리`;
}
