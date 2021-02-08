import { applyUpdates, realizeTree, emptyRootNode } from "../src/update-utils";

import type { NodeId } from "@pluginsdotdev/bridge";
import type { Node } from "../src/update-utils";

describe("apply-updates", () => {
  it("works for a basic case", () => {
    const root = emptyRootNode();
    let result = applyUpdates(root, [
      {
        nodeId: "1",
        type: "div",
        propUpdates: [{ op: "set", prop: "a", value: 7 }],
      },
      {
        nodeId: "0",
        type: "root",
        childUpdates: [
          {
            op: "set",
            childIdx: 0,
            childId: "1",
          },
        ],
      },
    ]);
    let realized = realizeTree(result.nodesById, result);
    expect(realized.children[0]).toMatchObject({
      id: "1",
      type: "div",
      props: { a: 7 },
      children: [],
    });

    result = applyUpdates(result, [
      {
        nodeId: "2",
        type: "text",
        textUpdate: {
          text: "Hello world!",
        },
      },
      {
        nodeId: "1",
        type: "div",
        childUpdates: [
          {
            op: "set",
            childIdx: 0,
            childId: "2",
          },
        ],
      },
    ]);
    realized = realizeTree(result.nodesById, result);
    expect(realized.children[0]).toMatchObject({
      id: "1",
      type: "div",
      props: { a: 7 },
    });
    expect(realized.children[0].children[0]).toMatchObject({
      id: "2",
      type: "text",
      text: "Hello world!",
    });

    result = applyUpdates(result, [
      {
        nodeId: "1",
        type: "div",
        propUpdates: [
          { op: "delete", prop: "a" },
          { op: "set", prop: "b", value: { hello: "world" } },
        ],
      },
    ]);
    realized = realizeTree(result.nodesById, result);
    expect(realized.children[0]).toMatchObject({
      id: "1",
      type: "div",
      props: { b: { hello: "world" } },
    });

    result = applyUpdates(result, [
      {
        nodeId: "1",
        type: "div",
        childUpdates: [{ op: "delete", childId: "2" }],
      },
    ]);
    realized = realizeTree(result.nodesById, result);
    expect(realized.children[0]).toMatchObject({
      id: "1",
      type: "div",
      props: { b: { hello: "world" } },
      children: [],
    });
  });
});
