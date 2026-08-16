<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 한다리 (Handari)

한 다리 건너 아는 사람을, 아는 사람이 보증해서 소개하는 서비스. 사이드 프로젝트다.

**작업 전에 읽을 것**

- `README.md` - 서비스 개요, 구조, 데이터 모델, 인프라. 리포에 커밋돼 있다
- `PRODUCT.md` - 제품 명세. 동작이 번호 매긴 불변식으로 적혀 있다. 코드 주석의 `(PRODUCT 27)` 같은 표기는 이 번호를 가리킨다
- `TECH.md` - 데이터 모델, 인프라, 다리 수 알고리즘의 상세

**`PRODUCT.md`와 `TECH.md`는 gitignore돼 있다.** 작성자 로컬에만 있는 작업 문서다. 파일이 없는 환경이라면 찾아 헤매지 말고 `README.md`와 아래 "깨뜨리면 안 되는 것"을 근거로 삼는다. 그 둘로 판단이 안 서는 동작은 임의로 만들지 말고 물어본다.

파일이 있는 환경에서 기능을 만들 때는 **`PRODUCT.md`의 해당 항목을 먼저 찾아 읽는다.** 명세에 없는 동작을 임의로 만들지 말고, 필요하면 `PRODUCT.md`를 먼저 고친다.

## 명령

```shell
npm run tunnel      # RDS는 VPC 내부 전용. 개발 시작 = 터널 켜기 (필수, 별도 터미널)
npm run dev         # http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run lint
npm run build

npm run migrate         # migrations/*.sql 중 미적용분 적용
npm run migrate:status  # 적용 현황

npm run seed            # 테스트 방/사람/카드 생성 + 모든 페이지 쿼리를 실제로 검증
npm run seed:clean      # 시드 데이터만 삭제
```

`npm run seed`는 생 SQL의 문법·컬럼 오류를 잡는 유일한 방어다. **쿼리를 고쳤으면 돌려볼 것.**

두 가지를 같이 지킨다.

- **`scripts/seed.mjs`는 페이지 쿼리를 복사해서 검사한다.** 화면의 쿼리를 고치면 seed의 사본도
  고친다. 안 그러면 유일한 방어가 헛것을 검사한다 (실제로 어드민 쿼리에서 이 일이 났다)
- **끝나면 `npm run seed:clean`.** 개발과 운영이 같은 `handari` 데이터베이스를 쓴다.
  시드 방과 카드가 남으면 서비스에 그대로 보인다

**터널이 없으면 앱이 DB를 못 붙는다.** 로컬 DB는 두지 않는다 - RDS의 `handari` 데이터베이스를 개발에도 그대로 쓴다.

## 구조

```
app/            화면과 라우트 (App Router)
  api/          Route Handler (health, cron, auth)
lib/
  db.ts         mysql2 풀 + query/queryOne/execute/transaction
  types.ts      테이블 행 타입. 스키마의 유일한 TS 출처
  session.ts    getCurrentUser / requireUser - 로그인 사용자 접근의 유일한 경로
  graph.ts      다리 수 BFS
  age.ts        나이 계산·만 19세 하한. 유일한 출처
  kakaotalk.ts  카톡 아이디 형식 검사
  profileFields.ts  프로필 선택지 + 폼 파서
  photos.ts     사진 저장 (로컬 파일 / S3)
  notify.ts     알림
  tokens.ts     링크 토큰·만료
  rooms.ts      방 접근·열람 게이트
components/     AppBar, ProfileCard, ShareLink
auth.ts         Auth.js 설정 (카카오 전용)
proxy.ts        CloudFront 오리진 검증
migrations/     SQL 파일. 손으로 쓰고 npm run migrate 로 적용
infra/          EC2에 두는 배포·삭제 파일 (compose, deploy, teardown)
scripts/        개발용 스크립트
```

## 규칙

**ORM을 쓰지 않는다.** `lib/db.ts`의 헬퍼로 SQL을 직접 쓴다.

```ts
const rows = await query<ProfileRow>('SELECT * FROM profile WHERE room_id = ?', [roomId]);
```

- 값은 **반드시 `?` 바인딩**으로 넘긴다. 문자열 결합으로 SQL을 만들지 않는다
- 행 타입은 `lib/types.ts`에 있는 것을 쓴다. 인라인으로 새로 정의하지 않는다
- **`migrations/*.sql`을 고치면 `lib/types.ts`도 같이 고친다.** 두 곳이 어긋나도 컴파일러가 잡아주지 않는다. 이게 유일한 방어다

**로그인 사용자는 `lib/session.ts`로만 가져온다.**

```ts
const user = await requireUser();       // 로그인+온보딩 필수. 아니면 리다이렉트
const user = await getCurrentUser();    // 없으면 null
```

`auth()`를 직접 부르지 않는다. 세션(JWT)에는 `uid`만 있고 나머지는 DB에서 읽는다 - JWT는 로그인 시점에 굳어서 온보딩 같은 변경이 반영되지 않기 때문이다.

**기본은 서버 컴포넌트다.** 폼은 Server Action으로 처리한다. `'use client'`는 정말 필요할 때만 쓴다 - 이 앱은 실시간 기능이 없어서 대부분 필요 없다.

**빌드 시점에 DB에 붙지 않는다.** 커넥션 풀은 `getPool()`로 첫 쿼리 때 만든다.
모듈 로드 시점에 만들면 `next build`가 라우트 설정을 수집하며 파일을 평가할 때
`DATABASE_URL`이 없어 빌드가 깨진다 - CI와 Docker 빌드에는 그 값이 없다.

**글에 `—`(em dash)를 쓰지 않는다.** 코드 주석, 문서, 화면 문구 전부 `-`(하이픈)로 쓴다.

**시각은 UTC로 저장한다.** `lib/db.ts`가 세션 타임존을 `+00:00`으로 맞춘다. SQL에서 `NOW()` 대신 `UTC_TIMESTAMP()`를 쓴다. 표시할 때만 KST로 바꾼다.

**Next 16 주의**

- `cookies()`, `headers()`, `params`, `searchParams`는 전부 **async**다. 반드시 `await`
- `middleware.ts`는 **`proxy.ts`**로 이름이 바뀌었다

## 디자인 시스템

화면을 만들 때 **`components/ui`에서 먼저 찾는다.** 없으면 거기에 추가한다.
페이지에 유틸리티 클래스를 직접 뿌리지 않는다 - 화면이 늘 때마다 톤이 흩어진다.

```tsx
import { Button, ButtonLink, Field, Input, Select, Textarea, ChoiceGroup,
         Card, Box, PageTitle, SectionTitle, Caption, Badge, ListRow,
         ActionList, ActionRow, Tabs, EmptyState, Notice, Bell, ChevronLeft } from '@/components/ui';
```

**색은 `app/globals.css`의 토큰만 쓴다.** 임의의 hex나 Tailwind 기본 팔레트(`neutral-*`, `red-*`)를 쓰지 않는다.

| 토큰 | 쓰는 곳 |
|---|---|
| `ink` / `ink-2` / `ink-3` | 텍스트 3단. 이 이상 쪼개지 않는다 |
| `fill` / `fill-2` | 회색 묶음. 테두리 대신 이걸로 구분한다 |
| `haze` | 구분선 |
| `brand` (주홍 `#FD4E43`) | **액션에만** - 버튼, 선택 상태, 안 읽은 점. 정보 표시에 쓰지 않는다 |
| `alert` / `warn` / `good` | 상태. soft 변형과 짝으로 |

**규칙**

- 화면당 primary 버튼은 하나만 둔다
- **전폭 버튼을 세 개 이상 쌓지 않는다.** 전부 같은 무게로 보여서 무엇이 본론인지 알 수 없다.
  화면의 주된 행동만 `<Button/>`으로 두고, 내 것을 손보는 동작(고치기·멈추기·삭제)은
  `<ActionList/>` + `<ActionRow/>`로 묶는다. `ActionRow`는 `href`가 있으면 링크,
  없으면 감싼 `<form>`의 submit이다
- 알림은 **항상 종 아이콘**(`<Bell/>`). "알림" 텍스트로 노출하지 않는다
- 뒤로가기는 **히스토리로 돌아간다**(`<BackButton/>`). `AppBar`의 `back`은 링크로 바로
  들어왔을 때의 fallback일 뿐이다. 고정 경로로 두면 방 → 알림 → 뒤로 가 홈으로 튄다
- 프로필 선택 항목은 `lib/profileFields.ts`의 목록과 `parseExtras()`를 쓴다. 등록·수정·상세가
  같은 정의를 봐야 하고, 폼은 `<ProfileExtraFields/>` 하나로 공유한다
- 목록 필터는 `<Tabs/>`로 링크 이동해서 서버에서 거른다. 클라이언트 상태를 만들지 않는다.
  **탭 이동은 `replace`다** - 같은 화면의 상태 변경이라 히스토리에 쌓이면 뒤로가기가
  필터를 거슬러 올라간다
- 아이콘은 24×24 그리드, stroke 1.6, `currentColor` (`components/ui/icons.tsx`)
- 한글 문단에는 `kr` 클래스를 붙인다 (단어 중간 줄바꿈 방지)
- 숫자에는 `mark` 클래스 (tabular-nums)
- 기본은 서버 컴포넌트. 폼은 Server Action

**브랜드 자산**

로고와 파비콘은 리포에 둔다. S3는 사용자가 올린 사진 전용이다.

| 파일 | 용도 |
|---|---|
| `app/icon.png` | 파비콘. Next.js가 자동으로 주입한다 |
| `app/apple-icon.png` | iOS 홈화면 |
| `public/brand/logo.png` | 앱 내 워드마크 (`components/Logo.tsx`) |
| `brand/logo-source.png` | 마스터. 아이콘 재생성용, 배포 이미지에는 안 들어간다 |

## 배포에서 밟은 지뢰

전부 로컬에서는 안 나고 CI·운영에서만 나는 것들이다. 같은 자리를 다시 밟지 않도록 적어둔다.

**푸시하기 전에 Docker로 빌드해본다.** CI를 디버거로 쓰면 한 번에 3분씩 태운다.

```shell
docker build -t handari:verify .
docker run --rm -p 3100:3000 \
  -e DATABASE_URL=... -e AUTH_SECRET=... -e ORIGIN_VERIFY_SECRET=아무값 \
  handari:verify
```

`ORIGIN_VERIFY_SECRET`을 **반드시 넣고** 띄운다. 로컬 dev에는 이 값이 없어서 `proxy.ts`가
no-op이고, 그래서 오리진 검증과 얽힌 버그는 로컬에서 절대 재현되지 않는다.

**lockfile은 리눅스에서 만든다.** macOS의 `npm install`은 `@img/sharp-wasm32`가 요구하는
`@emnapi/runtime`을 lock에 넣지 않는다. 리눅스의 `npm ci`가 거부한다.

```shell
docker run --rm -v "$PWD":/w -w /w node:22-alpine npm install --package-lock-only
```

**빌드 시점에 DB에 붙지 않는다.** 커넥션 풀은 `getPool()`로 첫 쿼리 때 만든다. 모듈 로드
시점에 만들면 `next build`가 라우트 설정을 수집하며 파일을 평가할 때 `DATABASE_URL`이 없어
빌드가 깨진다 - CI와 Docker 빌드에는 그 값이 없다.

**`proxy.ts`의 matcher에서 정적 자산을 뺀다.** 이미지 최적화기가 `public/` 파일을 자기
자신에게 다시 요청하는데 그 내부 요청에는 `x-origin-verify` 헤더가 없다. 막으면 이미지가
400으로 깨진다.

**compose의 `handari-network`는 `external: true`다.** `deploy-handari.sh`가 먼저 만들기
때문에, compose가 소유권을 주장하면 "incorrect label"로 배포가 막힌다.

**AWS 작업은 EC2 인스턴스 역할로 한다.** `tium` IAM 사용자 키에는 ACM·Route 53 권한이 없다
(`implicitDeny`). 인스턴스 역할 `tium-ec2`에는 다 있다.

```shell
ssh tium
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY   # 인스턴스 역할을 쓰게 한다
```

## 깨뜨리면 안 되는 것

`PRODUCT.md`에 근거가 있는 것들이다. 고치기 전에 명세를 먼저 확인한다.

1. **초대 링크와 카드 가져가기 링크는 1회성 + 24시간이다** (PRODUCT 7, 24). 만료 판정은 배치가 아니라 **조회 시점에** `expires_at`으로 한다
2. **링크 사용 처리는 트랜잭션 + 영향 행 수 1 검사로 한다.** 같은 링크로 두 명이 동시에 들어오는 경쟁을 막아야 한다
3. **`subject_user_id IS NULL` == 본인 미확인.** 별도 플래그를 만들지 않는다. 카드에 "본인 미확인" 배지가 붙는다 (PRODUCT 19)
4. **열람 게이트** - `room_member.unlocked_at`이 NULL이면 남의 카드가 안 보인다. 등록하면 열리고, 한 번 열리면 다시 잠기지 않는다 (PRODUCT 9~11)
5. **소개 쉬기는 본인 선택이 주선자 선택보다 우선한다** (PRODUCT 51). 본인이 되돌린 카드를 주선자가 다시 멈출 수 없다.
   **"품절"이라는 말을 화면에 쓰지 않는다** - 사람을 물건으로 두는 표현이다. 상태는 `쉬는 중`,
   동작은 `소개 잠시 멈추기` / `다시 소개 시작하기`. DB의 `PAUSED`는 그대로 둔다
6. **거절 사유는 전달하지 않는다** (PRODUCT 23, 38). 지인 관계가 걸려 있다
7. **`UNWANTED`/`NOT_SELF` 신고는 접수 즉시 `HIDDEN`으로 바꾼다** (PRODUCT 59). 운영자를 기다리지 않는다
8. **초대자와 주선자는 다른 개념이다.** 초대자는 `room_member.invited_by_user_id`(방에
   데려온 사람), 주선자는 `profile.author_user_id`(카드를 쓴 사람). 자주 겹치지만 같지 않고,
   **다리 수는 두 관계를 모두 센다** (`lib/graph.ts`)
9. **관심을 거둬도 알림을 보내지 않는다.** "거둬졌다"는 통보는 받는 쪽에 좋을 게 없다.
   대신 받은 관심 목록 쿼리에서 `status <> 'CANCELED'`로 빼서 조용히 사라지게 한다
10. **`profile.status`의 `DRAFT`/`INVITED`는 MVP에서 쓰지 않는다.** 승인 게이트를 켤 때를 위해 enum에만 있다. 지우지 말 것
11. **`user.kakao_id`와 `user.kakaotalk_id`는 다른 값이다.** 앞은 카카오 로그인이 앱마다
    다르게 발급하는 회원번호라 카카오톡 친구찾기에 넣을 수 없다. 운영자가 연결할 때 쓰는 건
    뒤의 카톡 아이디이고, **선택 입력이라 비어 있을 수 있다.** 비면 닉네임으로 찾는다.
    회원번호를 "찾을 수 있는 값"처럼 화면에 띄우지 않는다
12. **본인 카드의 성별·출생연도는 계정(`user`) 값이 출처다** (PRODUCT 17). 등록·수정 화면에서
    묻지 않고 보여주기만 한다. `/me/edit`에서 고치면 `subject_user_id = 나`인 카드가 한
    트랜잭션에서 같이 바뀐다. 카드마다 따로 받으면 내 정보와 카드의 나이가 갈라진다.
    나이 계산과 하한(만 19세)은 `lib/age.ts` 한 곳에만 둔다

## 승인 게이트 (아직 없음)

MVP에는 본인 승인 대기가 없다. 등록하면 바로 공개된다. 나중에 켤 때 필요한 건 이것뿐이다 - 마이그레이션 없음.

1. 등록 시 시작 상태를 `ACTIVE` → `DRAFT`로
2. 조회 계층에 "`DRAFT`/`INVITED`는 `author_user_id` 본인에게만" 스코프 추가
3. 가져가기 링크 화면에 승인/거절 버튼 추가

## 인프라

tium 프로젝트(Java/Spring)와 **EC2 호스트·RDS 인스턴스만** 공유한다. 그 외에는 전부 분리돼 있다.

**tium 자원은 절대 건드리지 않는다.** 언제든 지워도 tium에 흔적이 남지 않아야 한다. 이 원칙 때문에 이렇게 돼 있다:

- DB는 `handari` 데이터베이스 + 전용 계정. `tium` DB가 보이지 않는다
- Docker 네트워크는 `handari-network`. `tium-network`에 붙지 않는다
- tium의 nginx를 거치지 않는다. CloudFront가 EC2:3000으로 직접 온다 (`proxy.ts`가 오리진 검증)
- S3는 전용 버킷 `handari-uploads`. tium 버킷과 크레덴셜을 쓰지 않는다

기타

- 시크릿은 SSM `/handari/prod/*`. 로컬은 `.env.local` (커밋 금지)
- 배포는 **master** push → GitHub Actions → Docker Hub → EC2. 블루/그린 없음
- 도메인 `handari.tium-care.com`
- 삭제: `ssh tium` 후 `/home/ubuntu/infra/teardown-handari.sh --yes`
- 자세한 건 `README.md`, 더 상세한 건 `TECH.md`(로컬 전용)
