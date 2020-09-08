import React from 'react';
import { render, createRootNode } from '../src/reconciler';
import type { ReconciliationUpdate } from '@pluginsdotdev/bridge';

describe('reconcile', () => {
  it('should work', () => {
    return new Promise((resolve, reject) => {
      const onCommit = (_: any, updates: Array<ReconciliationUpdate>) => {
        // TODO: write an expect.anyCapture that can capture named values
        //       to assert that they are the same when used multiple times.
        //       unification for the win.
        expect(updates).toContainEqual({
          nodeId: expect.any(Number),
          type: 'text',
          textUpdate: { text: "This is me!" }
        });
        expect(updates).toContainEqual({
          nodeId: expect.any(Number),
          type: 'p',
          propUpdates: []
        });
        expect(updates).toContainEqual({
          nodeId: expect.any(Number),
          type: 'p',
          childUpdates: [{
            op: 'set',
            childIdx: 0,
            childId: expect.any(Number)
          }]
        });
        expect(updates).toContainEqual({
          nodeId: expect.any(Number),
          type: 'div',
          propUpdates: [{
            op: 'set',
            prop: 'className',
            value: 'helloWorld'
          }]
        });
        expect(updates).toContainEqual({
          nodeId: expect.any(Number),
          type: 'div',
          childUpdates: [{
            op: 'set',
            childIdx: 0,
            childId: expect.any(Number)
          }]
        });
        expect(updates).toContainEqual({
          nodeId: 0,
          type: 'root',
          childUpdates: [{
            op: 'set',
            childIdx: 0,
            childId: expect.any(Number)
          }]
        });
        resolve();
      };
      const root = createRootNode(onCommit);
      render(
        <div className="helloWorld">
          <p>
            This is me!
          </p>
        </div>,
        root
      );
    });
  });
});
