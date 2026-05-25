import trainingLibraryManifest from '../../content-briefs/prime-self/training-library.json';

export type TrainingLibraryStatus = 'ready' | 'planned' | 'draft' | 'archived';

export type TrainingLibraryComposition = 'MarketingVideo' | 'TrainingVideo' | 'WalkthroughVideo';

export interface TrainingLibraryModule {
  briefKey: string;
  composition: TrainingLibraryComposition;
  audience: string;
  area: string;
  status: TrainingLibraryStatus;
  topic: string;
}

export interface TrainingLibraryManifest {
  appId: string;
  library: string;
  version: number;
  updatedAt: string;
  description: string;
  modules: TrainingLibraryModule[];
}

const manifests: Record<string, TrainingLibraryManifest> = {
  prime_self: trainingLibraryManifest as TrainingLibraryManifest,
};

export function getTrainingLibrary(appId: string): TrainingLibraryManifest | null {
  return manifests[appId] ?? null;
}

export function getTrainingModule(appId: string, briefKey: string): TrainingLibraryModule | null {
  const library = getTrainingLibrary(appId);
  return library?.modules.find((module) => module.briefKey === briefKey) ?? null;
}

export function listTrainingModules(appId: string): TrainingLibraryModule[] {
  return getTrainingLibrary(appId)?.modules ?? [];
}

export function listReadyTrainingModules(appId: string): TrainingLibraryModule[] {
  return listTrainingModules(appId).filter((module) => module.status === 'ready');
}
