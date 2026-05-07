#!/usr/bin/env node

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { getRepoNames, repoRegistry } from "./agent-ship.repos.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const factoryRoot = path.resolve(__dirname, "..");

function printUsage() {
  console.log(`Factory agent ship orchestrator

Usage:
  node scripts/agent-ship.mjs --list
  node scripts/agent-ship.mjs --repo <name> --validate-only
  node scripts/agent-ship.mjs --all --validate-only
  node scripts/agent-ship.mjs --repo <name> --message "commit message"
  node scripts/agent-ship.mjs --all --message "commit message" --no-push
  node scripts/agent-ship.mjs --repo <name> --message "commit message" --open-pr

Options:
  --repo <name>             Target a single registered repo
  --all                     Target every registered repo
  --list                    Show the registered repos and their paths
  --message <text>          Commit message to use when shipping
  --validate-only           Run validation only, never commit or push
  --dry-run                 Print commands without executing mutations
  --no-push                 Commit locally but do not push
  --open-pr                 Create or update a pull request after push
  --pr-base <branch>        Pull request base branch (default: main)
  --pr-title <text>         Pull request title (default: commit message)
  --pr-body <text>          Pull request body text
  --pr-body-file <path>     Pull request body file path
  --draft-pr                Create the pull request as draft
  --allow-main              Allow commit/push from main
  --allow-unvalidated       Allow shipping repos with no validate contract
`);
}

function parseArgs(argv) {
  const args = {
    repo: null,
    all: false,
    list: false,
    message: null,
    validateOnly: false,
    dryRun: false,
    noPush: false,
    openPr: false,
    prBase: "main",
    prTitle: null,
    prBody: null,
    prBodyFile: null,
    draftPr: false,
    allowMain: false,
    allowUnvalidated: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--repo":
        args.repo = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--all":
        args.all = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--message":
        args.message = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--validate-only":
        args.validateOnly = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--no-push":
        args.noPush = true;
        break;
      case "--open-pr":
        args.openPr = true;
        break;
      case "--pr-base":
        args.prBase = argv[index + 1] ?? "main";
        index += 1;
        break;
      case "--pr-title":
        args.prTitle = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--pr-body":
        args.prBody = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--pr-body-file":
        args.prBodyFile = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--draft-pr":
        args.draftPr = true;
        break;
      case "--allow-main":
        args.allowMain = true;
        break;
      case "--allow-unvalidated":
        args.allowUnvalidated = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${token}`);
        printUsage();
        process.exit(1);
    }
  }

  return args;
}

function runShell(command, cwd, env = {}, dryRun = false) {
  console.log(`   $ ${command}`);
  if (dryRun) {
    return { status: 0, stdout: "", stderr: "" };
  }

  const result = spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function runGit(args, cwd, dryRun = false) {
  const rendered = `git ${args.join(" ")}`;
  console.log(`   $ ${rendered}`);
  if (dryRun) {
    return { status: 0, stdout: "", stderr: "" };
  }

  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

function runProgram(program, args, cwd, dryRun = false) {
  console.log(`   $ ${program} ${args.join(" ")}`);
  if (dryRun) {
    return { status: 0, stdout: "", stderr: "" };
  }

  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function captureGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    status: result.status ?? 1,
  };
}

function captureProgram(program, args, cwd) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    status: result.status ?? 1,
  };
}

function ensureRepoSelection(args) {
  if (args.list) {
    return;
  }

  if ((args.repo && args.all) || (!args.repo && !args.all)) {
    console.error("Choose exactly one of --repo <name> or --all.");
    printUsage();
    process.exit(1);
  }

  if (!args.validateOnly && !args.message) {
    console.error("--message is required when committing.");
    process.exit(1);
  }

  if (args.noPush && args.openPr) {
    console.error("--open-pr requires push. Remove --no-push.");
    process.exit(1);
  }

  if (args.prBody && args.prBodyFile) {
    console.error("Use either --pr-body or --pr-body-file, not both.");
    process.exit(1);
  }
}

function ensureGhAvailable(cwd) {
  const gh = captureProgram("gh", ["--version"], cwd);
  if (!gh.ok) {
    throw new Error("GitHub CLI (gh) is required for --open-pr.");
  }
}

function syncPullRequest(cwd, branchName, args) {
  ensureGhAvailable(cwd);

  const title = args.prTitle ?? args.message;
  const bodyArgs = args.prBodyFile
    ? ["--body-file", path.resolve(factoryRoot, args.prBodyFile)]
    : args.prBody
      ? ["--body", args.prBody]
      : ["--body", "Automated by Factory agent-ship."];

  const existing = captureProgram("gh", ["pr", "list", "--head", branchName, "--json", "number,url", "--limit", "1"], cwd);
  if (!existing.ok) {
    throw new Error(existing.stderr || "Unable to query pull requests with gh.");
  }

  let currentPullRequest = [];
  try {
    currentPullRequest = existing.stdout ? JSON.parse(existing.stdout) : [];
  } catch {
    currentPullRequest = [];
  }

  if (currentPullRequest.length > 0) {
    const existingPullRequest = currentPullRequest[0];
    console.log(`   ! Updating existing PR #${existingPullRequest.number}: ${existingPullRequest.url}`);
    const editResult = runProgram("gh", ["pr", "edit", String(existingPullRequest.number), "--title", title, ...bodyArgs], cwd, args.dryRun);
    if ((editResult.status ?? 1) !== 0) {
      throw new Error("gh pr edit failed.");
    }
    return;
  }

  const createArgs = ["pr", "create", "--base", args.prBase, "--head", branchName, "--title", title, ...bodyArgs];
  if (args.draftPr) {
    createArgs.push("--draft");
  }

  const createResult = runProgram("gh", createArgs, cwd, args.dryRun);
  if ((createResult.status ?? 1) !== 0) {
    throw new Error("gh pr create failed.");
  }
}

function printRegistry() {
  console.log("Registered repos:\n");
  for (const name of getRepoNames()) {
    const entry = repoRegistry[name];
    const mode = entry.validate.length > 0 ? `${entry.validate.length} validation step(s)` : "no validate contract";
    console.log(`- ${name}`);
    console.log(`  path: ${entry.path}`);
    console.log(`  contract: ${mode}`);
    if (entry.notes) {
      console.log(`  notes: ${entry.notes}`);
    }
  }
}

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exitCode = 1;
}

function executeValidation(name, entry, cwd, args) {
  console.log(`\n==> ${name}: validation`);
  if (entry.validate.length === 0) {
    console.log("   ! No validate contract registered.");
    if (entry.notes) {
      console.log(`   ! ${entry.notes}`);
    }
    return { ok: false, skipped: true };
  }

  for (const step of entry.validate) {
    console.log(` - ${step.name}`);
    if (step.requiredEnv?.length) {
      const missingEnv = step.requiredEnv.filter((key) => !process.env[key]);
      if (missingEnv.length > 0) {
        console.error(`   ! Missing required environment variables: ${missingEnv.join(", ")}`);
        return { ok: false, skipped: false };
      }
    }
    const result = runShell(step.command, cwd, step.env, args.dryRun);
    if ((result.status ?? 1) !== 0) {
      return { ok: false, skipped: false };
    }
    const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (step.failurePatterns?.some((pattern) => combinedOutput.includes(pattern))) {
      console.error(`   ! Validation output matched failure pattern(s): ${step.failurePatterns.join(", ")}`);
      return { ok: false, skipped: false };
    }
  }

  return { ok: true, skipped: false };
}

function executeShip(name, cwd, args, validation) {
  console.log(`\n==> ${name}: ship`);

  if (!validation.ok) {
    if (validation.skipped && args.allowUnvalidated) {
      console.log("   ! Proceeding without repo validation because --allow-unvalidated was set.");
    } else {
      throw new Error("Validation did not pass. Refusing to ship.");
    }
  }

  const branch = captureGit(["branch", "--show-current"], cwd);
  if (!branch.ok) {
    throw new Error(branch.stderr || "Unable to determine current branch.");
  }

  if (branch.stdout === "main" && !args.allowMain) {
    throw new Error("Refusing to ship from main without --allow-main.");
  }

  const conflicts = captureGit(["diff", "--name-only", "--diff-filter=U"], cwd);
  if (!conflicts.ok) {
    throw new Error(conflicts.stderr || "Unable to inspect merge conflicts.");
  }
  if (conflicts.stdout) {
    throw new Error("Working tree has unresolved merge conflicts.");
  }

  const status = captureGit(["status", "--short"], cwd);
  if (!status.ok) {
    throw new Error(status.stderr || "Unable to inspect working tree.");
  }

  if (!status.stdout) {
    console.log("   ! No local changes. Skipping commit and push.");
    return;
  }

  let result = runGit(["add", "-A"], cwd, args.dryRun);
  if ((result.status ?? 1) !== 0) {
    throw new Error("git add failed.");
  }

  const staged = captureGit(["diff", "--cached", "--name-only"], cwd);
  if (!staged.ok) {
    throw new Error(staged.stderr || "Unable to inspect staged diff.");
  }
  if (!staged.stdout) {
    console.log("   ! Nothing staged after git add. Skipping commit and push.");
    return;
  }

  result = runGit(["commit", "-m", args.message], cwd, args.dryRun);
  if ((result.status ?? 1) !== 0) {
    const stderr = result.stderr?.trim();
    if (stderr) {
      console.error(stderr);
    }
    throw new Error("git commit failed.");
  }

  if (args.noPush) {
    console.log("   ! --no-push set, leaving commit local.");
    return;
  }

  const upstream = captureGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  const pushArgs = upstream.ok ? ["push"] : ["push", "-u", "origin", branch.stdout];
  result = runGit(pushArgs, cwd, args.dryRun);
  if ((result.status ?? 1) !== 0) {
    const stderr = result.stderr?.trim();
    if (stderr) {
      console.error(stderr);
    }
    throw new Error("git push failed.");
  }

  if (args.openPr) {
    syncPullRequest(cwd, branch.stdout, args);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureRepoSelection(args);

  if (args.list) {
    printRegistry();
    return;
  }

  const targetNames = args.all ? getRepoNames() : [args.repo];
  let failures = 0;

  for (const name of targetNames) {
    const entry = repoRegistry[name];
    if (!entry) {
      console.error(`Unknown repo: ${name}`);
      failures += 1;
      continue;
    }

    const cwd = path.resolve(factoryRoot, entry.path);
    console.log(`\n============================================================`);
    console.log(`${name} (${cwd})`);
    console.log(`============================================================`);

    try {
      const validation = executeValidation(name, entry, cwd, args);
      if (args.validateOnly) {
        if (!validation.ok && !validation.skipped) {
          throw new Error("Validation failed.");
        }
      } else {
        executeShip(name, cwd, args, validation);
      }
    } catch (error) {
      failures += 1;
      console.error(`\n${name} failed: ${error.message}`);
    }
  }

  if (failures > 0) {
    fail(`${failures} repo(s) failed.`);
  } else {
    console.log("\nAll requested repo operations completed.");
  }
}

main();