import { redirect } from 'next/navigation';
import { execute } from '@/lib/db';
import { getCurrentUser, isOnboarded } from '@/lib/session';
import { Button, Caption, ChoiceGroup, Field, Input, Notice, PageTitle } from '@/components/ui';

// 카카오에서 연령·성별을 받으려면 비즈 앱 전환(사업자 등록 + 검수)이 필요하다.
// 취미 프로젝트 단계에서는 직접 입력받는다 (PRODUCT 3).
// 비즈 앱으로 전환하면 이 화면을 건너뛰고 카카오 값으로 채우면 된다.

const MIN_AGE = 19;

const GENDERS = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
] as const;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/onboarding');

  const { error, next } = await searchParams;
  // 초대·가져가기 링크로 들어온 흐름이 온보딩에서 끊기지 않게 목적지를 들고 다닌다
  const after = next && next.startsWith('/') ? next : '/';

  if (isOnboarded(user)) redirect(after);

  const thisYear = new Date().getFullYear();

  async function save(formData: FormData) {
    'use server';

    const me = await getCurrentUser();
    if (!me) redirect('/login');

    const birthYear = Number(formData.get('birth_year'));
    const gender = String(formData.get('gender'));
    const back = `/onboarding?next=${encodeURIComponent(after)}`;

    if (!Number.isInteger(birthYear) || birthYear < 1950 || birthYear > thisYear) {
      redirect(`${back}&error=birth_year`);
    }
    if (gender !== 'MALE' && gender !== 'FEMALE') redirect(`${back}&error=gender`);

    // 만 나이 대신 연 나이로 본다. 자기신고라 정밀도보다 명확함이 낫다
    if (thisYear - birthYear < MIN_AGE) redirect(`${back}&error=underage`);

    await execute(
      'UPDATE `user` SET birth_year = ?, gender = ?, age_verified_at = UTC_TIMESTAMP() WHERE id = ?',
      [birthYear, gender, me.id],
    );

    redirect(after);
  }

  return (
    <main className="px-6 pt-16 pb-16">
      <PageTitle sub="소개를 주고받으려면 두 가지가 필요해요.">거의 다 됐어요</PageTitle>

      {error && (
        <div className="mb-6">
          <Notice>
            {error === 'underage'
              ? '만 19세 이상만 이용할 수 있어요.'
              : error === 'birth_year'
                ? '출생연도를 다시 확인해주세요.'
                : '성별을 선택해주세요.'}
          </Notice>
        </div>
      )}

      <form action={save} className="space-y-7">
        <Field label="출생연도" htmlFor="birth_year">
          <Input
            id="birth_year"
            name="birth_year"
            type="number"
            inputMode="numeric"
            required
            min={1950}
            max={thisYear}
            placeholder="1995"
          />
        </Field>

        <Field label="성별">
          <ChoiceGroup name="gender" options={GENDERS} required />
        </Field>

        <Button type="submit">시작하기</Button>
      </form>

      <Caption className="mt-5">
        나이와 성별은 카드에 표시돼요. 카드마다 따로 고칠 수도 있어요.
      </Caption>
    </main>
  );
}
