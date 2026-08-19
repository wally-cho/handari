import { query, execute } from '@/lib/db';
import { savePhoto, deletePhoto } from '@/lib/photos';
import type { ProfilePhotoRow } from '@/lib/types';

// 카드 사진 목록. 사진은 여러 장이고 순서가 있다.
//
// 대표 사진은 profile.photo_key, 두 번째 이후는 profile_photo다 (migrations/007).
// 이 파일이 그 둘을 한 배열로 붙이는 유일한 곳이다 - 화면마다 따로 붙이면 순서가 갈라진다.

/** 카드 한 장에 붙일 수 있는 사진 수 */
export const MAX_PHOTOS = 6;

/** 순서대로 붙인 사진 키. 첫 장이 대표 사진이다 */
export async function photoKeysOf(profileId: number, primaryKey: string | null): Promise<string[]> {
  const extras = await query<ProfilePhotoRow>(
    'SELECT * FROM profile_photo WHERE profile_id = ? ORDER BY sort_order, id',
    [profileId],
  );
  return [...(primaryKey ? [primaryKey] : []), ...extras.map((e) => e.photo_key)];
}

/**
 * 업로드된 파일들을 저장하고 키를 순서대로 돌려준다.
 * 형식·크기가 안 맞으면 PhotoError를 던지고, 그때까지 저장한 것은 되돌린다 -
 * 남으면 아무 카드에도 안 붙은 사진이 스토리지에 뜬다.
 * 빈 파일은 건너뛴다 (파일 입력을 비워두고 보내면 그렇게 온다).
 */
export async function savePhotos(files: unknown[], limit: number): Promise<string[]> {
  const keys: string[] = [];
  for (const f of files) {
    if (keys.length >= limit) break;
    if (!(f instanceof File) || f.size === 0) continue;
    try {
      keys.push(await savePhoto(f));
    } catch (e) {
      for (const k of keys) await deletePhoto(k);
      throw e;
    }
  }
  return keys;
}

/**
 * 두 번째 이후 사진을 주어진 순서로 다시 깐다.
 * 대표 사진(첫 장)은 부르는 쪽이 profile.photo_key에 쓴다.
 */
export async function setExtraPhotos(profileId: number, keys: string[]): Promise<void> {
  await execute('DELETE FROM profile_photo WHERE profile_id = ?', [profileId]);
  for (const [i, key] of keys.slice(0, MAX_PHOTOS - 1).entries()) {
    await execute(
      'INSERT INTO profile_photo (profile_id, photo_key, sort_order) VALUES (?, ?, ?)',
      [profileId, key, i + 1],
    );
  }
}

/** 카드가 지워질 때. 사진을 스토리지에서 지우고 행도 없앤다 */
export async function deleteAllPhotos(profileId: number, primaryKey: string | null): Promise<void> {
  const keys = await photoKeysOf(profileId, primaryKey);
  await execute('DELETE FROM profile_photo WHERE profile_id = ?', [profileId]);
  for (const key of keys) await deletePhoto(key);
}
