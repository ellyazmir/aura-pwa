/**
 * Rule-based (no LLM) math solvers for the primary (Year 4-6) and secondary
 * (Form 1-4) syllabus. Each rule has `match(text)` (cheap, sync, regex only) and
 * `solve(parsed, lang, ctx)` which returns [{ working, explanation }] or null.
 * ctx.loadMath() lazily provides mathjs for the algebra rules.
 */
import { hcfLcm, rounding, standardForm } from './numbers.js';
import { fractions } from './fractions.js';
import { percent, ratio } from './percentRatio.js';
import { shapes, pythagoras } from './measure.js';
import { statistics, probability, sequence } from './data.js';
import {
  quadraticEquation, expand, factorise, inequality, simultaneous,
} from './algebra.js';
import { coordinates } from './coords.js';

/** Most specific rules first: the first rule whose match() accepts the text wins. */
export const RULES = [
  simultaneous,
  quadraticEquation,
  factorise,
  expand,
  inequality,
  ratio,
  pythagoras,
  coordinates,
  shapes,
  statistics,
  probability,
  sequence,
  standardForm,
  rounding,
  hcfLcm,
  percent,
  fractions,
];

function matches(text) {
  const hits = [];
  for (const rule of RULES) {
    let parsed = null;
    try {
      parsed = rule.match(text);
    } catch {
      parsed = null;
    }
    if (parsed) hits.push({ rule, parsed });
  }
  return hits;
}

const resolve = (v, parsed) => (typeof v === 'function' ? v(parsed) : v);

/**
 * Identify which rule (if any) recognises the problem.
 * @returns {{ id: string, topic: string, level: string } | null}
 */
export function identify(text) {
  const [hit] = matches(text);
  if (!hit) return null;
  const { rule, parsed } = hit;
  return { id: rule.id, topic: resolve(rule.topic, parsed), level: resolve(rule.level, parsed) };
}

/**
 * Solve with the first matching rule that can produce steps.
 * @returns {Promise<Array<{working: string, explanation: string}> | null>}
 */
export async function solveWithRules(text, lang, ctx = {}) {
  for (const { rule, parsed } of matches(text)) {
    try {
      const steps = await rule.solve(parsed, lang, ctx);
      if (steps && steps.length) return steps;
    } catch {
      /* try the next rule */
    }
  }
  return null;
}
