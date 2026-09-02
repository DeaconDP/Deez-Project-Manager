import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri, remoteUnsupported } from "../../lib/runtime";
import type { UsbDevice, UsbTopology } from "../types/usb";

const emptyTopology = (): UsbTopology => ({
  controllers: [],
  devices: [],
  warnings: [],
  enumeratedAt: new Date().toISOString(),
});

export async function fetchTopology(): Promise<UsbTopology> {
  if (!isTauri()) return emptyTopology();
  return invoke<UsbTopology>("get_topology");
}

export async function setUsbWatch(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  return invoke("set_usb_watch", { enabled });
}

export async function fetchDeviceDetail(id: string): Promise<UsbDevice> {
  if (!isTauri()) remoteUnsupported("USB device detail");
  return invoke<UsbDevice>("get_device_detail", { id });
}

export async function onTopologyChanged(
  handler: (topology: UsbTopology) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    void handler;
    return () => {};
  }
  return listen<UsbTopology>("usb://topology-changed", (event) => {
    handler(event.payload);
  });
}
