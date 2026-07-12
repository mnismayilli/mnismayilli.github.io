#!/usr/bin/env node
// One command to put new material on the live site:
//
//   npm run publish                     -- auto-written commit message
//   npm run publish -- "Week 3 slides"  -- your own message
//
// Builds first so a broken site is caught here rather than in CI, then commits and
// pushes. GitHub Actions (.github/workflows/deploy.yml) deploys every push to main.

import { execFileSync } from 'node:child_process';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf-8' }).trim();
const runLive = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

const git = (...args) => run('git', args);

const status = git('status', '--porcelain');
if (!status) {
    console.log('Nothing to publish — no changes since the last push.');
    process.exit(0);
}

const changed = status
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

console.log(`\n${changed.length} change${changed.length === 1 ? '' : 's'} to publish:`);
for (const file of changed.slice(0, 20)) console.log(`  ${file}`);
if (changed.length > 20) console.log(`  … and ${changed.length - 20} more`);

console.log('\nBuilding…');
try {
    runLive('npm', ['run', 'build']);
} catch {
    console.error('\nBuild failed — nothing was pushed. Fix the error above and run again.');
    process.exit(1);
}

const lectureFiles = changed.filter((file) => file.startsWith('public/lectures/'));
const message =
    process.argv[2] ??
    (lectureFiles.length > 0
        ? `Add ${lectureFiles.length} lecture file${lectureFiles.length === 1 ? '' : 's'}`
        : `Update site (${changed.length} file${changed.length === 1 ? '' : 's'})`);

console.log('\nPublishing…');
git('add', '-A');
git('commit', '-m', message);
runLive('git', ['push']);

const remote = git('remote', 'get-url', 'origin');
const repo = remote.replace(/^git@github\.com:|^https:\/\/github\.com\//, '').replace(/\.git$/, '');
console.log(`\nPushed: "${message}"`);
console.log(`GitHub Actions is deploying now — https://github.com/${repo}/actions`);
console.log('The site updates in about a minute.');
