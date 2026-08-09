import Link from 'next/link';

// 디자인 시스템 프리미티브.
//
// 화면을 새로 만들 때는 여기 있는 것을 먼저 찾고, 없으면 여기에 추가한다.
// 페이지에 유틸리티 클래스를 직접 뿌리지 않는다 — 그러면 화면이 늘 때마다 톤이 흩어진다.
//
// 규칙
//   - 색은 globals.css의 토큰만 쓴다 (ink / ink-2 / ink-3 / fill / haze / brand / alert)
//   - 주홍(brand)은 액션에만. 정보 표시에 쓰지 않는다
//   - 테두리보다 회색 필(fill)로 묶는다
//   - 텍스트 위계는 3단을 넘기지 않는다

export * from './icons';

/* ────────────────────────────────────────────────
   Button — 화면당 primary는 하나만 둔다
   ──────────────────────────────────────────────── */

type ButtonTone = 'primary' | 'ghost' | 'kakao' | 'danger';

const TONE: Record<ButtonTone, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  kakao: 'btn-kakao',
  danger: 'bg-alert-soft text-alert',
};

export function Button({
  tone = 'primary',
  small,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  small?: boolean;
}) {
  return (
    <button {...props} className={`btn ${TONE[tone]} ${small ? 'btn-sm' : ''} ${className}`} />
  );
}

/** 같은 생김새의 링크. 이동에는 button 대신 이걸 쓴다 */
export function ButtonLink({
  tone = 'primary',
  small,
  className = '',
  ...props
}: React.ComponentProps<typeof Link> & { tone?: ButtonTone; small?: boolean }) {
  return (
    <Link
      {...props}
      className={`btn ${TONE[tone]} ${small ? 'btn-sm' : ''} block text-center ${className}`}
    />
  );
}

/* ────────────────────────────────────────────────
   Field — label + 입력 한 벌
   ──────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  optional,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="text-ink-3 ml-1 font-normal">선택</span>}
      </label>
      {hint && <p className="text-ink-3 -mt-1 mb-2 text-[13px] leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`field resize-none ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field ${props.className ?? ''}`} />;
}

/** 라디오를 큰 터치 타깃으로. 성별처럼 선택지가 적을 때 */
export function ChoiceGroup({
  name,
  options,
  defaultValue,
  columns = 2,
  required,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  columns?: number;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}>
      {options.map((o) => (
        <label
          key={o.value}
          className="bg-fill text-ink-2 has-checked:bg-brand-soft has-checked:text-brand cursor-pointer rounded-[14px] py-3.5 text-center text-[15px] font-medium has-checked:font-semibold"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            required={required}
            defaultChecked={defaultValue === o.value}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────
   면 — Card(흰 카드) / Box(회색 묶음)
   ──────────────────────────────────────────────── */

export function Card({
  href,
  className = '',
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const base = `bg-surface ring-haze block overflow-hidden rounded-2xl ring-1 ${className}`;
  return href ? (
    <Link href={href} className={`${base} active:bg-fill-2`}>
      {children}
    </Link>
  ) : (
    <div className={base}>{children}</div>
  );
}

/** 회색 필로 묶는 상자. 안내문, 통계, 강조 블록 */
export function Box({
  tone = 'fill',
  className = '',
  children,
}: {
  tone?: 'fill' | 'brand' | 'alert';
  className?: string;
  children: React.ReactNode;
}) {
  const bg = tone === 'brand' ? 'bg-brand-soft' : tone === 'alert' ? 'bg-alert-soft' : 'bg-fill-2';
  return <div className={`rounded-2xl p-[18px] ${bg} ${className}`}>{children}</div>;
}

/* ────────────────────────────────────────────────
   텍스트
   ──────────────────────────────────────────────── */

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-7">
      <h1 className="kr text-[24px] leading-[1.35] font-bold tracking-[-0.03em]">{children}</h1>
      {sub && <p className="text-ink-3 kr mt-2 text-[15px] leading-relaxed">{sub}</p>}
    </div>
  );
}

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-[17px] font-bold tracking-[-0.03em]">
        {children}
        {count != null && <span className="text-ink-3 mark ml-1.5 font-semibold">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

export function Caption({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={`text-ink-3 kr text-[13px] leading-relaxed ${className}`}>{children}</p>;
}

/* ────────────────────────────────────────────────
   Badge — 상태 표시. 주홍은 액션 전용이라 여기 안 쓴다
   ──────────────────────────────────────────────── */

type BadgeTone = 'neutral' | 'warn' | 'good' | 'alert';

const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-fill text-ink-3',
  warn: 'bg-warn-soft text-warn',
  good: 'bg-good-soft text-good',
  alert: 'bg-alert-soft text-alert',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-[3px] text-[11px] font-semibold ${BADGE[tone]}`}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────
   목록
   ──────────────────────────────────────────────── */

export function ListRow({
  href,
  title,
  sub,
  right,
  leading,
}: {
  href?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  const inner = (
    <div className="flex items-center gap-3 py-3.5">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{title}</div>
        {sub && <div className="text-ink-3 mt-0.5 truncate text-[13px]">{sub}</div>}
      </div>
      {right}
    </div>
  );
  return href ? (
    <Link href={href} className="-mx-1 block px-1 active:opacity-60">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-3 kr py-12 text-center text-[14px]">{children}</p>;
}

/** 폼 검증 실패 등 화면 상단에 띄우는 안내 */
export function Notice({
  tone = 'alert',
  children,
}: {
  tone?: 'alert' | 'good' | 'brand';
  children: React.ReactNode;
}) {
  const c =
    tone === 'good'
      ? 'bg-good-soft text-good'
      : tone === 'brand'
        ? 'bg-brand-soft text-brand'
        : 'bg-alert-soft text-alert';
  return <p className={`kr rounded-xl px-4 py-3 text-[14px] font-medium ${c}`}>{children}</p>;
}
