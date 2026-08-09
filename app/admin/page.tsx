import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { execute, query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notify } from '@/lib/notify';
import AppBar from '@/components/AppBar';
import { isAdmin } from '@/lib/admin';

// 운영자 콘솔 (PRODUCT 44, 58).
//
// MVP에서 연결은 운영자가 수동으로 한다 - 양쪽 카톡으로 단톡방을 만들고
// 여기서 완료 처리한다.
//
// 찾는 단서는 카톡 아이디(`kakaotalk_id`)다. 로그인이 주는 `kakao_id`는 앱마다 다르게
// 발급되는 회원번호라 카카오톡 친구찾기에 넣을 수 없다 - 여기 띄우지 않는다.
// 카톡 아이디는 선택 입력이라 비어 있을 수 있고, 그때는 닉네임으로 찾는다.
// 운영자가 방 사람들을 이미 알기 때문에 성립하는 방식이고, 방이 늘면 깨진다.

export const dynamic = 'force-dynamic';

interface QueueRow {
  connection_id: number;
  interest_id: number;
  status: string;
  created_at: Date;
  from_nickname: string;
  from_talk_id: string | null;
  to_name: string;
  to_nickname: string | null;
  to_talk_id: string | null;
  room_name: string;
}

interface ReportRow {
  id: number;
  reason: string;
  detail: string | null;
  status: string;
  created_at: Date;
  profile_id: number;
  display_name: string;
  profile_status: string;
  reporter_nickname: string;
}

export default async function AdminPage() {
  const user = await requireUser('/admin');
  if (!isAdmin(user.id)) notFound();

  const [queue, reports] = await Promise.all([
    query<QueueRow>(
      `SELECT c.id AS connection_id, c.interest_id, c.status, c.created_at,
            fu.nickname AS from_nickname, fu.kakaotalk_id AS from_talk_id,
            p.display_name AS to_name,
            su.nickname AS to_nickname, su.kakaotalk_id AS to_talk_id,
            r.name AS room_name
       FROM connection c
       JOIN interest i ON i.id = c.interest_id
       JOIN \`user\` fu ON fu.id = i.from_user_id
       JOIN profile p ON p.id = i.to_profile_id
       JOIN room r ON r.id = p.room_id
       LEFT JOIN \`user\` su ON su.id = p.subject_user_id
      ORDER BY FIELD(c.status,'PENDING') DESC, c.created_at DESC
      LIMIT 50`,
    ),
    query<ReportRow>(
      `SELECT rp.id, rp.reason, rp.detail, rp.status, rp.created_at,
            rp.profile_id, p.display_name, p.status AS profile_status,
            u.nickname AS reporter_nickname
       FROM report rp
       JOIN profile p ON p.id = rp.profile_id
       JOIN \`user\` u ON u.id = rp.reporter_user_id
      ORDER BY FIELD(rp.status,'OPEN') DESC, rp.created_at DESC
      LIMIT 50`,
    ),
  ]);

  async function completeConnection(formData: FormData) {
    'use server';

    const me = await requireUser();
    if (!isAdmin(me.id)) notFound();

    const connectionId = Number(formData.get('connection_id'));
    const note = String(formData.get('note') ?? '').trim() || null;

    const rows = await query<{
      from_user_id: number;
      subject_user_id: number | null;
    }>(
      `SELECT i.from_user_id, p.subject_user_id
         FROM connection c JOIN interest i ON i.id = c.interest_id
         JOIN profile p ON p.id = i.to_profile_id
        WHERE c.id = ?`,
      [connectionId],
    );
    const row = rows[0];
    if (!row) redirect('/admin');

    await execute(
      "UPDATE connection SET status='DONE', connected_at=UTC_TIMESTAMP(), operator_note=? WHERE id = ?",
      [note, connectionId],
    );
    await execute(
      "UPDATE interest SET status='CONNECTED' WHERE id = (SELECT interest_id FROM connection WHERE id = ?)",
      [connectionId],
    );

    await notify(row.from_user_id, 'CONNECTION_DONE', { connectionId });
    if (row.subject_user_id) await notify(row.subject_user_id, 'CONNECTION_DONE', { connectionId });

    redirect('/admin');
  }

  async function resolveReport(formData: FormData) {
    'use server';

    const me = await requireUser();
    if (!isAdmin(me.id)) notFound();

    const reportId = Number(formData.get('report_id'));
    const action = String(formData.get('action'));
    const profileId = Number(formData.get('profile_id'));

    if (action === 'delete') {
      await execute(
        "UPDATE profile SET status='DELETED', deleted_at=UTC_TIMESTAMP(), photo_key=NULL WHERE id = ?",
        [profileId],
      );
    } else if (action === 'restore') {
      await execute("UPDATE profile SET status='ACTIVE', hidden_at=NULL WHERE id = ?", [profileId]);
    }

    await execute("UPDATE report SET status='RESOLVED' WHERE id = ?", [reportId]);
    redirect('/admin');
  }

  return (
    <>
      <AppBar title="운영자" back="/" userId={user.id} />

      <main className="px-5 py-6">
        <h2 className="text-ink-3 text-sm font-medium">
          연결 대기열 ({queue.filter((q) => q.status === 'PENDING').length})
        </h2>
        <p className="text-ink-3 mt-1 text-xs leading-relaxed">
          카톡 아이디로 두 사람을 찾아 단톡방을 만들어주고 완료 처리하세요. 아이디는 선택 입력이라
          비어 있을 수 있어요. 그때는 닉네임으로 찾으세요.
        </p>

        {queue.length === 0 ? (
          <p className="text-ink-3 mt-3 text-sm">없어요.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {queue.map((c) => (
              <li key={c.connection_id} className="ring-haze rounded-2xl p-4 ring-1">
                <p className="text-ink-3 text-xs">{c.room_name}</p>
                <p className="mt-1 text-sm">
                  <strong className="font-medium">{c.from_nickname}</strong>
                  <span className="text-ink-3"> ↔ </span>
                  <strong className="font-medium">{c.to_nickname ?? c.to_name}</strong>
                </p>
                <p className="text-ink-3 mt-1 font-mono text-[11px]">
                  {c.from_talk_id ?? '아이디 없음'} / {c.to_talk_id ?? '아이디 없음'}
                </p>

                {c.status === 'PENDING' ? (
                  <form action={completeConnection} className="mt-3 flex gap-2">
                    <input type="hidden" name="connection_id" value={c.connection_id} />
                    <input
                      name="note"
                      placeholder="메모 (선택)"
                      className="field min-w-0 flex-1 !py-2.5 !text-[14px]"
                    />
                    <button className="btn btn-primary btn-sm shrink-0">완료</button>
                  </form>
                ) : (
                  <p className="text-good mt-2 text-xs">연결 완료</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <h2 className="text-ink-3 mt-10 text-sm font-medium">
          신고 ({reports.filter((r) => r.status === 'OPEN').length})
        </h2>
        {reports.length === 0 ? (
          <p className="text-ink-3 mt-3 text-sm">없어요.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="ring-haze rounded-2xl p-4 ring-1">
                <p className="text-sm">
                  <Link href={`/profiles/${r.profile_id}`} className="font-medium underline">
                    {r.display_name}
                  </Link>{' '}
                  <span className="text-ink-3">- {r.reason}</span>
                </p>
                <p className="text-ink-3 mt-1 text-xs">
                  신고: {r.reporter_nickname} · 카드 상태: {r.profile_status}
                </p>
                {r.detail && <p className="text-ink-2 mt-2 text-sm">{r.detail}</p>}

                {r.status === 'OPEN' && (
                  <form action={resolveReport} className="mt-3 flex gap-2">
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="profile_id" value={r.profile_id} />
                    <button
                      name="action"
                      value="delete"
                      className="btn btn-sm bg-alert flex-1 text-white"
                    >
                      카드 삭제
                    </button>
                    <button name="action" value="restore" className="btn btn-ghost btn-sm flex-1">
                      복구
                    </button>
                    <button name="action" value="keep" className="btn btn-ghost btn-sm flex-1">
                      유지
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
