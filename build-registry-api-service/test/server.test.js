const assert = require('assert');
const { app, loadAgents, saveAgents } = require('../src/server');
const http = require('http');

let server, baseUrl;
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: server.address().port, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => {
        res.body = data ? JSON.parse(data) : {}; resolve(res);
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  // Clean state
  saveAgents({});
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
  let res, agent;

  // Register agent
  res = await request('POST', '/agents', { name: 'CodeBot', endpoint: 'http://codebot:8080',
    capabilities: [{ name: 'code-generation', version: '1.0.0', tags: ['coding', 'llm'] }] });
  assert.equal(res.statusCode, 201);
  agent = res.body;
  assert.ok(agent.id);
  assert.equal(agent.capabilities.length, 1);

  // List agents
  res = await request('GET', '/agents');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);

  // Query by capability
  res = await request('GET', '/agents?capability=code-generation');
  assert.equal(res.body.total, 1);
  res = await request('GET', '/agents?capability=nonexistent');
  assert.equal(res.body.total, 0);

  // Query by tag
  res = await request('GET', '/agents?tag=coding');
  assert.equal(res.body.total, 1);

  // Update capabilities
  res = await request('PUT', `/agents/${agent.id}/capabilities`, [{ name: 'code-review', version: '2.0.0', tags: ['review'] }]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.capabilities[0].name, 'code-review');

  // Validation errors
  res = await request('POST', '/agents', {});
  assert.equal(res.statusCode, 400);

  // Delete agent
  res = await request('DELETE', `/agents/${agent.id}`);
  assert.equal(res.statusCode, 200);
  res = await request('GET', '/agents');
  assert.equal(res.body.total, 0);

  saveAgents({});
  server.close();
  console.log('All tests passed!');
}

run().catch(e => { console.error(e); process.exit(1); });