// 나이는 한 곳에서만 센다.
//
// 계정과 카드는 같은 사람인데 화면마다 다른 값이 나오면 어느 쪽이 맞는지 알 수 없다.
// 본인 카드의 출생연도·성별은 입력받지 않고 계정 값을 그대로 쓴다 (PRODUCT 16).

/** 만 19세 미만은 가입할 수 없다 (PRODUCT 3) */
export const MIN_AGE = 19;

/** 입력 하한. 이보다 앞선 연도는 오타로 본다 */
export const OLDEST_BIRTH_YEAR = 1950;

/**
 * 화면에 쓰는 나이. 연도 차이 + 1(세는 나이)로 센다.
 * 생일을 받지 않으므로 만 나이는 계산할 수 없고, 자기신고라 정밀도보다 일관성이 중요하다.
 */
export function ageOf(birthYear: number): number {
  return new Date().getFullYear() - birthYear + 1;
}

/** 입력 폼의 max. 올해 기준 만 19세가 되는 해 */
export function latestBirthYear(): number {
  return new Date().getFullYear() - MIN_AGE;
}

/** 형식이 맞는 연도인지. 나이 하한은 따로 본다 - 안내 문구가 다르다 */
export function isBirthYearShaped(birthYear: number): boolean {
  return (
    Number.isInteger(birthYear) &&
    birthYear >= OLDEST_BIRTH_YEAR &&
    birthYear <= new Date().getFullYear()
  );
}

/** 만 19세 이상인지. 연 나이로 본다 - 자기신고라 정밀도보다 명확함이 낫다 */
export function isAdult(birthYear: number): boolean {
  return new Date().getFullYear() - birthYear >= MIN_AGE;
}
