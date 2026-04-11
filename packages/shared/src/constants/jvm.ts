// Aikar's JVM flags for optimal Minecraft server performance
// Reference: https://docs.papermc.io/paper/aikars-flags

export const AIKAR_FLAGS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:+AlwaysPreTouch',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1',
] as const;

export const AIKAR_FLAGS_STRING = AIKAR_FLAGS.join(' ');

// Common RAM presets
export const RAM_PRESETS = [
  { label: '1 GB', value: '1G' },
  { label: '2 GB', value: '2G' },
  { label: '4 GB', value: '4G' },
  { label: '6 GB', value: '6G' },
  { label: '8 GB', value: '8G' },
  { label: '12 GB', value: '12G' },
  { label: '16 GB', value: '16G' },
] as const;

// Default ports
export const DEFAULT_JAVA_PORT = 25565;
export const DEFAULT_BEDROCK_PORT = 19132;
