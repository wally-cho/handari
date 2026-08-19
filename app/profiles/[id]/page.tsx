import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { execute, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import { distancesFrom, degreeToProfile, degreeLabel } from '@/lib/graph';
import { photoUrl } from '@/lib/photos';
import { deleteAllPhotos, photoKeysOf } from '@/lib/profilePhotos';
import { notify } from '@/lib/notify';
import { daysFromNow, INTEREST_TTL_DAYS } from '@/lib/tokens';
import AppBar from '@/components/AppBar';
import { drinkText, religionText, smokingText } from '@/lib/profileFields';
import { ageOf } from '@/lib/age';
import {
  ActionList,
  ActionRow,
  Badge,
  Box,
  Button,
  Caption,
  Notice,
  PhotoCarousel,
} from '@/components/ui';
import type { ProfileRow, InterestRow } from '@/lib/types';

// 카드 상세. 관심 표시, 소개 멈춤/재개, 신고, 삭제가 여기 모인다.

interface DetailView extends ProfileRow {
  author_nickname: string;
  room_name: string;
}

export default async function ProfileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    claimed?: string;
    sent?: string;
    canceled?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const profileId = Number(id);
  const user = await requireUser(`/profiles/${id}`);
  const { claimed, sent, canceled, error } = await searchParams;

  const profile = await queryOne<DetailView>(
    `SELECT p.*, u.nickname AS author_nickname, r.name AS room_name
       FROM profile p
       JOIN \`user\` u ON u.id = p.author_user_id
       JOIN room r ON r.id = p.room_id
      WHERE p.id = ? AND p.deleted_at IS NULL`,
    [profileId],
  );
  if (!profile) notFound();

  await requireRoomAccess(profile.room_id, user.id);

  const isMine = profile.subject_user_id === user.id;
  const isAuthor = profile.author_user_id === user.id;
  const isSelfRegistered = profile.subject_user_id === profile.author_user_id;
  const canEdit = isMine || (isAuthor && profile.claimed_at == null);

  // 신고로 가려진 카드는 당사자와 주선자만 본다
  if (profile.status === 'HIDDEN' && !isMine && !isAuthor) notFound();

  // 다리 수 계산과 진행 중 요청 조회는 서로 의존이 없다.
  // 진행 중인 요청이 있으면 관심 버튼이 잠긴다 (PRODUCT 40)
  const [dist, pending] = await Promise.all([
    distancesFrom(profile.room_id, user.id),
    queryOne<InterestRow>(
      "SELECT * FROM interest WHERE from_user_id = ? AND to_profile_id = ? AND status = 'PENDING'",
      [user.id, profileId],
    ),
  ]);
  const degree = degreeToProfile(dist, profile);

  async function sendInterest() {
    'use server';

    const me = await requireUser();
    const p = await queryOne<ProfileRow>(
      "SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL AND status = 'ACTIVE'",
      [profileId],
    );
    if (!p) redirect(`/profiles/${profileId}?error=gone`);
    if (p.subject_user_id === me.id) redirect(`/profiles/${profileId}?error=self`);

    const dup = await queryOne<{ id: number }>(
      "SELECT id FROM interest WHERE from_user_id = ? AND to_profile_id = ? AND status = 'PENDING'",
      [me.id, profileId],
    );
    if (dup) redirect(`/profiles/${profileId}`);

    const res = await execute(
      'INSERT INTO interest (room_id, from_user_id, to_profile_id, expires_at) VALUES (?, ?, ?, ?)',
      [p.room_id, me.id, profileId, daysFromNow(INTEREST_TTL_DAYS)],
    );

    // 주선자와 본인 양쪽에 동시에 간다 (PRODUCT 34).
    // 주선자가 안 봐도 흐름이 멈추지 않게 하려는 것이다
    const payload = {
      interestId: res.insertId,
      profileId,
      fromUserId: me.id,
      nickname: me.nickname,
    };
    await notify(p.author_user_id, 'INTEREST_RECEIVED', payload);

    if (p.subject_user_id) {
      await notify(p.subject_user_id, 'INTEREST_RECEIVED', payload);
    } else {
      // 아직 카드를 안 가져갔으면 본인에게 보낼 곳이 없다 (PRODUCT 35)
      await notify(p.author_user_id, 'INTEREST_UNCLAIMED', { profileId });
    }

    redirect(`/profiles/${profileId}?sent=1`);
  }

  /** 보낸 사람이 관심을 거둔다. 상대가 답하기 전까지만 */
  async function cancelInterest() {
    'use server';

    const me = await requireUser();
    const it = await queryOne<{ id: number; author: number; subject: number | null }>(
      `SELECT i.id, p.author_user_id AS author, p.subject_user_id AS subject
         FROM interest i JOIN profile p ON p.id = i.to_profile_id
        WHERE i.from_user_id = ? AND i.to_profile_id = ? AND i.status = 'PENDING'`,
      [me.id, profileId],
    );
    if (!it) redirect(`/profiles/${profileId}`);

    await execute(
      "UPDATE interest SET status='CANCELED', responded_at=UTC_TIMESTAMP() WHERE id = ? AND status='PENDING'",
      [it.id],
    );

    // 거뒀다는 알림은 보내지 않는다. 관심을 받았다가 거둬졌다는 통보는
    // 받는 쪽에 좋을 게 없다 - 조용히 사라지는 편이 낫다.
    // 요청 자체는 상대 화면에서 없어진다.

    redirect(`/profiles/${profileId}?canceled=1`);
  }

  async function togglePause() {
    'use server';

    const me = await requireUser();
    const p = await queryOne<ProfileRow>(
      'SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL',
      [profileId],
    );
    if (!p) notFound();

    const mine = p.subject_user_id === me.id;
    const author = p.author_user_id === me.id;
    if (!mine && !author) redirect(`/profiles/${profileId}`);

    if (p.status === 'PAUSED') {
      // 본인이 내린 건 주선자가 되돌릴 수 없다 (PRODUCT 51)
      if (!mine && p.paused_by === 'SELF') redirect(`/profiles/${profileId}?error=owner_paused`);
      await execute(
        "UPDATE profile SET status='ACTIVE', paused_at=NULL, paused_by=NULL WHERE id = ?",
        [profileId],
      );
    } else {
      await execute(
        "UPDATE profile SET status='PAUSED', paused_at=UTC_TIMESTAMP(), paused_by=? WHERE id = ?",
        [mine ? 'SELF' : 'MATCHMAKER', profileId],
      );
      if (!mine && p.subject_user_id) {
        await notify(p.subject_user_id, 'PAUSED_BY_MATCHMAKER', { profileId });
      }
    }

    redirect(`/profiles/${profileId}`);
  }

  async function remove() {
    'use server';

    const me = await requireUser();
    const p = await queryOne<ProfileRow>(
      'SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL',
      [profileId],
    );
    if (!p) notFound();
    if (p.subject_user_id !== me.id && !(p.author_user_id === me.id && p.claimed_at == null)) {
      redirect(`/profiles/${profileId}`);
    }

    await deleteAllPhotos(profileId, p.photo_key);
    await execute(
      `UPDATE profile SET status='DELETED', deleted_at=UTC_TIMESTAMP(),
              photo_key=NULL, claim_token=NULL, claim_token_expires_at=NULL
        WHERE id = ?`,
      [profileId],
    );
    await execute(
      "UPDATE interest SET status='EXPIRED' WHERE to_profile_id = ? AND status='PENDING'",
      [profileId],
    );

    redirect(`/rooms/${p.room_id}`);
  }

  // 채워진 것만 보여준다. 빈 줄이 늘어서면 카드가 설문지처럼 보인다
  const details: [string, string][] = (
    [
      ['취미', profile.hobbies],
      ['MBTI', profile.mbti],
      ['키', profile.height ? `${profile.height}cm` : null],
      ['주량', drinkText(profile.drink_type, profile.drink_amount)],
      ['담배', smokingText(profile.smoking)],
      ['종교', religionText(profile.religion)],
      ['이런 사람이면', profile.ideal_type],
    ] as [string, string | null][]
  ).filter((d): d is [string, string] => Boolean(d[1]));

  const photos = (await photoKeysOf(profileId, profile.photo_key)).map((k) => photoUrl(k)!);
  const age = ageOf(profile.birth_year);
  const paused = profile.status === 'PAUSED';

  return (
    <>
      <AppBar title={profile.display_name} back={`/rooms/${profile.room_id}`} userId={user.id} />

      <main className="pb-16">
        {(claimed || sent || canceled || error || profile.status === 'HIDDEN') && (
          <div className="px-6 pb-4">
            {claimed && (
              <Notice tone="good">내 카드가 됐어요. 이제 직접 고치거나 내릴 수 있어요.</Notice>
            )}
            {sent && (
              <Notice tone="brand">관심을 보냈어요. 답이 오면 알림으로 알려드릴게요.</Notice>
            )}
            {error && (
              <Notice>
                {error === 'owner_paused'
                  ? '본인이 직접 내린 카드예요. 주선자는 되돌릴 수 없어요.'
                  : error === 'self'
                    ? '내 카드에는 관심을 표시할 수 없어요.'
                    : '이미 사라진 카드예요.'}
              </Notice>
            )}
            {profile.status === 'HIDDEN' && (
              <Notice>신고가 접수되어 다른 사람에게는 보이지 않아요.</Notice>
            )}
          </div>
        )}

        {photos.length > 0 && (
          <PhotoCarousel srcs={photos} className="mx-6 h-60 w-[calc(100%-3rem)] rounded-2xl" />
        )}

        <div className="px-6 pt-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[26px] font-bold tracking-[-0.035em]">{profile.display_name}</h2>
            {paused && <Badge>쉬는 중</Badge>}
            {profile.claimed_at == null && <Badge tone="warn">본인 미확인</Badge>}
          </div>

          <p className="text-ink-3 mark mt-1 text-[15px]">
            {age}세 · {profile.gender === 'MALE' ? '남성' : '여성'} · {profile.region}
            {profile.job && ` · ${profile.job}`}
          </p>

          <p className="text-ink-2 mt-2.5 text-[14px]">
            {degreeLabel(degree)}
            {' · '}
            {isSelfRegistered ? '본인이 등록' : `${profile.author_nickname}님이 소개`}
          </p>

          {profile.recommendation && (
            <Box className="mt-6">
              <p className="kr text-[15px] leading-[1.75] whitespace-pre-wrap">
                {profile.recommendation}
              </p>
              <p className="text-ink-3 mt-3 text-[13px]">- {profile.author_nickname}님이 쓴 소개</p>
            </Box>
          )}

          {details.length > 0 && (
            <dl className="divide-haze ring-haze mt-3 divide-y rounded-2xl px-[18px] ring-1">
              {details.map(([label, value]) => (
                <div key={label} className="flex gap-4 py-3">
                  <dt className="text-ink-3 w-20 shrink-0 text-[14px]">{label}</dt>
                  <dd className="kr flex-1 text-[15px] whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {profile.self_intro && (
            <Box className="mt-3">
              <p className="text-ink-3 text-[13px] font-semibold">본인 한마디</p>
              <p className="kr mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                {profile.self_intro}
              </p>
            </Box>
          )}

          {profile.claimed_at == null && !isAuthor && (
            <Caption className="mt-4">
              아직 본인이 카드를 가져가지 않았어요. 소개한 분이 쓴 내용이에요.
            </Caption>
          )}

          {/*
            남의 카드에서 할 일은 관심 하나뿐이다. 그것만 버튼으로 둔다.
            내 카드를 손보는 동작은 아래 ActionList로 모은다 - 전폭 버튼 네 개가 쌓이면
            전부 같은 무게로 보여서 무엇이 이 화면의 본론인지 알 수 없다.
          */}
          {!isMine &&
            (profile.status === 'ACTIVE' ? (
              <div className="mt-8">
                {pending ? (
                  <form action={cancelInterest}>
                    <Button type="submit" tone="ghost">
                      관심 취소하기
                    </Button>
                  </form>
                ) : (
                  <form action={sendInterest}>
                    <Button type="submit">관심 표시하기</Button>
                  </form>
                )}
              </div>
            ) : (
              paused && (
                <Caption className="mt-8 text-center">
                  지금은 소개를 쉬고 있어요. 다시 시작하면 목록에 나타나요.
                </Caption>
              )
            ))}

          {(isMine || isAuthor) && (
            <ActionList title={isMine ? '내 카드' : '내가 소개한 카드'}>
              {canEdit && <ActionRow href={`/profiles/${profileId}/edit`} label="고치기" />}

              {isAuthor && profile.claimed_at == null && (
                <ActionRow href={`/profiles/${profileId}/share`} label="본인에게 링크 보내기" />
              )}

              <form action={togglePause}>
                <ActionRow
                  label={paused ? '다시 소개 시작하기' : '소개 잠시 멈추기'}
                  hint={paused ? undefined : '목록에서 안 보이게 해요'}
                />
              </form>

              {canEdit && (
                <form action={remove}>
                  <ActionRow label="카드 삭제" danger />
                </form>
              )}
            </ActionList>
          )}

          {!isMine && (
            <p className="text-ink-3 mt-12 text-center text-[13px]">
              <Link href={`/profiles/${profileId}/report`} className="underline underline-offset-4">
                신고하기
              </Link>
            </p>
          )}
        </div>
      </main>
    </>
  );
}
