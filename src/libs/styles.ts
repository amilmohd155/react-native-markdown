import { Platform } from 'react-native';
import type { StyleMap } from '../types/style.types';

export const styles: StyleMap = {
  root: {},
  heading1: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  heading2: {
    fontSize: 36,
    fontWeight: 'semibold',
  },
  heading3: {
    fontSize: 32,
    fontWeight: 'semibold',
  },
  heading4: {
    fontSize: 28,
    fontWeight: 'semibold',
  },
  heading5: {
    fontSize: 24,
    fontWeight: 'semibold',
  },
  heading6: {
    fontSize: 20,
    fontWeight: 'semibold',
  },
  paragraph: {
    marginVertical: 8,
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
  },
  strong: {
    fontWeight: 'bold',
  },
  emphasis: {
    fontStyle: 'italic',
  },
  text: {},
  break: {},
  thematicBreak: {
    flex: 1,
    height: 1,
    backgroundColor: '#0000006c',
    marginVertical: 12,
  },
  blockquote: {
    backgroundColor: '#f5f5f5',
    borderColor: '#3840ba',
    borderLeftWidth: 4,
    marginLeft: 5,
    paddingHorizontal: 5,
  },

  code: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
    fontSize: 16,
    color: '#333',
    ...Platform.select({
      ['ios']: {
        fontFamily: 'Courier',
      },
      ['android']: {
        fontFamily: 'monospace',
      },
    }),
  },
  inlineCode: {
    ...Platform.select({
      ['ios']: {
        fontFamily: 'Courier',
      },
      ['android']: {
        fontFamily: 'monospace',
      },
    }),
    backgroundColor: '#f0f0f0',
    padding: 4,
    borderRadius: 4,
  },
  link: {
    transform: [
      {
        translateY: 2, // Adjust vertical alignment for links
      },
    ],
    fontSize: 16,
    color: '#1e90ff',
    textDecorationLine: 'underline',
  },
  linkReference: {},
  image: {
    width: 200,
    height: 300,
    resizeMode: 'contain',
    borderRadius: 8,
    marginVertical: 8,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-start',
    gap: 8,
  },
  listBullet: {
    fontSize: 16,
    fontWeight: 'black',
  },
  listItemContent: {
    flex: 1,
    flexWrap: 'wrap',
  },
};
