import {
  View,
  Text,
  Pressable,
  Linking,
  Image,
  type ImageProps,
} from 'react-native';
import type { RenderRules } from '../components/ASTRenderer.types';

const renderRules: RenderRules = {
  root: (_node, key, styles, children) => (
    <View key={key} style={styles[`_VIEW_SAFE_${_node.type}`]}>
      {children}
    </View>
  ),
  paragraph: (_node, key, styles, children) => (
    <Text key={key} style={styles.paragraph}>
      {children}
    </Text>
  ),
  strong: (_node, key, styles, children) => (
    <Text key={key} style={styles.strong}>
      {children}
    </Text>
  ),
  emphasis: (node, key, styles, children) => {
    return (
      <Text key={key} style={styles[node.type]}>
        {children}
      </Text>
    );
  },
  delete: () => {
    return null; // Not implemented
  },
  text: (node, key, styles) => {
    return (
      <Text key={key} style={styles.text}>
        {node.value}
      </Text>
    );
  },
  blockquote: (node, key, styles, children) => {
    return (
      <View key={key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        {children}
      </View>
    );
  },
  break: (node, key, styles) => {
    return (
      <Text key={key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        {'\n'}
      </Text>
    );
  },
  thematicBreak: (node, key, styles) => {
    return <View key={key} style={styles[`_VIEW_SAFE_${node.type}`]} />;
  },
  code: (node, key, styles) => {
    return (
      <View key={key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        <Text style={styles[node.type]}>{node.value}</Text>
      </View>
    );
  },
  inlineCode: (node, key, styles) => {
    return (
      <Text key={key} style={styles[node.type]}>
        {node.value}
      </Text>
    );
  },
  imageReference: () => {
    return null; // Not implemented
  },
  definition: () => {
    return null; // Not implemented
  },
  image: (node, key, styles) => {
    const imageProps: ImageProps = {
      source: { uri: node.url },
      style: { flex: 1 },
    };

    if (node.alt) {
      imageProps.accessibilityLabel = node.alt;
      imageProps.alt = node.alt;
      imageProps.accessible = true;
    }

    return (
      <View key={key} style={styles._VIEW_SAFE_image}>
        <Image {...imageProps} />
      </View>
    );
  },
  link: (_node, key, styles, children) => {
    return (
      <Pressable
        key={key}
        style={styles.link}
        onPress={() => Linking.openURL(_node.url)}
      >
        <Text style={styles.link}>{children}</Text>
      </Pressable>
    );
  },
  linkReference: () => {
    return null; // Not implemented
  },
  list: (node, key, styles, children) => {
    return (
      <View key={key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        {children}
      </View>
    );
  },
  listItem: (_node, key, styles, children, _parent, extras) => {
    return (
      <View key={key} style={styles.listItem}>
        {/* Display bullet or number */}
        {extras?.customListStyleType ? (
          extras.customListStyleType
        ) : (
          <Text style={styles.listBullet}>{extras?.listStyleType}</Text>
        )}
        <View style={styles.listItemContent}>{children}</View>
      </View>
    );
  },
  heading: (node, key, styles, children) => {
    return (
      <Text key={key} style={styles[`heading${node.depth}`]}>
        {children}
      </Text>
    );
  },
  unknown: () => {
    return null;
  },
};

export default renderRules;
