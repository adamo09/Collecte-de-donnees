/** Métro empaquette les images comme des modules ; TypeScript a besoin
 *  qu'on le lui dise. */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType;
  export default source;
}
