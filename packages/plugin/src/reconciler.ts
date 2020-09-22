import ReactReconciler from "react-reconciler";
import type { ReactNode } from "react";

import type {
  ReconciliationUpdate,
  ReconciliationCombinedUpdate,
  ReconciliationPropUpdate,
} from "@pluginsdotdev/bridge";

type ElementType = string;

type Prop = any;

interface Props {
  [key: string]: Prop;
}

type NodeId = number;

interface Instance {
  id: NodeId;
  type: ElementType;
  children: Array<Instance | TextInstance>;
  props: Props;
  appendChild(child: Instance | TextInstance): void;
  removeChild(child: Instance | TextInstance): void;
  insertBefore(
    child: Instance | TextInstance,
    referenceNode: Instance | TextInstance
  ): void;
  applyProps(props: { [key: string]: any }): void;
}

interface RootInstance extends Instance {
  fireCommit: () => void;
  nextId: () => NodeId;
  recordUpdate: (update: ReconciliationUpdate) => void;
}

interface TextInstance {
  id: NodeId;
  type: string;
  text: string;
}

type Container = RootInstance;

type HydratableInstance = any;

type PublicInstance = Instance | TextInstance;

type HostContext = null;

type UpdatePayload = any;

type ChildSet = any;

type TimeoutHandle = ReturnType<typeof setTimeout>;

type NoTimeout = undefined;

type RootNodeCommitCallback = (
  root: RootNode,
  updates: Array<ReconciliationUpdate>
) => void;

const isReactChildType = (children: any) =>
  Array.isArray(children) || (!!children && !!children.$$typeof);

const isSingleStringChildType = (children: any) => typeof children === "string";

class Node implements Instance {
  props: Props = {};
  id: NodeId;
  children: Array<PublicInstance>;

  constructor(
    private rootInstance: RootInstance,
    public type: ElementType,
    props: Props,
    children: Array<PublicInstance>
  ) {
    this.id = rootInstance.nextId();
    this.children = [];

    this.applyProps(props);
    children.forEach(this.appendChild.bind(this));
  }

  applyProps(props: { [key: string]: any }) {
    const { children, ...normalProps } = props;
    // weirdly, the reconciler doesn't create a text node for a single block of text, we do for consistency
    const isSingleStringChild = isSingleStringChildType(children);
    const isReactChild = isReactChildType(children);
    const ps = isReactChild || isSingleStringChild ? normalProps : props;

    if (isSingleStringChild) {
      this.children.slice().forEach(this.removeChild.bind(this));
      this.appendChild(new TextNode(this.rootInstance, children));
    }

    const propUpdates: Array<ReconciliationPropUpdate> = Object.keys(ps).map(
      (prop) => {
        const value = ps[prop];

        if (typeof value === "undefined") {
          delete this.props[prop];
          return {
            op: "delete",
            prop,
            value,
          };
        }

        this.props[prop] = value;

        return {
          op: "set",
          prop,
          value,
        };
      }
    );

    const update = {
      nodeId: this.id,
      type: this.type,
      propUpdates,
    };

    this.rootInstance.recordUpdate(update);
  }

  appendChild(child: PublicInstance) {
    this.children.push(child);

    this.rootInstance.recordUpdate({
      nodeId: this.id,
      type: this.type,
      childUpdates: [
        {
          op: "set",
          childIdx: this.children.length - 1,
          childId: child.id,
        },
      ],
    });
  }

  removeChild(child: PublicInstance) {
    this.children = this.children.filter((c) => c !== child);

    this.rootInstance.recordUpdate({
      nodeId: this.id,
      type: this.type,
      childUpdates: [
        {
          op: "delete",
          childId: child.id,
        },
      ],
    });
  }

  insertBefore(child: PublicInstance, referenceNode: PublicInstance) {
    const idx = this.children.indexOf(referenceNode);
    this.children.splice(idx, 0, child);
    this.rootInstance.recordUpdate({
      nodeId: this.id,
      type: this.type,
      childUpdates: [
        {
          op: "set",
          childIdx: idx,
          childId: child.id,
        },
      ],
    });
  }
}

const coalesceUpdates = (
  updates: Array<ReconciliationUpdate>
): Array<ReconciliationUpdate> => {
  const updatesById = new Map<NodeId, ReconciliationUpdate>();
  const newUpdates: Array<ReconciliationUpdate> = [];
  for (const update of updates) {
    if (!updatesById.has(update.nodeId)) {
      updatesById.set(update.nodeId, update);
      newUpdates.push(update);
    } else {
      const priorUpdate = updatesById.get(update.nodeId)!;
      if (update.propUpdates) {
        priorUpdate.propUpdates = (priorUpdate.propUpdates || []).concat(
          update.propUpdates
        );
      }
      if (update.childUpdates) {
        priorUpdate.childUpdates = (priorUpdate.childUpdates || []).concat(
          update.childUpdates
        );
      }
      if (update.textUpdate) {
        priorUpdate.textUpdate = update.textUpdate;
      }
    }
  }
  return newUpdates;
};

// TODO: RootNode is very similar to Node; consider factoring
//       nextId and recordUpdate/fireCommit out into two separate things
class RootNode implements RootInstance {
  container: OpaqueRoot;

  props: Props = {};
  id: NodeId = 0;
  children: Array<PublicInstance> = [];
  type: "root" = "root";

  private _nextId: NodeId = 1;
  private updates: Array<ReconciliationUpdate> = [];

  constructor(public onCommit: RootNodeCommitCallback) {
    this.container = Reconciler.createContainer(this, false, false);
  }

  applyProps(props: Props) {
    // no props on root
  }

  appendChild(child: PublicInstance) {
    this.children.push(child);
    this.recordUpdate({
      nodeId: this.id,
      type: this.type,
      childUpdates: [
        {
          op: "set",
          childIdx: this.children.length - 1,
          childId: child.id,
        },
      ],
    });
  }

  removeChild(child: PublicInstance) {
    this.children = this.children.filter((c) => c !== child);
    this.recordUpdate({
      nodeId: this.id,
      type: this.type,
      childUpdates: [
        {
          op: "delete",
          childId: child.id,
        },
      ],
    });
  }

  insertBefore(child: PublicInstance, referenceNode: PublicInstance) {
    const idx = this.children.indexOf(referenceNode);
    this.children.splice(idx, 0, child);
    this.recordUpdate({
      nodeId: this.id,
      type: this.type,
      childUpdates: [
        {
          op: "set",
          childIdx: idx,
          childId: child.id,
        },
      ],
    });
  }

  fireCommit() {
    this.onCommit(this, coalesceUpdates(this.updates));
    this.updates = [];
  }

  nextId() {
    return this._nextId++;
  }

  recordUpdate(update: ReconciliationUpdate): void {
    this.updates.push(update);
  }
}

class TextNode implements TextInstance {
  id: NodeId;
  type: string;

  constructor(private rootInstance: RootInstance, public text: string) {
    this.type = "text";
    this.id = rootInstance.nextId();

    rootInstance.recordUpdate({
      nodeId: this.id,
      type: this.type,
      textUpdate: {
        text,
      },
    });
  }
}

const Reconciler = ReactReconciler<
  ElementType,
  Props,
  Container,
  Instance,
  TextInstance,
  HydratableInstance,
  PublicInstance,
  HostContext,
  UpdatePayload,
  ChildSet,
  TimeoutHandle,
  NoTimeout
>({
  createInstance(
    type: ElementType,
    props: Props,
    rootContainerInstance: Container,
    hostContext: HostContext
  ): Instance {
    return new Node(rootContainerInstance, type, props, []);
  },

  appendInitialChild(parentInstance: Instance, child: PublicInstance): void {
    parentInstance.appendChild(child);
  },

  finalizeInitialChildren(
    parentInstance: Instance,
    type: ElementType,
    props: Props,
    rootContainerInstance: Container,
    hostContext: HostContext
  ): boolean {
    return false;
  },

  createTextInstance(
    text: string,
    rootContainerInstance: Container,
    hostContext: HostContext
  ): TextInstance {
    console.log("text instance", text);
    return new TextNode(rootContainerInstance, text);
  },

  getPublicInstance(instance: PublicInstance): PublicInstance {
    return instance;
  },

  prepareForCommit(containerInfo: Container): void {
    // noop
  },

  resetAfterCommit(containerInfo: Container): void {
    containerInfo.fireCommit();
  },

  resetTextContent(instance: Instance): void {
    // noop
  },

  commitTextUpdate(
    textInstance: TextInstance,
    oldText: string,
    newText: string
  ): void {
    textInstance.text = newText;
    console.log("update text", newText, oldText);
    // TODO: save the text update
  },

  removeChild(parentInstance: Instance, child: PublicInstance): void {
    parentInstance.removeChild(child);
  },

  removeChildFromContainer(container: Container, child: PublicInstance): void {
    container.removeChild(child);
  },

  insertBefore(
    parentInstance: Instance,
    child: PublicInstance,
    beforeChild: PublicInstance
  ): void {
    parentInstance.insertBefore(child, beforeChild);
  },

  appendChildToContainer(container: Container, child: PublicInstance): void {
    return container.appendChild(child);
  },

  appendChild(parentInstance: Instance, child: PublicInstance): void {
    return parentInstance.appendChild(child);
  },

  shouldSetTextContent(type: ElementType, props: Props): boolean {
    // verbatim from: https://github.com/facebook/react/blob/848bb2426e44606e0a55dfe44c7b3ece33772485/packages/react-dom/src/client/ReactDOMHostConfig.js#L350
    return (
      type === "textarea" ||
      type === "option" ||
      type === "noscript" ||
      typeof props.children === "string" ||
      typeof props.children === "number" ||
      (typeof props.dangerouslySetInnerHTML === "object" &&
        props.dangerouslySetInnerHTML !== null &&
        props.dangerouslySetInnerHTML.__html != null)
    );
  },

  getRootHostContext(rootContainerInstance: Container): HostContext {
    return null;
  },

  getChildHostContext(
    parentHostContext: HostContext,
    type: ElementType,
    rootContainerInstance: Container
  ): HostContext {
    return null;
  },

  now: Date.now,

  prepareUpdate(
    instance: Instance,
    type: ElementType,
    oldProps: Props,
    newProps: Props,
    rootContainerInstance: Container,
    hostContext: HostContext
  ): null | UpdatePayload {
    const allKeys = new Set(
      Object.keys(oldProps).concat(Object.keys(newProps))
    );
    return Array.from(allKeys).reduce((props, key) => {
      if (oldProps[key] === newProps[key]) {
        return props;
      }
      if (key === "children" && isReactChildType(newProps[key])) {
        // we don't need to handle react children as props
        return props;
      }
      props[key] = newProps[key];
      return props;
    }, {} as Record<string, any>);
  },

  commitUpdate(
    instance: Instance,
    updatePayload: any,
    type: string,
    oldProps: Props,
    newProps: Props
  ): void {
    if (Object.keys(updatePayload).length > 0) {
      instance.applyProps(updatePayload);
    }
  },

  commitMount(instance: Instance, type: ElementType, newProps: Props): void {
    // noop
  },

  // shouldDeprioritizeSubtree was deprecated in https://github.com/facebook/react/pull/19124
  shouldDeprioritizeSubtree(): boolean {
    return true;
  },

  // scheduleDeferredCallback was deprecated in https://github.com/facebook/react/pull/14984
  scheduleDeferredCallback(
    callback?: () => any,
    options?: { timeout: number }
  ): any {
    console.log("scheduleDeferredCallback");
  },

  // cancelDeferredCallback was deprecated in https://github.com/facebook/react/pull/14984
  cancelDeferredCallback(callbackID: any): void {
    console.log("cancelDeferredCallback");
    // noop
  },

  setTimeout(
    handler: (...args: any[]) => void,
    timeout: number
  ): TimeoutHandle | NoTimeout {
    return setTimeout(handler, timeout);
  },

  clearTimeout(handle: TimeoutHandle | NoTimeout): void {
    if (handle) {
      clearTimeout(handle);
    }
  },

  noTimeout: void 0 as NoTimeout,

  isPrimaryRenderer: true,

  supportsMutation: true,

  supportsPersistence: false,

  supportsHydration: false,
});

export type OpaqueRoot = ReturnType<typeof Reconciler.createContainer>;

export type ReactNodeList = ReactNode | null | undefined | boolean;

const defaultCallback = () => {};

const createRootNode = (onCommit: RootNodeCommitCallback) =>
  new RootNode(onCommit);

const render = (
  element: ReactNodeList,
  root: RootNode,
  callback?: () => void | null | undefined
) => {
  Reconciler.updateContainer(
    element,
    root.container,
    null,
    callback ?? defaultCallback
  );
};

export { createRootNode, render };
