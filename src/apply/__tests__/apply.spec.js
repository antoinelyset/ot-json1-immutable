import { insertOp, moveOp, editOp, removeOp, replaceOp, type } from 'ot-json1';
import { fromJS } from 'immutable';
import Delta from 'quill-delta';
import apply, { registerSubtype } from '..';

describe('insertOp', () => {
  it('inserts at root', () => {
    const input = undefined;
    const output = fromJS([1]);
    const op = insertOp([], [1]);

    expect(apply(input, op)).toEqual(output);
  });

  it('inserts inside Map', () => {
    const input = fromJS({ a: { b: 1 } });
    const output = fromJS({ a: { b: 1, c: 2 } });
    const op = insertOp(['a', 'c'], 2);

    expect(apply(input, op)).toEqual(output);
  });

  it('inserts inside List', () => {
    const input = fromJS({ a: [1] });
    const output = fromJS({ a: [2, 1] });
    const op = insertOp(['a', 0], 2);

    expect(apply(input, op)).toEqual(output);
  });

  it('throws when inserting in place of existing node', () => {
    const input = fromJS({ a: [0] });
    const op = insertOp(['a'], [1]);

    expect(() => apply(input, op)).toThrow('Node already exists at path: [a]');
  });
});

describe('moveOp', () => {
  it('moves nodes on same level at root', () => {
    const input = fromJS([1, 2]);
    const output = fromJS([2, 1]);
    const op = moveOp([0], [1]);

    expect(apply(input, op)).toEqual(output);
  });

  it('moves nodes on same nested level', () => {
    const input = fromJS({ a: [1, 2] });
    const output = fromJS({ a: [2, 1] });
    const op = moveOp(['a', 0], ['a', 1]);

    expect(apply(input, op)).toEqual(output);
  });

  it('moves nodes on different level', () => {
    const input = fromJS({ a: [1, 2], b: [3] });
    const output = fromJS({ a: [1], b: [2, 3] });
    const op = moveOp(['a', 1], ['b', 0]);

    expect(apply(input, op)).toEqual(output);
  });
});

describe('editOp', () => {
  it('edits nodes with text-unicode ot type', () => {
    const input = fromJS({ a: ['Foo'] });
    const output = fromJS({ a: ['Foo Bar'] });
    const op = editOp(['a', 0], 'text-unicode', [3, ' Bar']);

    expect(apply(input, op)).toEqual(output);
  });

  it('edits nodes with number ot type', () => {
    const input = fromJS({ a: [1] });
    const output = fromJS({ a: [2] });
    const op = editOp(['a', 0], 'number', 1);

    expect(apply(input, op)).toEqual(output);
  });

  it('edits nodes with registered ot type', () => {
    registerSubtype(require('rich-text'));
    const input = fromJS({ a: [new Delta([{ insert: 'Foo' }])] });
    const output = fromJS({ a: [new Delta([{ insert: 'Foo Bar' }])] });
    const op = editOp(['a', 0], 'rich-text', [
      { retain: 3 },
      { insert: ' Bar' },
    ]);

    expect(apply(input, op)).toEqual(output);
  });

  it('throws when ot type is unknown', () => {
    const input = fromJS({ a: ['Foo'] });
    const op = editOp(['a', 0], 'custom-type', ['edit']);

    expect(() => apply(input, op)).toThrow('Missing type: custom-type');
  });
});

describe('removeOp', () => {
  it('removes at root', () => {
    const input = fromJS({ a: {} });
    const output = undefined;
    const op = removeOp([]);

    expect(apply(input, op)).toEqual(output);
  });

  it('removes nested', () => {
    const input = fromJS({ a: { b: {} } });
    const output = fromJS({ a: {} });
    const op = removeOp(['a', 'b']);

    expect(apply(input, op)).toEqual(output);
  });

  it('removes nested and all its children', () => {
    const input = fromJS({ a: { b: { c: [1, 2] } } });
    const output = fromJS({ a: {} });
    const op = removeOp(['a', 'b']);

    expect(apply(input, op)).toEqual(output);
  });
});

describe('replaceOp', () => {
  it('replaces at root', () => {
    const input = fromJS({ a: 1 });
    const output = fromJS(['b', 1]);
    const op = replaceOp([], { a: 1 }, ['b', 1]);

    expect(apply(input, op)).toEqual(output);
  });

  it('replaces nested', () => {
    const input = fromJS({ a: { b: 1 } });
    const output = fromJS({ a: { c: 2 } });
    const op = replaceOp(['a'], { b: 1 }, { c: 2 });

    expect(apply(input, op)).toEqual(output);
  });
});

describe('fancy tests', () => {
  it('handles composed operations', () => {
    registerSubtype(require('rich-text'));

    const input = fromJS([9]);
    const output = fromJS({
      a: new Delta([{ insert: 'Foo Bar' }]),
      b: 8,
      c: 'Foo Bar',
    });

    const op = [
      [{ r: [], i: {} }, [0, { p: 0 }], ['b', { d: 0 }]],
      editOp(['b'], 'number', -1),
      insertOp(['a'], new Delta()),
      editOp(['a'], 'rich-text', [{ insert: 'Foo Bar' }]),
      insertOp(['c'], ''),
      editOp(['c'], 'text-unicode', ['Foo Bar']),
    ].reduce(type.compose, null);

    expect(apply(input, op)).toEqual(output);
  });

  it('converts {x: {y: {}}} to {X: {Y: {}}}', () => {
    const input = fromJS({ x: { y: {} } });
    const output = fromJS({ X: { Y: {} } });
    const op = [['x', { p: 0 }, 'y', { p: 1 }], ['X', { d: 0 }, 'Y', { d: 1 }]];

    expect(apply(input, op)).toEqual(output);
  });

  it('converts {x:10,y:20,z:30} to [10,20,30]', () => {
    const input = fromJS({ x: 10, y: 20, z: 30 });
    const output = fromJS([10, 20, 30]);
    const op = [
      { r: {}, i: [] },
      ['x', { p: 0 }],
      ['y', { p: 1 }],
      ['z', { p: 2 }],
      [0, { d: 0 }],
      [1, { d: 1 }],
      [2, { d: 2 }],
    ];

    expect(apply(input, op)).toEqual(output);
  });

  it('converts {x:{y:{secret:"data"}}} to {y:{x:{secret:"data"}}}', () => {
    const input = fromJS({ x: { y: { secret: 'data' } } });
    const output = fromJS({ y: { x: { secret: 'data' } } });
    const op = [
      ['x', [{ r: {} }, ['y', { p: 0 }]]],
      ['y', [{ i: {} }, ['x', { d: 0 }]]],
    ];

    expect(apply(input, op)).toEqual(output);
  });
});
