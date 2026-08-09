-- 한다리 초기 스키마
-- 적용: mysql -h 127.0.0.1 -P 13306 -u handari -p handari < migrations/001_init.sql
-- (먼저 SSH 터널을 열 것)
--
-- 시각은 전부 UTC로 저장한다. 앱이 세션 타임존을 +00:00으로 맞춘다 (lib/db.ts).

SET time_zone = '+00:00';

-- ─────────────────────────────────────────────────────────────
-- user - 카카오로 로그인한 사람
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user` (
  id                      BIGINT       NOT NULL AUTO_INCREMENT,
  kakao_id                VARCHAR(64)  NOT NULL,
  nickname                VARCHAR(50)  NOT NULL,
  kakao_profile_image_url VARCHAR(500) NULL,
  -- 카카오에서 연령/성별을 받으려면 비즈 앱 전환이 필요해서 직접 입력받는다 (PRODUCT 3)
  birth_year              SMALLINT     NULL,
  gender                  ENUM('MALE','FEMALE') NULL,
  age_verified_at         DATETIME     NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at              DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_kakao_id (kakao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- room - 폐쇄된 방. 방이 곧 매칭 풀이다
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  owner_user_id BIGINT       NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_room_owner (owner_user_id),
  CONSTRAINT fk_room_owner FOREIGN KEY (owner_user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- room_invite - 멤버 각자가 발급하는 1회성 초대 링크 (PRODUCT 7)
--   링크 하나 = 사람 한 명. 그래야 누가 누구를 데려왔는지 남고
--   다리 수 계산의 "초대 엣지"가 만들어진다.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_invite (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  room_id         BIGINT      NOT NULL,
  inviter_user_id BIGINT      NOT NULL,
  token           VARCHAR(64) NOT NULL,
  expires_at      DATETIME    NOT NULL,          -- 발급 + 24시간
  used_by_user_id BIGINT      NULL,
  used_at         DATETIME    NULL,
  revoked_at      DATETIME    NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_room_invite_token (token),
  KEY idx_room_invite_inviter (inviter_user_id),
  KEY idx_room_invite_room_exp (room_id, expires_at),
  CONSTRAINT fk_invite_room    FOREIGN KEY (room_id)         REFERENCES room(id),
  CONSTRAINT fk_invite_inviter FOREIGN KEY (inviter_user_id) REFERENCES `user`(id),
  CONSTRAINT fk_invite_used_by FOREIGN KEY (used_by_user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- room_member - 방 참여. invited_by_user_id 가 "초대 엣지"
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_member (
  id                 BIGINT   NOT NULL AUTO_INCREMENT,
  room_id            BIGINT   NOT NULL,
  user_id            BIGINT   NOT NULL,
  invited_by_user_id BIGINT   NULL,               -- 방장은 NULL
  role               ENUM('OWNER','MEMBER')  NOT NULL DEFAULT 'MEMBER',
  status             ENUM('ACTIVE','KICKED') NOT NULL DEFAULT 'ACTIVE',
  unlocked_at        DATETIME NULL,               -- 열람 게이트 해제 (PRODUCT 9~11)
  joined_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_room_member (room_id, user_id),
  KEY idx_room_member_user (user_id),
  KEY idx_room_member_inviter (invited_by_user_id),
  CONSTRAINT fk_member_room    FOREIGN KEY (room_id)            REFERENCES room(id),
  CONSTRAINT fk_member_user    FOREIGN KEY (user_id)            REFERENCES `user`(id),
  CONSTRAINT fk_member_inviter FOREIGN KEY (invited_by_user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- profile - 카드
--   DRAFT/INVITED는 MVP에서 쓰지 않는다. 승인 게이트를 켤 때를 대비해
--   enum에만 미리 넣어둔다 (그때 마이그레이션이 필요 없도록).
--   subject_user_id IS NULL == "본인 미확인"
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile (
  id                     BIGINT       NOT NULL AUTO_INCREMENT,
  room_id                BIGINT       NOT NULL,
  author_user_id         BIGINT       NOT NULL,   -- 주선자
  subject_user_id        BIGINT       NULL,       -- 카드를 가져가면 채워진다
  status                 ENUM('DRAFT','INVITED','ACTIVE','PAUSED','HIDDEN','DELETED')
                                      NOT NULL DEFAULT 'ACTIVE',
  display_name           VARCHAR(50)  NOT NULL,
  gender                 ENUM('MALE','FEMALE') NOT NULL,
  birth_year             SMALLINT     NOT NULL,
  region                 VARCHAR(50)  NOT NULL,
  job                    VARCHAR(100) NULL,
  recommendation         TEXT         NULL,       -- 주선자 추천사. 친구 등록 시 필수(20자+)
  self_intro             TEXT         NULL,
  photo_key              VARCHAR(300) NULL,       -- S3 key
  consent_type           ENUM('SELF','OFFLINE_CONFIRMED','APPROVED_IN_APP') NOT NULL,
  consent_confirmed_at   DATETIME     NULL,       -- "친구에게 이야기했어요" 체크 시각
  claim_token            VARCHAR(64)  NULL,       -- 가져가기 링크. 1회성
  claim_token_expires_at DATETIME     NULL,       -- 발급 + 24시간
  claimed_at             DATETIME     NULL,
  paused_at              DATETIME     NULL,
  paused_by              ENUM('SELF','MATCHMAKER') NULL,
  hidden_at              DATETIME     NULL,       -- 신고로 자동 비공개
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at             DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_profile_claim_token (claim_token),
  KEY idx_profile_room_status (room_id, status),
  KEY idx_profile_subject (subject_user_id),
  KEY idx_profile_author (author_user_id),
  CONSTRAINT fk_profile_room    FOREIGN KEY (room_id)         REFERENCES room(id),
  CONSTRAINT fk_profile_author  FOREIGN KEY (author_user_id)  REFERENCES `user`(id),
  CONSTRAINT fk_profile_subject FOREIGN KEY (subject_user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- interest - 관심 요청
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interest (
  id                 BIGINT   NOT NULL AUTO_INCREMENT,
  room_id            BIGINT   NOT NULL,
  from_user_id       BIGINT   NOT NULL,
  to_profile_id      BIGINT   NOT NULL,
  status             ENUM('PENDING','ACCEPTED','DECLINED','EXPIRED','CONNECTED')
                              NOT NULL DEFAULT 'PENDING',
  matchmaker_comment TEXT     NULL,
  expires_at         DATETIME NOT NULL,           -- 생성 + 7일
  responded_at       DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_interest_to (to_profile_id, status),
  KEY idx_interest_from (from_user_id, status),
  KEY idx_interest_pending_exp (status, expires_at),
  CONSTRAINT fk_interest_room    FOREIGN KEY (room_id)       REFERENCES room(id),
  CONSTRAINT fk_interest_from    FOREIGN KEY (from_user_id)  REFERENCES `user`(id),
  CONSTRAINT fk_interest_profile FOREIGN KEY (to_profile_id) REFERENCES profile(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- connection - 운영자 수동 중개 대기열 (PRODUCT 44)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connection (
  id            BIGINT   NOT NULL AUTO_INCREMENT,
  interest_id   BIGINT   NOT NULL,
  status        ENUM('PENDING','DONE') NOT NULL DEFAULT 'PENDING',
  operator_note TEXT     NULL,
  connected_at  DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_connection_interest (interest_id),
  KEY idx_connection_status (status),
  CONSTRAINT fk_connection_interest FOREIGN KEY (interest_id) REFERENCES interest(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- notification - 앱 안 알림함. 실시간 아님, 새로고침 시 갱신 (PRODUCT 54)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  user_id    BIGINT      NOT NULL,
  type       VARCHAR(50) NOT NULL,
  payload    JSON        NULL,
  read_at    DATETIME    NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notification_user (user_id, read_at),
  KEY idx_notification_created (created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- report - 신고. UNWANTED/NOT_SELF는 접수 즉시 HIDDEN 처리 (PRODUCT 59)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report (
  id               BIGINT   NOT NULL AUTO_INCREMENT,
  profile_id       BIGINT   NOT NULL,
  reporter_user_id BIGINT   NOT NULL,
  reason           ENUM('FALSE_INFO','NOT_SELF','UNWANTED','OFFENSIVE','ETC') NOT NULL,
  detail           TEXT     NULL,
  status           ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_report_status (status),
  KEY idx_report_profile (profile_id),
  CONSTRAINT fk_report_profile  FOREIGN KEY (profile_id)       REFERENCES profile(id),
  CONSTRAINT fk_report_reporter FOREIGN KEY (reporter_user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────
-- schema_migration - 적용 이력. 자동 러너는 없다. 손으로 남긴다
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migration (
  version    VARCHAR(50) NOT NULL,
  applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migration (version) VALUES ('001_init')
  ON DUPLICATE KEY UPDATE version = version;
