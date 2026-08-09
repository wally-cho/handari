-- 관심 표시를 보낸 사람이 되돌릴 수 있게 한다.
--
-- EXPIRED로 뭉뚱그리면 "시간이 지나 사라진 것"과 "보낸 사람이 거둔 것"이 구분되지 않는다.
-- 받은 쪽 화면에 다르게 보여야 해서 상태를 따로 둔다.

SET time_zone = '+00:00';

ALTER TABLE interest
  MODIFY COLUMN status
    ENUM('PENDING','ACCEPTED','DECLINED','EXPIRED','CONNECTED','CANCELED')
    NOT NULL DEFAULT 'PENDING';
