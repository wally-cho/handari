import { redirect } from 'next/navigation';
import { execute } from '@/lib/db';
import { getCurrentUser, isOnboarded } from '@/lib/session';
import { Button, Caption, ChoiceGroup, Field, Input, Notice, PageTitle } from '@/components/ui';
import { isAdult, isBirthYearShaped, OLDEST_BIRTH_YEAR } from '@/lib/age';
import { parseKakaotalkId } from '@/lib/kakaotalk';

// 카카오에서 연령·성별을 받으려면 비즈 앱 전환(사업자 등록 + 검수)이 필요하다.
// 취미 프로젝트 단계에서는 직접 입력받는다 (PRODUCT 3).
// 비즈 앱으로 전환하면 이 화면을 건너뛰고 카카오 값으로 채우면 된다.

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

    if (!isBirthYearShaped(birthYear)) redirect(`${back}&error=birth_year`);
    if (gender !== 'MALE' && gender !== 'FEMALE') redirect(`${back}&error=gender`);
    if (!isAdult(birthYear)) redirect(`${back}&error=underage`);

    // 카톡 아이디는 선택이다. 형식이 아니면 조용히 비운다 - 여기서 막으면 가입이 끊긴다
    const kakaotalkId = parseKakaotalkId(formData.get('kakaotalk_id'));

    await execute(
      'UPDATE `user` SET birth_year = ?, gender = ?, kakaotalk_id = ?, age_verified_at = UTC_TIMESTAMP() WHERE id = ?',
      [birthYear, gender, kakaotalkId, me.id],
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
            min={OLDEST_BIRTH_YEAR}
            max={thisYear}
            placeholder="1995"
          />
        </Field>

        <Field label="성별">
          <ChoiceGroup name="gender" options={GENDERS} required />
        </Field>

        <Field
          label="카카오톡 아이디"
          optional
          hint="소개가 성사되면 이 아이디로 찾아서 연결해드려요. 다른 사람에게는 보이지 않아요."
          htmlFor="kakaotalk_id"
        >
          <Input
            id="kakaotalk_id"
            name="kakaotalk_id"
            maxLength={50}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="handari_kim"
          />
        </Field>

        <Button type="submit">시작하기</Button>
      </form>

      <Caption className="mt-5">
        나이와 성별은 내 카드에 그대로 표시돼요. 전부 나중에 내 정보에서 고칠 수 있어요.
      </Caption>
    </main>
  );
}
