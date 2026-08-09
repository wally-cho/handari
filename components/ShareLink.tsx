'use client';

import { useState } from 'react';

// 링크 복사 + 카카오톡으로 보낼 문구.
// 서비스가 대신 발송하지 않는다 - 주선자가 친구 연락처를 이미 알고 있고,
// 우리는 연락처를 수집하지 않는다 (PRODUCT 20).

export default function ShareLink({ url, message }: { url: string; message: string }) {
  const [copied, setCopied] = useState<'none' | 'link' | 'message'>('none');

  async function copy(text: string, which: 'link' | 'message') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 권한이 없으면(구형 브라우저, 비 HTTPS) 사용자가 직접 긁어야 한다
      return;
    }
    setCopied(which);
    setTimeout(() => setCopied('none'), 2000);
  }

  return (
    <div>
      <p className="text-ink-2 kr rounded-xl bg-white px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap select-all">
        {message}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => copy(message, 'message')}
          className="btn btn-primary btn-sm !w-full"
        >
          {copied === 'message' ? '복사했어요' : '문구 복사'}
        </button>
        <button
          type="button"
          onClick={() => copy(url, 'link')}
          className="btn btn-sm text-ink-2 !w-full bg-white"
        >
          {copied === 'link' ? '복사했어요' : '링크만 복사'}
        </button>
      </div>

      <p className="text-ink-3 mt-2.5 text-center text-[12px]">
        복사해서 카카오톡으로 직접 보내주세요
      </p>
    </div>
  );
}
