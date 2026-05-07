export const repoRegistry = {
  videoking: {
    path: "_external_reviews/videoking",
    validate: [
      {
        name: "Typecheck",
        command: "pnpm typecheck",
      },
      {
        name: "CI validation",
        command: "pnpm test:ci",
      },
      {
        name: "Pre-deploy checks",
        command: "node scripts/pre-deploy-checks.js --ci",
        env: {
          NEXT_PUBLIC_API_BASE_URL: "https://api.capricast.com",
          NEXT_PUBLIC_APP_URL: "https://capricast.com",
        },
      },
    ],
  },
  "xico-city": {
    path: "_external_reviews/xico-city",
    validate: [
      {
        name: "Registry validation",
        command: "npm run registry:validate",
        failurePatterns: ["FATAL:"],
      },
      {
        name: "Typecheck",
        command: "npm run typecheck",
      },
      {
        name: "Tests",
        command: "npm test",
      },
    ],
  },
  humandesign: {
    path: "_external_reviews/humandesign",
    validate: [
      {
        name: "Push gate",
        command: "npm run verify:push",
        requiredEnv: ["GITHUB_TOKEN"],
        failurePatterns: ["[verify-push] ERROR:"],
      },
    ],
  },
  coh: {
    path: "_external_reviews/coh",
    validate: [
      {
        name: "Typecheck",
        command: "npm run typecheck",
      },
    ],
  },
  focusbro: {
    path: "_external_reviews/focusbro",
    validate: [],
    notes: "No mature validate contract is available yet. Shipping requires --allow-unvalidated.",
  },
};

export function getRepoNames() {
  return Object.keys(repoRegistry).sort();
}