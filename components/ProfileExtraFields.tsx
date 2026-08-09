import { DRINK_TYPES, MBTI_TYPES, RELIGIONS } from '@/lib/profileFields';
import { ChoiceGroup, Field, Input, Select, Textarea } from '@/components/ui';
import type { ProfileRow } from '@/lib/types';

// 프로필 선택 항목. 등록·수정 두 화면이 같은 폼을 써야 해서 컴포넌트로 뺀다.
//
// 기본은 접어둔다. 필수가 아닌 항목을 펼쳐놓으면 등록 화면이 설문지처럼 보이고,
// 등록 마찰이 커지는 건 MVP 목표(등록 풀 확대)와 정면으로 부딪힌다.
// 주선자가 모르는 건 비워두고 본인이 가져간 뒤 채우면 된다.

export default function ProfileExtraFields({
  defaults,
  open,
}: {
  defaults?: Pick<
    ProfileRow,
    | 'hobbies'
    | 'mbti'
    | 'height'
    | 'drink_type'
    | 'drink_amount'
    | 'smoking'
    | 'religion'
    | 'ideal_type'
  > | null;
  /** 수정 화면에서는 펼쳐둔다 — 이미 채운 값을 찾아야 하니까 */
  open?: boolean;
}) {
  const d = defaults;

  return (
    <details open={open} className="bg-fill-2 rounded-2xl px-4 py-3.5">
      <summary className="cursor-pointer list-none text-[15px] font-semibold">
        더 알려주기
        <span className="text-ink-3 ml-1.5 text-[13px] font-normal">선택</span>
      </summary>

      <div className="mt-5 space-y-6 pb-1">
        <Field label="취미" htmlFor="hobbies" optional>
          <Input
            id="hobbies"
            name="hobbies"
            maxLength={200}
            defaultValue={d?.hobbies ?? ''}
            placeholder="등산, 요리, 넷플릭스"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="MBTI" htmlFor="mbti" optional>
            <Select id="mbti" name="mbti" defaultValue={d?.mbti ?? ''}>
              <option value="">선택 안 함</option>
              {MBTI_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="키" htmlFor="height" optional>
            <Input
              id="height"
              name="height"
              type="number"
              inputMode="numeric"
              min={120}
              max={230}
              defaultValue={d?.height ?? ''}
              placeholder="cm"
            />
          </Field>
        </div>

        <Field label="주량" hint="종류를 고르고 마시는 양을 적어주세요" optional>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Select name="drink_type" defaultValue={d?.drink_type ?? ''} aria-label="술 종류">
              <option value="">선택 안 함</option>
              {DRINK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Input
              name="drink_amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              defaultValue={d?.drink_amount ?? ''}
              placeholder="양"
              aria-label="주량"
              className="!w-24"
            />
          </div>
        </Field>

        <Field label="담배" optional>
          <ChoiceGroup
            name="smoking"
            defaultValue={d?.smoking == null ? undefined : d.smoking ? 'Y' : 'N'}
            options={[
              { value: 'N', label: '안 피움' },
              { value: 'Y', label: '피움' },
            ]}
          />
        </Field>

        <Field label="종교" htmlFor="religion" optional>
          <Select id="religion" name="religion" defaultValue={d?.religion ?? ''}>
            <option value="">선택 안 함</option>
            {RELIGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="이런 사람이면 좋겠어요" htmlFor="ideal_type" optional>
          <Textarea
            id="ideal_type"
            name="ideal_type"
            rows={3}
            maxLength={300}
            defaultValue={d?.ideal_type ?? ''}
            placeholder="대화가 잘 통하고 취미를 같이 즐길 수 있는 사람"
          />
        </Field>
      </div>
    </details>
  );
}
