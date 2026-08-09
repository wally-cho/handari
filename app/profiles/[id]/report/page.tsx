import { notFound, redirect } from 'next/navigation';
import { execute, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import AppBar from '@/components/AppBar';
import type { ProfileRow, ReportReason } from '@/lib/types';

// 신고 (PRODUCT 58~59).
//
// "원하지 않는 등록"과 "본인이 아님"은 접수 즉시 카드를 가린다.
// 승인 게이트가 없는 MVP에서 이게 사후 방어의 전부라 사람을 기다리면 안 된다.

const AUTO_HIDE: ReportReason[] = ['UNWANTED', 'NOT_SELF'];

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  {
    value: 'UNWANTED',
    label: '원하지 않는 등록',
    hint: '본인 동의 없이 올라갔어요',
  },
  { value: 'NOT_SELF', label: '본인이 아님', hint: '다른 사람 정보예요' },
  { value: 'FALSE_INFO', label: '사실과 다름', hint: '내용이 틀렸어요' },
  { value: 'OFFENSIVE', label: '불쾌함', hint: '보기 불편한 내용이 있어요' },
  { value: 'ETC', label: '기타', hint: '' },
];

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profileId = Number(id);
  const user = await requireUser(`/profiles/${id}/report`);

  const profile = await queryOne<ProfileRow>(
    'SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL',
    [profileId],
  );
  if (!profile) notFound();
  await requireRoomAccess(profile.room_id, user.id);

  async function submit(formData: FormData) {
    'use server';

    const me = await requireUser();
    const reason = String(formData.get('reason') ?? '') as ReportReason;
    const detail = String(formData.get('detail') ?? '').trim() || null;

    if (!REASONS.some((r) => r.value === reason)) redirect(`/profiles/${profileId}/report`);

    await execute(
      'INSERT INTO report (profile_id, reporter_user_id, reason, detail) VALUES (?, ?, ?, ?)',
      [profileId, me.id, reason, detail],
    );

    // 운영자가 볼 때까지 기다리지 않는다
    if (AUTO_HIDE.includes(reason)) {
      await execute(
        "UPDATE profile SET status='HIDDEN', hidden_at=UTC_TIMESTAMP() WHERE id = ? AND status IN ('ACTIVE','PAUSED')",
        [profileId],
      );
      await execute(
        "UPDATE interest SET status='EXPIRED' WHERE to_profile_id = ? AND status='PENDING'",
        [profileId],
      );
    }

    redirect('/report/done');
  }

  return (
    <>
      <AppBar title="신고하기" back={`/profiles/${profileId}`} userId={user.id} />

      <main className="px-6 py-6">
        <p className="text-ink-2 text-sm leading-relaxed">
          <strong className="font-medium">{profile.display_name}</strong> 카드를 신고해요. 운영자가
          확인합니다.
        </p>

        <form action={submit} className="mt-6 space-y-6">
          <fieldset className="space-y-2">
            <legend className="sr-only">신고 사유</legend>
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="bg-fill-2 has-checked:bg-brand-soft flex cursor-pointer items-start gap-3 rounded-2xl p-4"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  required
                  className="accent-brand mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{r.label}</span>
                  {r.hint && <span className="text-ink-3 mt-0.5 block text-xs">{r.hint}</span>}
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="detail" className="block text-sm font-medium">
              자세히 <span className="text-ink-3">(선택)</span>
            </label>
            <textarea id="detail" name="detail" rows={3} className="field resize-none" />
          </div>

          <p className="bg-warn-soft text-warn rounded-xl p-4 text-xs leading-relaxed">
            &lsquo;원하지 않는 등록&rsquo;과 &lsquo;본인이 아님&rsquo;은 접수하는 즉시 카드가 보이지
            않게 돼요. 운영자 확인을 기다리지 않아요.
          </p>

          <button type="submit" className="btn btn-primary">
            신고하기
          </button>
        </form>
      </main>
    </>
  );
}
