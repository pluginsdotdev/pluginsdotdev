import React from "react";
import {
  initializePluginBridge,
  RenderRootId,
  ReconciliationUpdate,
} from "@pluginsdotdev/bridge";
import { createRootNode, render } from "./reconciler";

import type { ComponentType, ElementType } from "react";
import type { PluginBridge, Props } from "@pluginsdotdev/bridge";

type ExposedComponents = Record<
  keyof JSX.IntrinsicElements,
  keyof JSX.IntrinsicElements
>;

interface PluginConfig {
  pluginId: string;
  hostId: string;
  userId: string;
  exposedComponents: ExposedComponents;
}

type PluginFactory = (pluginConfig: PluginConfig) => ComponentType<Props>;

const makeRoot = (rootId: RenderRootId, pluginBridge: PluginBridge) => {
  const rootNode = createRootNode(
    (_: any, updates: Array<ReconciliationUpdate>) => {
      pluginBridge.reconcile(rootId, updates);
    }
  );
  return rootNode;
};

interface BrowserData {
  pluginId: string;
  hostId: string;
  userId: string;
  hostOrigin: string;
  exposedComponentsList: Array<keyof ExposedComponents>;
}

const browserData = async (): Promise<BrowserData> => {
  return new Promise((resolve, reject) => {
    document.addEventListener("DOMContentLoaded", () => {
      resolve({
        pluginId: document.body.getAttribute("data-plugin-id")!,
        hostId: document.body.getAttribute("data-host-id")!,
        userId: document.body.getAttribute("data-user-id")!,
        hostOrigin: document.body.getAttribute("data-host-origin")!,
        exposedComponentsList: JSON.parse(
          document.body.getAttribute("data-exposed-components")!
        ) as Array<keyof ExposedComponents>,
      });
    });
  });
};

const makeExposedComponents = (
  exposedComponentsList: Array<keyof ExposedComponents>
): ExposedComponents => {
  return exposedComponentsList.reduce((exposedComponents, component) => {
    exposedComponents[
      component
    ] = `host:${component}` as keyof JSX.IntrinsicElements;
    return exposedComponents;
  }, {} as ExposedComponents);
};

const exposeReactPlugin = async (pluginFactory: PluginFactory) => {
  const {
    hostOrigin,
    exposedComponentsList,
    ...pluginConfig
  } = await browserData();
  const plugin = pluginFactory({
    ...pluginConfig,
    exposedComponents: makeExposedComponents(exposedComponentsList),
  });
  const rootById = new Map<RenderRootId, ReturnType<typeof createRootNode>>();
  const onRender = (rootId: RenderRootId, props: Props) => {
    const rootNode = rootById.get(rootId) || makeRoot(rootId, pluginBridge);
    rootById.set(rootId, rootNode);
    render(React.createElement(plugin, props), rootNode);
  };
  const pluginBridge = await initializePluginBridge({
    origin: hostOrigin,
    render: onRender,
  });
};

export { exposeReactPlugin };
