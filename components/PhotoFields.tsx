'use client';

import { useState } from 'react';

// 사진 입력. 등록·수정이 같은 것을 쓴다.
//
// 클라이언트 컴포넌트인 이유는 하나다 - 고른 자리에서 바로 막아야 한다.
// 서버는 넘치는 사진을 조용히 버릴 수밖에 없고(이미 저장한 걸 되돌려야 하니),
// 사용자는 왜 세 장만 올라갔는지 알 수 없다. 장수와 크기는 여기서 세어서 말해준다.
//
// 한도 값은 서버에서 내려받는다. lib/photos.ts는 node:fs를 물고 있어서
// 클라이언트로 가져올 수 없다.

interface Current {
  key: string;
  url: string;
}

export default function PhotoFields({
  current = [],
  max,
  maxBytes,
}: {
  /** 이미 붙어 있는 사진. 첫 장이 대표다 */
  current?: Current[];
  max: number;
  maxBytes: number;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const megabytes = Math.round(maxBytes / 1024 / 1024);
  const remaining = max - (current.length - removed.length);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);

    for (const p of picked) URL.revokeObjectURL(p.url);
    setPicked([]);
    setError(null);
    if (files.length === 0) return;

    // 안 되는 선택은 입력에서 비운다. 그대로 두면 보낼 때 서버가 조용히 버린다
    const tooBig = files.find((f) => f.size > maxBytes);
    if (tooBig) {
      input.value = '';
      setError(`"${tooBig.name}"이 ${megabytes}MB를 넘어요. 장당 ${megabytes}MB까지예요.`);
      return;
    }
    if (files.length > remaining) {
      input.value = '';
      setError(
        remaining === 0
          ? `사진은 ${max}장까지예요. 먼저 지울 사진을 골라주세요.`
          : `${remaining}장 더 올릴 수 있어요. ${files.length}장을 고르셨어요.`,
      );
      return;
    }

    setPicked(files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })));
  }

  return (
    <div>
      <span className="block text-sm font-medium">
        사진{' '}
        <span className="text-ink-3">
          (선택, {max}장까지, 장당 {megabytes}MB)
        </span>
      </span>

      {current.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {current.map((photo, i) => {
            const gone = removed.includes(photo.key);
            return (
              <li key={photo.key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className={`h-20 w-20 rounded-xl object-cover ${gone ? 'opacity-30' : ''}`}
                />
                <label className="text-ink-2 mt-1.5 flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    name="remove_photo"
                    value={photo.key}
                    className="accent-brand"
                    onChange={(e) =>
                      setRemoved((prev) =>
                        e.target.checked
                          ? [...prev, photo.key]
                          : prev.filter((k) => k !== photo.key),
                      )
                    }
                  />
                  {i === 0 && !gone ? '대표 지우기' : '지우기'}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <input
        id="photos"
        name="photos"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={pick}
        className="text-ink-2 file:bg-haze mt-3 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm"
      />

      {picked.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {picked.map((p) => (
            <li key={p.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-20 w-20 rounded-xl object-cover" />
            </li>
          ))}
        </ul>
      )}

      {/* 고른 뒤에 "지우기"를 풀면 자리가 다시 줄어든다. 이때도 말해준다 */}
      {error || picked.length > remaining ? (
        <p className="text-alert mt-1.5 text-xs leading-relaxed">
          {error ??
            `${max}장을 넘어요. 지울 사진을 더 고르거나, 올릴 사진을 다시 골라주세요. 지금 보내면 뒤쪽 ${picked.length - remaining}장은 빠져요.`}
        </p>
      ) : (
        <p className="text-ink-3 mt-1.5 text-xs leading-relaxed">
          {current.length > 0
            ? remaining > 0
              ? `${remaining}장 더 올릴 수 있어요. 새로 올린 사진은 뒤에 붙고, 남은 사진 중 첫 장이 대표가 돼요.`
              : `사진은 ${max}장까지예요. 지울 사진을 고르면 자리가 생겨요.`
            : '한 번에 여러 장 고를 수 있어요. 고른 순서대로 보이고, 첫 장이 대표 사진이에요.'}
        </p>
      )}
    </div>
  );
}
