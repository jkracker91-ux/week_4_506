// Reproduces the save/publish race and prints a timeline.
//
// Run with:
//   npm run harness:race

const { performance } = require('node:perf_hooks');
const supertest = require('supertest');

process.env.RACE_TRACE = process.env.RACE_TRACE || '1';
process.env.SAVE_COMMIT_DELAY_MS = process.env.SAVE_COMMIT_DELAY_MS || '300';

const app = require('../app/server');

const traceStart = performance.now();

function elapsed() {
  return `${(performance.now() - traceStart).toFixed(1)}ms`;
}

function log(event, details = {}) {
  console.log(
    `[harness] ${JSON.stringify({
      t: elapsed(),
      event,
      ...details,
    })}`,
  );
}

async function main() {
  const agent = supertest(app);
  const initialDraft = 'draft A';
  const latestDraft = 'draft B';

  log('reset:start');
  await agent.post('/reset').expect(200);
  log('reset:done');

  log('save-initial:start', { content: initialDraft });
  await agent.post('/draft').send({ content: initialDraft }).expect(200);
  log('save-initial:committed', { content: initialDraft });

  log('save-latest:start-without-awaiting', { content: latestDraft });
  const saveLatestPromise = agent
    .post('/draft')
    .send({ content: latestDraft })
    .then((response) => {
      log('save-latest:response', { saved: response.body.saved });
      return response;
    });

  log('publish:start-while-save-in-flight');
  const publishPromise = agent.post('/publish').then((response) => {
    log('publish:response', { published: response.body.published });
    return response;
  });

  const [saveLatestResponse, publishResponse] = await Promise.all([
    saveLatestPromise,
    publishPromise,
  ]);

  const currentResponse = await agent.get('/current').expect(200);
  const publishedResponse = await agent.get('/published').expect(200);

  const raceObserved = publishResponse.body.published !== saveLatestResponse.body.saved;
  log('final-state', {
    current: currentResponse.body.current,
    published: publishedResponse.body.published,
    expectedPublished: latestDraft,
    raceObserved,
  });

  if (raceObserved) {
    process.exitCode = 1;
    console.log(
      '\nRace detected: publish returned the previously committed draft while the latest save was still pending.',
    );
    return;
  }

  console.log('\nRace not reproduced: publish reflected the latest save.');
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});

