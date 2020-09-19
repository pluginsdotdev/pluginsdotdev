import React, { useEffect, useState } from 'react';
import { initializeHostBridge } from '@pluginsdotdev/bridge';

import type { ComponentType } from 'react';
import type { HostId, RenderRootId, ReconciliationUpdate, HostBridge, NodeId, ReconciliationSetPropUpdate, ReconciliationDeletePropUpdate, ReconciliationSetChildUpdate, ReconciliationDeleteChildUpdate } from '@pluginsdotdev/bridge';

interface PluginPointProps<P> {
  hostId: HostId;
  pluginPoint: string;
  jwt: string;
  pluginUrl: string;
  exposedComponents: Record<string, ComponentType>;
  props: P;
}

interface Node {
  id: NodeId;
  type: string;
  text?: string;
  children: NodeId[];
  props: Record<string, any>;
}

type RootNode = Node & { nodesById: Map<NodeId, Node>; };

const applyUpdates = (rootNode: RootNode, updates: ReconciliationUpdate[]): RootNode => (
  updates.reduce((rootNode: RootNode, update: ReconciliationUpdate) => {
    const { nodesById } = rootNode;
    if ( !nodesById.has(update.nodeId) ) {
      nodesById.set(
        update.nodeId,
        {
          id: update.nodeId,
          type: update.type,
          children: [],
          props: {}
        }
      );
    }

    const node = Object.assign({}, nodesById.get(update.nodeId)!);

    if ( typeof update.propUpdates !== 'undefined' ) {
      const propsToSet = update.propUpdates.filter((u): u is ReconciliationSetPropUpdate => u.op === 'set');
      const propsToDel = update.propUpdates.filter((u): u is ReconciliationDeletePropUpdate => u.op === 'delete');
      const newProps = propsToSet.reduce((props, { prop, value }) => {
        props[prop] = value;
        return props;
      }, {} as Record<string, any>);
      const withoutDeleted = propsToDel.reduce((props, { prop }) => {
        delete props[prop];
        return props;
      }, Object.assign({}, node.props));
      node.props = { ...node.props, ...newProps };
    }

    if ( typeof update.childUpdates !== 'undefined' ) {
      const childrenToSet = update.childUpdates.filter((c): c is ReconciliationSetChildUpdate => c.op === 'set');
      const childrenToDel = new Set(update.childUpdates.filter((c): c is ReconciliationDeleteChildUpdate => c.op === 'delete').map(c => c.childId));
      const withoutDeleted = node.children.filter(childrenToDel.has.bind(childrenToDel));
      const children = childrenToSet.reduce((children, { childId, childIdx }) => {
        children[childIdx] = childId;
        return children;
      }, node.children.slice());
      node.children = children;
    }

    if ( typeof update.textUpdate !== 'undefined' ) {
      node.text = update.textUpdate.text;
    }

    nodesById.set(node.id, node);
    return {
      ...rootNode,
      nodesById
    };
  }, rootNode)
);

type NodeComponentProps = {
  node: Node | undefined,
  nodesById: Map<NodeId, Node>
};
const NodeComponent: React.FC<NodeComponentProps> = ({ node, nodesById }) => {
  return node
    ? React.createElement(
      node.type === 'root' ? React.Fragment : node.type,
      node.props,
      node.text ?? node.children.map((childId: NodeId) => (
        React.createElement(
          NodeComponent,
          {
            key: childId,
            node: nodesById.get(childId),
            nodesById
          }
        )
      ))
    ) : null;
};

const PluginPoint = <P extends {}>(props: PluginPointProps<P>) => {
  const [bridge, setBridge] = useState<HostBridge | null>(null);
  const root = {
    id: 0,
    type: 'root',
    props: {},
    children: [],
    nodesById: new Map<NodeId, Node>()
  };
  const rootId = 1;
  const [rootNodesById, setRootNodesById] = useState<Map<RenderRootId, RootNode>>(new Map([
    [rootId, root]
  ]));

  const onReconcile = (rootId: RenderRootId, updates: ReconciliationUpdate[]) => {
    const rootNode = rootNodesById.get(rootId);
    if ( !rootNode ) {
      // TODO: log?
      return;
    }
    setRootNodesById(rootNodesById.set(rootId, applyUpdates(rootNode, updates)));
  };

  useEffect(() => {
    initializeHostBridge(props.hostId, onReconcile)
    .then(bridgeMaker => bridgeMaker(props.pluginUrl))
    .then(bridge => {
      setBridge(bridge);
      bridge.render(rootId, props.props);
    });
  }, [props.hostId, props.pluginUrl]);

  useEffect(() => {
    if ( bridge ) {
      bridge.render(rootId, props.props);
    }
  }, [props.props]);

  const rootNode = rootNodesById.get(rootId);
  if ( !rootNode ) {
    return null;
  }

  return React.createElement(
    NodeComponent,
    { node: rootNode, nodesById: rootNode.nodesById }
  );
};
