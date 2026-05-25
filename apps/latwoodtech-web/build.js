import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');

// Only customer-facing brand surfaces belong here. Internal infra hosts
// (schedule.latwoodtech.work, monitor.latwoodtech.work, supervisor.latwoodtech.work,
// webhooks.latwoodtech.work) are operator plumbing, not products — list them
// in the authenticated Admin Studio, never on the public landing.
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
];

// Build-time liveness probe so a dead landing page can never silently ship
// into pulse.json. HEAD with redirect-follow; fall back to GET if the origin
// rejects HEAD. Surfaces that don't respond < 400 within the timeout get
// dropped from the public feed with a build-log warning.
async function probeSurface(surface, timeoutMs = 8000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const attempt = async (method) => {
		const response = await fetch(surface.url, {
			method,
			redirect: 'follow',
			signal: controller.signal,
			headers: { 'User-Agent': 'latwoodtech-web build-probe' },
		});
		return response.status;
	};
	const startedAt = Date.now();
	try {
		let status = await attempt('HEAD');
		if (status === 405 || status === 501) status = await attempt('GET');
		clearTimeout(timer);
		return { surface, alive: status < 400, status, durationMs: Date.now() - startedAt };
	} catch (error) {
		clearTimeout(timer);
		return { surface, alive: false, error: error.message, durationMs: Date.now() - startedAt };
	}
}

async function probeAllSurfaces(surfaces) {
	const results = await Promise.all(surfaces.map((s) => probeSurface(s)));
	for (const result of results) {
		if (!result.alive) {
			const detail = result.error ? `error=${result.error}` : `status=${result.status}`;
			console.warn(
				`[pulse] dropping surface ${result.surface.name} (${result.surface.url}) — ${detail}`,
			);
		}
	}
	return results;
}

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

async function buildPulseSnapshot() {
	const trackerPath = join(__dirname, '..', '..', 'docs', 'completion-tracker.json');
	const tracker = JSON.parse(await readFile(trackerPath, 'utf8'));
	const rows = Array.isArray(tracker.rows) ? tracker.rows : [];
	const verifiedRows = rows.filter((row) => row.status === '✅').length;
	const probeResults = await probeAllSurfaces(PUBLIC_SURFACES);
	const liveSurfaces = probeResults.filter((r) => r.alive).map((r) => r.surface);
	const surfaceHealth = probeResults.map((r) => ({
		name: r.surface.name,
		url: r.surface.url,
		category: r.surface.category,
		alive: r.alive,
		status: r.status ?? null,
		durationMs: r.durationMs,
		error: r.error ?? null,
	}));
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
					value: String(liveSurfaces.length),
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
			surfaces: liveSurfaces,
			surfaceHealth,
			vectors,
			provenance: [
				'docs/completion-tracker.json',
				'Curated public-domain allowlist in build.js (filtered by build-time liveness probe)',
			],
		},
	};
}

// Clean build: wipe the subtrees we are about to recreate so removed source
// files don't linger in the deployed bundle (cp doesn't delete extraneous
// destination files). We avoid removing distDir itself because Windows
// frequently holds a handle on the directory inode (explorer thumbnails,
// editors), which makes a top-level rmdir fail with EBUSY.
await mkdir(distDir, { recursive: true });
await rm(join(distDir, 'assets'), { recursive: true, force: true, maxRetries: 3 });
await rm(join(distDir, 'stack'), { recursive: true, force: true, maxRetries: 3 });
await rm(join(distDir, 'status'), { recursive: true, force: true, maxRetries: 3 });
await rm(join(distDir, '.well-known'), { recursive: true, force: true, maxRetries: 3 });
await rm(join(distDir, 'data'), { recursive: true, force: true, maxRetries: 3 });
await copyFile(join(srcDir, 'index.html'), join(distDir, 'index.html'));
await copyFile(join(srcDir, 'styles.css'), join(distDir, 'styles.css'));
await copyFile(join(srcDir, 'app.js'), join(distDir, 'app.js'));
await cp(join(srcDir, 'assets'), join(distDir, 'assets'), { recursive: true });
await mkdir(join(distDir, 'stack'), { recursive: true });
await copyFile(join(srcDir, 'stack', 'index.html'), join(distDir, 'stack', 'index.html'));
// /status/ — near-live brand surface health page that fetches the
// status-prober Worker with graceful fall-back to data/pulse.json.
await cp(join(srcDir, 'status'), join(distDir, 'status'), { recursive: true });

// Credibility signals: humans.txt (humanstxt.org) at root; security.txt
// (RFC 9116) under /.well-known/. Both are 1-2 KB and absence reads
// "not yet a real platform" to senior engineers / security researchers.
await copyFile(join(srcDir, 'humans.txt'), join(distDir, 'humans.txt'));
await mkdir(join(distDir, '.well-known'), { recursive: true });
await copyFile(join(srcDir, '.well-known', 'security.txt'), join(distDir, '.well-known', 'security.txt'));

await mkdir(join(distDir, 'data'), { recursive: true });
await writeFile(
	join(distDir, 'data', 'pulse.json'),
	`${JSON.stringify(await buildPulseSnapshot(), null, 2)}\n`,
	'utf8',
);

console.log('Built static site to dist/');
