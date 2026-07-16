export type PortStatus =
  | "empty"
  | "connected"
  | "failedEnumeration"
  | "generalFailure"
  | "overcurrent"
  | "notEnoughPower"
  | "notEnoughBandwidth"
  | "hubNestedTooDeeply"
  | "inLegacyHub"
  | "enumerating"
  | "reset"
  | "unknown"
  | "unmapped";

export interface UsbWarning {
  code: string;
  message: string;
  target?: string | null;
}

export interface UsbEndpoint {
  address: number;
  attributes: number;
  maxPacketSize: number;
  interval: number;
  direction: string;
  transferType: string;
}

export interface UsbInterface {
  interfaceNumber: number;
  alternateSetting: number;
  class: number;
  subclass: number;
  protocol: number;
  endpoints: UsbEndpoint[];
}

export interface UsbConfiguration {
  value: number;
  attributes: number;
  maxPowerMa: number;
  interfaces: UsbInterface[];
}

export interface UsbDevice {
  id: string;
  hubId: string;
  portIndex: number;
  portChain: number[];
  vendorId: number;
  productId: number;
  revision?: number | null;
  manufacturer?: string | null;
  product?: string | null;
  serial?: string | null;
  friendlyName?: string | null;
  deviceClass: number;
  deviceSubclass: number;
  deviceProtocol: number;
  maxPacketSize0: number;
  numConfigurations: number;
  address: number;
  speed?: string | null;
  superspeed?: boolean | null;
  isHub: boolean;
  connectionStatus: string;
  driverKey?: string | null;
  instanceId?: string | null;
  service?: string | null;
  locationPaths: string[];
  containerId?: string | null;
  pnpStatus?: string | null;
  /** Windows CM problem code; 0 / null means OK. */
  pnpProblemCode?: number | null;
  configurations: UsbConfiguration[];
}

export interface UsbPort {
  id: string;
  hubId: string;
  portIndex: number;
  status: PortStatus;
  statusLabel: string;
  speed?: string | null;
  superspeed?: boolean | null;
  deviceId?: string | null;
  isHub: boolean;
}

export interface UsbHub {
  id: string;
  name: string;
  devicePath?: string | null;
  isRoot: boolean;
  portCount: number;
  ports: UsbPort[];
  childHubs: UsbHub[];
}

export interface UsbController {
  id: string;
  name: string;
  devicePath?: string | null;
  mapped: boolean;
  hubs: UsbHub[];
}

export interface UsbTopology {
  controllers: UsbController[];
  devices: UsbDevice[];
  warnings: UsbWarning[];
  enumeratedAt: string;
}

export type Selection =
  | { kind: "all" }
  | { kind: "controller"; id: string }
  | { kind: "hub"; id: string }
  | { kind: "port"; id: string; hubId: string; portIndex: number };

export function hexId(n: number, width = 4): string {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

export function deviceDisplayName(d: UsbDevice): string {
  // Prefer human primary label (kind-aware fallback) via deviceKind helpers.
  // Kept here so existing imports keep working.
  if (d.friendlyName?.trim()) return d.friendlyName.trim();
  if (d.product?.trim()) return d.product.trim();
  return `${hexId(d.vendorId)}:${hexId(d.productId)}` || "Unknown device";
}

export function findPort(
  topology: UsbTopology,
  hubId: string,
  portIndex: number,
): UsbPort | null {
  const walk = (hubs: UsbHub[]): UsbPort | null => {
    for (const h of hubs) {
      if (h.id === hubId) {
        return h.ports.find((p) => p.portIndex === portIndex) ?? null;
      }
      const nested = walk(h.childHubs);
      if (nested) return nested;
    }
    return null;
  };
  for (const c of topology.controllers) {
    const found = walk(c.hubs);
    if (found) return found;
  }
  return null;
}

export function findPortById(
  topology: UsbTopology,
  portId: string,
): UsbPort | null {
  const walk = (hubs: UsbHub[]): UsbPort | null => {
    for (const h of hubs) {
      const hit = h.ports.find((p) => p.id === portId);
      if (hit) return hit;
      const nested = walk(h.childHubs);
      if (nested) return nested;
    }
    return null;
  };
  for (const c of topology.controllers) {
    const found = walk(c.hubs);
    if (found) return found;
  }
  return null;
}

export function collectAllPorts(topology: UsbTopology): UsbPort[] {
  const out: UsbPort[] = [];
  const walk = (hubs: UsbHub[]) => {
    for (const h of hubs) {
      out.push(...h.ports);
      walk(h.childHubs);
    }
  };
  for (const c of topology.controllers) walk(c.hubs);
  return out;
}

export function portsForSelection(
  topology: UsbTopology,
  selection: Selection,
): UsbPort[] {
  switch (selection.kind) {
    case "all":
      return collectAllPorts(topology);
    case "controller": {
      const ctrl = topology.controllers.find((c) => c.id === selection.id);
      if (!ctrl) return [];
      const out: UsbPort[] = [];
      const walk = (hubs: UsbHub[]) => {
        for (const h of hubs) {
          out.push(...h.ports);
          walk(h.childHubs);
        }
      };
      walk(ctrl.hubs);
      return out;
    }
    case "hub": {
      const hub = findHub(topology, selection.id);
      if (!hub) return [];
      const out: UsbPort[] = [];
      const walk = (h: UsbHub) => {
        out.push(...h.ports);
        for (const child of h.childHubs) walk(child);
      };
      walk(hub);
      return out;
    }
    case "port": {
      const port = findPort(topology, selection.hubId, selection.portIndex);
      return port ? [port] : [];
    }
  }
}

export function classLabel(classCode: number): string {
  const map: Record<number, string> = {
    0x00: "Interface-defined",
    0x01: "Audio",
    0x02: "CDC",
    0x03: "HID",
    0x05: "Physical",
    0x06: "Image",
    0x07: "Printer",
    0x08: "Mass Storage",
    0x09: "Hub",
    0x0a: "CDC-Data",
    0x0b: "Smart Card",
    0x0d: "Content Security",
    0x0e: "Video",
    0x0f: "Personal Healthcare",
    0x10: "Audio/Video",
    0x11: "Billboard",
    0x12: "USB Type-C Bridge",
    0xdc: "Diagnostic",
    0xe0: "Wireless",
    0xef: "Miscellaneous",
    0xfe: "Application Specific",
    0xff: "Vendor Specific",
  };
  return map[classCode] ?? "Unknown";
}

export function collectHubIds(hub: UsbHub): string[] {
  return [hub.id, ...hub.childHubs.flatMap(collectHubIds)];
}

export function findHub(topology: UsbTopology, hubId: string): UsbHub | null {
  const walk = (hubs: UsbHub[]): UsbHub | null => {
    for (const h of hubs) {
      if (h.id === hubId) return h;
      const nested = walk(h.childHubs);
      if (nested) return nested;
    }
    return null;
  };
  for (const c of topology.controllers) {
    const found = walk(c.hubs);
    if (found) return found;
  }
  return null;
}

export function devicesForSelection(
  topology: UsbTopology,
  selection: Selection,
): UsbDevice[] {
  switch (selection.kind) {
    case "all":
      return topology.devices;
    case "controller": {
      const ctrl = topology.controllers.find((c) => c.id === selection.id);
      if (!ctrl) return [];
      const hubIds = new Set(ctrl.hubs.flatMap(collectHubIds));
      return topology.devices.filter((d) => hubIds.has(d.hubId));
    }
    case "hub": {
      const hub = findHub(topology, selection.id);
      if (!hub) return [];
      const hubIds = new Set(collectHubIds(hub));
      return topology.devices.filter((d) => hubIds.has(d.hubId));
    }
    case "port":
      return topology.devices.filter(
        (d) => d.hubId === selection.hubId && d.portIndex === selection.portIndex,
      );
  }
}
