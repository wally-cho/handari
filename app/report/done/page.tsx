import Link from 'next/link';

export default function ReportDonePage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-8">
      <h1 className="text-2xl font-bold tracking-tight">접수했어요</h1>
      <p className="text-ink-2 mt-3 text-sm leading-relaxed">
        운영자가 확인할게요. 신고한 사람이 누구인지는 상대에게 알려지지 않아요.
      </p>
      <Link href="/" className="btn btn-primary mt-8 block text-center">
        돌아가기
      </Link>
    </main>
  );
}
