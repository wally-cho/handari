import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// tium의 nginx를 거치지 않으므로, nginx가 하던 CloudFront 오리진 검증을 여기서 한다.
// EC2 포트로 직접 들어오는 요청(CloudFront를 우회한 스캐너 등)을 막는다.
//
// ORIGIN_VERIFY_SECRET 이 없으면(로컬 개발) 검사하지 않는다.
// CloudFront 배포의 Origin custom header에 같은 값을 넣어야 한다.

export function proxy(request: NextRequest) {
  const expected = process.env.ORIGIN_VERIFY_SECRET;
  if (!expected) return NextResponse.next();

  // 헬스체크는 컨테이너 안에서도 불린다(배포 스크립트). 검증에서 뺀다.
  if (request.nextUrl.pathname === '/api/health') return NextResponse.next();

  if (request.headers.get('x-origin-verify') !== expected) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  // 정적 자산은 검사하지 않는다 — 어차피 CloudFront가 캐시해서 오리진까지 안 온다
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
