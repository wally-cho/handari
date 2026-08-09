'use client';

import { useState } from 'react';
import { DRINK_TYPES } from '@/lib/profileFields';
import { Field, Input, Select } from '@/components/ui';
import type { DrinkType } from '@/lib/types';

// 주량. 종류를 고르면 그 종류의 단위로 양을 묻는다.
// "안 마심"이나 미선택일 때 양 칸을 남겨두면 뭘 적으라는 건지 알 수 없다.

export default function DrinkField({
  defaultType,
  defaultAmount,
}: {
  defaultType?: DrinkType | null;
  defaultAmount?: number | null;
}) {
  const [type, setType] = useState<string>(defaultType ?? '');
  const picked = DRINK_TYPES.find((d) => d.value === type);
  const needsAmount = Boolean(picked && picked.value !== 'NONE');

  return (
    <Field label="주량" hint={needsAmount ? `한 번에 마시는 ${picked!.unit} 수` : undefined}>
      <div className={needsAmount ? 'grid grid-cols-[1fr_auto] gap-2' : ''}>
        <Select
          name="drink_type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="술 종류"
        >
          <option value="">선택 안 함</option>
          {DRINK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        {needsAmount && (
          <div className="flex items-center gap-1.5">
            <Input
              name="drink_amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              defaultValue={defaultAmount ?? ''}
              aria-label="주량"
              className="!w-20 text-center"
            />
            <span className="text-ink-2 shrink-0 text-[15px] font-medium">{picked!.unit}</span>
          </div>
        )}
      </div>
    </Field>
  );
}
