#!/usr/bin/env node
/**
 * install.js — code-warden auto-installer
 *
 * Scans for installed AI apps and deploys the skill to each detected target.
 *
 * Usage:
 *   node install.js                              # scan, prompt, install
 *   node install.js --all                        # scan, install all without prompt
 *   node install.js --dry-run                    # scan, show plan, write nothing
 *   node install.js --list                       # show detection results and exit
 *   node install.js --doctor                     # verify health of all detected installs
 *   node install.js --verify-target=claude       # strict health check for one target; exits nonzero if unknown or not installed
 *   node install.js --verify-target=claude,warp  # check multiple targets
 *   node install.js --target=claude,cursor       # force specific targets (warns if not detected)
 *   node install.js --hooks=claude               # install PreToolUse hooks into ~/.claude/settings.json
 *   node install.js --uninstall-hooks=claude     # remove code-warden hook entries from ~/.claude/settings.json
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const { TARGETS }           = require('./tools/auto-targets');
const { scanTargets }       = require('./tools/auto-detect');
const { installWindsurf }   = require('./tools/auto-windsurf-adapter');
const { getCodexHookRepairHint, inspectHookEntries, inspectHooksFeature } = require('./tools/lib/codex-config');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SOURCE_DIR  = __dirname;
const SKILL_NAME  = 'code-warden';
const PKG         = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'package.json'), 'utf8'));
const VERSION     = PKG.version;
const SKIP_DIRS   = new Set(['node_modules', '.git', 'target']);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log  = msg => console.log(`[CodeWarden] ${msg}`);
const ok   = msg => console.log(`  [PASS] ${msg}`);
const skip = msg => console.log(`  [SKIP] ${msg}`);
const fail = msg => console.error(`  [FAIL] ${msg}`);

// ---------------------------------------------------------------------------
// File copy (recursive, skips heavy dirs)
// ---------------------------------------------------------------------------

function copyRecursive(src, dest) {
  for (const entry of fs.readdirSync(src)) {
    if (SKIP_DIRS.has(entry)) continue;
    const srcPath  = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Install manifest (.code-warden-install.json written into each install dir)
// ---------------------------------------------------------------------------

function writeManifest(destDir, target, installPath = destDir) {
  const manifest = {
    skill:       SKILL_NAME,
    version:     VERSION,
    target:      target.id,
    format:      target.format,
    installedAt: new Date().toISOString(),
    installPath,
  };
  fs.writeFileSync(
    path.join(destDir, '.code-warden-install.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

// ---------------------------------------------------------------------------
// Install one target (atomic: copy to .tmp, then swap)
// ---------------------------------------------------------------------------

function installTarget(target, dryRun) {
  if (target.format === 'windsurf-flat') {
    const destFile = path.join(target.skillsDir, `${SKILL_NAME}.md`);
    if (dryRun) {
      ok(`DRY RUN: would write Windsurf flat file -> ${destFile}`);
      return true;
    }
    try {
      installWindsurf(SOURCE_DIR, target.skillsDir);
      ok(`Windsurf flat file written -> ${destFile}`);
      return true;
    } catch (err) {
      fail(`Windsurf install failed: ${err.message}`);
      return false;
    }
  }

  // skill-md: copy full folder atomically via temp dir
  const destDir = path.join(target.skillsDir, SKILL_NAME);
  const tmpDir  = `${destDir}.tmp`;

  if (dryRun) {
    ok(`DRY RUN: would install -> ${destDir}`);
    return true;
  }
  try {
    // Clean up stale temp from any previous failed install
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

    // Stage into temp dir first
    fs.mkdirSync(tmpDir, { recursive: true });
    copyRecursive(SOURCE_DIR, tmpDir);
    writeManifest(tmpDir, target, destDir);

    // Swap: remove old, rename temp into place
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
    fs.renameSync(tmpDir, destDir);

    ok(`Installed -> ${destDir}`);
    return true;
  } catch (err) {
    // Best-effort cleanup of temp on failure
    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    fail(`Install failed for ${target.name}: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const pick = prefix => {
    const a = args.find(a => a.startsWith(prefix));
    return a ? a.split('=')[1].split(',').map(s => s.trim()) : null;
  };
  return {
    dryRun:       args.includes('--dry-run'),
    all:          args.includes('--all'),
    list:         args.includes('--list'),
    doctor:       args.includes('--doctor'),
    targetFilter:        pick('--target='),
    verifyTarget:        pick('--verify-target='),
    hooksTarget:         pick('--hooks='),
    uninstallHooksTarget: pick('--uninstall-hooks='),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Doctor helpers — shared by --doctor and --verify-target
// ---------------------------------------------------------------------------

function checkSourceIntegrity(issues) {
  const check = (label, pass) => {
    if (pass) ok(label); else { fail(label); issues.push(label); }
  };
  log('Checking source integrity...\n');
  check('SKILL.md present',                fs.existsSync(path.join(SOURCE_DIR, 'SKILL.md')));
  check('references/ present',             fs.existsSync(path.join(SOURCE_DIR, 'references')));
  check('tools/get-context.js present',    fs.existsSync(path.join(SOURCE_DIR, 'tools', 'get-context.js')));
  check('tools/warden-lint.js present',    fs.existsSync(path.join(SOURCE_DIR, 'tools', 'warden-lint.js')));
  check('tools/verify-secrets.js present', fs.existsSync(path.join(SOURCE_DIR, 'tools', 'verify-secrets.js')));
  const scripts = Object.keys(PKG.scripts || {});
  check('package.json: install-auto script',    scripts.includes('install-auto'));
  check('package.json: install-dry-run script', scripts.includes('install-dry-run'));
}

function checkTarget(t, issues) {
  const check = (label, pass) => {
    if (pass) ok(label); else { fail(label); issues.push(label); }
  };
  if (t.format === 'windsurf-flat') {
    const flatFile = path.join(t.skillsDir, `${SKILL_NAME}.md`);
    console.log(`  ${t.name}`);
    check(`    Windsurf flat file present (${flatFile})`, fs.existsSync(flatFile));
  } else {
    const installDir   = path.join(t.skillsDir, SKILL_NAME);
    const manifestPath = path.join(installDir, '.code-warden-install.json');
    const skillMdPath  = path.join(installDir, 'SKILL.md');
    console.log(`  ${t.name} (${installDir})`);
    const hasManifest = fs.existsSync(manifestPath);
    check('    Manifest (.code-warden-install.json) present', hasManifest);
    if (hasManifest) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        check(`    Manifest version current (${m.version} == ${VERSION})`, m.version === VERSION);
      } catch {
        fail('    Manifest present but could not be parsed');
        issues.push(`${t.id}: manifest parse error`);
      }
    }
    check('    SKILL.md present in install dir', fs.existsSync(skillMdPath));

    if (t.id === 'claude') {
      const sp = path.join(t.skillsDir, '..', 'settings.json');
      if (fs.existsSync(sp)) { try {
        const cw=(JSON.parse(fs.readFileSync(sp,'utf8'))?.hooks?.PreToolUse||[]).flatMap(m=>m.hooks||[]).filter(h=>String(h.description||'').startsWith('code-warden:'));
        if(cw.length>0){check(`    Hooks registered (${cw.length})`,true);cw.forEach(h=>{const p=h.args&&h.args[0];check(`    Hook script: ${path.basename(p||'?')}`,!!(p&&fs.existsSync(p)));});}
      } catch { fail('    settings.json parse error'); issues.push('claude: settings.json'); } }
    }
    if (t.id === 'codex') {
      const hp = path.join(t.skillsDir, '..', 'hooks.json');
      const hooks = inspectHookEntries(hp);
      if (!hooks.exists) skip('    Codex hooks not registered');
      if (hooks.parseError) { fail('    hooks.json parse error'); issues.push('codex: hooks.json'); }
      if (hooks.entries.length>0){const missing=hooks.entries.map(e=>e.args&&e.args[0]).filter(p=>!(p&&fs.existsSync(p)));check(`    Hooks registered (${hooks.entries.length})`,true);hooks.entries.forEach(e=>{const p=e.args&&e.args[0];check(`    Hook script: ${path.basename(p||'?')}`,!!(p&&fs.existsSync(p)));});const cfg=inspectHooksFeature();check('    config.toml [features].hooks enabled', cfg.enabled);if (cfg.deprecated) { fail('    Deprecated [features].codex_hooks present'); issues.push('codex: deprecated codex_hooks'); }const hint=getCodexHookRepairHint({entries:hooks.entries,missingScripts:missing,config:cfg});if(hint) console.error(`  [FIX]     ${hint}`);}
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Doctor — verify source integrity + all detected installs
// ---------------------------------------------------------------------------

function runDoctor(scanned) {
  const issues = [];
  checkSourceIntegrity(issues);
  console.log('');
  log('Checking installed targets...\n');
  const detected = scanned.filter(t => t.detected);
  if (detected.length === 0) console.log('  -- No targets detected on this machine.\n');
  for (const t of detected) checkTarget(t, issues);
  const count = issues.length;
  log(`Doctor complete. ${count === 0 ? 'No issues found.' : `${count} issue(s) found.`}`);
  if (count > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Verify-target — strict per-target health check
// ---------------------------------------------------------------------------

function runVerifyTarget(ids) {
  const knownIds = TARGETS.map(t => t.id);
  const issues   = [];

  // Validate all requested IDs before doing any checks
  const unknown = ids.filter(id => !knownIds.includes(id));
  if (unknown.length > 0) {
    for (const id of unknown) {
      console.error(`[CodeWarden] [FAIL] Unknown target ID: "${id}"`);
    }
    console.error(`[CodeWarden]        Known IDs: ${knownIds.join(', ')}`);
    process.exit(1);
  }

  checkSourceIntegrity(issues);
  console.log('');
  log(`Checking target(s): ${ids.join(', ')}\n`);

  for (const id of ids) {
    const t = TARGETS.find(t => t.id === id);
    checkTarget(t, issues);
  }

  const count = issues.length;
  log(`Verify-target complete. ${count === 0 ? 'No issues found.' : `${count} issue(s) found.`}`);
  if (count > 0) process.exit(1);
}

// ---------------------------------------------------------------------------

function destPath(target) {
  return target.format === 'windsurf-flat'
    ? path.join(target.skillsDir, `${SKILL_NAME}.md`)
    : path.join(target.skillsDir, SKILL_NAME);
}

async function main() {
  const { dryRun, all, list, doctor, targetFilter, verifyTarget,
          hooksTarget, uninstallHooksTarget } = parseArgs(process.argv);

  log(`Auto-Installer v${VERSION}`);

  // --verify-target: strict per-target check — does not need a scan
  if (verifyTarget) {
    runVerifyTarget(verifyTarget);
    return;
  }

  if (hooksTarget || uninstallHooksTarget) {  // --hooks / --uninstall-hooks dispatch
    const HOOK_TARGETS = { claude: 'Claude Code', codex: 'OpenAI Codex' };
    const ids = hooksTarget || uninstallHooksTarget;
    const bad = ids.filter(id => !HOOK_TARGETS[id]);
    if (bad.length > 0) {
      console.error(`[CodeWarden] hooks support: ${Object.keys(HOOK_TARGETS).join(', ')}. Unknown: ${bad.join(', ')}`);
      process.exit(1);
    }
    for (const id of ids) {
      const skillDir = path.join(TARGETS.find(t => t.id === id).skillsDir, SKILL_NAME);
      const mod = require(`./tools/hooks/${id}/${hooksTarget ? 'install' : 'uninstall'}-hooks`);
      if (hooksTarget) {
        log(`Installing hooks for ${HOOK_TARGETS[id]}...`);
        mod.installHooks(skillDir);
        ok('Hook entries written');
        log(`Restart ${HOOK_TARGETS[id]} for hooks to take effect.`);
      } else {
        log(`Removing hooks for ${HOOK_TARGETS[id]}...`);
        mod.uninstallHooks();
        log(`Restart ${HOOK_TARGETS[id]} for changes to take effect.`);
      }
    }
    return;
  }

  log('Scanning for installed AI apps...\n');

  // Step 1: Detection — annotate all targets, never mutate detected field here
  const scanned = scanTargets(TARGETS);

  // --doctor: verify health of source + all detected installs, then exit
  if (doctor) {
    runDoctor(scanned);
    return;
  }

  // Step 2: Selection — separate concern from detection
  let selected;
  if (targetFilter) {
    // Explicit override: honour --target= regardless of detection result
    selected = scanned.filter(t => targetFilter.includes(t.id));
    for (const t of selected) {
      if (!t.detected) {
        console.warn(`[CodeWarden] WARN  ${t.name} was not detected but was explicitly requested.`);
      }
    }
  } else {
    // Auto: only install what was detected
    selected = scanned.filter(t => t.detected);
  }

  // Print full scan table (detected + undetected)
  for (const r of scanned) {
    const isSelected = selected.some(s => s.id === r.id);
    const status     = isSelected ? 'FOUND' : '--   ';
    const methodNote = r.method ? ` (${r.method})` : '';
    console.log(`  ${status}  ${r.name.padEnd(22)} -> ${destPath(r)}${list ? methodNote : ''}`);
  }
  console.log('');

  // --list: just show scan results and exit
  if (list) {
    log('Use --all or --target=<id> to install.');
    process.exit(0);
  }

  if (selected.length === 0) {
    log('No targets selected. Use --target=claude,cursor to force install.');
    process.exit(0);
  }

  if (!all && !dryRun) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve =>
      rl.question(`Install to ${selected.length} target(s)? [Y/n] `, resolve)
    );
    rl.close();
    if (answer.trim().toLowerCase() === 'n') {
      log('Aborted.');
      process.exit(0);
    }
    console.log('');
  }

  log(dryRun ? 'Dry run — no files will be written.\n' : 'Installing...\n');

  let success = 0;
  let failure = 0;

  for (const target of selected) {
    if (installTarget(target, dryRun)) success++;
    else failure++;
  }

  console.log('');
  log(`Done. ${success} ${dryRun ? 'planned' : 'installed'}, ${failure} failed.`);
  if (!dryRun) log('Next: run `code-warden doctor`, then `code-warden report`.\n[CodeWarden] Optional hard hooks: `code-warden hooks claude` or `code-warden hooks codex`.\n[CodeWarden] Restart or refresh your agent session to load the updated skill.');
  if (failure > 0) process.exit(1);
}

main().catch(err => {
  console.error(`[CodeWarden] Fatal: ${err.message}`);
  process.exit(1);
});
