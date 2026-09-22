import { useState } from 'react';

export function MinecraftIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src={`/api/minecraft/texture/${id}`}
      alt={''}
      className={'size-4 shrink-0 [image-rendering:pixelated]'}
      onError={() => setFailed(true)}
    />
  );
}
