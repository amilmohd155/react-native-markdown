import {
  View,
  Text,
  Pressable,
  Linking,
  Image,
  type ImageProps,
  type ImageStyle,
} from 'react-native';
import type { RenderRules } from '../components/ASTRenderer.types';

const renderRules: RenderRules = {
  root: ({ node, styles, children }) => (
    <View key={node.key} style={styles._VIEW_SAFE_root}>
      {children}
    </View>
  ),
  paragraph: ({ node, styles, children }) => (
    <Text key={node.key} style={styles.paragraph}>
      {children}
    </Text>
  ),
  strong: ({ node, styles, children }) => (
    <Text key={node.key} style={styles.strong}>
      {children}
    </Text>
  ),
  emphasis: ({ node, styles, children }) => {
    return (
      <Text key={node.key} style={styles.emphasis}>
        {children}
      </Text>
    );
  },
  delete: ({ node, styles, children }) => {
    // Won't work unless a plugin is used https://github.com/syntax-tree/mdast-util-gfm-strikethrough
    return (
      <Text key={node.key} style={styles.delete}>
        {children}
      </Text>
    );
  },
  text: ({ node, styles }) => {
    return (
      <Text key={node.key} style={styles.text} maxFontSizeMultiplier={1.2}>
        {node.value}
      </Text>
    );
  },
  blockquote: ({ node, styles, children }) => {
    return (
      <View key={node.key} style={styles._VIEW_SAFE_blockquote}>
        {children}
      </View>
    );
  },
  break: ({ node, styles }) => {
    return (
      <Text key={node.key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        {'\n'}
      </Text>
    );
  },
  thematicBreak: ({ node, styles }) => {
    return <View key={node.key} style={styles[`_VIEW_SAFE_${node.type}`]} />;
  },
  code: ({ node, styles }) => {
    return (
      <View key={node.key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        <Text style={styles[node.type]}>{node.value}</Text>
      </View>
    );
  },
  inlineCode: ({ node, styles }) => {
    return (
      <Text key={node.key} style={styles[node.type]}>
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
  image: ({ node, styles }) => {
    const imageProps: ImageProps = {
      source: { uri: node.url },
      style: styles.image as ImageStyle,
    };

    if (node.alt) {
      imageProps.accessibilityLabel = node.alt;
      imageProps.alt = node.alt;
      imageProps.accessible = true;
    }

    return (
      <View key={node.key}>
        <Image {...imageProps} />
      </View>
    );
  },
  link: ({ node, styles, children }) => {
    return (
      <Pressable
        key={node.key}
        style={styles._VIEW_SAFE_link}
        onPress={() => Linking.openURL(node.url)}
      >
        <Text style={styles.link}>{children}</Text>
      </Pressable>
    );
  },
  linkReference: () => {
    return null; // Not implemented
  },
  list: ({ node, styles, children }) => {
    return (
      <View key={node.key} style={styles[`_VIEW_SAFE_${node.type}`]}>
        {children}
      </View>
    );
  },
  listItem: ({ node, styles, children, extras }) => {
    return (
      <View key={node.key} style={styles.listItem}>
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
  heading: ({ node, styles, children }) => {
    return (
      <Text key={node.key} style={styles[`heading${node.depth}`]}>
        {children}
      </Text>
    );
  },
  unknown: ({ node }) => {
    console.warn('Unknown node type encountered', node.type);
    return null;
  },
};

export default renderRules;
