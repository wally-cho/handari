import Link from 'next/link';
import { redirect } from 'next/navigation';
import { execute, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess, unlockRoom } from '@/lib/rooms';
import { savePhoto, PhotoError } from '@/lib/photos';
import { newToken, linkExpiry } from '@/lib/tokens';
import AppBar from '@/components/AppBar';
import ProfileExtraFields from '@/components/ProfileExtraFields';
import { REGIONS, parseExtras } from '@/lib/profileFields';
import { ageOf, isAdult, isBirthYearShaped, latestBirthYear, OLDEST_BIRTH_YEAR } from '@/lib/age';

// 프로필 등록 (PRODUCT 13~18).
//
// MVP에는 승인 대기가 없다. 등록하면 곧바로 방에 공개된다.
// 대신 친구 등록이면 "가져가기 링크"를 발급해서, 본인이 자기 카드의 주인이 되어
// 직접 고치고 지울 수 있게 한다. 이게 승인 게이트를 뺀 자리를 메우는 최소선이다.

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; error?: string }>;
}) {
  const { id } = await params;
  const roomId = Number(id);
  const user = await requireUser(`/rooms/${id}/register`);
  const { room } = await requireRoomAccess(roomId, user.id);
  const { type, error } = await searchParams;

  // 등록 대상 선택 화면
  if (type !== 'self' && type !== 'friend') {
    const mine = await queryOne<{ id: number }>(
      "SELECT id FROM profile WHERE room_id = ? AND subject_user_id = ? AND status <> 'DELETED' AND deleted_at IS NULL",
      [roomId, user.id],
    );

    return (
      <>
        <AppBar title="등록하기" back={`/rooms/${roomId}`} userId={user.id} />
        <main className="space-y-3 px-6 py-8">
          <p className="text-ink-2 text-sm leading-relaxed">누구를 등록할까요?</p>

          {mine ? (
            <Link
              href={`/profiles/${mine.id}`}
              className="ring-haze active:bg-fill-2 block rounded-2xl p-5 ring-1"
            >
              <span className="font-medium">내 카드 보기</span>
              <p className="text-ink-3 mt-1 text-sm">이 방에 이미 등록했어요</p>
            </Link>
          ) : (
            <Link
              href={`/rooms/${roomId}/register?type=self`}
              className="ring-haze active:bg-fill-2 block rounded-2xl p-5 ring-1"
            >
              <span className="font-medium">내 프로필</span>
              <p className="text-ink-3 mt-1 text-sm">나도 소개받고 싶어요</p>
            </Link>
          )}

          <Link
            href={`/rooms/${roomId}/register?type=friend`}
            className="ring-haze active:bg-fill-2 block rounded-2xl p-5 ring-1"
          >
            <span className="font-medium">친구 프로필</span>
            <p className="text-ink-3 mt-1 text-sm">소개해주고 싶은 친구가 있어요</p>
          </Link>

          <p className="text-ink-3 pt-4 text-xs leading-relaxed">
            둘 중 하나만 등록해도 방이 열려요. 소개받을 생각이 없어도 주선자로만 참여할 수 있어요.
          </p>
        </main>
      </>
    );
  }

  const isSelf = type === 'self';

  async function register(formData: FormData) {
    'use server';

    const me = await requireUser();
    await requireRoomAccess(roomId, me.id);

    const back = `/rooms/${roomId}/register?type=${isSelf ? 'self' : 'friend'}`;

    const displayName = String(formData.get('display_name') ?? '').trim();
    // 본인 카드의 나이·성별은 물어보지 않는다. 계정에 있는 값이 곧 내 값이다 —
    // 따로 받으면 내 정보와 내 카드의 나이가 갈라진다
    const gender = isSelf ? (me.gender ?? '') : String(formData.get('gender') ?? '');
    const birthYear = isSelf ? Number(me.birth_year) : Number(formData.get('birth_year'));
    const region = String(formData.get('region') ?? '').trim();
    const job = String(formData.get('job') ?? '').trim() || null;
    const recommendation = String(formData.get('recommendation') ?? '').trim();
    const selfIntro = String(formData.get('self_intro') ?? '').trim() || null;
    const consent = formData.get('consent') === 'on';
    const photo = formData.get('photo');
    const extras = parseExtras(formData);

    if (!displayName || displayName.length > 50) redirect(`${back}&error=name`);
    if (gender !== 'MALE' && gender !== 'FEMALE') redirect(`${back}&error=gender`);
    if (!isBirthYearShaped(birthYear) || !isAdult(birthYear)) redirect(`${back}&error=birth_year`);
    if (!region) redirect(`${back}&error=region`);

    if (!isSelf) {
      // 추천사가 카드의 주인공이다 (PRODUCT 15)
      if (recommendation.length < 20) redirect(`${back}&error=recommendation`);
      // 친구에게 먼저 이야기했는지 확인받는다 (PRODUCT 17)
      if (!consent) redirect(`${back}&error=consent`);
    }

    let photoKey: string | null = null;
    if (photo instanceof File && photo.size > 0) {
      try {
        photoKey = await savePhoto(photo);
      } catch (e) {
        if (e instanceof PhotoError) redirect(`${back}&error=photo`);
        throw e;
      }
    }

    const claimToken = isSelf ? null : newToken();

    const res = await execute(
      `INSERT INTO profile
         (room_id, author_user_id, subject_user_id, status,
          display_name, gender, birth_year, region, job,
          recommendation, self_intro, photo_key,
          consent_type, consent_confirmed_at,
          claim_token, claim_token_expires_at, claimed_at,
          hobbies, mbti, height, drink_type, drink_amount, smoking, religion, ideal_type)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId,
        me.id,
        isSelf ? me.id : null,
        displayName,
        gender,
        birthYear,
        region,
        job,
        isSelf ? null : recommendation,
        isSelf ? selfIntro : null,
        photoKey,
        isSelf ? 'SELF' : 'OFFLINE_CONFIRMED',
        isSelf ? null : new Date(),
        claimToken,
        claimToken ? linkExpiry() : null,
        isSelf ? new Date() : null,
        extras.hobbies,
        extras.mbti,
        extras.height,
        extras.drink_type,
        extras.drink_amount,
        extras.smoking,
        extras.religion,
        extras.ideal_type,
      ],
    );

    // 등록 행위 자체가 게이트를 연다. 친구의 확인을 기다리지 않는다 (PRODUCT 10)
    await unlockRoom(roomId, me.id);

    if (isSelf) redirect(`/rooms/${roomId}`);
    redirect(`/profiles/${res.insertId}/share`);
  }

  const errorText: Record<string, string> = {
    name: '이름을 확인해주세요.',
    gender: '성별을 선택해주세요.',
    birth_year: '만 19세 이상만 등록할 수 있어요.',
    region: '지역을 선택해주세요.',
    recommendation: '추천사를 20자 이상 써주세요.',
    consent: '친구에게 먼저 이야기했는지 확인해주세요.',
    photo: '사진은 JPG·PNG·WEBP, 2MB까지 올릴 수 있어요.',
  };

  return (
    <>
      <AppBar
        title={isSelf ? '내 프로필 등록' : '친구 등록'}
        back={`/rooms/${roomId}/register`}
        userId={user.id}
      />

      <main className="px-6 py-6">
        <p className="text-ink-3 text-sm">{room.name}</p>

        {error && (
          <p className="bg-alert-soft text-alert mt-4 rounded-lg p-3 text-sm">
            {errorText[error] ?? '입력을 확인해주세요.'}
          </p>
        )}

        <form action={register} className="mt-6 space-y-7" encType="multipart/form-data">
          {!isSelf && (
            <div>
              <label htmlFor="recommendation" className="block text-sm font-medium">
                이 친구를 소개하는 말 <span className="text-ink-3">(20자 이상)</span>
              </label>
              <p className="text-ink-3 mt-1 text-xs leading-relaxed">
                카드에서 가장 크게 보이는 부분이에요. 스펙보다 이게 중요해요.
              </p>
              <textarea
                id="recommendation"
                name="recommendation"
                required
                minLength={20}
                rows={4}
                placeholder="10년 봤는데 사람이 참 한결같아요. 말수는 적은데 챙길 건 다 챙기는 스타일이라…"
                className="field resize-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="display_name" className="block text-sm font-medium">
              {isSelf ? '이름 또는 별명' : '친구 이름 또는 별명'}
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              maxLength={50}
              defaultValue={isSelf ? user.nickname : ''}
              className="field"
            />
          </div>

          {/* 본인 카드의 나이·성별은 계정 값을 그대로 쓴다. 여기서 또 받으면 두 값이 갈라진다 */}
          {isSelf ? (
            <div className="bg-fill-2 flex items-center gap-3 rounded-2xl px-[18px] py-4">
              <p className="mark min-w-0 flex-1 text-[15px] font-medium">
                {user.birth_year && `${ageOf(user.birth_year)}세`}
                {user.gender && ` · ${user.gender === 'MALE' ? '남성' : '여성'}`}
                <span className="text-ink-3 mt-0.5 block text-[13px] font-normal">
                  내 정보에 저장된 값이에요
                </span>
              </p>
              <Link href="/me/edit" className="text-ink-2 shrink-0 text-[14px] font-medium">
                고치기
              </Link>
            </div>
          ) : (
            <>
              <fieldset>
                <legend className="text-sm font-medium">성별</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      ['MALE', '남성'],
                      ['FEMALE', '여성'],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="bg-fill text-ink-2 has-checked:bg-brand-soft has-checked:text-brand cursor-pointer rounded-[14px] py-3.5 text-center text-[15px] font-medium has-checked:font-semibold"
                    >
                      <input
                        type="radio"
                        name="gender"
                        value={value}
                        required
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="birth_year" className="block text-sm font-medium">
                  출생연도
                </label>
                <input
                  id="birth_year"
                  name="birth_year"
                  type="number"
                  inputMode="numeric"
                  required
                  min={OLDEST_BIRTH_YEAR}
                  max={latestBirthYear()}
                  className="field"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="region" className="block text-sm font-medium">
              지역
            </label>
            <select id="region" name="region" required defaultValue="" className="field">
              <option value="" disabled>
                선택
              </option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="job" className="block text-sm font-medium">
              하는 일 <span className="text-ink-3">(선택)</span>
            </label>
            <input id="job" name="job" maxLength={100} placeholder="디자이너" className="field" />
          </div>

          {isSelf && (
            <div>
              <label htmlFor="self_intro" className="block text-sm font-medium">
                한마디 <span className="text-ink-3">(선택)</span>
              </label>
              <textarea id="self_intro" name="self_intro" rows={3} className="field resize-none" />
            </div>
          )}

          <div>
            <label htmlFor="photo" className="block text-sm font-medium">
              사진 <span className="text-ink-3">(선택, 2MB까지)</span>
            </label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-ink-2 file:bg-haze mt-2 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm"
            />
          </div>

          <ProfileExtraFields />

          {!isSelf && (
            <label className="bg-warn-soft flex gap-3 rounded-xl p-4">
              <input
                type="checkbox"
                name="consent"
                required
                className="accent-brand mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-warn text-sm leading-relaxed">
                이 친구에게 등록한다고 이야기했어요. 등록하면 바로 방에 공개되고, 친구가 링크로
                들어와 직접 고치거나 내릴 수 있어요.
              </span>
            </label>
          )}

          <button type="submit" className="btn btn-primary">
            등록하기
          </button>
        </form>
      </main>
    </>
  );
}
