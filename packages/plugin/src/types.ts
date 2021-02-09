import type {
  NodeId,
  ReconciliationHandlerUpdate,
} from "@pluginsdotdev/bridge";

export type GetNodeById = (nodeId: NodeId) => Node | null;
export type QueueHandlerUpdate = (
  node: Node,
  handlerUpdate: ReconciliationHandlerUpdate
) => void;
