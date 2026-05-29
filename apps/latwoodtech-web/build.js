import { copyFile, cp, mkdir, readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateTopology } from './scripts/generate-topology.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');

const BRAND_SURFACES = [
	{ name: 'Prime Self', url: 'https://selfprime.net', category: 'Practitioner intelligence' },
	{ name: 'Capricast', url: 'https://capricast.com', category: 'Interactive creator video' },
	{ name: 'Cypher of Healing', url: 'https://cypherofhealing.com', category: 'Restoration ecosystem' },
	{ name: 'AP Unlimited', url: 'https://apunlimited.com', category: 'Governance studio' },
];

async function probeSurface(surface) {
	const start = Date.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 6000);
	try {
		const res = await fetch(surface.url, {
			method: 'GET',
			redirect: 'follow',
			signal: controller.signal,
			headers: { 'user-agent': 'latwoodtech-web-build-probe/1.0' },
		});
		const durationMs = Date.now() - start;
		return {
			name: surface.name,
			url: surface.url,
			category: surface.category,
			alive: res.ok,
			status: res.status,
			durationMs,
			error: null,
		};
	} catch (error) {
		return {
			name: surface.name,
			url: surface.url,
			category: surface.category,
			alive: false,
			status: 0,
			durationMs: Date.now() - start,
			error: error?.message || String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function probeSurfaces() {
	return Promise.all(BRAND_SURFACES.map(probeSurface));
}

const PUBLIC_SURFACES = [
	{
		name: 'Prime Self',
		category: 'Practitioner intelligence',
		url: 'https://selfprime.net',
		note: 'Chart data, interpretation, and deliverables',
	},
	{
		name: 'Capricast',
		category: 'Interactive creator video',
		url: 'https://capricast.com',
		note: 'Playback, chat, watch parties, and monetization',
	},
	{
		name: 'Cypher of Healing',
		category: 'Restoration ecosystem',
		url: 'https://cypherofhealing.com',
		note: 'The Chair, academy, events, and community',
	},
	{
		name: 'AP Unlimited',
		category: 'Governance studio',
		url: 'https://apunlimited.com',
		note: 'Environment-aware operator controls',
	},
	{
		name: 'Factory Schedule',
		category: 'Render orchestration',
		url: 'https://schedule.latwoodtech.work',
		note: 'Video jobs, health probes, and status handoffs',
	},
];

const REPO_LABELS = {
	HD: 'HumanDesign',
	CC: 'Capricast',
	FA: 'Factory',
	CH: 'Cypher of Healing',
	XC: 'Xico City',
};

function percent(value) {
	return `${value.toFixed(1)}%`;
}

function unique(list) {
	return [...new Set(list)];
}

function summarizeRepoRows(rows, repoKey) {
	const repoRows = rows.filter((row) => row.repo_key === repoKey);
	const verifiedCount = repoRows.filter((row) => row.status === '✅').length;
	const trackedCount = repoRows.length;
	return { verifiedCount, trackedCount };
}

async function buildPulseSnapshot(surfaceHealth) {
	const trackerPath = join(__dirname, '..', '..', 'docs', 'completion-tracker.json');
	const tracker = JSON.parse(await readFile(trackerPath, 'utf8'));
	const rows = Array.isArray(tracker.rows) ? tracker.rows : [];
	const verifiedRows = rows.filter((row) => row.status === '✅').length;
	const attentionRepos = unique([...(tracker.ci_red ?? []), ...(tracker.smoke_red ?? [])]);
	const measuredRepos = Object.keys(tracker.repo_weighted ?? {}).length;
	const repoNames = Object.fromEntries(
		rows
			.filter((row) => row.repo_key && row.repo_name)
			.map((row) => [row.repo_key, row.repo_name]),
	);
	const vectors = Object.entries(tracker.repo_weighted ?? {})
		.map(([repoKey, weighted]) => {
			const isAttention = attentionRepos.includes(repoKey);
			const isCiRed = (tracker.ci_red ?? []).includes(repoKey);
			const { verifiedCount, trackedCount } = summarizeRepoRows(rows, repoKey);
			const weightedProgress = Number(weighted ?? 0);
			const state = verifiedCount > 0 ? `${verifiedCount} verified` : 'Verification pending';
			const context = isCiRed
				? `CI attention${weightedProgress > 0 ? ` • ${percent(weightedProgress)} weighted progress` : ''}`
				: isAttention
					? `Smoke attention${weightedProgress > 0 ? ` • ${percent(weightedProgress)} weighted progress` : ''}`
					: weightedProgress > 0
						? `${percent(weightedProgress)} weighted progress`
						: 'Tracker live from completion matrix';
			return {
				name: REPO_LABELS[repoKey] ?? repoNames[repoKey] ?? repoKey,
				value: String(trackedCount),
				state,
				context,
				tone: isAttention ? 'warning' : weightedProgress >= 50 ? 'good' : 'neutral',
			};
		})
		.sort((left, right) => Number.parseFloat(right.value) - Number.parseFloat(left.value));

	return {
		generatedAt: tracker.generated_at,
		pulse: {
			title: 'Factory Pulse',
			summary:
				'A public-safe operating picture built from completion drift signals, verified work, and curated production surfaces.',
			securityModel:
				'Curated, same-origin JSON generated at build time. No auth, no operator endpoints, no secrets, and no internal request metadata.',
			stats: [
				{
					id: 'verified-rows',
					label: 'Verified functions',
					value: String(verifiedRows),
					context: 'Public proof of executed and tracked work',
				},
				{
					id: 'tracked-capabilities',
					label: 'Tracked capabilities',
					value: String(rows.length),
					context: 'Feature rows under active measurement',
				},
				{
					id: 'public-surfaces',
					label: 'Public surfaces',
					value: String(PUBLIC_SURFACES.length),
					context: 'Branded domains carrying real product work',
				},
				{
					id: 'measured-repos',
					label: 'Repos under measurement',
					value: String(measuredRepos),
					context: 'Cross-repo operating discipline',
				},
			],
			health: [
				{
					label: 'Weighted progress',
					value: percent(Number(tracker.overall_weighted ?? 0)),
					tone: 'neutral',
				},
				{
					label: 'Known coverage',
					value: percent(Number(tracker.overall_known ?? 0)),
					tone: 'good',
				},
				{
					label: 'Active hardening',
					value: `${attentionRepos.length} repos`,
					tone: attentionRepos.length > 0 ? 'warning' : 'good',
				},
				{
					label: 'Risk surface',
					value: 'Read-only',
					tone: 'good',
				},
			],
			story: [
				'Excellence is documented, versioned, and measured across products rather than claimed in a vacuum.',
				'The public surface shows proof of rigor while deeper operator controls remain inside authenticated studio surfaces.',
				'Every visible metric is intentionally curated to communicate craft, readiness, and velocity with minimal risk surface.',
			],
			surfaces: PUBLIC_SURFACES,
			surfaceHealth,
			vectors,
			provenance: [
				'docs/completion-tracker.json',
				'Curated public-domain allowlist in build.js (filtered by build-time liveness probe)',
			],
		},
	};
}

// Regenerate the deterministic topology before we copy src/ -> dist/ so the
// fresh JSON is included in the dist payload.
const { topology } = await generateTopology();

await mkdir(distDir, { recursive: true });
await copyFile(join(srcDir, 'index.html'), join(distDir, 'index.html'));
await copyFile(join(srcDir, 'privacy.html'), join(distDir, 'privacy.html'));
await copyFile(join(srcDir, 'styles.css'), join(distDir, 'styles.css'));
await copyFile(join(srcDir, 'app.js'), join(distDir, 'app.js'));
await copyFile(join(srcDir, 'hero-circuitry.js'), join(distDir, 'hero-circuitry.js'));
await cp(join(srcDir, 'assets'), join(distDir, 'assets'), { recursive: true });
// /status/ — near-live brand surface health page that fetches the
// status-prober Worker with graceful fall-back to data/pulse.json.
await cp(join(srcDir, 'status'), join(distDir, 'status'), { recursive: true });
await mkdir(join(distDir, 'data'), { recursive: true });
await copyFile(
	join(srcDir, 'data', 'circuit-topology.json'),
	join(distDir, 'data', 'circuit-topology.json'),
);

// Liveness probes run in parallel; on CI without outbound network they all
// degrade and the runtime still renders a static topology.
const surfaceHealth = await probeSurfaces();
await writeFile(
	join(distDir, 'data', 'pulse.json'),
	`${JSON.stringify(await buildPulseSnapshot(surfaceHealth), null, 2)}\n`,
	'utf8',
);

const brandTraceCount = topology.traces.filter((t) => t.brand).length;
console.log(
	`Built static site to dist/ — topology: ${topology.nodes.length} nodes / ${topology.traces.length} traces (${brandTraceCount} branded).`,
);
