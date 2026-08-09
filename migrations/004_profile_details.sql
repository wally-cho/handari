-- 프로필 상세 항목을 늘린다. 전부 선택이다.
--
-- 원래는 "키·학교·연봉 같은 스펙은 넣지 않는다"였다. 추천사가 주인공이라는 전제를
-- 지키기 위해서였는데, 본인이 카드를 가져간 뒤 직접 고칠 수 있으므로 주선자가 모르는
-- 항목은 비워두면 된다. 그래서 넣기로 했다.
--
-- 다만 전부 NULL 허용이고 등록 화면에서는 접어둔다. 필수로 만들면 등록 마찰이 커지고
-- 그게 MVP 목표(등록 풀 확대)와 정면으로 부딪힌다.
--
-- 술은 "얼마나 자주"가 아니라 주량으로 받는다. 종류에 따라 단위가 달라서
-- 종류와 양을 나눠 저장하고 표시할 때 붙인다 — 소주 1병 / 맥주 3잔 / 소맥 5잔.
-- 담배는 O/X면 충분하다.

SET time_zone = '+00:00';

ALTER TABLE profile
  ADD COLUMN height       SMALLINT NULL AFTER mbti,
  ADD COLUMN drink_type   ENUM('NONE','SOJU','BEER','SOMAEK') NULL AFTER height,
  ADD COLUMN drink_amount SMALLINT NULL AFTER drink_type,
  ADD COLUMN smoking      TINYINT(1) NULL AFTER drink_amount,
  ADD COLUMN religion     ENUM('NONE','CHRISTIAN','CATHOLIC','BUDDHIST','ETC') NULL AFTER smoking,
  ADD COLUMN ideal_type   TEXT NULL AFTER religion;
