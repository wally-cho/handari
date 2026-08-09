import type { Metadata, Viewport } from 'next';
import './globals.css';

// 한글 UI에서 토스 특유의 밀도를 내려면 Pretendard가 사실상 유일한 선택지다.
// 구글 폰트에 없어서 CDN을 쓴다. dynamic-subset이라 필요한 글자만 내려온다.
const PRETENDARD =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

export const metadata: Metadata = {
  title: '한다리',
  description: '한 다리 건너 아는 사람을, 아는 사람이 보증해서 소개합니다.',
};

// 모바일 웹 전용이다. 데스크톱 레이아웃은 만들지 않는다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href={PRETENDARD} />
        <style>{`:root{--font-body:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif}`}</style>
      </head>
      <body>
        {/* 모바일 폭에 고정. 넓은 화면에서는 가운데 정렬된 좁은 컬럼 */}
        <div className="mx-auto min-h-dvh w-full max-w-[460px] bg-white">{children}</div>
      </body>
    </html>
  );
}
