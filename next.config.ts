import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 배포용. .next/standalone 에 실행에 필요한 것만 모아준다
  output: 'standalone',

  experimental: {
    // 사진 업로드가 Server Action을 탄다. 한도가 두 군데 있고 둘 다 올려야 한다 -
    // 사진 수나 장당 크기를 바꾸면 여기도 같이 본다 (장당 2MB × 6장 + multipart 부대 바이트)
    serverActions: {
      // 기본 1MB. 그대로 두면 2MB 한 장도 못 올린다
      bodySizeLimit: '14mb',
    },
    // 기본 10MB. proxy.ts가 있으면 이 크기에서 본문이 잘린다 - 잘려도 요청은 계속 가서
    // 마지막 사진이 깨진 채로 저장된다. 올리지 않으면 6장을 다 채울 때 걸린다
    proxyClientMaxBodySize: '14mb',
  },

  images: {
    remotePatterns: [
      // 카카오 프로필 이미지
      { protocol: 'https', hostname: 'k.kakaocdn.net' },
      { protocol: 'http', hostname: 'k.kakaocdn.net' },
      { protocol: 'https', hostname: 'img1.kakaocdn.net' },
      // 우리 CDN (프로필 사진)
      { protocol: 'https', hostname: 'cdn.tium-care.com' },
    ],
  },
};

export default nextConfig;
