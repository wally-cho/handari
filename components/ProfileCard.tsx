import { photoUrl } from '@/lib/photos';
import { Badge, Card } from '@/components/ui';
import type { ProfileRow } from '@/lib/types';

// 카드. 추천사가 주인공이다 — 스펙보다 크게 놓는다 (PRODUCT 15).
// 다리 수는 목록의 섹션 머리말이 맡으므로 카드에는 넣지 않는다.

export interface CardData extends ProfileRow {
  author_nickname: string;
  degree: number;
}

export default function ProfileCard({ card }: { card: CardData }) {
  const photo = photoUrl(card.photo_key);
  const age = new Date().getFullYear() - card.birth_year + 1;
  const isSelf = card.subject_user_id === card.author_user_id;

  return (
    <Card href={`/profiles/${card.id}`}>
      <div className="flex gap-3.5 p-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="bg-fill text-ink-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold">
            {card.display_name.slice(0, 1)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[16px] font-bold tracking-[-0.03em]">
              {card.display_name}
            </span>
            {card.claimed_at == null && <Badge tone="warn">본인 미확인</Badge>}
          </div>

          <p className="text-ink-3 mark mt-0.5 text-[13px]">
            {age}세 · {card.region}
            {card.job && ` · ${card.job}`}
          </p>

          <p className="text-ink-3 mt-1 text-[13px]">
            {isSelf ? '본인이 등록' : `${card.author_nickname}님이 소개`}
          </p>
        </div>
      </div>

      {card.recommendation && (
        <p className="bg-fill-2 text-ink-2 kr mx-4 mb-4 rounded-xl px-3.5 py-3 text-[14px] leading-[1.7]">
          {card.recommendation.length > 78
            ? card.recommendation.slice(0, 78) + '…'
            : card.recommendation}
        </p>
      )}
    </Card>
  );
}
