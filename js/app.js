// Shared app context (filled in by main.js) and tiny DOM helpers.
export const app = {
  db: null, S: null, world: null, perf: null, audio: null, voice: null, haptics: null, traj: null, pads: null, quality: null,
  storage: null, saveNow: null, state: 'boot',
};
export const $ = (id) => document.getElementById(id);
export function show(id, on) { const el = typeof id === 'string' ? $(id) : id; if (el) el.classList.toggle('hidden', !on); }
export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export const VCOL = { good: '#22c55e', warn: '#f5a524', bad: '#ef4444' };
// Colour AND shape for every verdict (readable without colour vision).
export const MARK = { good: '<b class="mk g" aria-label="right">●</b>', warn: '<b class="mk w" aria-label="close">▲</b>', bad: '<b class="mk b" aria-label="wrong">✕</b>' };
export const BADGE = {
  good: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" fill="rgba(34,197,94,.14)" stroke="#22c55e" stroke-width="8"/><path d="M29 52 L44 67 L72 36" fill="none" stroke="#22c55e" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8 L94 88 H6 Z" fill="rgba(245,165,36,.14)" stroke="#f5a524" stroke-width="8" stroke-linejoin="round"/><path d="M50 36 V60" stroke="#f5a524" stroke-width="10" stroke-linecap="round"/><circle cx="50" cy="74" r="6" fill="#f5a524"/></svg>',
  bad: '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="16" fill="rgba(239,68,68,.14)" stroke="#ef4444" stroke-width="8"/><path d="M32 32 L68 68 M68 32 L32 68" stroke="#ef4444" stroke-width="10" stroke-linecap="round"/></svg>' };
