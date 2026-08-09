import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 배포용. .next/standalone 에 실행에 필요한 것만 모아준다
  output: 'standalone',

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
