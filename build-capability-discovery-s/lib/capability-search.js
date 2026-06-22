===
class CapabilitySearch {
  constructor(registry = new Map()) {
    this.registry = registry;
  }

  register(agentId, capabilities = [], tags = [], metadata = {}) {
    const normalizedCaps = capabilities.map(c => c.toLowerCase().trim());
    const normalizedTags = tags.map(t => t.toLowerCase().trim());
    this.registry.set(agentId, {
      agentId,
      capabilities: normalizedCaps,
      tags: normalizedTags,
      metadata,
      registeredAt: Date.now(),
    });
  }

  unregister(agentId) {
    return this.registry.delete(agentId);
  }

  _levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  _fuzzyScore(query, target) {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t === q) return 1.0;
    if (t.includes(q)) return 0.9;
    const dist = this._levenshtein(q, t);
    const maxLen = Math.max(q.length, t.length);
    return Math.max(0, 1 - dist / maxLen);
  }

  _subsequenceScore(query, target) {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qi = 0, matches = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) { matches++; qi++; }
    }
    return qi === q.length ? matches / q.length * 0.7 : 0;
  }

  searchByCapability(query, { fuzzyThreshold = 0.4, limit } = {}) {
    const results = [];
    for (const [, agent] of this.registry) {
      let bestScore = 0;
      let matchedCaps = [];
      for (const cap of agent.capabilities) {
        const score = Math.max(
          this._fuzzyScore(query, cap),
          this._subsequenceScore(query, cap)
        );
        if (score >= fuzzyThreshold) {
          matchedCaps.push({ capability: cap, score });
          bestScore = Math.max(bestScore, score);
        }
      }
      if (matchedCaps.length > 0) {
        results.push({ ...agent, matchedCapabilities: matchedCaps, capabilityScore: bestScore });
      }
    }
    results.sort((a, b) => b.capabilityScore - a.capabilityScore);
    return limit ? results.slice(0, limit) : results;
  }

  searchByTags(tags, { matchMode = 'any', limit } = {}) {
    const normalizedTags = tags.map(t => t.toLowerCase().trim());
    const results = [];
    for (const [, agent] of this.registry) {
      const matched = normalizedTags.filter(t => agent.tags.includes(t));
      const passes = matchMode === 'all'
        ? matched.length === normalizedTags.length
        : matched.length > 0;
      if (passes) {
        const tagScore = matched.length / normalizedTags.length;
        results.push({ ...agent, matchedTags: matched, tagScore });
      }
    }
    results.sort((a, b) => b.tagScore - a.tagScore);
    return limit ? results.slice(0, limit) : results;
  }

  searchByTask(taskDescription, { capabilityWeight = 0.6, tagWeight = 0.3, freshnessWeight = 0.1, limit } = {}) {
    const tokens = taskDescription.toLowerCase().split(/[\s,;.]+/).filter(Boolean);
    const results = [];

    for (const [, agent] of this.registry) {
      let capScore = 0;
      const matchedCaps = [];
      for (const token of tokens) {
        for (const cap of agent.capabilities) {
          const s = Math.max(this._fuzzyScore(token, cap), this._subsequenceScore(token, cap));
          if (s > 0.4) {
            matchedCaps.push({ capability: cap, score: s, matchedToken: token });
            capScore = Math.max(capScore, s);
          }
        }
      }
      let tagScore = 0;
      const matchedTags = [];
      for (const token of tokens) {
        for (const tag of agent.tags) {
          if (tag.includes(token) || token.includes(tag)) {
            matchedTags.push(tag);
            tagScore += 1;
          }
        }
      }
      tagScore = tokens.length > 0 ? Math.min(tagScore / tokens.length, 1) : 0;

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const age = Date.now() - agent.registeredAt;
      const freshness = Math.max(0, 1 - age / maxAge);

      if (capScore > 0 || tagScore > 0) {
        const relevance = (capScore * capabilityWeight) + (tagScore * tagWeight) + (freshness * freshnessWeight);
        results.push({
          ...agent,
          matchedCapabilities: matchedCaps,
          matchedTags,
          scores: { capability: capScore, tag: tagScore, freshness, relevance },
        });
      }
    }

    results.sort((a, b) => b.scores.relevance - a.scores.relevance);
    return limit ? results.slice(0, limit) : results;
  }

  getAgentsByCapabilityExact(capability) {
    const lc = capability.toLowerCase().trim();
    const results = [];
    for (const [, agent] of this.registry) {
      if (agent.capabilities.includes(lc)) results.push(agent);
    }
    return results;
  }

  getAllTags() {
    const tagCounts = new Map();
    for (const [, agent] of this.registry) {
      for (const tag of agent.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  size() { return this.registry.size; }
}

module.exports = { CapabilitySearch };