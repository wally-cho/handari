-- 본인 확인된 카드의 성별·출생연도를 계정 값에 맞춘다 (PRODUCT 17).
--
-- 지금까지는 등록·수정 화면에서 카드마다 따로 받았다. 계정 값이 기본값으로 채워지긴 했지만
-- 고칠 수 있었고, 그래서 내 정보의 나이와 내 카드의 나이가 갈라진 카드가 남아 있다.
-- 어느 쪽이 맞는지 알 방법이 없으므로 계정을 출처로 삼아 한 번 정렬한다.
--
-- 앞으로는 화면에서 아예 묻지 않고, /me/edit에서 고치면 여기 카드가 같이 갱신된다.
-- 친구 카드(subject_user_id IS NULL)는 계정이 없으니 건드리지 않는다.

SET time_zone = '+00:00';

UPDATE profile p
  JOIN `user` u ON u.id = p.subject_user_id
   SET p.birth_year = u.birth_year,
       p.gender     = u.gender
 WHERE p.deleted_at IS NULL
   AND u.birth_year IS NOT NULL
   AND u.gender IS NOT NULL
   AND (p.birth_year <> u.birth_year OR p.gender <> u.gender);
