/**
 * Display-name filter, shared by the browser (instant feedback) and the
 * `players` party (the check that counts).
 *
 * Names are normalised first (accents stripped, camelCase split, leetspeak
 * like 5h1t read as letters, f.u.c.k joined up, fuuuck collapsed). Then:
 * - STRONG terms (slurs, unambiguous profanity) are blocked anywhere in the name;
 * - WORD terms (short or ambiguous) only as whole words, so Classic, Analog,
 *   Grape and Scunthorpe stay fine; ALLOW lists more such innocent words.
 * The lists are ROT13 so the source doesn't spell them out; extend as needed.
 */

const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

const STRONG = ['shpx', 'fuvg', 'phag', 'avttre', 'avttn', 'avte', 'snttbg', 'sntbg', 'ergneq', 'encvfg', 'anmv', 'uvgyre', 'xvxr', 'puvax', 'tbbx', 'jrgonpx', 'ornare', 'genaal', 'juber', 'fyhg', 'ovgpu', 'chffl', 'cravf', 'intvan', 'cbea', 'zbyrfg', 'cnrqb', 'crqbcuvyr', 'vaprfg', 'wvmm', 'gjng', 'onfgneq', 'nffubyr', 'nfubyr', 'enturnq', 'gbjryurnq', 'fcnfgvp', 'zbatbybvq', 'furznyr', 'fjnfgvxn', 'juvgrcbjre', 'xvyylbhefrys', 'pbpxfhpx', 'oybjwbo', 'unaqwbo', 'qvyqb', 'pyvg', 'betnfz', 'znfgheong', 'fpuybat', 'zvys', 'fxnax', 'qbhpur', 'tbqqnza', 'artebvq', 'zbgureshpx'].map(rot13);
const WORD = new Set(['shx', 'shd', 'nff', 'nefr', 'encr', 'encrq', 'fcvp', 'snt', 'sntf', 'pbba', 'pbbaf', 'qlxr', 'qlxrf', 'arteb', 'artebf', 'ubzb', 'ubzbf', 'yrfob', 'gvg', 'gvgf', 'gvggl', 'qvpx', 'qvpxf', 'pbpx', 'pbpxf', 'phz', 'nany', 'frk', 'frkl', 'tlc', 'tlccrq', 'cnxv', 'fcnm', 'pevccyr', 'xxx', 'wnc', 'avc', 'avcf', 'cvff', 'dhrrs', 'anmvf', 'fhvpvqr', 'crqb', 'crqbf', 'cevpx', 'ubeal', 'frzra', 'ubbxre', 'jnax', 'obare', 'xlf'].map(rot13));
const ALLOW = ['fphagubecr', 'cravfgbar', 'pbpxohea', 'unapbpx', 'crnpbpx', 'pbpxcvg', 'pbpxngbb', 'pbpxngvry', 'qvpxraf', 'fuvgnxr', 'fuvvgnxr', 'nanybt', 'nanylfg', 'nffnffva', 'onff', 'pynff', 'tencr', 'qencr', 'gurencvfg', 'fcvpr', 'fhffrk', 'rffrk', 'cnff', 'tynff', 'tenff', 'znff', 'fnff', 'oenff', 'pbzcnff', 'pbpxgnvy', 'phzhyhf', 'phphzore', 'gvgna', 'gvgnavp', 'gvgyr'].map(rot13);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

/** Squash runs of a letter: fuuuck -> fuck. */
const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

/** 3 to 16 letters, digits, spaces, dashes or underscores. */
const SHAPE = /^[\p{L}\p{N} _-]{3,16}$/u;

export type NameProblem = 'shape' | 'blocked';

/** Why a name can't be used, or null if it's fine. Expects a trimmed name. */
export function nameProblem(name: string): NameProblem | null {
  if (!SHAPE.test(name)) return 'shape';
  // Hate-number codes, before digits are read as letters.
  if (/14\D*88/.test(name)) return 'blocked';
  const plain = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[0-9@$!|+]/g, (c) => LEET[c] ?? c);
  const tokens = plain.split(/[^a-z]+/).filter((t) => t && !ALLOW.includes(t));
  let joined = tokens.join('');
  for (const ok of ALLOW) joined = joined.split(ok).join('');
  const squashed = collapse(joined);
  if (STRONG.some((w) => joined.includes(w) || squashed.includes(collapse(w)))) return 'blocked';
  const isWord = (t: string) => WORD.has(t) || [...WORD].some((w) => t.length > w.length && collapse(t) === collapse(w));
  if (tokens.some(isWord)) return 'blocked';
  // Spelled out a letter at a time: a s s.
  if (tokens.length > 1 && tokens.every((t) => t.length === 1) && isWord(joined)) return 'blocked';
  return null;
}

export function nameMessage(problem: NameProblem): string {
  return problem === 'shape' ? 'Names are 3 to 16 letters, numbers, spaces, - or _' : "That name isn't allowed";
}
