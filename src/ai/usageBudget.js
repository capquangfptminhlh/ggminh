'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_MONTHLY_REQUESTS = 1000;
function monthKey(time) {
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) throw Error('Invalid AI budget clock');
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function blank(month, limit = 0) {
  return {
    version: 1, month, limit, attempts: 0, successes: 0,
    promptTokens: 0, completionTokens: 0, unreportedUsage: 0
  };
}
function valid(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      record.version !== 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month) ||
      !Number.isInteger(record.limit) || record.limit < 0 ||
      record.limit > MAX_MONTHLY_REQUESTS) return false;
  for (const field of ['attempts', 'successes', 'promptTokens', 'completionTokens', 'unreportedUsage'])
    if (!Number.isSafeInteger(record[field]) || record[field] < 0) return false;
  return record.successes <= record.attempts &&
    record.unreportedUsage <= record.successes;
}
function reportedTokens(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10000000 ? value : null;
}
class AIUsageBudget {
  constructor(root, { clock = () => Date.now() } = {}) {
    this.file = path.join(root, 'ai-usage-budget.json');
    this.clock = clock;
    this.invalid = false;
    this.record = blank(monthKey(this.clock()));
    try {
      if (fs.existsSync(this.file)) {
        if (fs.statSync(this.file).size > 4096) throw Error('AI usage ledger is too large');
        const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (!valid(loaded)) throw Error('AI usage ledger has invalid fields');
        this.record = loaded;
      }
    } catch (_) {
      // A broken optional budget file must not prevent the desktop app
      // from opening. AI requests are blocked until the ledger is repaired.
      this.invalid = true;
    }
  }
  current() {
    if (this.invalid) throw Error('Sổ hạn mức AI bị lỗi; cần khôi phục dữ liệu trước khi gọi AI');
    const month = monthKey(this.clock());
    return this.record.month === month ? { ...this.record } : blank(month, this.record.limit);
  }
  status() {
    if (this.invalid) return {
      available: false, error: 'Sổ hạn mức AI không hợp lệ; AI tạm khóa để tránh vượt giới hạn.'
    };
    const state = this.current();
    return {
      available: true, month: state.month, limit: state.limit,
      attempts: state.attempts, successes: state.successes,
      promptTokens: state.promptTokens, completionTokens: state.completionTokens,
      unreportedUsage: state.unreportedUsage,
      remaining: state.limit ? Math.max(0, state.limit - state.attempts) : null
    };
  }
  write(state) {
    if (!valid(state)) throw Error('Invalid AI usage ledger state');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(state), {
        encoding: 'utf8', mode: 0o600, flag: 'wx'
      });
      try { fs.chmodSync(temp, 0o600); } catch (_) {}
      fs.renameSync(temp, this.file);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch (_) {}
      throw error;
    }
    this.record = state;
  }
  setLimit(value) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_MONTHLY_REQUESTS)
      throw Error('Hạn mức phải là số nguyên từ 0 đến 1000 (0 = không giới hạn)');
    const next = this.current();
    next.limit = value;
    this.write(next);
    return this.status();
  }
  reserveAttempt() {
    const next = this.current();
    if (next.limit > 0 && next.attempts >= next.limit)
      throw Error('Đã hết hạn mức yêu cầu AI trong tháng. Hãy điều chỉnh hạn mức hoặc chờ tháng mới.');
    // Reserve BEFORE network traffic. Failed/aborted calls still count,
    // because the upstream provider may have charged for the attempt.
    if (!Number.isSafeInteger(next.attempts + 1)) throw Error('AI budget counter overflow');
    next.attempts++;
    this.write(next);
  }
  recordResponse(usage) {
    const next = this.current();
    if (!next.attempts) throw Error('AI budget has no reserved request');
    const prompt = reportedTokens(usage?.promptTokens);
    const completion = reportedTokens(usage?.completionTokens);
    next.successes++;
    if (prompt === null || completion === null) next.unreportedUsage++;
    else {
      next.promptTokens += prompt;
      next.completionTokens += completion;
    }
    this.write(next);
  }
}
module.exports = { AIUsageBudget, monthKey, reportedTokens, valid, MAX_MONTHLY_REQUESTS };
