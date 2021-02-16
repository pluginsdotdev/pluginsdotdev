import type {
  Bridge,
  ProxyId,
  ProxyHandler,
  ProxyType,
} from "@pluginsdotdev/bridge";
import type { GetNodeById } from "./types";

interface EventCtor {
  new (type: string, data: any): Event;
}

// https://developer.mozilla.org/en-US/docs/Web/API/Event
const eventCtorMap: Record<string, EventCtor> = {
  AnimationEvent,
  ClipboardEvent,
  CompositionEvent,
  DragEvent,
  FocusEvent,
  InputEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  TrackEvent,
  TransitionEvent,
  UIEvent,
  WheelEvent,
};

const { InputDeviceCapabilities } = window as any;
export const getEventProxyHandler = (
  getNodeById: GetNodeById
): ProxyHandler => {
  const fromBridgeHandler = (bridge: Bridge, proxyId: ProxyId, value: any) => {
    const { type, data }: { type: string; data: any } = value;
    const EventCtor = eventCtorMap[type] || Event;
    if (data.sourceCapabilities) {
      // sourceCapabilities must be of type InputDeviceCapabilities if present
      data.sourceCapabilities = new InputDeviceCapabilities(
        data.sourceCapabilities
      );
    }
    // not useful to send the host window
    delete data.view;
    const evtInit = { ...data };
    delete evtInit.target;
    delete evtInit.relatedTarget;
    if (data.relatedTarget) {
      evtInit.relatedTarget = getNodeById(data.relatedTarget.nodeId);
    }
    const evt: any = new EventCtor(data.type, evtInit);
    evt._id = `${evtInit.type}|${evtInit.timeStamp}|${evtInit.target?.nodeId}`;
    evt._target = {
      node: getNodeById(data.target.nodeId),
      checked: data.target.checked,
      value: data.target.value,
      selectedIndex: data.target.selectedIndex,
    };
    return evt;
  };

  return {
    type: "plugins.dev/Event" as ProxyType,
    fromBridgeHandler,
  };
};
