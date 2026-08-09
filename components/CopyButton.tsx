'use client';

import { useState } from 'react';

// 목록에서 링크 하나를 바로 복사한다. 문구 없이 링크만.

export default function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 클립보드 권한이 없으면(구형 브라우저, 비 HTTPS) 조용히 넘어간다
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-ghost btn-sm shrink-0"
      aria-label="링크 복사"
    >
      {done ? '복사됨' : '복사'}
    </button>
  );
}
