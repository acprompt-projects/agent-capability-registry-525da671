const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'agents.json');
const VALID_SKILL_FIELDS = ['name', 'version', 'description', 'tags'];
const VALID_AGENT_FIELDS = ['name', 'description', 'endpoint', 'metadata'];

function loadAgents() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveAgents(agents) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(agents, null, 2));
}

const app = express();
app.use(express.json());

function validateAgent(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 1)
    errors.push('name is required and must be a non-empty string');
  if (body.endpoint && typeof body.endpoint !== 'string')
    errors.push('endpoint must be a string');
  if (body.capabilities && !Array.isArray(body.capabilities))
    errors.push('capabilities must be an array');
  if (Array.isArray(body.capabilities)) {
    body.capabilities.forEach((cap, i) => {
      if (!cap.name || typeof cap.name !== 'string')
        errors.push(`capabilities[${i}].name is required`);
      if (cap.version && !/^\d+\.\d+\.\d+$/.test(cap.version))
        errors.push(`capabilities[${i}].version must be semver (x.y.z)`);
    });
  }
  return errors;
}

// Register agent
app.post('/agents', (req, res) => {
  const errors = validateAgent(req.body);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  const id = crypto.randomUUID();
  const agent = {
    id,
    name: req.body.name.trim(),
    description: req.body.description || '',
    endpoint: req.body.endpoint || '',
    capabilities: (req.body.capabilities || []).map(c => ({
      name: c.name.trim(),
      version: c.version || '0.1.0',
      description: c.description || '',
      tags: Array.isArray(c.tags) ? c.tags.map(t => String(t).trim().toLowerCase()) : []
    })),
    metadata: req.body.metadata || {},
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const agents = loadAgents();
  agents[id] = agent;
  saveAgents(agents);
  res.status(201).json(agent);
});

// List all agents
app.get('/agents', (req, res) => {
  const agents = loadAgents();
  const list = Object.values(agents);
  if (req.query.capability) {
    const cap = req.query.capability.trim().toLowerCase();
    const filtered = list.filter(a => a.capabilities.some(c => c.name.toLowerCase() === cap));
    return res.json({ total: filtered.length, agents: filtered });
  }
  if (req.query.tag) {
    const tag = req.query.tag.trim().toLowerCase();
    const filtered = list.filter(a => a.capabilities.some(c => c.tags.includes(tag)));
    return res.json({ total: filtered.length, agents: filtered });
  }
  res.json({ total: list.length, agents: list });
});

// Get agent by ID
app.get('/agents/:id', (req, res) => {
  const agents = loadAgents();
  const agent = agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Update capabilities
app.put('/agents/:id/capabilities', (req, res) => {
  const agents = loadAgents();
  if (!agents[req.params.id]) return res.status(404).json({ error: 'Agent not found' });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Request body must be an array of capabilities' });
  const errors = [];
  req.body.forEach((cap, i) => {
    if (!cap.name || typeof cap.name !== 'string') errors.push(`capabilities[${i}].name is required`);
    if (cap.version && !/^\d+\.\d+\.\d+$/.test(cap.version)) errors.push(`capabilities[${i}].version must be semver`);
  });
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  agents[req.params.id].capabilities = req.body.map(c => ({
    name: c.name.trim(), version: c.version || '0.1.0',
    description: c.description || '', tags: Array.isArray(c.tags) ? c.tags.map(t => String(t).trim().toLowerCase()) : []
  }));
  agents[req.params.id].updatedAt = new Date().toISOString();
  saveAgents(agents);
  res.json(agents[req.params.id]);
});

// Delete agent
app.delete('/agents/:id', (req, res) => {
  const agents = loadAgents();
  if (!agents[req.params.id]) return res.status(404).json({ error: 'Agent not found' });
  const deleted = agents[req.params.id];
  delete agents[req.params.id];
  saveAgents(agents);
  res.json({ deleted });
});

// Search capabilities across all agents
app.get('/capabilities', (req, res) => {
  const agents = loadAgents();
  const capMap = {};
  Object.values(agents).forEach(a => {
    a.capabilities.forEach(c => {
      const key = c.name.toLowerCase();
      if (!capMap[key]) capMap[key] = { name: c.name, agents: [] };
      capMap[key].agents.push({ id: a.id, name: a.name, version: c.version });
    });
  });
  res.json({ total: Object.keys(capMap).length, capabilities: Object.values(capMap) });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Agent Capability Registry running on port ${PORT}`));
}
module.exports = { app, loadAgents, saveAgents };