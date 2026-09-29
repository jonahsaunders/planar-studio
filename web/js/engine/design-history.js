const clone = value => JSON.parse(JSON.stringify(value));

// History is session-local; named checkpoints are ordinary saved design data.
export class DesignHistory {
  constructor(state, limit = 50) { this.limit = limit; this.reset(state); }
  reset(state) { this.current = clone(state); this.past = []; this.future = []; }
  record(state, label = 'Edit design') {
    if (JSON.stringify(state) === JSON.stringify(this.current)) return;
    this.past.push({ state: this.current, label });
    if (this.past.length > this.limit) this.past.shift();
    this.current = clone(state); this.future = [];
  }
  undo() {
    const entry = this.past.pop(); if (!entry) return null;
    this.future.push({ state: this.current, label: entry.label });
    this.current = entry.state; return clone(this.current);
  }
  redo() {
    const entry = this.future.pop(); if (!entry) return null;
    this.past.push({ state: this.current, label: entry.label });
    this.current = entry.state; return clone(this.current);
  }
}

export function checkpoint(state, label) {
  const config = clone(state); delete config.checkpoints;
  // Candidate snapshots already contain complete configs; avoid nested copies.
  delete config.candidates;
  return { label, date: new Date().toISOString(), config };
}

export function changedFields(before, patch) {
  return Object.keys(patch).filter(k => !['candidates', 'checkpoints'].includes(k)
    && JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
}
