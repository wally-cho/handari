-- 사진 여러 장.
--
-- profile.photo_key는 그대로 남는다. 대표 사진(첫 장)이고, 목록 카드의 썸네일이 그걸 쓴다.
-- 이 표는 **두 번째 이후의 사진만** 담는다. 대표 사진까지 여기 넣으면 같은 키가 두 곳에
-- 있게 되고, 어긋나도 컴파일러가 잡아주지 않는다.
--
-- 카드에 붙은 사진 = [profile.photo_key, ...profile_photo(sort_order 순)]

CREATE TABLE profile_photo (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  profile_id BIGINT       NOT NULL,
  photo_key  VARCHAR(300) NOT NULL,
  sort_order SMALLINT     NOT NULL,   -- 1부터. 0은 대표 사진(profile.photo_key)의 자리다
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_profile_photo_key (photo_key),
  KEY idx_profile_photo_profile (profile_id, sort_order),
  CONSTRAINT fk_profile_photo_profile FOREIGN KEY (profile_id) REFERENCES profile(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
