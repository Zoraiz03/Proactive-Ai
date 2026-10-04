// Opt-in real-provider E2E. Sends only synthetic fixtures and never logs credentials or code.
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLiveProjectRequest } from '../apps/desktop/src/main/live-observer.ts';
import { ProjectContextEngine } from '../apps/desktop/src/main/project-context.ts';
import { validateAndBuildProposedEdit } from '../apps/desktop/src/shared/ai-edit.ts';
import { ProjectContextSchema } from '../src/lib/server/project-context.ts';
import { getSuggestion } from '../src/lib/server/providers.ts';

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('OPENAI_API_KEY is required; load it from the local environment file.');

const fixtures = [
  {
    name: 'wrong-code',
    content: 'def add(a, b):\n    """Return the sum of a and b."""\n    return a - b\n',
    previousContent: 'def add(a, b):\n    """Return the sum of a and b."""\n',
    line: 3,
    column: 17,
    assertion: 'assert add(2, 3) == 5\nassert add(-2, 2) == 0\n',
  },
  {
    name: 'half-code',
    content: 'def square(n):\n    result = n * n',
    previousContent: 'def square(n):\n',
    line: 2,
    column: 19,
    assertion: 'assert square(0) == 0\nassert square(5) == 25\n',
  },
] as const;

const policy = { observerEnabled:true, includeDiagnostics:true, confirmCompleteFile:false, exclusions:[], maximumCharacters:50_000, maximumFileCharacters:8_000, maximumRelatedFiles:4 };
const root = await mkdtemp(join(tmpdir(), 'live-observer-openai-e2e-'));
try {
  const engine = new ProjectContextEngine();
  engine.setWorkspace(root);
  for (const fixture of fixtures.filter((item) => !process.env.OBSERVER_E2E_FIXTURE || item.name === process.env.OBSERVER_E2E_FIXTURE)) {
    const relativePath = `${fixture.name}.py`;
    await writeFile(join(root, relativePath), fixture.content);
    const request = await buildLiveProjectRequest({ relativePath, content:fixture.content, previousContent:fixture.previousContent, line:fixture.line, column:fixture.column, diagnostics:[] }, 'openai', policy, engine);
    const started = Date.now();
    let providerText = '';
    const transport = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const response = await transport(input, init);
      if (process.env.OBSERVER_E2E_DEBUG) {
        const body = await response.clone().json() as { choices?: { message?: { content?: string } }[] };
        providerText = body.choices?.[0]?.message?.content ?? '';
      }
      return response;
    };
    let suggestion;
    try {
      suggestion = await getSuggestion('openai', key, {
        liveObserver:true,
        fileName:request.fileName,
        kind:'code',
        content:'',
        context:{mode:'improve_code'},
        projectContext:ProjectContextSchema.parse(request.contextPackage),
        editBase:request.editBase,
      });
    } catch (error) {
      if (process.env.OBSERVER_E2E_DEBUG) console.error(JSON.stringify({ fixture:fixture.name, providerText }));
      throw error;
    } finally {
      globalThis.fetch = transport;
    }
    if (!suggestion.edit) throw new Error(`${fixture.name}: provider returned no code edit.`);
    const checked = validateAndBuildProposedEdit(suggestion.edit, request.editBase!, fixture.content, request.editBase!.originalContentHash);
    if (!checked.ok) throw new Error(`${fixture.name}: ${checked.message}`);
    const python = spawnSync('python3', ['-I', '-c', `${checked.value.proposedContent}\n${fixture.assertion}`], { encoding:'utf8', timeout:5_000, maxBuffer:100_000 });
    if (python.status !== 0 && process.env.OBSERVER_E2E_DEBUG) console.error(JSON.stringify({ fixture:fixture.name, providerText, proposedContent:checked.value.proposedContent, stderr:python.stderr }));
    if (python.status !== 0) throw new Error(`${fixture.name}: proposed code failed its behavioral assertion.`);
    console.log(JSON.stringify({ fixture:fixture.name, validEdit:true, behaviorPassed:true, editType:suggestion.edit.editType, elapsedMs:Date.now()-started }));
  }
} finally {
  await rm(root, { recursive:true, force:true });
}
