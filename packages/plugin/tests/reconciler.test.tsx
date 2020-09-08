import React from 'react';
import { render, createRootNode } from '../src/reconciler';
import type { ReconciliationUpdate } from '@pluginsdotdev/bridge';

describe('reconcile', () => {
  it('should work', () => {
    return new Promise((resolve, reject) => {
      const onCommit = (_: any, updates: Array<ReconciliationUpdate>) => {
        console.log(JSON.stringify(updates));
        resolve();
      };
      const root = createRootNode(onCommit);
      render(
        <div className="helloWorld">
          <div>
            This is me!
          </div>
        </div>,
        root
      );
    });
  });
});
