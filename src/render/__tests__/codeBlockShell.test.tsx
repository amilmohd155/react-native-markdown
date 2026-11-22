import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { findAll, renderTree, type TestInstance } from '../../__tests__/tree';
import { CodeBlockShell, splitPadding } from '../defaults/codeBlockShell';

const container = {
  backgroundColor: '#eee',
  borderRadius: 6,
  marginBottom: 12,
  padding: 12,
};

function body() {
  return (
    <ScrollView horizontal>
      <Text>{'a = 1'}</Text>
    </ScrollView>
  );
}

const isAccessible = (n: TestInstance) =>
  n.type === 'View' && n.props.accessible === true;

describe('CodeBlockShell', () => {
  it('without a header renders the pre-header markup, unlabelled', async () => {
    const shell = await renderTree(
      <CodeBlockShell code="a = 1" style={container}>
        {body()}
      </CodeBlockShell>
    );
    const today = await renderTree(<View style={container}>{body()}</View>);
    expect(shell.toJSON()).toEqual(today.toJSON());
  });

  it('without a header renders the pre-header markup, labelled', async () => {
    const shell = await renderTree(
      <CodeBlockShell code="a = 1" style={container} labelled>
        {body()}
      </CodeBlockShell>
    );
    const today = await renderTree(
      <View style={container} accessible accessibilityLabel="a = 1">
        {body()}
      </View>
    );
    expect(shell.toJSON()).toEqual(today.toJSON());
  });

  it('with a header labels the body only and moves the padding to it', async () => {
    const tree = await renderTree(
      <CodeBlockShell
        code="a = 1"
        style={container}
        header={<Text testID="header">js</Text>}
      >
        {body()}
      </CodeBlockShell>
    );
    const outer = tree.container.children[0] as TestInstance;
    expect(outer.props.style).toEqual({
      backgroundColor: '#eee',
      borderRadius: 6,
      marginBottom: 12,
      overflow: 'hidden',
    });
    expect(outer.props.accessible).toBeUndefined();
    expect(outer.props.accessibilityLabel).toBeUndefined();

    const [header, labelled] = outer.children as TestInstance[];
    expect(header!.props.testID).toBe('header');
    expect(labelled!.props.accessible).toBe(true);
    expect(labelled!.props.accessibilityLabel).toBe('a = 1');
    expect(labelled!.props.style).toEqual({ padding: 12 });
    expect(findAll(labelled!, (n) => n.props.testID === 'header')).toEqual([]);
    expect(tree.findAll(isAccessible)).toHaveLength(1);
    expect(tree.findAll('RCTScrollView')).toHaveLength(1);
  });

  it('flattens an array of registered styles', async () => {
    const sheet = StyleSheet.create({ a: container, b: { paddingTop: 4 } });
    const tree = await renderTree(
      <CodeBlockShell
        code="x"
        style={[sheet.a, sheet.b]}
        header={<Text>js</Text>}
      >
        {body()}
      </CodeBlockShell>
    );
    const outer = tree.container.children[0] as TestInstance;
    expect(outer.props.style.backgroundColor).toBe('#eee');
    expect(outer.props.style.padding).toBeUndefined();
    expect(tree.find(isAccessible).props.style).toEqual({
      padding: 12,
      paddingTop: 4,
    });
  });
});

describe('splitPadding', () => {
  it('splits every padding key from the rest', () => {
    const padding = {
      padding: 1,
      paddingHorizontal: 2,
      paddingVertical: 3,
      paddingTop: 4,
      paddingRight: 5,
      paddingBottom: 6,
      paddingLeft: 7,
      paddingStart: 8,
      paddingEnd: 9,
    };
    const rest = {
      backgroundColor: 'red',
      borderRadius: 4,
      borderWidth: 1,
      margin: 2,
    };
    expect(splitPadding({ ...padding, ...rest })).toEqual({
      outer: { ...rest, overflow: 'hidden' },
      padding,
    });
  });

  it('keeps a set overflow', () => {
    expect(splitPadding({ overflow: 'visible' }).outer).toEqual({
      overflow: 'visible',
    });
  });

  it('handles an empty style', () => {
    expect(splitPadding(undefined)).toEqual({
      outer: { overflow: 'hidden' },
      padding: {},
    });
  });
});
