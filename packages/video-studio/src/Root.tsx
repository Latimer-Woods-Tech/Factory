import React from 'react';
import { Composition, registerRoot } from 'remotion';
import {
  EnergyBlueprintVideo,
  blueprintSchema,
} from './compositions/EnergyBlueprintVideo.js';
import { DEFAULT_BRAND_COLOR } from './blueprint-types.js';

/** Frame rate of every composition in this library. */
export const VIDEO_FPS = 30;
/** Render width (1080p landscape). */
export const VIDEO_WIDTH = 1920;
/** Render height (1080p landscape). */
export const VIDEO_HEIGHT = 1080;
/** Total frames in the Energy Blueprint composition (75s at 30fps). */
export const ENERGY_BLUEPRINT_FRAMES = 2250;

/**
 * Remotion root for `@latimer-woods-tech/video-studio`.
 *
 * Registers the `EnergyBlueprintVideo` composition so the Cloud Run render
 * service (Wave 2) and `apps/video-studio` can bundle and render it. The
 * `defaultProps` are placeholder studio-preview values only — real renders pass
 * resolved props (built via {@link chartToScenes}) and selfprime-authored
 * narration. No on-screen string here uses the word "AI".
 */
export const EnergyBlueprintRoot: React.FC = () => {
  return (
    <Composition
      id="EnergyBlueprintVideo"
      component={EnergyBlueprintVideo}
      durationInFrames={ENERGY_BLUEPRINT_FRAMES}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      schema={blueprintSchema}
      defaultProps={{
        appId: 'prime_self',
        topic: 'Your Pattern Has Always Been Here',
        script:
          'Before you learned to explain yourself, your pattern was already complete. The moment of your birth encoded something specific — a frequency that was yours from the beginning. This is a map of your original pattern: the way energy moves through you, and the way it does not. When you return to what your design actually says, life stops feeling like resistance and starts to flow.',
        narrationUrl: '',
        brandColor: DEFAULT_BRAND_COLOR,
        brandAccent: DEFAULT_BRAND_COLOR,
        logoUrl: '',
        forgeTheme: 'self',
      }}
    />
  );
};

registerRoot(EnergyBlueprintRoot);
