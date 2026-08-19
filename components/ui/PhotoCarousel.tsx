'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from './icons';

// 사진 여러 장을 옆으로 넘겨 본다. 끝이 없다 - 마지막에서 한 번 더 넘기면 첫 장으로
// 이어진다 (1231231...). 되돌아가는 애니메이션 없이 이어지도록 앞뒤에 클론 한 장을 두고,
// 클론에 닿는 순간 애니메이션을 끈 채 같은 그림의 원본 자리로 옮긴다.
//
// 이 앱에서 클라이언트 컴포넌트가 필요한 드문 자리다. 넘기는 상태는 서버가 알 수 없다.

export default function PhotoCarousel({
  srcs,
  className = '',
  alt = '',
}: {
  srcs: string[];
  /** 사진 한 장의 영역. 높이를 넘겨준다 (예: 'h-60 rounded-2xl') */
  className?: string;
  alt?: string;
}) {
  const n = srcs.length;
  const items = n > 0 ? [srcs[n - 1], ...srcs, srcs[0]] : [];

  const [i, setI] = useState(1); // items 기준. 1이 실제 첫 장
  const [animate, setAnimate] = useState(true);
  const touchX = useRef<number | null>(null);

  // 클론에 닿으면 같은 그림의 원본 자리로 소리 없이 옮긴다.
  // 프레임을 두 번 넘기고 애니메이션을 되살린다 - 한 번만 넘기면 옮긴 위치가
  // 아직 화면에 반영되지 않아 되돌아가는 움직임이 보인다
  useEffect(() => {
    if (animate) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  function settle() {
    if (i === 0) {
      setAnimate(false);
      setI(n);
    } else if (i === items.length - 1) {
      setAnimate(false);
      setI(1);
    }
  }

  const go = (step: number) => setI((prev) => prev + step);
  const current = ((i - 1 + n) % n) + 1;

  if (n === 0) return null;
  if (n === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={srcs[0]} alt={alt} className={`w-full object-cover ${className}`} />
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className={`flex h-full w-full ${animate ? 'transition-transform duration-300 ease-out' : ''}`}
        style={{ transform: `translateX(-${i * 100}%)` }}
        onTransitionEnd={settle}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          if (start == null) return;
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        {items.map((src, idx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={idx}
            src={src}
            alt={alt}
            draggable={false}
            className="h-full w-full shrink-0 object-cover select-none"
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="이전 사진"
        onClick={() => go(-1)}
        className="text-ink bg-surface/85 absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        aria-label="다음 사진"
        onClick={() => go(1)}
        className="text-ink bg-surface/85 absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full"
      >
        <ChevronRight size={20} />
      </button>

      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {srcs.map((_, idx) => (
          <span
            key={idx}
            className={`h-1.5 w-1.5 rounded-full ${
              idx + 1 === current ? 'bg-surface' : 'bg-surface/45'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
