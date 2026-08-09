#!/usr/bin/env node
// 개발용 시드 + 스모크 테스트.
//
//   npm run seed        테스트 방/사람/카드를 만들고, 페이지의 모든 쿼리를 실제로 돌려본다
//   npm run seed:clean  시드로 만든 것만 지운다
//
// 생 SQL을 쓰기 때문에 문법·컬럼 오류는 실행해봐야만 잡힌다. 그걸 여기서 잡는다.
// 시드 사용자는 kakao_id가 'seed:'로 시작한다. 정리는 그걸 기준으로 한다.

import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';

const clean = process.argv.includes('--clean');
const SEED_PREFIX = 'seed:';

const conn = await mysql
  .createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' })
  .catch((e) => {
    console.error('DB 접속 실패:', e.message);
    console.error('\nSSH 터널이 열려 있나요?  npm run tunnel');
    process.exit(1);
  });
await conn.query("SET time_zone = '+00:00'");

const q = async (sql, params = []) => (await conn.execute(sql, params))[0];
const token = () => randomBytes(24).toString('base64url');

// ── 정리 ──────────────────────────────────────────────
async function cleanup() {
  const users = await q('SELECT id FROM `user` WHERE kakao_id LIKE ?', [`${SEED_PREFIX}%`]);
  const rooms = await q('SELECT id FROM room WHERE name LIKE ?', ['[시드]%']);
  if (users.length === 0 && rooms.length === 0) return console.log('지울 시드 데이터가 없어요.');

  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length) {
    const ph = roomIds.map(() => '?').join(',');
    await q(
      `DELETE c FROM connection c JOIN interest i ON i.id=c.interest_id WHERE i.room_id IN (${ph})`,
      roomIds,
    );
    await q(`DELETE FROM interest WHERE room_id IN (${ph})`, roomIds);
    await q(
      `DELETE r FROM report r JOIN profile p ON p.id=r.profile_id WHERE p.room_id IN (${ph})`,
      roomIds,
    );
    await q(`DELETE FROM profile WHERE room_id IN (${ph})`, roomIds);
    await q(`DELETE FROM room_invite WHERE room_id IN (${ph})`, roomIds);
    await q(`DELETE FROM room_member WHERE room_id IN (${ph})`, roomIds);
    await q(`DELETE FROM room WHERE id IN (${ph})`, roomIds);
  }
  if (users.length) {
    const ph = users.map(() => '?').join(',');
    const ids = users.map((u) => u.id);
    await q(`DELETE FROM notification WHERE user_id IN (${ph})`, ids);
    await q(`DELETE FROM \`user\` WHERE id IN (${ph})`, ids);
  }
  console.log(`정리 완료 - 사용자 ${users.length}명, 방 ${roomIds.length}개`);
}

if (clean) {
  await cleanup();
  await conn.end();
  process.exit(0);
}

await cleanup(); // 다시 돌려도 깨끗하게

// ── 시드 ──────────────────────────────────────────────
console.log('시드 만드는 중...\n');

async function addUser(name, year, gender) {
  const r = await q(
    'INSERT INTO `user` (kakao_id, nickname, birth_year, gender, age_verified_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',
    [`${SEED_PREFIX}${name}`, name, year, gender],
  );
  return r.insertId;
}

// 방장(민수) ─초대─ 지영 ─초대─ 태현
const minsu = await addUser('김민수', 1993, 'MALE');
const jiyoung = await addUser('박지영', 1995, 'FEMALE');
const taehyun = await addUser('이태현', 1992, 'MALE');

const room = await q('INSERT INTO room (name, owner_user_id) VALUES (?,?)', [
  '[시드] 한다리 테스트 방',
  minsu,
]);
const roomId = room.insertId;

await q(
  "INSERT INTO room_member (room_id,user_id,invited_by_user_id,role,unlocked_at) VALUES (?,?,NULL,'OWNER',UTC_TIMESTAMP())",
  [roomId, minsu],
);
await q(
  "INSERT INTO room_member (room_id,user_id,invited_by_user_id,role,unlocked_at) VALUES (?,?,?,'MEMBER',UTC_TIMESTAMP())",
  [roomId, jiyoung, minsu],
);
await q(
  "INSERT INTO room_member (room_id,user_id,invited_by_user_id,role,unlocked_at) VALUES (?,?,?,'MEMBER',UTC_TIMESTAMP())",
  [roomId, taehyun, jiyoung],
);

async function addProfile(author, subject, name, year, gender, region, job, rec, claimed) {
  const r = await q(
    `INSERT INTO profile (room_id,author_user_id,subject_user_id,status,display_name,gender,birth_year,region,job,
       recommendation,consent_type,consent_confirmed_at,claim_token,claim_token_expires_at,claimed_at)
     VALUES (?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,?)`,
    [
      roomId,
      author,
      subject,
      name,
      gender,
      year,
      region,
      job,
      rec,
      subject === author ? 'SELF' : 'OFFLINE_CONFIRMED',
      subject === author ? null : new Date(),
      claimed ? null : token(),
      claimed ? null : new Date(Date.now() + 86400_000),
      claimed ? new Date() : null,
    ],
  );
  return r.insertId;
}

const pJiyoung = await addProfile(
  jiyoung,
  jiyoung,
  '박지영',
  1995,
  'FEMALE',
  '서울',
  '디자이너',
  null,
  true,
);
await addProfile(taehyun, taehyun, '이태현', 1992, 'MALE', '경기', '개발자', null, true);
// 민수가 소개한, 아직 안 가져간 카드 - "본인 미확인" 배지가 붙는다
const pSuyeon = await addProfile(
  minsu,
  null,
  '최수연',
  1996,
  'FEMALE',
  '서울',
  '마케터',
  '10년 본 친구인데 사람이 참 한결같아요. 말수는 적은데 챙길 건 다 챙기는 스타일이라 같이 있으면 편해요.',
  false,
);

await q(
  'INSERT INTO interest (room_id,from_user_id,to_profile_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))',
  [roomId, taehyun, pJiyoung],
);
await q('INSERT INTO notification (user_id,type,payload) VALUES (?,?,?)', [
  jiyoung,
  'INTEREST_RECEIVED',
  JSON.stringify({ profileId: pJiyoung }),
]);

// 방장이 만든, 아직 안 쓴 초대 링크 - 이걸로 직접 들어가볼 수 있다
const inviteToken = token();
await q(
  'INSERT INTO room_invite (room_id,inviter_user_id,token,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 24 HOUR))',
  [roomId, minsu, inviteToken],
);

// ── 스모크: 페이지들이 쓰는 쿼리를 실제로 돌려본다 ──────────────
console.log('쿼리 검증 중...\n');
const checks = [];
const check = async (label, fn) => {
  try {
    const out = await fn();
    checks.push([true, label, Array.isArray(out) ? `${out.length}행` : '']);
  } catch (e) {
    checks.push([false, label, e.message]);
  }
};

await check('홈 - 내 방 목록', () =>
  q(
    `SELECT r.*, (SELECT COUNT(*) FROM room_member m2 WHERE m2.room_id=r.id AND m2.status='ACTIVE') AS member_count
       FROM room r JOIN room_member m ON m.room_id=r.id
      WHERE m.user_id=? AND m.status='ACTIVE' ORDER BY r.created_at DESC`,
    [minsu],
  ),
);

await check('방 홈 - 통계', () =>
  q(
    `SELECT (SELECT COUNT(*) FROM room_member WHERE room_id=? AND status='ACTIVE') AS members,
            (SELECT COUNT(*) FROM profile WHERE room_id=? AND status='ACTIVE' AND gender='MALE' AND deleted_at IS NULL) AS male,
            (SELECT COUNT(*) FROM profile WHERE room_id=? AND status='ACTIVE' AND gender='FEMALE' AND deleted_at IS NULL) AS female`,
    [roomId, roomId, roomId],
  ),
);

await check('방 홈 - 카드 목록', () =>
  q(
    `SELECT p.*, u.nickname AS author_nickname FROM profile p JOIN \`user\` u ON u.id=p.author_user_id
      WHERE p.room_id=? AND p.status='ACTIVE' AND p.deleted_at IS NULL ORDER BY p.updated_at DESC`,
    [roomId],
  ),
);

await check('그래프 - 초대 엣지', () =>
  q(
    `SELECT invited_by_user_id AS a, user_id AS b FROM room_member
      WHERE room_id=? AND status='ACTIVE' AND invited_by_user_id IS NOT NULL`,
    [roomId],
  ),
);

await check('그래프 - 등록 엣지', () =>
  q(
    `SELECT author_user_id AS a, subject_user_id AS b FROM profile
      WHERE room_id=? AND subject_user_id IS NOT NULL AND author_user_id<>subject_user_id
        AND deleted_at IS NULL AND status IN ('ACTIVE','PAUSED')`,
    [roomId],
  ),
);

await check('초대 링크 조회', () =>
  q(
    `SELECT i.*, r.name AS room_name, u.nickname AS inviter_nickname,
            (SELECT COUNT(*) FROM room_member m WHERE m.room_id=i.room_id AND m.status='ACTIVE') AS member_count
       FROM room_invite i JOIN room r ON r.id=i.room_id JOIN \`user\` u ON u.id=i.inviter_user_id
      WHERE i.token=?`,
    [inviteToken],
  ),
);

await check('내 초대 링크 목록', () =>
  q(
    `SELECT i.id,i.token,i.expires_at,i.used_at,i.revoked_at,u.nickname AS used_by_nickname
       FROM room_invite i LEFT JOIN \`user\` u ON u.id=i.used_by_user_id
      WHERE i.room_id=? AND i.inviter_user_id=? ORDER BY i.created_at DESC LIMIT 30`,
    [roomId, minsu],
  ),
);

await check('카드 상세', () =>
  q(
    `SELECT p.*, u.nickname AS author_nickname, r.name AS room_name
       FROM profile p JOIN \`user\` u ON u.id=p.author_user_id JOIN room r ON r.id=p.room_id
      WHERE p.id=? AND p.deleted_at IS NULL`,
    [pSuyeon],
  ),
);

await check('가져가기 링크 조회', () =>
  q(`SELECT p.*, r.name AS room_name, u.nickname AS author_nickname
       FROM profile p JOIN room r ON r.id=p.room_id JOIN \`user\` u ON u.id=p.author_user_id
      WHERE p.claim_token IS NOT NULL AND p.deleted_at IS NULL LIMIT 1`),
);

await check('관심 - 받은 목록', () =>
  q(
    `SELECT i.*, p.display_name AS profile_name, u.nickname AS from_nickname,
            (p.subject_user_id=?) AS is_subject, au.nickname AS matchmaker_nickname,
            (SELECT fp.id FROM profile fp WHERE fp.room_id=i.room_id AND fp.subject_user_id=i.from_user_id
               AND fp.deleted_at IS NULL LIMIT 1) AS from_profile_id
       FROM interest i JOIN profile p ON p.id=i.to_profile_id
       JOIN \`user\` u ON u.id=i.from_user_id JOIN \`user\` au ON au.id=p.author_user_id
      WHERE (p.subject_user_id=? OR p.author_user_id=?) AND p.deleted_at IS NULL
      ORDER BY FIELD(i.status,'PENDING') DESC, i.created_at DESC LIMIT 50`,
    [jiyoung, jiyoung, jiyoung],
  ),
);

await check('관심 - 보낸 목록', () =>
  q(
    `SELECT i.*, p.display_name AS profile_name, p.room_id AS profile_room_id
       FROM interest i JOIN profile p ON p.id=i.to_profile_id
      WHERE i.from_user_id=? ORDER BY i.created_at DESC LIMIT 50`,
    [taehyun],
  ),
);

await check('마이페이지 - 내 카드', () =>
  q(
    `SELECT p.*, r.name AS room_name FROM profile p JOIN room r ON r.id=p.room_id
      WHERE p.subject_user_id=? AND p.deleted_at IS NULL AND p.status<>'DELETED' ORDER BY p.updated_at DESC`,
    [jiyoung],
  ),
);

await check('마이페이지 - 내가 소개한 사람', () =>
  q(
    `SELECT p.*, r.name AS room_name FROM profile p JOIN room r ON r.id=p.room_id
      WHERE p.author_user_id=? AND (p.subject_user_id IS NULL OR p.subject_user_id<>?)
        AND p.deleted_at IS NULL AND p.status<>'DELETED' ORDER BY p.created_at DESC`,
    [minsu, minsu],
  ),
);

await check('방 관리 - 멤버', () =>
  q(
    `SELECT m.id AS member_id,m.user_id,u.nickname,m.role,m.joined_at,iu.nickname AS invited_by_nickname,
            (SELECT COUNT(*) FROM profile p WHERE p.room_id=m.room_id AND p.subject_user_id=m.user_id AND p.deleted_at IS NULL) AS card_count
       FROM room_member m JOIN \`user\` u ON u.id=m.user_id LEFT JOIN \`user\` iu ON iu.id=m.invited_by_user_id
      WHERE m.room_id=? AND m.status='ACTIVE' ORDER BY m.joined_at ASC`,
    [roomId],
  ),
);

await check('운영자 - 연결 대기열', () =>
  q(`SELECT c.id AS connection_id,c.interest_id,c.status,c.created_at,fu.nickname AS from_nickname,fu.kakaotalk_id AS from_talk_id,
            p.display_name AS to_name,su.nickname AS to_nickname,su.kakaotalk_id AS to_talk_id,r.name AS room_name
       FROM connection c JOIN interest i ON i.id=c.interest_id JOIN \`user\` fu ON fu.id=i.from_user_id
       JOIN profile p ON p.id=i.to_profile_id JOIN room r ON r.id=p.room_id
       LEFT JOIN \`user\` su ON su.id=p.subject_user_id
      ORDER BY FIELD(c.status,'PENDING') DESC, c.created_at DESC LIMIT 50`),
);

await check('운영자 - 신고', () =>
  q(`SELECT rp.id,rp.reason,rp.detail,rp.status,rp.created_at,rp.profile_id,p.display_name,p.status AS profile_status,
            u.nickname AS reporter_nickname
       FROM report rp JOIN profile p ON p.id=rp.profile_id JOIN \`user\` u ON u.id=rp.reporter_user_id
      ORDER BY FIELD(rp.status,'OPEN') DESC, rp.created_at DESC LIMIT 50`),
);

await check('배치 - 미가져간 카드 리마인드', () =>
  q(`SELECT p.id,p.author_user_id FROM profile p
      WHERE p.claimed_at IS NULL AND p.deleted_at IS NULL AND p.status='ACTIVE'
        AND p.author_user_id <> COALESCE(p.subject_user_id,0)
        AND p.created_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)
        AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.user_id=p.author_user_id
                          AND n.type='CLAIM_REMINDER' AND JSON_EXTRACT(n.payload,'$.profileId')=p.id)`),
);

await check('사진 권한 조회', () =>
  q('SELECT room_id,status FROM profile WHERE photo_key=? AND deleted_at IS NULL', [
    'profiles/none.jpg',
  ]),
);

// ── 결과 ──────────────────────────────────────────────
const failed = checks.filter(([ok]) => !ok);
for (const [ok, label, note] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${note ? `  ${note}` : ''}`);
}

// 다리 수 검증: 민수(0) → 지영(1) → 태현(2), 미확인 카드는 주선자+1
const edges = [
  ...(await q(
    `SELECT invited_by_user_id a, user_id b FROM room_member WHERE room_id=? AND invited_by_user_id IS NOT NULL`,
    [roomId],
  )),
];
const adj = new Map();
for (const { a, b } of edges) {
  adj.set(a, [...(adj.get(a) ?? []), b]);
  adj.set(b, [...(adj.get(b) ?? []), a]);
}
const dist = new Map([[minsu, 0]]);
let frontier = [minsu],
  d = 0;
while (frontier.length) {
  d++;
  const next = [];
  for (const n of frontier)
    for (const m of adj.get(n) ?? [])
      if (!dist.has(m)) {
        dist.set(m, d);
        next.push(m);
      }
  frontier = next;
}
const degreeOk = dist.get(jiyoung) === 1 && dist.get(taehyun) === 2;
console.log(
  `  ${degreeOk ? '✓' : '✗'} 다리 수  민수→지영 ${dist.get(jiyoung)}, 민수→태현 ${dist.get(taehyun)}`,
);

console.log(`\n${'─'.repeat(50)}`);
if (failed.length) {
  console.log(`실패 ${failed.length}건`);
  for (const [, label, msg] of failed) console.log(`  ${label}: ${msg}`);
} else {
  console.log('쿼리 전부 정상');
}
console.log(`
시드 데이터
  방        [시드] 한다리 테스트 방 (id ${roomId})
  사람      김민수(방장) → 박지영 → 이태현
  카드      박지영, 이태현, 최수연(본인 미확인)
  관심      이태현 → 박지영 (대기중)

이 링크로 직접 들어가보세요 (1회용, 24시간):
  /join/${inviteToken}

정리:  npm run seed:clean
`);

await conn.end();
process.exit(failed.length ? 1 : 0);
