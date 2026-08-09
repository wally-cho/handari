import NextAuth, { type DefaultSession } from 'next-auth';
import Kakao from 'next-auth/providers/kakao';
// 모듈 보강(declare module)을 하려면 해당 모듈이 먼저 해석돼야 한다
import type {} from 'next-auth/jwt';
import { queryOne, execute } from '@/lib/db';
import type { UserRow } from '@/lib/types';

// 로그인 수단은 카카오 하나뿐이다 (PRODUCT 2).
// AUTH_KAKAO_ID / AUTH_KAKAO_SECRET / AUTH_SECRET 은 Auth.js가 환경변수에서 자동으로 읽는다.
//
// 카카오에서 받는 건 닉네임과 프로필 사진뿐이다.
// 연령·성별은 비즈 앱 전환이 필요해서 온보딩에서 직접 입력받는다 (PRODUCT 3).

// 세션에는 uid만 담는다. 나머지 사용자 정보는 lib/session.ts가 DB에서 읽는다.
// JWT는 로그인 시점에 굳어버려서, 여기에 값을 담아두면 온보딩을 마쳐도
// 토큰은 옛 값을 들고 있게 된다. 출처를 하나로 둔다.
declare module 'next-auth' {
  interface Session {
    user: {
      /** 우리 DB의 user.id. 카카오 id가 아니다 */
      uid: number;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Kakao],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // 최초 로그인 시점에만 account가 들어온다. 이때 우리 user 행을 만들거나 갱신한다.
      if (account && profile) {
        const kakaoId = String(profile.id ?? account.providerAccountId);

        // 카카오 응답 모양: { id, properties: { nickname, profile_image }, kakao_account: {...} }
        const props = (profile as { properties?: { nickname?: string; profile_image?: string } })
          .properties;
        const nickname = props?.nickname ?? '이름없음';
        const image = props?.profile_image ?? null;

        const existing = await queryOne<UserRow>(
          'SELECT * FROM `user` WHERE kakao_id = ? AND deleted_at IS NULL',
          [kakaoId],
        );

        if (existing) {
          await execute(
            'UPDATE `user` SET nickname = ?, kakao_profile_image_url = ? WHERE id = ?',
            [nickname, image, existing.id],
          );
          token.uid = existing.id;
        } else {
          const res = await execute(
            'INSERT INTO `user` (kakao_id, nickname, kakao_profile_image_url) VALUES (?, ?, ?)',
            [kakaoId, nickname, image],
          );
          token.uid = res.insertId;
        }

        token.name = nickname;
        token.picture = image;
      }

      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        uid: token.uid as number,
        name: token.name,
        image: token.picture,
      };
      return session;
    },
  },
});
