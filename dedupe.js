/**
 * Deduplication utilities for song pairs
 * Provides stable, case-insensitive keys for detecting duplicate pairs
 */

/**
 * Normalize text for comparison (legacy - kept for compatibility)
 * - Trim whitespace
 * - Collapse multiple spaces to one
 * - Convert to lowercase
 * @param {string} s - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeText(s) {
  if (!s) return '';
  return s
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces to one
    .toLowerCase();
}

/**
 * Normalize a song title for dedupe comparison
 * Removes common suffixes, punctuation, and whitespace variations
 * @param {string} title - Song title to normalize
 * @returns {string} - Normalized title
 */
function normalizeTitle(title) {
  if (!title) return '';
  
  let normalized = title;
  
  // 1. Convert to lowercase
  normalized = normalized.toLowerCase();
  
  // 2. Replace all types of dashes with spaces
  normalized = normalized.replace(/[–—-]/g, ' ');
  
  // 3. Remove text inside parentheses or brackets
  normalized = normalized.replace(/\([^)]*\)/g, '');
  normalized = normalized.replace(/\[[^\]]*\]/g, '');
  
  // 4. Remove common suffixes with optional years/numbers
  const suffixes = [
    'remastered', 'remaster', 'remix', 'radio edit', 'radio version',
    'edit', 'mono', 'stereo', 'version', 'single version', 'album version',
    'extended', 'extended version', 'deluxe', 'deluxe edition',
    'explicit', 'clean', 'instrumental', 'acapella', 'live'
  ];
  
  // Sort by length (longest first) to match "radio edit" before "edit"
  const sortedSuffixes = suffixes.sort((a, b) => b.length - a.length);
  
  for (const suffix of sortedSuffixes) {
    // Match suffix optionally followed by year/numbers (e.g., "remastered 2003")
    const pattern = new RegExp(`\\b${suffix}(?:\\s+\\d+)?\\b\\s*$`, 'i');
    normalized = normalized.replace(pattern, '');
  }
  
  // 5. Remove non-alphanumeric characters except spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  
  // 6. Collapse multiple spaces into one
  normalized = normalized.replace(/\s+/g, ' ');
  
  // 7. Trim
  normalized = normalized.trim();
  
  return normalized;
}

/**
 * Normalize an artist name for dedupe comparison
 * Simple case-insensitive normalization
 * @param {string} artist - Artist name to normalize
 * @returns {string} - Normalized artist name
 */
function normalizeArtist(artist) {
  if (!artist) return '';
  
  return artist
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a stable key for a song based on title and artist
 * Uses improved normalization for better duplicate detection
 * @param {Object} song - Song object with title and artist properties
 * @returns {string} - Normalized key string
 */
function keyForSong(song) {
  if (!song) return '';
  
  const title = normalizeTitle(song.title || '');
  const artist = normalizeArtist(song.artist || '');
  
  return `${title}|${artist}`;
}

/**
 * Create a stable key for a pair
 * Supports both pair structures:
 * - pair.original / pair.sampled (from advanced pairing)
 * - pair.originalTrack / pair.sampledTrack (from buildPairsFromPlan)
 * @param {Object} pair - Pair object
 * @returns {string} - Stable dedupe key
 */
function getPairKey(pair) {
  if (!pair) return '';
  
  // Support both naming conventions
  const original = pair.original || pair.originalTrack;
  const sampled = pair.sampled || pair.sampledTrack;
  
  const originalKey = keyForSong(original);
  const sampledKey = keyForSong(sampled);
  
  return `O:${originalKey}||S:${sampledKey}`;
}

module.exports = {
  normalizeText,
  normalizeTitle,
  normalizeArtist,
  keyForSong,
  getPairKey
};

// Debug test: Verify normalization works correctly
if (process.env.DEBUG_DEDUPE) {
  console.log('\n=== Dedupe Normalization Test ===');
  
  const testTitles = [
    'Every Breath I Take',
    'Every Breath I Take - Remastered',
    'Every Breath I Take (2018 Remaster)',
    'Every Breath I Take – Remastered 2003',
    'Every Breath I Take [Radio Edit]'
  ];
  
  console.log('\nOriginal Titles → Normalized:');
  testTitles.forEach(title => {
    const normalized = normalizeTitle(title);
    console.log(`  "${title}"`);
    console.log(`    → "${normalized}"\n`);
  });
  
  const allNormalized = testTitles.map(normalizeTitle);
  const allSame = allNormalized.every(n => n === allNormalized[0]);
  
  console.log(`✓ All titles normalize to: "${allNormalized[0]}"`);
  console.log(`✓ All match? ${allSame ? 'YES' : 'NO'}`);
  console.log('=================================\n');
}
