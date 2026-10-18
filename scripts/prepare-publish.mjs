// scripts/prepare-publish.mjs
// Runs inside the published mirror repo right before `npm publish`.
// Rewrites any "workspace:*" / "workspace:^" @rymi/* dependency to a real
// "^<published-version>" range resolved from the npm registry. In the mirror
// there is no pnpm workspace, so workspace protocol specifiers would otherwise
// be unresolvable for consumers.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

function resolveLatest(name) {
    // Poll npm: an upstream dependency (e.g. @rymi/sdk-types) published moments
    // earlier in the same release may take a few seconds to become visible.
    for (let i = 0; i < 12; i++) {
        try {
            const v = execSync(`npm view ${name} version`, { encoding: 'utf8' }).trim();
            if (v) return v;
        } catch {
            /* not yet on the registry */
        }
        execSync('sleep 5');
    }
    throw new Error(`Could not resolve a published version for ${name} after retries`);
}

let changed = false;
for (const field of ['dependencies', 'peerDependencies']) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
        if (typeof range === 'string' && range.startsWith('workspace:') && name.startsWith('@rymi/')) {
            const version = resolveLatest(name);
            deps[name] = `^${version}`;
            changed = true;
            console.log(`${name}: ${range} -> ^${version}`);
        }
    }
}

if (changed) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('package.json rewritten for publish');
} else {
    console.log('no workspace:* deps to rewrite');
}
