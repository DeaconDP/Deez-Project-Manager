export interface MetricsSnapshot {
  ts: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  gpus: GpuMetrics[];
  temps: TempMetrics;
  processes: ProcessMetrics[];
  wifi: WifiMetrics | null;
  hostNet: HostNetMetrics;
  netProcesses: NetProcessMetrics[];
}

export interface CpuMetrics {
  usagePercent: number;
  coreCount: number;
  brand: string;
}

export interface MemoryMetrics {
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface DiskMetrics {
  name: string;
  mount: string;
  totalBytes: number;
  availableBytes: number;
  usagePercent: number;
}

export interface GpuMetrics {
  name: string;
  usagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  tempC: number | null;
  source: string;
}

export interface TempMetrics {
  cpuC: number | null;
  gpuC: number | null;
  zones: { name: string; tempC: number }[];
  notes: string[];
}

export interface ProcessMetrics {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  diskReadBps: number | null;
  diskWriteBps: number | null;
}

export interface WifiMetrics {
  ssid: string;
  signalPercent: number | null;
  radioType: string | null;
  channel: number | null;
  receiveRateMbps: number | null;
  transmitRateMbps: number | null;
  state: string;
  interface: string | null;
}

export interface HostNetMetrics {
  recvBps: number;
  sentBps: number;
  totalRecvBytes: number;
  totalSentBytes: number;
}

export interface NetProcessMetrics {
  pid: number;
  name: string;
  connectionCount: number;
  readBps: number;
  writeBps: number;
}

export interface LatencyResult {
  probe: string;
  url: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface SpikeEvent {
  id: number;
  ts: string;
  kind: string;
  source: string;
  value: number;
  baseline: number | null;
  note: string | null;
}
