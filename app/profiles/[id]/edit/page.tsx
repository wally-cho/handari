import { notFound, redirect } from 'next/navigation';
import { execute, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { requireRoomAccess } from '@/lib/rooms';
import { savePhoto, deletePhoto, photoUrl, PhotoError } from '@/lib/photos';
import AppBar from '@/components/AppBar';
import ProfileExtraFields from '@/components/ProfileExtraFields';
import { REGIONS, parseExtras } from '@/lib/profileFields';
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
  const thisYear = new Date().getFullYear();

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
    const birthYear = Number(formData.get('birth_year'));
    const job = String(formData.get('job') ?? '').trim() || null;
    const selfIntro = String(formData.get('self_intro') ?? '').trim() || null;
    const recommendation = String(formData.get('recommendation') ?? '').trim();
    const removePhoto = formData.get('remove_photo') === 'on';
    const photo = formData.get('photo');
    const extras = parseExtras(formData);

    if (!displayName || displayName.length > 50) redirect(`${back}?error=name`);
    if (!Number.isInteger(birthYear) || birthYear < 1950 || thisYear - birthYear < 19) {
      redirect(`${back}?error=birth_year`);
    }
    if (!region) redirect(`${back}?error=region`);
    if (authorBefore && recommendation.length > 0 && recommendation.length < 20) {
      redirect(`${back}?error=recommendation`);
    }

    let photoKey = p.photo_key;

    if (removePhoto && p.photo_key) {
      await deletePhoto(p.photo_key);
      photoKey = null;
    }

    if (photo instanceof File && photo.size > 0) {
      try {
        const next = await savePhoto(photo);
        // 교체 시 이전 객체를 반드시 지운다. 안 지우면 내려간 사진이 스토리지에 남는다
        if (photoKey) await deletePhoto(photoKey);
        photoKey = next;
      } catch (e) {
        if (e instanceof PhotoError) redirect(`${back}?error=photo`);
        throw e;
      }
    }

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

    redirect(`/profiles/${profileId}`);
  }

  const currentPhoto = photoUrl(profile.photo_key);
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

          <div className="grid grid-cols-2 gap-3">
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
                min={1950}
                max={thisYear - 19}
                defaultValue={profile.birth_year}
                className="field"
              />
            </div>
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

          <div>
            <span className="block text-sm font-medium">사진</span>
            {currentPhoto && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentPhoto} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <label className="text-ink-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="remove_photo" className="accent-brand" />
                  지우기
                </label>
              </div>
            )}
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-ink-2 file:bg-haze mt-3 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm"
            />
            <p className="text-ink-3 mt-1 text-xs">새로 올리면 기존 사진은 지워져요.</p>
          </div>

          <ProfileExtraFields defaults={profile} open />

          <button type="submit" className="btn btn-primary">
            저장
          </button>
        </form>
      </main>
    </>
  );
}
