export function BrandPanel() {
  return (
    <div className={'relative hidden w-1/2 overflow-hidden bg-zinc-950 lg:block'}>
      <video autoPlay loop muted playsInline className={'absolute inset-0 size-full object-cover'} src={'/brand-panel.mp4'} />
      <div className={'absolute inset-0 bg-linear-to-t from-black/40 via-black/20 to-black/30'} />
      <div className={'absolute right-0 bottom-0 left-0 px-10 pb-10'}>
        <div className={'flex items-baseline justify-start gap-2'}>
          <p className={'font-quattrocento text-[50px] leading-10 font-bold text-white'}>Shulkr</p>
          <p className={'text-sm tracking-wide text-white/80'}>v{__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
