-- 취미와 MBTI를 프로필에 추가한다.
--
-- 둘 다 선택 항목이고, 스펙이 아니라 대화거리다.
-- 키·학교·연봉 같은 스펙은 여전히 넣지 않는다 (PRODUCT 14) — 추천사가 주인공이라는
-- 전제가 무너진다.

SET time_zone = '+00:00';

ALTER TABLE profile
  ADD COLUMN hobbies VARCHAR(200) NULL AFTER job,
  ADD COLUMN mbti CHAR(4) NULL AFTER hobbies;
