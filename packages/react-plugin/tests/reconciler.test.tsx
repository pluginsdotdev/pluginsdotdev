import React from 'react';
import fc from "fast-check";
import { render, createRootNode } from '../src/reconciler';
import type { ReconciliationUpdate, ReconciliationSetPropUpdate, ReconciliationPropUpdate } from '@pluginsdotdev/bridge';

type RootNode = ReturnType<typeof createRootNode>;
type ReconciliationUpdatesPromise = Promise<ReconciliationUpdate[]>;
type UpdatesForRenderResult = Promise<{ root: RootNode, updates: ReconciliationUpdate[] }>;

const updatesForRender = (
  el: React.ReactNode,
  rootNode?: RootNode
): UpdatesForRenderResult => {
  return new Promise((resolve, reject) => {
    const onCommit = (_: any, updates: ReconciliationUpdate[]) => {
      resolve({ root, updates });
    };
    if ( rootNode ) {
      rootNode.onCommit = onCommit;
    }
    const root = rootNode ?? createRootNode(onCommit);
    render(el, root);
  });
}

describe('reconcile', () => {
  it('basic rendering', () => {
    return new Promise((resolve, reject) => {
      const onCommit = (_: any, updates: ReconciliationUpdate[]) => {
        // TODO: write an expect.anyCapture that can capture named values
        //       to assert that they are the same when used multiple times.
        //       unification for the win.
        expect(updates).toContainEqual({
          nodeId: expect.any(String),
          type: 'text',
          textUpdate: { text: "This is me!" }
        });
        expect(updates).toContainEqual({
          nodeId: expect.any(String),
          type: 'p',
          propUpdates: [],
          childUpdates: [{
            op: 'set',
            childIdx: 0,
            childId: expect.any(String)
          }]
        });
        expect(updates).toContainEqual({
          nodeId: expect.any(String),
          type: 'div',
          propUpdates: [{
            op: 'set',
            prop: 'className',
            value: 'helloWorld'
          }],
          childUpdates: [{
            op: 'set',
            childIdx: 0,
            childId: expect.any(String)
          }]
        });
        expect(updates).toContainEqual({
          nodeId: "0",
          type: 'root',
          childUpdates: [{
            op: 'set',
            childIdx: 0,
            childId: expect.any(String)
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

  it('numeric children', async () => {
    const { updates, root } = await updatesForRender(
      <div className="helloWorld">
        <p>
          {4}
        </p>
      </div>
    );

    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: 'text',
      textUpdate: {
        text: '4'
      }
    });
  });

  it('rendering for updates', async () => {
    const { updates, root } = await updatesForRender(
      <div className="helloWorld">
        <p>
          This is me!
        </p>
      </div>
    );

    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: 'text',
      textUpdate: {
        text: 'This is me!'
      }
    });

    const { updates: updates2 } = await updatesForRender(
      <div className="helloWorld">
        <p>
          This is me?
        </p>
      </div>,
      root
    );
    expect(updates2.length).toEqual(2);
    expect(updates2).toContainEqual({
      nodeId: expect.any(String),
      type: 'p',
      childUpdates: [
        { op: 'delete', childId: expect.any(String) },
        { op: 'set', childId: expect.any(String), childIdx: 0 }
      ],
      propUpdates: []
    });
    expect(updates2).toContainEqual({
      nodeId: expect.any(String),
      type: 'text',
      textUpdate: {
        text: 'This is me?'
      }
    });

    const { updates: updates3 } = await updatesForRender(
      <div className="helloWorld">
        <div>
          This is me?
        </div>
      </div>,
      root
    );
    expect(updates3).toContainEqual({
      nodeId: expect.any(String),
      type: "text",
      textUpdate: {
        text: "This is me?"
      }
    });
    expect(updates3).toContainEqual({
      nodeId: expect.any(String),
      type: 'div',
      childUpdates: [
        { op: 'set', childId: expect.any(String), childIdx: 0 }
      ],
      propUpdates: []
    });
    expect(updates3).toContainEqual({
      nodeId: expect.any(String),
      type: 'div',
      childUpdates: [
        { op: 'delete', childId: expect.any(String) },
        { op: 'set', childId: expect.any(String), childIdx: 0 }
      ]
    });
  });

  it('rendering for text updates', async () => {
    const { updates, root } = await updatesForRender(
      <div className="helloWorld">
        <p>
          yo {"hi"}
        </p>
      </div>
    );

    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: 'text',
      textUpdate: {
        text: 'hi'
      }
    });

    const { updates: updates2 } = await updatesForRender(
      <div className="helloWorld">
        <p>
          yo {"bye"}
        </p>
      </div>,
      root
    );
    expect(updates2).toContainEqual({
      nodeId: expect.any(String),
      type: 'text',
      textUpdate: {
        text: 'bye'
      }
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
        async (items: {type: string, props: Record<string, any>}[]) => {
          const { updates } = await updatesForRender(
            React.createElement(
              'div', 
              {},
              items.map(({ type, props }, key) => (
                React.createElement(type, { key, ...props })
              ))
            )
          );

          items.forEach(({ type, props }) => {
            expect(updates).toContainEqual({
              nodeId: expect.any(String),
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

  it('should produce updates with the right props on update', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constantFrom('div', 'p', 'a', 'img'),
            props: fc.dictionary(
              fc.string(),
              fc.record({
                state: fc.constantFrom('removed', 'added', 'maintained'),
                value: fc.anything({ values: [fc.boolean(), fc.integer(), fc.string(), fc.constant(null)] }),
              })
            )
          })
        ),
        async (items_: {type: string, props: { [prop: string]: {value: any; state: string } }}[]) => {
          const items = items_.map(item => ({
            type: item.type,
            props: Object.keys(item.props).map(prop => {
              const { value, state } = item.props[prop];
              return {
                prop,
                value,
                state
              };
            })
          }));
          const validStatesByPart = {
            first: new Set(['removed', 'maintained']),
            second: new Set(['added', 'maintained'])
          };

          const updateBatches: ReconciliationUpdate[][] = [];
          let onBatchReady: null | (() => void);
          const onCommit = (_: any, updates: ReconciliationUpdate[]) => {
            updateBatches.push(updates);
            if ( onBatchReady ) {
              onBatchReady();
            }
          };
          const root = createRootNode(onCommit);
          const getUpdates = (): ReconciliationUpdatesPromise => (
            new Promise((resolve, reject) => {
              if ( updateBatches.length ) {
                resolve(updateBatches.pop());
                return;
              }

              onBatchReady = () => {
                resolve(updateBatches.pop());
                onBatchReady = null;
              };
            })
          );
          const makeProps = (ps: { prop: string; value: any }[]) => (
            ps.reduce((props, {prop, value}) => ({
              ...props,
              [prop]: value
            }), {})
          );

          const renderForPart = (part: 'first' | 'second') => {
            render(
              React.createElement(
                'div', 
                {},
                items.map(({ type, props }, key) => (
                  React.createElement(type, { key, ...makeProps(props.filter(p => validStatesByPart[part].has(p.state))) })
                ))
              ),
              root
            );
          };

          const getSetProps = (props: { prop: string; value: any; state: string }[]) => (
            props
              .reverse()
              .reduce(({ seen, propUpdates }, { prop, value }) => {
                if ( seen.has(prop) ) {
                  return { seen, propUpdates };
                }
                seen.add(prop);
                const propUpdate: ReconciliationSetPropUpdate = {
                  op: 'set',
                  prop,
                  value
                };
                propUpdates.add(propUpdate);
                return {
                  seen,
                  propUpdates
                };
              }, {
                seen: new Set<string>(),
                propUpdates: new Set<ReconciliationSetPropUpdate>()
              }).propUpdates
          );

          renderForPart('first');
          const updates = await getUpdates();

          items.forEach(({ type, props }) => {
            expect(
              updates.map(update => ({
                ...update,
                propUpdates: new Set(update.propUpdates)
              }))
            ).toContainEqual({
              nodeId: expect.any(String),
              type,
              propUpdates: getSetProps(
                props.filter(p => validStatesByPart.first.has(p.state))
              )
            });
          });

          renderForPart('second');
          const updates2 = await getUpdates();

          items.forEach(({ type, props }) => {
            const delPropUpdates: ReconciliationPropUpdate[] = Array.from(new Set(
              props
                .filter(p => p.state === 'removed')
                .map(p => p.prop)
            )).map(prop => ({
              op: 'delete',
              prop
            }));

            const setPropUpdates: Set<ReconciliationPropUpdate> = getSetProps(
              props.filter(p => p.state === 'added')
            );

            const propUpdates = new Set(delPropUpdates.concat(Array.from(setPropUpdates)));

            if ( !propUpdates.size ) {
              return;
            }

            expect(
              updates2.map(update => ({
                ...update,
                propUpdates: new Set(update.propUpdates)
              }))
            ).toContainEqual({
              nodeId: expect.any(String),
              type,
              propUpdates
            });
          });
        }
      )
    );
  });
});
