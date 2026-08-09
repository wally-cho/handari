import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { execute, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { newToken, linkExpiry, isExpired, remainingText } from '@/lib/tokens';
import { baseUrl } from '@/lib/url';
import AppBar from '@/components/AppBar';
import ShareLink from '@/components/ShareLink';
import type { ProfileRow } from '@/lib/types';

// 등록 직후 화면. "친구에게 알리기"가 가장 크고 눈에 띄는 버튼이다 (PRODUCT 21).
// 링크는 1회성 + 24시간이고, 만료되면 여기서 재발급한다 (PRODUCT 24).

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profileId = Number(id);
  const user = await requireUser(`/profiles/${id}/share`);

  const profile = await queryOne<ProfileRow & { room_name: string }>(
    `SELECT p.*, r.name AS room_name
       FROM profile p JOIN room r ON r.id = p.room_id
      WHERE p.id = ? AND p.deleted_at IS NULL`,
    [profileId],
  );
  if (!profile) notFound();

  // 링크는 주선자만 볼 수 있다
  if (profile.author_user_id !== user.id) redirect(`/profiles/${profileId}`);
  if (profile.claimed_at) redirect(`/profiles/${profileId}`);

  async function reissue() {
    'use server';

    const me = await requireUser();
    const p = await queryOne<ProfileRow>(
      'SELECT * FROM profile WHERE id = ? AND author_user_id = ? AND deleted_at IS NULL',
      [profileId, me.id],
    );
    if (!p || p.claimed_at) redirect(`/profiles/${profileId}`);

    // 재발급하면 이전 링크는 즉시 무효가 된다
    await execute('UPDATE profile SET claim_token = ?, claim_token_expires_at = ? WHERE id = ?', [
      newToken(),
      linkExpiry(),
      profileId,
    ]);
    redirect(`/profiles/${profileId}/share`);
  }

  const alive = profile.claim_token && !isExpired(profile.claim_token_expires_at);
  const base = await baseUrl();
  const url = `${base}/claim/${profile.claim_token}`;

  const message =
    `${profile.display_name}아, 나 한다리라는 데다가 너 소개해놨어.\n` +
    `"${profile.room_name}" 방인데 아는 사람들끼리만 있는 곳이야.\n\n` +
    `이 링크로 들어오면 네가 직접 고치거나 내릴 수 있어. 24시간 안에 열어줘!\n${url}`;

  return (
    <>
      <AppBar title="친구에게 알리기" back={`/rooms/${profile.room_id}`} userId={user.id} />

      <main className="px-6 py-8">
        <h2 className="text-xl font-bold tracking-tight">등록했어요</h2>
        <p className="text-ink-2 mt-2 text-sm leading-relaxed">
          <strong className="font-medium">{profile.display_name}</strong>님 카드가 방에 올라갔어요.
          이제 본인에게 링크를 보내주세요. 링크로 들어오면 카드의 주인이 되어 직접 고치거나 내릴 수
          있어요.
        </p>

        <div className="mt-8">
          {alive ? (
            <>
              <p className="text-ink-3 mb-3 text-xs">
                한 번만 쓸 수 있어요 · {remainingText(profile.claim_token_expires_at)}
              </p>
              <ShareLink url={url} message={message} />
            </>
          ) : (
            <div className="bg-fill-2 rounded-2xl p-[18px] text-center">
              <p className="text-ink-2 text-sm">링크가 만료됐어요.</p>
              <form action={reissue} className="mt-3">
                <button type="submit" className="btn btn-primary">
                  새 링크 만들기
                </button>
              </form>
            </div>
          )}
        </div>

        <Link
          href={`/rooms/${profile.room_id}`}
          className="text-ink-3 mt-8 block text-center text-sm underline underline-offset-4"
        >
          나중에 할게요
        </Link>
      </main>
    </>
  );
}
