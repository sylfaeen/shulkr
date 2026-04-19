export type AikarServerType = 'paper' | 'forge' | 'fabric' | 'vanilla';

export type AikarInput = {
  ramMb: number;
  javaVersion?: number;
  serverType?: AikarServerType;
};

export type AikarFlagExplanation = { flag: string; reasonKey: string };

export type AikarResult = {
  flags: Array<string>;
  explanations: Array<AikarFlagExplanation>;
  warnings: Array<string>;
};

const LARGE_HEAP_THRESHOLD_MB = 12 * 1024;

export function computeAikarFlags({ ramMb, javaVersion, serverType = 'paper' }: AikarInput): AikarResult {
  const warnings: Array<string> = [];
  if (ramMb < 512) warnings.push('ram_too_low');
  else if (ramMb < 2048) warnings.push('ram_under_2gb');

  const isLargeHeap = ramMb >= LARGE_HEAP_THRESHOLD_MB;

  const baseFlags: Array<AikarFlagExplanation> = [
    { flag: '-XX:+UseG1GC', reasonKey: 'g1gc' },
    { flag: '-XX:+ParallelRefProcEnabled', reasonKey: 'parallel_ref_proc' },
    { flag: '-XX:MaxGCPauseMillis=200', reasonKey: 'pause_target' },
    { flag: '-XX:+UnlockExperimentalVMOptions', reasonKey: 'unlock_experimental' },
    { flag: '-XX:+DisableExplicitGC', reasonKey: 'disable_explicit_gc' },
    { flag: '-XX:+AlwaysPreTouch', reasonKey: 'always_pre_touch' },
    { flag: '-XX:G1HeapWastePercent=5', reasonKey: 'heap_waste' },
    { flag: '-XX:G1MixedGCCountTarget=4', reasonKey: 'mixed_gc_count' },
    { flag: '-XX:G1MixedGCLiveThresholdPercent=90', reasonKey: 'mixed_gc_live' },
    { flag: '-XX:G1RSetUpdatingPauseTimePercent=5', reasonKey: 'rset_pause' },
    { flag: '-XX:SurvivorRatio=32', reasonKey: 'survivor_ratio' },
    { flag: '-XX:+PerfDisableSharedMem', reasonKey: 'perf_disable_shared' },
    { flag: '-XX:MaxTenuringThreshold=1', reasonKey: 'tenuring_threshold' },
  ];

  const adaptiveFlags: Array<AikarFlagExplanation> = isLargeHeap
    ? [
        { flag: '-XX:G1NewSizePercent=40', reasonKey: 'new_size_large' },
        { flag: '-XX:G1MaxNewSizePercent=50', reasonKey: 'max_new_size_large' },
        { flag: '-XX:G1HeapRegionSize=16M', reasonKey: 'region_size_large' },
        { flag: '-XX:G1ReservePercent=15', reasonKey: 'reserve_large' },
        { flag: '-XX:InitiatingHeapOccupancyPercent=20', reasonKey: 'iho_large' },
      ]
    : [
        { flag: '-XX:G1NewSizePercent=30', reasonKey: 'new_size_small' },
        { flag: '-XX:G1MaxNewSizePercent=40', reasonKey: 'max_new_size_small' },
        { flag: '-XX:G1HeapRegionSize=8M', reasonKey: 'region_size_small' },
        { flag: '-XX:G1ReservePercent=20', reasonKey: 'reserve_small' },
        { flag: '-XX:InitiatingHeapOccupancyPercent=15', reasonKey: 'iho_small' },
      ];

  const paperFlags: Array<AikarFlagExplanation> =
    serverType === 'paper'
      ? [
          { flag: '-Dusing.aikars.flags=https://mcflags.emc.gs', reasonKey: 'aikar_marker' },
          { flag: '-Daikars.new.flags=true', reasonKey: 'aikar_new_marker' },
        ]
      : [];

  const javaVersionWarnings: Array<string> = [];
  if (javaVersion !== undefined && javaVersion < 11) javaVersionWarnings.push('java_too_old');

  const explanations = [...baseFlags, ...adaptiveFlags, ...paperFlags];

  return {
    flags: explanations.map((e) => e.flag),
    explanations,
    warnings: [...warnings, ...javaVersionWarnings],
  };
}

export function parseRamToMb(ram: string): number {
  const match = ram.trim().match(/^(\d+)([GMK])$/i);
  if (!match) return 0;
  const [, rawValue, unit] = match;
  const value = Number(rawValue);
  if (unit.toUpperCase() === 'G') return value * 1024;
  if (unit.toUpperCase() === 'M') return value;
  return Math.round(value / 1024);
}
