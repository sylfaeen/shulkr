export type Clock = () => Date;

export function createClock(): Clock {
  return () => new Date();
}
