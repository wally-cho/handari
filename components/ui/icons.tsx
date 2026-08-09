// 아이콘. 24×24 그리드, stroke 1.6, currentColor.
// 새로 만들 때 이 규격을 지키면 어디에 놓아도 무게가 맞는다.

type IconProps = { size?: number; className?: string };

function Svg({ size = 24, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5 8 12l7 7" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

/** 알림. 텍스트 대신 항상 이 아이콘을 쓴다 */
export const Bell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 4-1.2 5.8-1.9 6.6-.4.4-.1 1.1.4 1.1h14c.5 0 .8-.7.4-1.1-.7-.8-1.9-2.6-1.9-6.6A5.5 5.5 0 0 0 12 3Z" />
    <path d="M9.8 19.5a2.3 2.3 0 0 0 4.4 0" />
  </Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Link2 = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
    <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const Pencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
  </Svg>
);

export const Users = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 5.2a3.2 3.2 0 0 1 0 5.6" />
  </Svg>
);
