// 테이블 행 타입. ORM이 없으므로 여기가 유일한 출처다.
//
// !! migrations/*.sql 을 고칠 때 이 파일도 같이 고친다. !!
// 두 곳이 어긋나도 컴파일러가 잡아주지 않는다. 이 규칙이 유일한 방어다.

export type ProfileStatus =
  | 'DRAFT' // MVP 미사용. 승인 게이트를 켤 때 쓴다
  | 'INVITED' // MVP 미사용
  | 'ACTIVE'
  | 'PAUSED' // 소개 쉬는 중
  | 'HIDDEN' // 신고로 자동 비공개
  | 'DELETED';

export type Gender = 'MALE' | 'FEMALE';
export type DrinkType = 'NONE' | 'SOJU' | 'BEER' | 'SOMAEK';
export type Religion = 'NONE' | 'CHRISTIAN' | 'CATHOLIC' | 'BUDDHIST' | 'ETC';
export type ConsentType = 'SELF' | 'OFFLINE_CONFIRMED' | 'APPROVED_IN_APP';
export type PausedBy = 'SELF' | 'MATCHMAKER';
export type MemberRole = 'OWNER' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'KICKED';
export type InterestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED' // 7일 무응답
  | 'CANCELED' // 보낸 사람이 거둠
  | 'CONNECTED';
export type ConnectionStatus = 'PENDING' | 'DONE';
export type ReportReason = 'FALSE_INFO' | 'NOT_SELF' | 'UNWANTED' | 'OFFENSIVE' | 'ETC';
export type ReportStatus = 'OPEN' | 'RESOLVED';

export interface UserRow {
  id: number;
  /** 카카오 로그인이 주는 회원번호. 카카오톡 친구찾기에는 쓸 수 없다 */
  kakao_id: string;
  /** 카카오톡 아이디. 선택이고, 운영자가 연결할 때 찾는 단서다 */
  kakaotalk_id: string | null;
  nickname: string;
  kakao_profile_image_url: string | null;
  birth_year: number | null;
  gender: Gender | null;
  age_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface RoomRow {
  id: number;
  name: string;
  owner_user_id: number;
  created_at: Date;
  updated_at: Date;
}

/** 멤버 각자가 발급하는 1회성 초대 링크 (PRODUCT 7) */
export interface RoomInviteRow {
  id: number;
  room_id: number;
  inviter_user_id: number;
  token: string;
  expires_at: Date;
  used_by_user_id: number | null;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export interface RoomMemberRow {
  id: number;
  room_id: number;
  user_id: number;
  /** 이 사람을 데려온 사람. 다리 수 계산의 "초대 엣지" */
  invited_by_user_id: number | null;
  role: MemberRole;
  status: MemberStatus;
  /** 열람 게이트 해제 시각. NULL이면 남의 카드가 안 보인다 (PRODUCT 9~11) */
  unlocked_at: Date | null;
  joined_at: Date;
}

export interface ProfileRow {
  id: number;
  room_id: number;
  /** 주선자. 본인 등록이면 subject_user_id와 같다 */
  author_user_id: number;
  /** NULL이면 "본인 미확인" - 아직 아무도 가져가지 않은 카드 */
  subject_user_id: number | null;
  status: ProfileStatus;
  display_name: string;
  gender: Gender;
  birth_year: number;
  region: string;
  job: string | null;
  /** 아래는 전부 선택. 주선자가 모르면 비워두고 본인이 가져간 뒤 채운다 */
  hobbies: string | null;
  mbti: string | null;
  /** cm */
  height: number | null;
  drink_type: DrinkType | null;
  /** 종류에 따라 단위가 다르다 - 소주 병, 맥주·소맥 잔 */
  drink_amount: number | null;
  /** mysql2가 tinyint(1)을 boolean으로 준다 */
  smoking: boolean | null;
  religion: Religion | null;
  ideal_type: string | null;
  /** 주선자 추천사. 카드의 주인공 (PRODUCT 15) */
  recommendation: string | null;
  self_intro: string | null;
  photo_key: string | null;
  consent_type: ConsentType;
  consent_confirmed_at: Date | null;
  claim_token: string | null;
  claim_token_expires_at: Date | null;
  claimed_at: Date | null;
  paused_at: Date | null;
  paused_by: PausedBy | null;
  hidden_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface InterestRow {
  id: number;
  room_id: number;
  from_user_id: number;
  to_profile_id: number;
  status: InterestStatus;
  matchmaker_comment: string | null;
  expires_at: Date;
  responded_at: Date | null;
  created_at: Date;
}

export interface ConnectionRow {
  id: number;
  interest_id: number;
  status: ConnectionStatus;
  operator_note: string | null;
  connected_at: Date | null;
  created_at: Date;
}

export type NotificationType =
  | 'INVITE_ACCEPTED' // 내 초대 링크로 들어왔어요
  | 'CARD_CLAIMED' // 친구분이 카드를 가져갔어요
  | 'CARD_DROPPED' // 친구분이 카드를 내렸어요
  | 'INTEREST_RECEIVED' // 관심이 왔어요
  | 'INTEREST_UNCLAIMED' // 친구분이 아직 카드를 안 가져갔어요
  | 'MATCHMAKER_COMMENT' // 주선자가 한마디 남겼어요
  | 'INTEREST_ACCEPTED'
  | 'INTEREST_DECLINED'
  | 'INTEREST_EXPIRED'
  | 'CONNECTION_PENDING'
  | 'CONNECTION_DONE'
  | 'PAUSED_BY_MATCHMAKER'
  | 'CLAIM_REMINDER'; // 배치가 보내는 리마인드

export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  payload: Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
}

export interface ReportRow {
  id: number;
  profile_id: number;
  reporter_user_id: number;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  created_at: Date;
}

export interface SchemaMigrationRow {
  version: string;
  applied_at: Date;
}
