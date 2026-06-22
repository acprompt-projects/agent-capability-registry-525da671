===
const { CapabilitySearch } = require('./capability-search');
const assert = require('assert');

const cs = new CapabilitySearch();

cs.register('agent-alpha', ['code-generation', 'code-review', 'refactoring'], ['code', 'quality', 'automation']);
cs.register('agent-beta', ['data-analysis', 'visualization', 'statistical-modeling'], ['data', 'analytics', 'ml']);
cs.register('agent-gamma', ['code-analysis', 'security-audit', 'vulnerability-scan'], ['security', 'code', 'audit']);
cs.register('agent-delta', ['natural-language-processing', 'text-generation', 'translation'], ['nlp', 'language', 'ai']);

// Fuzzy capability search
const fuzzyResults = cs.searchByCapability('code-generashun', { fuzzyThreshold: 0.4 });
assert(fuzzyResults.length > 0, 'Fuzzy search should find results');
assert(fuzzyResults[0].agentId === 'agent-alpha', 'Best fuzzy match should be agent-alpha');
console.log('✓ Fuzzy capability search works');

// Tag-based discovery (any)
const tagAny = cs.searchByTags(['code', 'audit']);
assert(tagAny.length >= 2, 'Should match agents with any of the tags');
console.log('✓ Tag search (any mode) works');

// Tag-based discovery (all)
const tagAll = cs.searchByTags(['code', 'quality'], { matchMode: 'all' });
assert(tagAll.length === 1 && tagAll[0].agentId === 'agent-alpha', 'All-mode should match only agent-alpha');
console.log('✓ Tag search (all mode) works');

// Task-based ranking
const taskResults = cs.searchByTask('Review code for security vulnerabilities and refactor');
assert(taskResults.length >= 2, 'Task search should find multiple agents');
console.log('  Task ranking:');
taskResults.forEach(r => {
  console.log(`    ${r.agentId}: relevance=${r.scores.relevance.toFixed(3)} (cap=${r.scores.capability.toFixed(3)}, tag=${r.scores.tag.toFixed(3)})`);
});
console.log('✓ Task-based search & ranking works');

// Exact capability lookup
const exact = cs.getAgentsByCapabilityExact('code-review');
assert(exact.length === 1 && exact[0].agentId === 'agent-alpha', 'Exact lookup should find agent-alpha');
console.log('✓ Exact capability lookup works');

// Tag catalog
const allTags = cs.getAllTags();
assert(allTags.length > 0, 'Should have tags');
assert(allTags[0].count >= allTags[allTags.length - 1].count, 'Tags sorted by count desc');
console.log('✓ Tag catalog works');

// Unregister
cs.unregister('agent-delta');
assert(cs.size() === 3, 'Should have 3 agents after unregister');
console.log('✓ Unregister works');

console.log('\nAll tests passed!');