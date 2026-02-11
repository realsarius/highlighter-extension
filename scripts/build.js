/**
 * Build script for multi-browser extension packaging.
 * No dependencies — uses only Node.js built-in modules.
 *
 * Usage:
 *   node scripts/build.js           → builds all targets
 *   node scripts/build.js chromium  → builds only Chromium
 *   node scripts/build.js firefox   → builds only Firefox
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const MANIFEST_COMMON = path.join(ROOT, 'manifest.common.json');

// ============================================
// BROWSER TARGETS
// ============================================

const TARGETS = {
    chromium: {
        background: { service_worker: 'background/background.js' }
    },
    firefox: {
        background: { scripts: ['background/background.js'] }
    }
};

// ============================================
// FILE OPERATIONS
// ============================================

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ============================================
// BUILD
// ============================================

function build(targetName) {
    const target = TARGETS[targetName];
    if (!target) {
        console.error(`❌ Unknown target: ${targetName}`);
        console.error(`   Available: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(1);
    }

    const outputDir = path.join(DIST, targetName);

    console.log(`\n🔨 Building ${targetName}...`);

    // 1. Clean output directory
    cleanDir(outputDir);

    // 2. Copy all source files
    copyDir(SRC, outputDir);

    // 3. Generate manifest.json with browser-specific background
    const common = JSON.parse(fs.readFileSync(MANIFEST_COMMON, 'utf-8'));
    const manifest = { ...common, background: target.background };
    fs.writeFileSync(
        path.join(outputDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    // Count files
    const fileCount = countFiles(outputDir);
    console.log(`✅ ${targetName} → dist/${targetName}/ (${fileCount} files)`);
}

function countFiles(dir) {
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            count += countFiles(path.join(dir, entry.name));
        } else {
            count++;
        }
    }
    return count;
}

// ============================================
// MAIN
// ============================================

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : Object.keys(TARGETS);

console.log('📦 Highlighter Extension Builder');
console.log('================================');

for (const target of targets) {
    build(target);
}

console.log('\n🎉 Done!\n');
