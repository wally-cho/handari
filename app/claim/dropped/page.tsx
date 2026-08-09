// 카드를 내린 뒤 화면. 정적 세그먼트가 [token]보다 먼저 잡힌다.

export default function DroppedPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-8">
      <h1 className="text-2xl font-bold tracking-tight">내렸어요</h1>
      <p className="text-ink-2 mt-3 text-sm leading-relaxed">
        사진을 포함해 완전히 지웠어요. 등록한 분께는 사유 없이 알림만 갔어요.
      </p>
      <p className="text-ink-3 mt-6 text-xs leading-relaxed">
        불편을 드려 죄송해요. 한다리는 아는 사람끼리만 쓰는 서비스라, 이런 일이 없도록 등록할 때
        본인에게 먼저 알리도록 안내하고 있어요.
      </p>
    </main>
  );
}
