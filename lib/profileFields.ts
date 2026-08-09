import type { DrinkType, Religion } from '@/lib/types';

// 프로필 선택지와 표시 문구를 한곳에 모은다.
// 등록·수정·상세 세 화면이 같은 목록을 써야 해서, 흩어놓으면 반드시 어긋난다.

export const REGIONS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '대전',
  '광주',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;

export const MBTI_TYPES = [
  'ISTJ','ISFJ','INFJ','INTJ',
  'ISTP','ISFP','INFP','INTP',
  'ESTP','ESFP','ENFP','ENTP',
  'ESTJ','ESFJ','ENFJ','ENTJ',
] as const;

/** 술은 "얼마나 자주"가 아니라 주량으로 받는다. 종류마다 단위가 다르다 */
export const DRINK_TYPES: { value: DrinkType; label: string; unit: string }[] = [
  { value: 'NONE', label: '안 마심', unit: '' },
  { value: 'SOJU', label: '소주', unit: '병' },
  { value: 'BEER', label: '맥주', unit: '잔' },
  { value: 'SOMAEK', label: '소맥', unit: '잔' },
];

export const RELIGIONS: { value: Religion; label: string }[] = [
  { value: 'NONE', label: '무교' },
  { value: 'CHRISTIAN', label: '기독교' },
  { value: 'CATHOLIC', label: '천주교' },
  { value: 'BUDDHIST', label: '불교' },
  { value: 'ETC', label: '기타' },
];

/** "소주 1병" / "안 마심" / null */
export function drinkText(type: DrinkType | null, amount: number | null): string | null {
  if (!type) return null;
  const t = DRINK_TYPES.find((d) => d.value === type);
  if (!t) return null;
  if (type === 'NONE') return t.label;
  return amount ? `${t.label} ${amount}${t.unit}` : t.label;
}

export function religionText(value: Religion | null): string | null {
  return RELIGIONS.find((r) => r.value === value)?.label ?? null;
}

/** 담배는 O/X면 충분하다 */
export function smokingText(value: boolean | number | null): string | null {
  if (value == null) return null;
  return value ? '피움' : '안 피움';
}

export interface ProfileExtras {
  hobbies: string | null;
  mbti: string | null;
  height: number | null;
  drink_type: DrinkType | null;
  drink_amount: number | null;
  smoking: boolean | null;
  religion: Religion | null;
  ideal_type: string | null;
}

/**
 * 폼에서 선택 항목을 뽑는다. 등록·수정 양쪽이 같은 규칙을 써야 해서 여기 둔다.
 * 전부 선택이라 빈 값은 null로 떨어뜨린다 - 검증 실패로 등록을 막지 않는다.
 */
export function parseExtras(formData: FormData): ProfileExtras {
  const str = (k: string, max: number) => {
    const v = String(formData.get(k) ?? '').trim();
    return v ? v.slice(0, max) : null;
  };
  const num = (k: string, min: number, max: number) => {
    const v = Number(formData.get(k));
    return Number.isInteger(v) && v >= min && v <= max ? v : null;
  };

  const mbti = str('mbti', 4)?.toUpperCase() ?? null;
  const drinkType = String(formData.get('drink_type') ?? '');
  const religion = String(formData.get('religion') ?? '');
  const smoking = String(formData.get('smoking') ?? '');

  return {
    hobbies: str('hobbies', 200),
    mbti: MBTI_TYPES.includes(mbti as (typeof MBTI_TYPES)[number]) ? mbti : null,
    height: num('height', 120, 230),
    drink_type: DRINK_TYPES.some((d) => d.value === drinkType) ? (drinkType as DrinkType) : null,
    // 안 마시면 양은 의미가 없다
    drink_amount: drinkType && drinkType !== 'NONE' ? num('drink_amount', 1, 99) : null,
    smoking: smoking === 'Y' ? true : smoking === 'N' ? false : null,
    religion: RELIGIONS.some((r) => r.value === religion) ? (religion as Religion) : null,
    ideal_type: str('ideal_type', 300),
  };
}
