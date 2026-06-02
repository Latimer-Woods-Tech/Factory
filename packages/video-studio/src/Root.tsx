import React from 'react';
import { Composition, registerRoot } from 'remotion';
import {
  EnergyBlueprintVideo,
  blueprintSchema,
} from './compositions/EnergyBlueprintVideo.js';
import type { EnergyBlueprintProps } from './compositions/EnergyBlueprintVideo.js';
import { DEFAULT_BRAND_COLOR } from './blueprint-types.js';
import { totalDurationFrames } from './sourceScenes.js';

/** Frame rate of every composition in this library. */
export const VIDEO_FPS = 30;
/** Render width (1080p landscape). */
export const VIDEO_WIDTH = 1920;
/** Render height (1080p landscape). */
export const VIDEO_HEIGHT = 1080;
/**
 * Default frame count for blueprint-only films (75s at 30fps). Used as a
 * studio-preview fallback; real renders compute duration dynamically from the
 * scene arc via the `calculateMetadata` callback below.
 */
export const ENERGY_BLUEPRINT_FRAMES = 2250;

/**
 * Remotion root for `@latimer-woods-tech/video-studio`.
 *
 * Registers the `EnergyBlueprintVideo` composition so the Cloud Run render
 * service and `apps/video-studio` can bundle and render it. Duration is
 * computed dynamically from `props.scenes` (Slice 3+) so a multi-source film
 * renders at its exact length. The 2250-frame default applies only to
 * blueprint-only Slice-2 renders and studio-preview where no scenes are passed.
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
      calculateMetadata={({ props }: { props: EnergyBlueprintProps }) => {
        const frames =
          props.scenes && props.scenes.length > 0
            ? totalDurationFrames(props.scenes)
            : ENERGY_BLUEPRINT_FRAMES;
        return { durationInFrames: frames };
      }}
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
