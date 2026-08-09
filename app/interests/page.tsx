import Link from 'next/link';
import { redirect } from 'next/navigation';
import { execute, query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notify } from '@/lib/notify';
import AppBar from '@/components/AppBar';
import { Button } from '@/components/ui';
import type { InterestRow } from '@/lib/types';

// 관심 요청 (PRODUCT 34~42).
//
// 결정 권한은 후보자 본인에게 있다. 주선자는 한마디를 얹을 수 있지만
// 아무것도 안 해도 흐름이 멈추지 않는다.

interface ReceivedRow extends InterestRow {
  profile_name: string;
  from_nickname: string;
  from_profile_id: number | null;
  is_subject: 0 | 1;
  matchmaker_nickname: string;
}

interface SentRow extends InterestRow {
  profile_name: string;
  profile_room_id: number;
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: '기다리는 중',
  ACCEPTED: '수락했어요',
  DECLINED: '지금은 어려울 것 같대요',
  EXPIRED: '응답이 없어 만료됐어요',
  CANCELED: '거뒀어요',
  CONNECTED: '연결됐어요',
};

export default async function InterestsPage() {
  const user = await requireUser('/interests');

  // 받은 것과 보낸 것은 서로 의존이 없으므로 같이 기다린다
  const [received, sent] = await Promise.all([
    query<ReceivedRow>(
      `SELECT i.*, p.display_name AS profile_name, u.nickname AS from_nickname,
            (p.subject_user_id = ?) AS is_subject,
            au.nickname AS matchmaker_nickname,
            (SELECT fp.id FROM profile fp
              WHERE fp.room_id = i.room_id AND fp.subject_user_id = i.from_user_id
                AND fp.deleted_at IS NULL LIMIT 1) AS from_profile_id
       FROM interest i
       JOIN profile p ON p.id = i.to_profile_id
       JOIN \`user\` u ON u.id = i.from_user_id
       JOIN \`user\` au ON au.id = p.author_user_id
      WHERE (p.subject_user_id = ? OR p.author_user_id = ?)
        AND p.deleted_at IS NULL
        AND i.status <> 'CANCELED'
      ORDER BY FIELD(i.status,'PENDING') DESC, i.created_at DESC
      LIMIT 50`,
      [user.id, user.id, user.id],
    ),
    query<SentRow>(
      `SELECT i.*, p.display_name AS profile_name, p.room_id AS profile_room_id
       FROM interest i
       JOIN profile p ON p.id = i.to_profile_id
      WHERE i.from_user_id = ?
      ORDER BY i.created_at DESC
      LIMIT 50`,
      [user.id],
    ),
  ]);

  async function respond(formData: FormData) {
    'use server';

    const me = await requireUser();
    const interestId = Number(formData.get('interest_id'));
    const accept = formData.get('accept') === '1';

    const row = await queryOne<{
      from_user_id: number;
      subject: number | null;
    }>(
      `SELECT i.from_user_id, p.subject_user_id AS subject
         FROM interest i JOIN profile p ON p.id = i.to_profile_id
        WHERE i.id = ? AND i.status = 'PENDING'`,
      [interestId],
    );
    // 결정은 본인만 한다 (PRODUCT 38)
    if (!row || row.subject !== me.id) redirect('/interests');

    await execute('UPDATE interest SET status = ?, responded_at = UTC_TIMESTAMP() WHERE id = ?', [
      accept ? 'ACCEPTED' : 'DECLINED',
      interestId,
    ]);

    if (accept) {
      // 운영자 중개 대기열로 (PRODUCT 43~44)
      await execute('INSERT IGNORE INTO connection (interest_id) VALUES (?)', [interestId]);
      await notify(row.from_user_id, 'INTEREST_ACCEPTED', { interestId });
      await notify(row.from_user_id, 'CONNECTION_PENDING', { interestId });
      await notify(me.id, 'CONNECTION_PENDING', { interestId });
    } else {
      // 사유는 전달하지 않는다. 지인 관계가 걸려 있다 (PRODUCT 38)
      await notify(row.from_user_id, 'INTEREST_DECLINED', { interestId });
    }

    redirect('/interests');
  }

  /** 보낸 사람이 관심을 거둔다. 상대가 답하기 전까지만 */
  async function cancel(formData: FormData) {
    'use server';

    const me = await requireUser();
    const interestId = Number(formData.get('interest_id'));

    const it = await queryOne<{ author: number; subject: number | null; profile: number }>(
      `SELECT p.author_user_id AS author, p.subject_user_id AS subject, p.id AS profile
         FROM interest i JOIN profile p ON p.id = i.to_profile_id
        WHERE i.id = ? AND i.from_user_id = ? AND i.status = 'PENDING'`,
      [interestId, me.id],
    );
    if (!it) redirect('/interests');

    await execute(
      "UPDATE interest SET status='CANCELED', responded_at=UTC_TIMESTAMP() WHERE id = ? AND status='PENDING'",
      [interestId],
    );

    // 거뒀다는 알림은 보내지 않는다 (카드 상세와 같은 이유)

    redirect('/interests');
  }

  async function comment(formData: FormData) {
    'use server';

    const me = await requireUser();
    const interestId = Number(formData.get('interest_id'));
    const text = String(formData.get('comment') ?? '').trim();
    if (!text) redirect('/interests');

    const row = await queryOne<{ author: number; subject: number | null }>(
      `SELECT p.author_user_id AS author, p.subject_user_id AS subject
         FROM interest i JOIN profile p ON p.id = i.to_profile_id
        WHERE i.id = ? AND i.status = 'PENDING'`,
      [interestId],
    );
    // 한마디는 주선자만 (PRODUCT 37)
    if (!row || row.author !== me.id) redirect('/interests');

    await execute('UPDATE interest SET matchmaker_comment = ? WHERE id = ?', [text, interestId]);
    if (row.subject) await notify(row.subject, 'MATCHMAKER_COMMENT', { interestId });

    redirect('/interests');
  }

  return (
    <>
      <AppBar title="관심" back="/" userId={user.id} />

      <main className="px-6 py-6">
        <h2 className="text-ink-3 text-sm font-medium">받은 관심</h2>
        {received.length === 0 ? (
          <p className="text-ink-3 mt-3 text-sm">아직 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {received.map((it) => (
              <li key={it.id} className="ring-haze rounded-2xl p-4 ring-1">
                <p className="text-sm">
                  <strong className="font-medium">{it.from_nickname}</strong>
                  님이{' '}
                  <Link href={`/profiles/${it.to_profile_id}`} className="underline">
                    {it.profile_name}
                  </Link>{' '}
                  카드에 관심을 표시했어요
                </p>

                {it.from_profile_id && (
                  <Link
                    href={`/profiles/${it.from_profile_id}`}
                    className="text-ink-2 mt-2 inline-block text-sm underline underline-offset-4"
                  >
                    {it.from_nickname}님 카드 보기
                  </Link>
                )}

                {it.matchmaker_comment && (
                  <p className="bg-fill-2 mt-3 rounded-xl p-3 text-sm leading-relaxed">
                    <span className="text-ink-3 text-xs">{it.matchmaker_nickname}님 한마디</span>
                    <br />
                    {it.matchmaker_comment}
                  </p>
                )}

                {it.status !== 'PENDING' ? (
                  <p className="text-ink-3 mt-3 text-xs">{STATUS_TEXT[it.status]}</p>
                ) : it.is_subject ? (
                  <form action={respond} className="mt-4 grid grid-cols-2 gap-2">
                    <input type="hidden" name="interest_id" value={it.id} />
                    <button name="accept" value="1" className="btn btn-primary btn-sm !w-full">
                      수락
                    </button>
                    <button name="accept" value="0" className="btn btn-ghost btn-sm !w-full">
                      거절
                    </button>
                  </form>
                ) : (
                  // 주선자 화면
                  <div className="mt-3">
                    {it.matchmaker_comment ? null : (
                      <form action={comment} className="flex gap-2">
                        <input type="hidden" name="interest_id" value={it.id} />
                        <input
                          name="comment"
                          maxLength={200}
                          placeholder="이 친구 괜찮아, 만나봐"
                          className="field min-w-0 flex-1 !py-2.5 !text-[14px]"
                        />
                        <button className="btn btn-primary btn-sm shrink-0">보내기</button>
                      </form>
                    )}
                    <p className="text-ink-3 mt-2 text-xs">
                      결정은 본인이 해요. 한마디만 얹을 수 있어요.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <h2 className="text-ink-3 mt-10 text-sm font-medium">보낸 관심</h2>
        {sent.length === 0 ? (
          <p className="text-ink-3 mt-3 text-sm">아직 없어요.</p>
        ) : (
          <ul className="divide-haze mt-3 divide-y">
            {sent.map((it) => (
              <li key={it.id} className="flex items-center gap-2 py-3.5">
                <Link
                  href={`/profiles/${it.to_profile_id}`}
                  className="min-w-0 flex-1 truncate text-[15px] font-semibold"
                >
                  {it.profile_name}
                </Link>
                {it.status === 'PENDING' ? (
                  <form action={cancel}>
                    <input type="hidden" name="interest_id" value={it.id} />
                    <Button type="submit" tone="ghost" small>
                      취소
                    </Button>
                  </form>
                ) : (
                  <span className="text-ink-3 shrink-0 text-[13px]">{STATUS_TEXT[it.status]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
