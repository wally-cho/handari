# 한다리 (Handari)

## 스택

TypeScript · Next.js 16 (App Router) · MySQL 8.4 · `mysql2` + 직접 쓴 SQL · Auth.js + Kakao

모바일 웹입니다. 네이티브 앱은 없고, 로그인은 카카오만, ORM은 쓰지 않습니다. 실시간 기능이 없어서(알림은 새로고침 기반, 채팅은 카카오톡) 별도 백엔드 없이 Next.js 서버 사이드만으로 처리합니다.

## 개발

로컬 DB는 두지 않습니다. RDS를 개발에도 그대로 쓰고, VPC 내부 전용이라 SSH 터널을 거칩니다.

```shell
npm install
npm run tunnel   # 터미널 1 — 켜둔 채로 (없으면 DB에 못 붙습니다)
npm run dev      # 터미널 2 — http://localhost:3000
```

환경변수는 `.env.local` 한 파일에 있습니다(커밋 제외). 원본은 AWS SSM `/handari/prod/*`이고 `ssh tium`에서 조회할 수 있습니다.

```shell
npm run migrate         # migrations/*.sql 중 미적용분 적용
npm run migrate:status  # 적용 현황

npm run seed            # 테스트 데이터 생성 + 페이지 쿼리 전수 검증
npm run seed:clean      # 시드 데이터만 삭제

npm run typecheck
npm run lint
npm run format
npm run build
```

`npm run seed`를 돌리면 테스트 방과 사람 3명, 카드 3장이 생기고 초대 링크가 출력됩니다. 그 링크로 들어가면 카카오 로그인 후 바로 방을 볼 수 있습니다.

ORM이 없어서 SQL 오류는 실행해봐야만 잡힙니다. **쿼리를 고쳤으면 `npm run seed`를 돌려주세요.** 이게 사실상의 테스트입니다.

## 디자인 시스템

토스 계열. 흰 바탕, 회색 필(fill)로 묶고, **주홍 `#FD4E43`은 액션에만** 씁니다. 브랜드 컬러는 로고에서 뽑았습니다.

프리미티브는 `components/ui`에 모여 있습니다. 화면을 만들 때 여기서 먼저 찾고, 없으면 여기에 추가합니다 — 페이지에 유틸리티 클래스를 직접 뿌리지 않습니다.

```tsx
import { Button, ButtonLink, Field, Input, Select, Textarea, ChoiceGroup,
         Card, Box, PageTitle, SectionTitle, Caption, Badge, ListRow,
         EmptyState, Notice, Bell } from '@/components/ui';
```

색은 `app/globals.css`의 토큰만 씁니다. 텍스트는 `ink` / `ink-2` / `ink-3` 3단, 상태는 `alert` / `warn` / `good`. 자세한 규칙은 [AGENTS.md](./AGENTS.md).

브랜드 자산은 리포에 둡니다. S3는 사용자가 올린 사진 전용입니다.

| 파일 | 용도 |
|---|---|
| `app/icon.png` | 파비콘. Next.js가 자동 주입 |
| `app/apple-icon.png` | iOS 홈화면 |
| `public/brand/logo.png` | 앱 내 워드마크 |
| `brand/logo-source.png` | 마스터. 배포 이미지에는 안 들어감 |

## 구조

```
app/              화면과 라우트 (App Router)
  api/            Route Handler — auth, health, cron, photos
lib/
  db.ts           mysql2 풀 + query / queryOne / execute / transaction
  types.ts        테이블 행 타입. 스키마의 유일한 TS 출처
  session.ts      getCurrentUser / requireUser
  graph.ts        다리 수 BFS
  photos.ts       사진 저장 (로컬 파일 / S3 두 백엔드)
  notify.ts       알림
components/
  ui/             디자인 시스템 프리미티브 + 아이콘
  AppBar          상단 바 + 알림 종
  ProfileCard     카드
  ShareLink       링크 복사 (클라이언트)
  Logo            워드마크
migrations/       SQL 파일. 손으로 쓰고 npm run migrate 로 적용
infra/            EC2에 두는 배포·삭제 파일
scripts/          마이그레이션 러너, 시드
proxy.ts          CloudFront 오리진 검증
```

작업 규칙과 깨뜨리면 안 되는 불변식은 [AGENTS.md](./AGENTS.md)에 있습니다.

## 데이터 모델

| 테이블 | 역할 |
|---|---|
| `user` | 카카오로 로그인한 사람 |
| `room` | 폐쇄된 방. 방이 곧 매칭 풀 |
| `room_invite` | 멤버 각자가 발급하는 1회성 초대 링크 (24시간) |
| `room_member` | 방 참여. `invited_by_user_id`가 관계 그래프의 절반 |
| `profile` | 카드. `subject_user_id`가 NULL이면 "본인 미확인" |
| `interest` | 관심 요청 (7일 만료) |
| `connection` | 운영자 수동 중개 대기열 |
| `notification` | 앱 안 알림함 (90일 보관) |
| `report` | 신고 |

### 다리 수

방 안의 관계 엣지는 두 종류입니다. 둘 다 무방향으로 봅니다.

1. **초대 엣지** — 누가 누구를 초대 링크로 데려왔는가
2. **등록 엣지** — 누가 누구의 카드를 만들었는가 (본인이 가져간 카드만)

내 user에서 BFS로 최단 거리를 구합니다. SQL 재귀 CTE를 쓰지 않고 방의 엣지를 전부 읽어 메모리에서 돕니다 — 방이 수백 명이면 쿼리 한 번 + O(V+E)로 끝나고, 재귀 CTE보다 단순하고 디버깅이 쉽습니다.

아직 아무도 가져가지 않은 카드는 대응하는 user 노드가 없어서 주선자를 경유해 셉니다(`주선자까지 거리 + 1`).

## 인프라

tium 프로젝트와 **EC2 호스트·RDS 인스턴스만** 공유하고 나머지는 전부 분리돼 있습니다. **tium 자원은 하나도 건드리지 않습니다.**

| | |
|---|---|
| 데이터베이스 | `handari` DB + 전용 계정. `tium` DB가 보이지 않음 |
| Docker 네트워크 | `handari-network`. `tium-network`에 붙지 않음 |
| 프록시 | tium의 nginx를 거치지 않음. CloudFront → EC2:3000 직접 |
| 스토리지 | 전용 버킷 `handari-uploads`. 퍼블릭 접근 차단 |
| 시크릿 | SSM `/handari/prod/*` |

사진은 스토리지에서 직접 공개하지 않고 항상 앱을 거쳐 서빙합니다(`/api/photos/[...key]`). 신고로 가려진 카드의 사진이 즉시 막히고, 버킷을 비공개로 둘 수 있습니다.

### 배포

`master`에 push하면 배포됩니다.

```
push → Docker Hub → EC2 SSH → deploy-handari.sh → 헬스체크
```

배포 알림은 보내지 않습니다 — 쓸 수 있는 Slack 웹훅이 tium 서버 알림 채널뿐이라 로그가 섞입니다. 실패하면 GitHub이 리포 소유자에게 메일을 보냅니다.

`infra/deploy-handari.sh`가 SSM에서 환경변수를 받아 `handari.env`를 만듭니다. **이미지에는 시크릿이 들어가지 않습니다.** 블루/그린은 하지 않습니다 — 재시작 몇 초 동안 502가 나지만 취미 프로젝트라 감수합니다. 빌드는 GitHub Actions에서만 합니다(EC2 메모리가 2GB뿐이라 거기서 빌드하면 tium이 위험합니다).

### 삭제

```shell
ssh tium
/home/ubuntu/infra/teardown-handari.sh          # 지울 것만 출력
/home/ubuntu/infra/teardown-handari.sh --yes    # 실제 삭제
```

AWS 자원까지 전부 지웁니다 — 컨테이너·이미지·도커 네트워크·EC2 파일·crontab·SSM 파라미터·S3 버킷·DB와 계정·보안그룹 규칙·Route 53 레코드·CloudFront 배포·ACM 인증서.

이름에 `tium`이 들어간 대상은 건너뛰는 안전장치가 걸려 있고, 보안그룹은 3000 포트 규칙만 지웁니다. 손으로 해야 하는 건 GitHub 리포, Docker Hub 리포지토리, 카카오 앱뿐이고 스크립트가 마지막에 목록으로 알려줍니다.
