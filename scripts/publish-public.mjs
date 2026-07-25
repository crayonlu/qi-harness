#!/usr/bin/env node
/**
 * Publish workspace packages as public under @crayonlu.
 *
 * Scoped packages default to private on npm unless access=public sticks.
 * This script:
 *  1. publishes with --access public (also set in .npmrc + publishConfig)
 *  2. verifies unauthenticated GET; if still private, runs
 *     `npm access set status=public` (may prompt browser OTP)
 *
 * Usage:
 *   node scripts/publish-public.mjs
 *   node scripts/publish-public.mjs @crayonlu/qi-harness
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_ORDER = [
	"@crayonlu/qi-cleanup",
	"@crayonlu/qi-bash-bg",
	"@crayonlu/qi-rewind",
	"@crayonlu/qi-harness",
];

const requested = process.argv.slice(2);
const packages = requested.length > 0 ? requested : DEFAULT_ORDER;

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {
		cwd: root,
		stdio: "inherit",
		shell: false,
		...opts,
	});
	if (r.status !== 0) {
		process.exit(r.status ?? 1);
	}
}

async function isPublic(name) {
	const enc = name.replace("/", "%2f");
	const res = await fetch(`https://registry.npmjs.org/${enc}`);
	if (!res.ok) return false;
	const body = await res.json();
	return Boolean(body["dist-tags"]?.latest);
}

async function ensurePublic(name) {
	if (await isPublic(name)) {
		console.log(`ok public: ${name}`);
		return;
	}
	console.log(`not public yet — setting access: ${name}`);
	run("npm", ["access", "set", "status=public", name], { stdio: "inherit" });
	// brief settle
	await new Promise((r) => setTimeout(r, 2000));
	if (!(await isPublic(name))) {
		console.error(`FAILED to make public: ${name}`);
		console.error("Authorize the browser OTP if prompted, then re-run this script.");
		process.exit(1);
	}
	console.log(`ok public: ${name}`);
}

console.log("npm access config → public (project .npmrc)");
for (const name of packages) {
	console.log(`\n=== publish ${name} ===`);
	run("npm", ["publish", "-w", name, "--access", "public"]);
	await ensurePublic(name);
}

console.log("\nall done");
