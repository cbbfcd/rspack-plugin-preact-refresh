import path from 'path';
import * as url from 'url';
import { $ } from 'execa';
import fs from 'fs-extra';
import { inc } from 'semver';

const RELEASE_TAG = process.env.TAG || 'beta';
const RELEASE_DRY_RUN = process.env.DRY_RUN || 'true';
const RELEASE_VERSION_TYPE = process.env.VERSION || 'prerelease';
const RELEASE_NPM_TOKEN = process.env.NPM_TOKEN || '';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const PKG_PATH = path.resolve(__dirname, '../package.json');
const pkg = fs.readJsonSync(PKG_PATH);
const currentVersion = pkg.version;
const nextVersion = inc(currentVersion, RELEASE_VERSION_TYPE);
if (!nextVersion) {
  throw new Error(
    `Failed to generate next version from "${currentVersion}" with type "${RELEASE_VERSION_TYPE}"`,
  );
}

console.info(`Release ${RELEASE_TAG} version ${nextVersion}`);

// Update pkg version
console.info(`Updating version from ${currentVersion} to ${nextVersion}`);
pkg.version = nextVersion;
fs.writeJsonSync(PKG_PATH, pkg, { spaces: 2 });

// Write npmrc
const npmrcPath = `${process.env.HOME}/.npmrc`;
console.info(`Writing npmrc to ${npmrcPath}`);
fs.writeFileSync(
  npmrcPath,
  `//registry.npmjs.org/:_authToken=${RELEASE_NPM_TOKEN}`,
);

// Publish to npm
console.info(`Publishing to npm with tag ${RELEASE_TAG}`);
try {
  await $`pnpm publish ${RELEASE_DRY_RUN === 'true' ? '--dry-run' : ''} --tag ${RELEASE_TAG} --no-git-checks --provenance`;
  console.info(`Published successfully`);
} catch (e) {
  console.error(`Publish failed: ${e.message}`);
  process.exit(1);
}

// Push tag to github
if (RELEASE_DRY_RUN !== 'true') {
  console.info(`Pushing tag to github`);
  try {
    await $`git config --global --add safe.directory /github/workspace`;
    await $`git config --global user.name "github-actions[bot]"`;
    await $`git config --global user.email "github-actions[bot]@users.noreply.github.com"`;
    await $`git status`;
    await $`git tag v${RELEASE_TAG} -m v${RELEASE_TAG}`;
    await $`git push origin ${RELEASE_TAG}`;
    console.info(`Pushed tag successfully`);
    fs.removeSync(npmrcPath);
    await $`git add --all`;
    await $`git commit -m "release v${RELEASE_TAG}"`;
    await $`git push`;
    console.info(`Pushed branch successfully`);
  } catch (e) {
    console.error(`Push tag failed: ${e.message}`);
    process.exit(1);
  }
}