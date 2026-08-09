import { redirect } from 'next/navigation';
import { transaction } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isBirthYearShaped, isAdult, latestBirthYear, OLDEST_BIRTH_YEAR } from '@/lib/age';
import AppBar from '@/components/AppBar';
import { Button, Caption, ChoiceGroup, Field, Input, Notice } from '@/components/ui';

// 내 정보 고치기 — 이름, 출생연도, 성별.
//
// 저장하면 본인 확인된 카드(subject_user_id = 나)의 나이·성별도 같이 바뀐다.
// 계정과 카드가 같은 사람인데 두 값이 갈라지면 어느 쪽이 맞는지 알 수 없다.
// 카드의 표시 이름은 방마다 다르게 부를 수 있으니 따라 바꾸지 않는다.

const GENDERS = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
] as const;

export default async function EditMePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser('/me/edit');
  const { error } = await searchParams;

  async function save(formData: FormData) {
    'use server';

    const me = await requireUser();
    const back = '/me/edit';

    const nickname = String(formData.get('nickname') ?? '').trim();
    const birthYear = Number(formData.get('birth_year'));
    const gender = String(formData.get('gender'));

    if (!nickname || nickname.length > 50) redirect(`${back}?error=nickname`);
    if (!isBirthYearShaped(birthYear)) redirect(`${back}?error=birth_year`);
    if (!isAdult(birthYear)) redirect(`${back}?error=underage`);
    if (gender !== 'MALE' && gender !== 'FEMALE') redirect(`${back}?error=gender`);

    // 계정과 내 카드는 한 번에 바뀌어야 한다. 한쪽만 바뀌면 나이가 어긋난 채로 남는다
    await transaction(async (tx) => {
      await tx.execute('UPDATE `user` SET nickname = ?, birth_year = ?, gender = ? WHERE id = ?', [
        nickname,
        birthYear,
        gender,
        me.id,
      ]);
      await tx.execute(
        `UPDATE profile SET birth_year = ?, gender = ?
          WHERE subject_user_id = ? AND deleted_at IS NULL`,
        [birthYear, gender, me.id],
      );
    });

    redirect('/me?saved=1');
  }

  const errorText: Record<string, string> = {
    nickname: '이름을 확인해주세요.',
    birth_year: '출생연도를 다시 확인해주세요.',
    underage: '만 19세 이상만 이용할 수 있어요.',
    gender: '성별을 선택해주세요.',
  };

  return (
    <>
      <AppBar title="내 정보 고치기" back="/me" userId={user.id} />

      <main className="px-6 py-6">
        {error && (
          <div className="mb-6">
            <Notice>{errorText[error] ?? '입력을 확인해주세요.'}</Notice>
          </div>
        )}

        <form action={save} className="space-y-7">
          <Field label="이름" hint="주선자로 카드에 표시되는 이름이에요." htmlFor="nickname">
            <Input
              id="nickname"
              name="nickname"
              required
              maxLength={50}
              defaultValue={user.nickname}
            />
          </Field>

          <Field label="출생연도" htmlFor="birth_year">
            <Input
              id="birth_year"
              name="birth_year"
              type="number"
              inputMode="numeric"
              required
              min={OLDEST_BIRTH_YEAR}
              max={latestBirthYear()}
              defaultValue={user.birth_year ?? ''}
            />
          </Field>

          <Field label="성별">
            <ChoiceGroup
              name="gender"
              options={GENDERS}
              defaultValue={user.gender ?? undefined}
              required
            />
          </Field>

          <Button type="submit">저장</Button>
        </form>

        <Caption className="mt-5">
          나이와 성별을 바꾸면 내 카드에도 함께 반영돼요. 카드의 표시 이름과 사진은 카드에서 따로
          고칠 수 있어요.
        </Caption>
      </main>
    </>
  );
}
