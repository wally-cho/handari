import Link from 'next/link';
import { redirect } from 'next/navigation';
import { execute, queryOne, transaction } from '@/lib/db';
import { getCurrentUser, isOnboarded } from '@/lib/session';
import { isExpired } from '@/lib/tokens';
import { deletePhoto, photoUrl } from '@/lib/photos';
import { notify } from '@/lib/notify';
import type { ProfileRow } from '@/lib/types';

// 카드 가져가기 (PRODUCT 22~24).
//
// 승인 게이트를 뺀 자리를 메우는 화면이다.
// 등록당한 사람이 자기 카드의 주인이 되어 직접 고치고 지울 수 있어야 한다.
//
// "내리기"는 로그인 없이도 된다. 원치 않게 등록된 사람에게 가입을 요구하고 나서야
// 지워주는 건 앞뒤가 바뀐 것이다.

interface ClaimView extends ProfileRow {
  room_name: string;
  author_nickname: string;
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const profile = await queryOne<ClaimView>(
    `SELECT p.*, r.name AS room_name, u.nickname AS author_nickname
       FROM profile p
       JOIN room r ON r.id = p.room_id
       JOIN \`user\` u ON u.id = p.author_user_id
      WHERE p.claim_token = ? AND p.deleted_at IS NULL`,
    [token],
  );

  const dead = !profile || profile.claimed_at != null || isExpired(profile.claim_token_expires_at);

  if (dead) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-8">
        <h1 className="text-2xl font-bold tracking-tight">만료된 링크예요</h1>
        <p className="text-ink-2 mt-3 text-sm leading-relaxed">
          이 링크는 한 번만 쓸 수 있고 24시간 뒤에 만료돼요. 보내주신 분께 새 링크를 요청해 주세요.
        </p>
      </main>
    );
  }

  async function claim() {
    'use server';

    const me = await getCurrentUser();
    if (!me) redirect(`/login?next=${encodeURIComponent(`/claim/${token}`)}`);
    if (!isOnboarded(me)) redirect(`/onboarding?next=${encodeURIComponent(`/claim/${token}`)}`);

    const roomId = profile!.room_id;
    const authorId = profile!.author_user_id;

    await transaction(async (tx) => {
      // 두 명이 동시에 열었을 때를 막는다. 영향 행 수가 1일 때만 진행한다
      const taken = await tx.execute(
        `UPDATE profile
            SET subject_user_id = ?, claimed_at = UTC_TIMESTAMP(),
                claim_token = NULL, claim_token_expires_at = NULL
          WHERE claim_token = ? AND subject_user_id IS NULL
            AND claim_token_expires_at > UTC_TIMESTAMP()`,
        [me.id, token],
      );
      if (taken.affectedRows !== 1) throw new Error('TAKEN');

      // 방 멤버가 되고, 등록해준 사람이 초대 엣지가 된다.
      // 등록당한 쪽도 게이트를 통과한 상태로 시작한다 — 이미 카드가 하나 있으므로
      const member = await tx.queryOne<{ id: number }>(
        'SELECT id FROM room_member WHERE room_id = ? AND user_id = ?',
        [roomId, me.id],
      );
      if (member) {
        await tx.execute(
          "UPDATE room_member SET status='ACTIVE', unlocked_at = COALESCE(unlocked_at, UTC_TIMESTAMP()) WHERE id = ?",
          [member.id],
        );
      } else {
        await tx.execute(
          `INSERT INTO room_member (room_id, user_id, invited_by_user_id, role, unlocked_at)
           VALUES (?, ?, ?, 'MEMBER', UTC_TIMESTAMP())`,
          [roomId, me.id, authorId],
        );
      }
    });

    await notify(authorId, 'CARD_CLAIMED', { profileId: profile!.id });
    redirect(`/profiles/${profile!.id}?claimed=1`);
  }

  async function drop() {
    'use server';

    // 로그인 없이 지울 수 있다. 링크를 가진 사람이 곧 본인이라고 본다
    const target = await queryOne<ProfileRow>(
      'SELECT * FROM profile WHERE claim_token = ? AND deleted_at IS NULL',
      [token],
    );
    if (!target) redirect(`/claim/${token}`);

    await deletePhoto(target.photo_key);
    await execute(
      `UPDATE profile
          SET status='DELETED', deleted_at = UTC_TIMESTAMP(),
              claim_token = NULL, claim_token_expires_at = NULL, photo_key = NULL
        WHERE id = ?`,
      [target.id],
    );
    await execute(
      "UPDATE interest SET status='EXPIRED' WHERE to_profile_id = ? AND status='PENDING'",
      [target.id],
    );

    // 사유는 전달하지 않는다. 지인 관계가 걸려 있다 (PRODUCT 23)
    await notify(target.author_user_id, 'CARD_DROPPED', {
      displayName: target.display_name,
    });
    redirect('/claim/dropped');
  }

  const photo = photoUrl(profile.photo_key);
  const age = new Date().getFullYear() - profile.birth_year + 1;

  return (
    <main className="px-6 py-10">
      <p className="text-ink-3 text-sm">{profile.author_nickname}님이 등록했어요</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{profile.display_name}님이신가요?</h1>
      <p className="text-ink-2 mt-3 text-sm leading-relaxed">
        <strong className="font-medium">{profile.room_name}</strong> 방에 아래 내용으로 올라가
        있어요. 가져가면 직접 고치거나 내릴 수 있어요.
      </p>

      <section className="ring-haze mt-6 overflow-hidden rounded-2xl ring-1">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-48 w-full object-cover" />
        )}
        <dl className="divide-haze divide-y text-sm">
          {[
            ['이름', profile.display_name],
            ['나이', `${age}세 (${profile.birth_year}년생)`],
            ['성별', profile.gender === 'MALE' ? '남성' : '여성'],
            ['지역', profile.region],
            ['하는 일', profile.job ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-3">
              <dt className="text-ink-3 w-16 shrink-0">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {profile.recommendation && (
          <div className="border-haze bg-fill-2 border-t px-4 py-4">
            <p className="text-ink-3 text-xs">{profile.author_nickname}님이 쓴 소개</p>
            <p className="mt-1.5 text-sm leading-relaxed">{profile.recommendation}</p>
          </div>
        )}
      </section>

      <form action={claim} className="mt-6">
        <button type="submit" className="btn btn-kakao">
          맞아요, 내 카드로 가져갈래요
        </button>
      </form>

      <form action={drop} className="mt-3">
        <button type="submit" className="btn btn-ghost">
          이거 내리고 싶어요
        </button>
      </form>

      <p className="text-ink-3 mt-4 text-center text-xs leading-relaxed">
        내리면 사진까지 완전히 지워지고,
        <br />
        등록한 분께는 사유 없이 알림만 가요.
      </p>

      <Link
        href="/"
        className="text-ink-3 mt-6 block text-center text-xs underline underline-offset-4"
      >
        한다리가 뭔가요?
      </Link>
    </main>
  );
}
