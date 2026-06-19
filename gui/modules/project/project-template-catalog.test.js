import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const catalog = readJSON('shared/project-template-catalog.json');
const templates = catalog.templates;
const templateKeys = Object.keys(templates);

// Mirror of KNOWN_PROMPT_PROFILES in app.js / project-io-controller.js. Each
// value maps directly to a folder under prompts/agents/<profile>.
const KNOWN_PROMPT_PROFILES = new Set(['full', 'minimized', 'full-image', 'minimized-image']);

const LOCALE_FILES = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'];

test('catalog has the four expected templates', () => {
  assert.deepEqual(
    templateKeys.sort(),
    ['default', 'default-image', 'extended', 'extended-image'].sort(),
  );
});

// These are exactly the invariants electron-main.cjs:normalizeProjectTemplateOrThrow
// enforces; a violation here means project:create would throw at runtime.
for (const [key, t] of Object.entries(templates)) {
  test(`template "${key}" satisfies normalize invariants`, () => {
    assert.ok(typeof t.id === 'string' && t.id.trim().length > 0, 'id must be a non-empty string');
    assert.ok(Array.isArray(t.layers) && t.layers.length > 0, 'layers must be a non-empty array');
    assert.ok(Array.isArray(t.agents) && t.agents.length > 0, 'agents must be a non-empty array');
    assert.ok(
      t.layers.includes(t.defaultActiveLayer),
      `defaultActiveLayer "${t.defaultActiveLayer}" must be one of layers`,
    );
    assert.ok(
      KNOWN_PROMPT_PROFILES.has(t.promptProfile),
      `promptProfile "${t.promptProfile}" must be a known profile`,
    );
  });

  test(`template "${key}" has prompt files for every agent under its profile`, () => {
    const profileDir = path.join(ROOT, 'prompts', 'agents', t.promptProfile);
    assert.ok(fs.existsSync(profileDir), `prompt folder missing: prompts/agents/${t.promptProfile}`);
    for (const agent of t.agents) {
      const promptFile = path.join(profileDir, `${agent}.prompt.md`);
      assert.ok(
        fs.existsSync(promptFile),
        `missing prompt: prompts/agents/${t.promptProfile}/${agent}.prompt.md`,
      );
    }
  });
}

test('image variants add resource-provider on top of their base template', () => {
  const basePairs = [
    ['default', 'default-image'],
    ['extended', 'extended-image'],
  ];
  for (const [base, image] of basePairs) {
    const baseAgents = templates[base].agents;
    const imageAgents = templates[image].agents;
    assert.ok(!baseAgents.includes('resource-provider'), `${base} should not include resource-provider`);
    assert.ok(imageAgents.includes('resource-provider'), `${image} should include resource-provider`);
    // Image variant = base agents + resource-provider, nothing else changed.
    assert.deepEqual(imageAgents, [...baseAgents, 'resource-provider']);
    assert.deepEqual(templates[image].layers, templates[base].layers);
  }
});

// Parse the New Project dropdown so we catch drift between the UI and the catalog.
const indexHtml = fs.readFileSync(path.join(ROOT, 'gui', 'index.html'), 'utf8');
const selectMatch = indexHtml.match(/<select id="new-project-template">([\s\S]*?)<\/select>/);

test('index.html dropdown exists and is parseable', () => {
  assert.ok(selectMatch, 'new-project-template <select> not found in index.html');
});

const optionRe = /<option value="([^"]+)"([^>]*?)data-i18n="([^"]+)"/g;
const options = [];
{
  let m;
  while ((m = optionRe.exec(selectMatch ? selectMatch[1] : '')) !== null) {
    options.push({ value: m[1], selected: /\bselected\b/.test(m[2]), i18nKey: m[3] });
  }
}

test('dropdown option values match catalog keys exactly', () => {
  assert.deepEqual(
    options.map((o) => o.value).sort(),
    templateKeys.sort(),
  );
});

test('default is the pre-selected dropdown option', () => {
  const selected = options.filter((o) => o.selected);
  assert.equal(selected.length, 1, 'exactly one option should be selected');
  assert.equal(selected[0].value, 'default');
});

test('every dropdown i18n key is present in all locale files', () => {
  const locales = Object.fromEntries(
    LOCALE_FILES.map((name) => [name, readJSON(`gui/locales/${name}.json`)]),
  );
  for (const opt of options) {
    for (const name of LOCALE_FILES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(locales[name], opt.i18nKey),
        `locale ${name}.json missing key "${opt.i18nKey}"`,
      );
    }
  }
});
