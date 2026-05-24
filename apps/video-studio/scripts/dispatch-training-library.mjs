import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const manifestPath = resolve(__dirname, '..', 'content-briefs', 'prime-self', 'training-library.json');
const raw = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);

const args = process.argv.slice(2);
const dispatch = args.includes('--dispatch');
const countArg = args.find((value) => value.startsWith('--count='));
const count = countArg ? Number(countArg.split('=')[1]) : 3;
const appId = 'prime_self';
const defaultBrandColor = '#8B5CF6';
const defaultBrandAccent = '#10B981';
const defaultLogoUrl = 'https://selfprime.net/icons/icon-72.png';

if (Number.isNaN(count) || count < 1 || count > 10) {
  console.error('Invalid --count value. Provide an integer between 1 and 10.');
  process.exit(1);
}

const readyModules = manifest.modules.filter((module) => module.status === 'ready').slice(0, count);

if (!readyModules.length) {
  console.log('No ready modules found in the training library manifest.');
  process.exit(0);
}

const commands = readyModules.map((module) => {
  const jobId = `training-${module.briefKey}`;
  return [
    'gh workflow run render-video.yml',
    '--repo Latimer-Woods-Tech/Factory',
    '-f', `job_id=${jobId}`,
    '-f', `composition_id=${module.composition}`,
    '-f', `app_id=${appId}`,
    '-f', `topic=${module.topic}`,
    '-f', `brief_key=${module.briefKey}`,
    '-f', `brand_color=${defaultBrandColor}`,
    '-f', `brand_accent=${defaultBrandAccent}`,
    '-f', `logo_url=${defaultLogoUrl}`,
  ].join(' ');
});

console.log('Training library render commands:');
commands.forEach((cmd) => console.log(cmd));

if (dispatch) {
  console.log('\nDispatching commands now...');
  for (const command of commands) {
    console.log(`\n$ ${command}`);
    execSync(command, { stdio: 'inherit' });
  }
}
