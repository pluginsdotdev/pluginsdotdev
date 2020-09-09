import React from 'react';
import fc from "fast-check";
import { render, createRootNode } from '../src/reconciler';
import type { ReconciliationUpdate } from '@pluginsdotdev/bridge';

describe('reconcile', () => {
  it('basic rendering', () => {
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
          propUpdates: [],
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
          }],
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

describe('properties', () => {
  it('should produce updates with the right props', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constantFrom('div', 'p', 'a', 'img'),
            props: fc.dictionary(
              fc.string(),
              fc.anything({ values: [fc.boolean(), fc.integer(), fc.string(), fc.constant(null)] })
            )
          })
        ),
        async (items: Array<{type: string, props: Record<string, any>}>) => {
          const updates = await new Promise<Array<ReconciliationUpdate>>((resolve, reject) => {
            const onCommit = (_: any, updates: Array<ReconciliationUpdate>) => {
              resolve(updates);
            };
            const root = createRootNode(onCommit);
            render(
              React.createElement(
                'div', 
                {},
                items.map(({ type, props }, key) => (
                  React.createElement(type, { key, ...props })
                ))
              ),
              root
            );
          });

          items.forEach(({ type, props }) => {
            expect(updates).toContainEqual({
              nodeId: expect.any(Number),
              type,
              propUpdates: Object.keys(props).map(prop => ({
                op: 'set',
                prop,
                value: props[prop]
              }))
            });
          });
        }
      )
    );
  });
});
