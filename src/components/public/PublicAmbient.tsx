export function PublicAmbient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="public-orb animate-public-float left-[-14%] top-[-8%] h-[28rem] w-[28rem] bg-[#1D70D8]/10" />
      <div className="public-orb animate-public-float-slow right-[-10%] top-[10%] h-[22rem] w-[22rem] bg-pink-300/15" />
      <div className="public-orb animate-public-float left-[35%] top-[28%] h-[16rem] w-[16rem] bg-sky-300/12" />
    </div>
  );
}
