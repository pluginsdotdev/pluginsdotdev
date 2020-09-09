import React, { useEffect, useState } from 'react';
import { initializeHostBridge } from '@pluginsdotdev/bridge';

import type { ComponentType } from 'react';
import type { HostId, RenderRootId, ReconciliationUpdate, HostBridge } from '@pluginsdotdev/bridge';

interface PluginPointProps<P> {
  hostId: HostId;
  pluginPoint: string;
  jwt: string;
  pluginUrl: string;
  exposedComponents: Record<string, ComponentType>;
  props: P;
}

const PluginPoint = <P extends {}>(props: PluginPointProps<P>) => {
  const [bridge, setBridge] = useState<HostBridge | null>(null);
  const [rootNode, setRootNode] = useState({});
  const onReconcile = (rootId: RenderRootId, updates: ReconciliationUpdate[]) => {
    // TODO: rootNode + updates => setRootNode
    setRootNode({});
  };
  useEffect(() => {
    initializeHostBridge(props.hostId, onReconcile)
    .then(bridgeMaker => bridgeMaker(props.pluginUrl))
    .then(setBridge)
  }, [props.hostId, props.pluginUrl]);

  return (
    <div></div>
  );
};
