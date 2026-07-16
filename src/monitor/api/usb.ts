import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { UsbDevice, UsbTopology } from "../types/usb";

export async function fetchTopology(): Promise<UsbTopology> {
  return invoke<UsbTopology>("get_topology");
}

export async function setUsbWatch(enabled: boolean): Promise<void> {
  return invoke("set_usb_watch", { enabled });
}

export async function fetchDeviceDetail(id: string): Promise<UsbDevice> {
  return invoke<UsbDevice>("get_device_detail", { id });
}

export async function onTopologyChanged(
  handler: (topology: UsbTopology) => void,
): Promise<UnlistenFn> {
  return listen<UsbTopology>("usb://topology-changed", (event) => {
    handler(event.payload);
  });
}
