import { headers } from 'next/headers';

// 공유 링크에 넣을 절대 주소.
// 로컬에서 폰으로 확인할 때 LAN IP로도 맞아야 해서 요청 헤더에서 읽는다.
// 운영에서는 CloudFront가 X-Forwarded-Proto/Host를 넘겨준다.

export async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');

  // 헤더를 먼저 본다. 로컬에서 폰으로 열면 LAN IP가 들어와야 링크가 맞는다
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.includes('tium-care.com') ? 'https' : 'http');
    return `${proto}://${host}`;
  }

  return (process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
