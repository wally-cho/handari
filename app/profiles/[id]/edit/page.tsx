import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { execute, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import { deletePhoto, photoUrl, PhotoError, MAX_PHOTO_BYTES } from '@/lib/photos';
import { MAX_PHOTOS, photoKeysOf, savePhotos, setExtraPhotos } from '@/lib/profilePhotos';
import PhotoFields from '@/components/PhotoFields';
import AppBar from '@/components/AppBar';
import ProfileExtraFields from '@/components/ProfileExtraFields';
import { REGIONS, parseExtras } from '@/lib/profileFields';
import { ageOf, isAdult, isBirthYearShaped, latestBirthYear, OLDEST_BIRTH_YEAR } from '@/lib/age';
import type { ProfileRow } from '@/lib/types';

// 카드 고치기.
//
// 추천사는 주선자의 말이므로 본인이 고칠 수 없다 (PRODUCT 22).
// 주선자는 본인이 가져가기 전까지만 고칠 수 있다.

export default async function EditProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const profileId = Number(id);
  const user = await requireUser(`/profiles/${id}/edit`);
  const { error } = await searchParams;

  const profile = await queryOne<ProfileRow>(
    'SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL',
    [profileId],
  );
  if (!profile) notFound();
  await requireRoomAccess(profile.room_id, user.id);

  const isMine = profile.subject_user_id === user.id;
  const isAuthorBeforeClaim = profile.author_user_id === user.id && profile.claimed_at == null;
  if (!isMine && !isAuthorBeforeClaim) redirect(`/profiles/${profileId}`);

  // 본인은 추천사를 못 고친다. 주선자는(가져가기 전이면) 고칠 수 있다
  const canEditRecommendation = isAuthorBeforeClaim;

  async function save(formData: FormData) {
    'use server';

    const me = await requireUser();
    const p = await queryOne<ProfileRow>(
      'SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL',
      [profileId],
    );
    if (!p) notFound();

    const mine = p.subject_user_id === me.id;
    const authorBefore = p.author_user_id === me.id && p.claimed_at == null;
    if (!mine && !authorBefore) redirect(`/profiles/${profileId}`);

    const back = `/profiles/${profileId}/edit`;
    const displayName = String(formData.get('display_name') ?? '').trim();
    const region = String(formData.get('region') ?? '').trim();
    // 내 카드의 나이는 여기서 안 고친다. 계정 값이 출처다 - 내 정보에서 고치면 같이 바뀐다
    const birthYear = mine ? Number(me.birth_year) : Number(formData.get('birth_year'));
    const job = String(formData.get('job') ?? '').trim() || null;
    const selfIntro = String(formData.get('self_intro') ?? '').trim() || null;
    const recommendation = String(formData.get('recommendation') ?? '').trim();
    const removeKeys = formData.getAll('remove_photo').map(String);
    const photoFiles = formData.getAll('photos');
    const extras = parseExtras(formData);

    if (!displayName || displayName.length > 50) redirect(`${back}?error=name`);
    if (!isBirthYearShaped(birthYear) || !isAdult(birthYear)) redirect(`${back}?error=birth_year`);
    if (!region) redirect(`${back}?error=region`);
    if (authorBefore && recommendation.length > 0 && recommendation.length < 20) {
      redirect(`${back}?error=recommendation`);
    }

    // 지울 것을 빼고, 새로 올린 것을 뒤에 붙인다. 순서가 곧 보여주는 순서고 첫 장이 대표다
    const current = await photoKeysOf(profileId, p.photo_key);
    const kept = current.filter((k) => !removeKeys.includes(k));

    let added: string[] = [];
    try {
      added = await savePhotos(photoFiles, MAX_PHOTOS - kept.length);
    } catch (e) {
      if (e instanceof PhotoError) redirect(`${back}?error=photo`);
      throw e;
    }

    const nextKeys = [...kept, ...added];
    const photoKey = nextKeys[0] ?? null;

    await execute(
      `UPDATE profile
          SET display_name = ?, birth_year = ?, region = ?, job = ?,
              self_intro = ?, photo_key = ?,
              hobbies = ?, mbti = ?, height = ?,
              drink_type = ?, drink_amount = ?, smoking = ?, religion = ?, ideal_type = ?,
              recommendation = CASE WHEN ? THEN ? ELSE recommendation END
        WHERE id = ?`,
      [
        displayName,
        birthYear,
        region,
        job,
        mine ? selfIntro : p.self_intro,
        photoKey,
        extras.hobbies,
        extras.mbti,
        extras.height,
        extras.drink_type,
        extras.drink_amount,
        extras.smoking,
        extras.religion,
        extras.ideal_type,
        authorBefore ? 1 : 0,
        recommendation || null,
        profileId,
      ],
    );

    await setExtraPhotos(profileId, nextKeys.slice(1));
    // 목록에서 빠진 사진은 스토리지에서도 지운다. 안 지우면 내려간 사진이 계속 남는다
    for (const gone of current.filter((k) => !nextKeys.includes(k))) await deletePhoto(gone);

    redirect(`/profiles/${profileId}`);
  }

  const currentPhotos = await photoKeysOf(profileId, profile.photo_key);
  const errorText: Record<string, string> = {
    name: '이름을 확인해주세요.',
    birth_year: '만 19세 이상만 등록할 수 있어요.',
    region: '지역을 선택해주세요.',
    recommendation: '추천사는 20자 이상이어야 해요.',
    photo: '사진은 JPG·PNG·WEBP, 2MB까지 올릴 수 있어요.',
  };

  return (
    <>
      <AppBar title="고치기" back={`/profiles/${profileId}`} userId={user.id} />

      <main className="px-6 py-6">
        {error && (
          <p className="bg-alert-soft text-alert mb-4 rounded-lg p-3 text-sm">
            {errorText[error] ?? '입력을 확인해주세요.'}
          </p>
        )}

        <form action={save} className="space-y-7" encType="multipart/form-data">
          {canEditRecommendation && (
            <div>
              <label htmlFor="recommendation" className="block text-sm font-medium">
                소개하는 말
              </label>
              <textarea
                id="recommendation"
                name="recommendation"
                rows={4}
                defaultValue={profile.recommendation ?? ''}
                className="field resize-none"
              />
            </div>
          )}

          {isMine && profile.recommendation && (
            <div className="bg-fill-2 rounded-xl p-4">
              <p className="text-ink-3 text-xs">주선자가 쓴 소개 (고칠 수 없어요)</p>
              <p className="mt-1.5 text-sm leading-relaxed">{profile.recommendation}</p>
            </div>
          )}

          <div>
            <label htmlFor="display_name" className="block text-sm font-medium">
              이름 또는 별명
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              maxLength={50}
              defaultValue={profile.display_name}
              className="field"
            />
          </div>

          {/* 내 카드의 나이는 계정 값이 출처다. 여기서 또 받으면 내 정보와 갈라진다 */}
          {isMine ? (
            <div className="bg-fill-2 flex items-center gap-3 rounded-2xl px-[18px] py-4">
              <p className="mark min-w-0 flex-1 text-[15px] font-medium">
                {ageOf(profile.birth_year)}세
                <span className="text-ink-3 mt-0.5 block text-[13px] font-normal">
                  내 정보에 저장된 값이에요
                </span>
              </p>
              <Link href="/me/edit" className="text-ink-2 shrink-0 text-[14px] font-medium">
                고치기
              </Link>
            </div>
          ) : (
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
                defaultValue={profile.birth_year}
                className="field"
              />
            </div>
          )}

          <div>
            <label htmlFor="region" className="block text-sm font-medium">
              지역
            </label>
            <select
              id="region"
              name="region"
              required
              defaultValue={profile.region}
              className="field"
            >
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
            <input
              id="job"
              name="job"
              maxLength={100}
              defaultValue={profile.job ?? ''}
              className="field"
            />
          </div>

          {isMine && (
            <div>
              <label htmlFor="self_intro" className="block text-sm font-medium">
                한마디 <span className="text-ink-3">(선택)</span>
              </label>
              <textarea
                id="self_intro"
                name="self_intro"
                rows={3}
                defaultValue={profile.self_intro ?? ''}
                className="field resize-none"
              />
            </div>
          )}

          <PhotoFields
            current={currentPhotos.map((key) => ({ key, url: photoUrl(key)! }))}
            max={MAX_PHOTOS}
            maxBytes={MAX_PHOTO_BYTES}
          />

          <ProfileExtraFields defaults={profile} open />

          <button type="submit" className="btn btn-primary">
            저장
          </button>
        </form>
      </main>
    </>
  );
}
