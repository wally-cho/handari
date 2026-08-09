'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from '@/components/ui';

// 뒤로가기는 "온 곳"으로 돌아가야 한다.
// 고정 경로로 두면 방 → 알림 → 뒤로 가 홈으로 튄다.
//
// 링크로 바로 들어온 경우(히스토리 없음)에는 갈 곳이 없으므로 fallback으로 보낸다.

export default function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="뒤로"
      className="text-ink -ml-2 p-2"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ChevronLeft size={24} />
    </button>
  );
}
