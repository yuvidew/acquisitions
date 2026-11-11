// Turns Jest's JSON output into GitHub annotations and a step summary.
import fs from 'node:fs';
import path from 'node:path';

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
const lines = ['## Test results', ''];

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const clean = text =>
  String(text).replace(ANSI, '').replace(/%/g, '%25').replace(/\r?\n/g, ' | ');

const flush = () => {
  if (summaryFile) fs.appendFileSync(summaryFile, lines.join('\n') + '\n');
};

if (!fs.existsSync('test-results.json')) {
  console.log(
    '::error title=Tests did not produce results::Jest crashed before writing test-results.json. Check the "Run tests with coverage" step log.'
  );
  lines.push('❌ Jest did not produce a results file.');
  flush();
  process.exit(0);
}

const r = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));

lines.push(
  r.success ? '✅ All tests passed' : '❌ Some tests failed',
  '',
  '| Suites | Tests | Passed | Failed | Skipped |',
  '|---|---|---|---|---|',
  `| ${r.numTotalTestSuites} | ${r.numTotalTests} | ${r.numPassedTests} | ${r.numFailedTests} | ${r.numPendingTests} |`,
  ''
);

for (const suite of r.testResults) {
  const file = path.relative(process.cwd(), suite.name).replace(/\\/g, '/');
  const failed = suite.assertionResults.filter(a => a.status === 'failed');

  // Suite failed before any test ran (syntax/import error, etc.).
  if (suite.status === 'failed' && failed.length === 0) {
    const msg = clean(
      (suite.message || 'Test suite failed to run').slice(0, 600)
    );
    console.log(`::error file=${file},title=Test suite failed to run::${msg}`);
  }

  for (const t of failed) {
    const title = t.fullName.replace(/[,:\r\n]/g, ' ');
    const msg = clean((t.failureMessages[0] || 'Test failed').slice(0, 600));
    console.log(`::error file=${file},title=${title}::${msg}`);
  }
}

if (fs.existsSync('coverage/coverage-summary.json')) {
  const c = JSON.parse(
    fs.readFileSync('coverage/coverage-summary.json', 'utf8')
  ).total;
  lines.push(
    '### Coverage',
    '',
    '| Statements | Branches | Functions | Lines |',
    '|---|---|---|---|',
    `| ${c.statements.pct}% | ${c.branches.pct}% | ${c.functions.pct}% | ${c.lines.pct}% |`,
    ''
  );
} else {
  lines.push('_Coverage summary not available._', '');
}

flush();
