import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Button, Caption } from '@/components/ui';
import Logo from '@/components/Logo';

// 로그인 수단은 카카오 하나뿐이다 (PRODUCT 2).
// 이메일 가입도, 다른 소셜 로그인도, 비회원 열람도 없다.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  const { next } = await searchParams;

  if (session?.user) redirect(next ?? '/');

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pb-20">
      <Logo height={44} />
      <p className="text-ink-3 kr mt-4 mb-8 text-[15px] leading-relaxed">
        한 다리 건너 아는 사람을,
        <br />
        아는 사람이 보증해서 소개합니다.
      </p>

      <form
        action={async () => {
          'use server';
          await signIn('kakao', { redirectTo: next ?? '/' });
        }}
      >
        <Button type="submit" tone="kakao">
          카카오로 시작하기
        </Button>
      </form>

      <Caption className="mt-5 text-center">만 19세 이상만 이용할 수 있어요.</Caption>
    </main>
  );
}
