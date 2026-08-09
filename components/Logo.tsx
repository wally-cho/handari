import Image from 'next/image';

// 워드마크. 로그인·랜딩·초대 진입처럼 "여기가 어디인지" 알려야 하는 화면에만 쓴다.
// 내부 화면은 상단 바 제목으로 충분하다 - 매 화면에 로고를 박으면 공간만 먹는다.

const RATIO = 640 / 277; // 원본 비율

export default function Logo({ height = 40 }: { height?: number }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="한다리"
      width={Math.round(height * RATIO)}
      height={height}
      priority
    />
  );
}
