/**
 * Advanced Pairing Plan Module
 * Defines data structures and helpers for custom playlist pairing rules
 */

/**
 * @typedef {Object} TrioOverride
 * @property {number} original - Track number for original (1-based)
 * @property {number} sampleA - Track number for first sample (1-based)
 * @property {number} sampleB - Track number for second sample (1-based)
 */

/**
 * @typedef {'EVEN_ORIGINAL' | 'ODD_ORIGINAL'} MappingType
 */

/**
 * @typedef {Object} RangeRule
 * @property {number} start - Start track number (1-based, inclusive)
 * @property {number} end - End track number (1-based, inclusive)
 * @property {MappingType} mapping - Pairing mapping type
 */

/**
 * @typedef {Object} PairingPlan
 * @property {TrioOverride[]} trios - Array of trio override rules
 * @property {RangeRule[]} ranges - Array of range-based pairing rules
 */

/**
 * Normalize and validate a pairing plan
 * @param {PairingPlan} plan - The raw pairing plan to normalize
 * @param {number} trackCount - Total number of tracks in the playlist
 * @returns {PairingPlan} - Cleaned and validated pairing plan
 */
function normalizePlan(plan, trackCount) {
  // Ensure plan has required properties
  const normalizedPlan = {
    trios: Array.isArray(plan.trios) ? plan.trios : [],
    ranges: Array.isArray(plan.ranges) ? plan.ranges : []
  };

  // Normalize trios
  normalizedPlan.trios = normalizedPlan.trios
    .map(trio => {
      // Coerce to integers and trim if strings
      const original = parseInt(String(trio.original).trim());
      const sampleA = parseInt(String(trio.sampleA).trim());
      const sampleB = parseInt(String(trio.sampleB).trim());

      // Validate all are valid numbers
      if (isNaN(original) || isNaN(sampleA) || isNaN(sampleB)) {
        return null;
      }

      // Clamp to valid range [1..trackCount]
      return {
        original: Math.max(1, Math.min(trackCount, original)),
        sampleA: Math.max(1, Math.min(trackCount, sampleA)),
        sampleB: Math.max(1, Math.min(trackCount, sampleB))
      };
    })
    .filter(trio => trio !== null); // Remove invalid entries

  // Normalize ranges
  normalizedPlan.ranges = normalizedPlan.ranges
    .map(range => {
      // Coerce to integers and trim if strings
      let start = parseInt(String(range.start).trim());
      let end = parseInt(String(range.end).trim());

      // Validate numbers
      if (isNaN(start) || isNaN(end)) {
        return null;
      }

      // Ensure start <= end (swap if needed)
      if (start > end) {
        [start, end] = [end, start];
      }

      // Clamp to valid range [1..trackCount]
      start = Math.max(1, Math.min(trackCount, start));
      end = Math.max(1, Math.min(trackCount, end));

      // Validate mapping type
      const mapping = String(range.mapping).trim();
      if (mapping !== 'EVEN_ORIGINAL' && mapping !== 'ODD_ORIGINAL') {
        return null;
      }

      return {
        start,
        end,
        mapping
      };
    })
    .filter(range => range !== null) // Remove invalid entries
    .sort((a, b) => a.start - b.start); // Sort by start ascending

  return normalizedPlan;
}

/**
 * Validate a pairing plan
 * @param {PairingPlan} plan - The pairing plan to validate
 * @param {number} trackCount - Total number of tracks in the playlist
 * @returns {{ ok: boolean; errors: string[] }} - Validation result
 */
function validatePlan(plan, trackCount) {
  const errors = [];

  // Must have at least 1 range
  if (!plan.ranges || plan.ranges.length === 0) {
    errors.push('Pairing plan must have at least one range rule');
  }

  // Validate each trio
  const trioTracks = new Set();
  if (plan.trios && plan.trios.length > 0) {
    plan.trios.forEach((trio, index) => {
      const tracks = [trio.original, trio.sampleA, trio.sampleB];
      
      // Check all are within bounds
      tracks.forEach(track => {
        if (track < 1 || track > trackCount) {
          errors.push(`Trio ${index + 1}: track ${track} is out of range [1..${trackCount}]`);
        }
      });

      // Check all are distinct
      const uniqueTracks = new Set(tracks);
      if (uniqueTracks.size !== 3) {
        errors.push(`Trio ${index + 1}: must contain 3 distinct track numbers (got: ${tracks.join(', ')})`);
      }

      // Check for overlaps with other trios
      tracks.forEach(track => {
        if (trioTracks.has(track)) {
          errors.push(`Track ${track} appears in multiple trios`);
        }
        trioTracks.add(track);
      });
    });
  }

  // Validate each range
  if (plan.ranges && plan.ranges.length > 0) {
    plan.ranges.forEach((range, index) => {
      // Check bounds
      if (range.start < 1 || range.start > trackCount) {
        errors.push(`Range ${index + 1}: start ${range.start} is out of range [1..${trackCount}]`);
      }
      if (range.end < 1 || range.end > trackCount) {
        errors.push(`Range ${index + 1}: end ${range.end} is out of range [1..${trackCount}]`);
      }

      // Check start <= end
      if (range.start > range.end) {
        errors.push(`Range ${index + 1}: start (${range.start}) must be <= end (${range.end})`);
      }
    });

    // Check for range overlaps
    for (let i = 0; i < plan.ranges.length; i++) {
      for (let j = i + 1; j < plan.ranges.length; j++) {
        const rangeA = plan.ranges[i];
        const rangeB = plan.ranges[j];

        // Ranges overlap if they share any track number
        // Touching is OK: [1,5] and [6,10] is fine
        // Overlapping is NOT: [1,5] and [5,10] is NOT OK
        const overlap = rangeA.end >= rangeB.start && rangeB.end >= rangeA.start;
        const touching = rangeA.end + 1 === rangeB.start || rangeB.end + 1 === rangeA.start;

        if (overlap && !touching) {
          errors.push(`Ranges ${i + 1} [${rangeA.start}..${rangeA.end}] and ${j + 1} [${rangeB.start}..${rangeB.end}] overlap`);
        }
      }
    }
  }

  // Check that all non-trio tracks are covered by exactly one range
  for (let trackNum = 1; trackNum <= trackCount; trackNum++) {
    // Skip tracks in trios
    if (trioTracks.has(trackNum)) {
      continue;
    }

    // Count how many ranges cover this track
    const coveringRanges = plan.ranges.filter(range => 
      trackNum >= range.start && trackNum <= range.end
    );

    if (coveringRanges.length === 0) {
      errors.push(`Track ${trackNum} is not covered by any range and is not in a trio`);
    } else if (coveringRanges.length > 1) {
      errors.push(`Track ${trackNum} is covered by multiple ranges (only one allowed)`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

/**
 * Build pairs from tracks using a pairing plan
 * @param {Array} tracks - Array of track objects from playlist
 * @param {PairingPlan} plan - The pairing plan to apply
 * @returns {Array} - Array of pair objects with global positions
 */
function buildPairsFromPlan(tracks, plan) {
  const pairs = [];
  const usedPositions = new Set(); // Track which positions have been used

  console.log(`\n=== Building pairs from ${tracks.length} tracks ===`);
  
  // Process trios first
  if (plan.trios && plan.trios.length > 0) {
    console.log(`\nProcessing ${plan.trios.length} trio(s)...`);
    
    plan.trios.forEach((trio, index) => {
      const originalPos = trio.original;
      const sampleAPos = trio.sampleA;
      const sampleBPos = trio.sampleB;

      console.log(`  Trio ${index + 1}: Original at pos ${originalPos}, Samples at pos ${sampleAPos}, ${sampleBPos}`);

      // Create two pairs from the trio
      pairs.push({
        originalTrack: tracks[originalPos - 1],
        sampledTrack: tracks[sampleAPos - 1],
        originalPos: originalPos,
        sampledPos: sampleAPos
      });

      pairs.push({
        originalTrack: tracks[originalPos - 1],
        sampledTrack: tracks[sampleBPos - 1],
        originalPos: originalPos,
        sampledPos: sampleBPos
      });

      // Mark these positions as used
      // Note: original is "used" for these pairs but samples are fully consumed
      usedPositions.add(sampleAPos);
      usedPositions.add(sampleBPos);
      
      console.log(`    Created 2 pairs, marked positions ${sampleAPos}, ${sampleBPos} as used`);
    });

    // Also mark original positions as used (they should not be paired again)
    plan.trios.forEach(trio => {
      usedPositions.add(trio.original);
    });
  }

  // Process ranges
  if (plan.ranges && plan.ranges.length > 0) {
    console.log(`\nProcessing ${plan.ranges.length} range(s)...`);

    plan.ranges.forEach((range, rangeIndex) => {
      console.log(`  Range ${rangeIndex + 1}: [${range.start}..${range.end}] with mapping ${range.mapping}`);

      // Get positions in this range that are not used by trios
      const availablePositions = [];
      for (let pos = range.start; pos <= range.end; pos++) {
        if (!usedPositions.has(pos)) {
          availablePositions.push(pos);
        }
      }

      console.log(`    Available positions: ${availablePositions.join(', ')}`);

      // Separate into originals and samples based on mapping
      const originals = [];
      const samples = [];

      availablePositions.forEach(pos => {
        const isEven = pos % 2 === 0;
        
        if (range.mapping === 'EVEN_ORIGINAL') {
          if (isEven) {
            originals.push(pos);
          } else {
            samples.push(pos);
          }
        } else { // ODD_ORIGINAL
          if (isEven) {
            samples.push(pos);
          } else {
            originals.push(pos);
          }
        }
      });

      console.log(`    Originals: ${originals.join(', ')}`);
      console.log(`    Samples: ${samples.join(', ')}`);

      // Validate we have equal counts
      if (originals.length !== samples.length) {
        const error = `Range ${rangeIndex + 1} [${range.start}..${range.end}]: unmatched tracks (${originals.length} originals, ${samples.length} samples)`;
        console.error(`    ERROR: ${error}`);
        throw new Error(error);
      }

      // Pair them up in order
      for (let i = 0; i < originals.length; i++) {
        const originalPos = originals[i];
        const sampledPos = samples[i];

        pairs.push({
          originalTrack: tracks[originalPos - 1],
          sampledTrack: tracks[sampledPos - 1],
          originalPos: originalPos,
          sampledPos: sampledPos
        });

        usedPositions.add(originalPos);
        usedPositions.add(sampledPos);
      }

      console.log(`    Created ${originals.length} pair(s) from range`);
    });
  }

  // Check for leftover tracks
  const leftoverPositions = [];
  for (let pos = 1; pos <= tracks.length; pos++) {
    if (!usedPositions.has(pos)) {
      leftoverPositions.push(pos);
    }
  }

  if (leftoverPositions.length > 0) {
    console.warn(`\n⚠️  WARNING: ${leftoverPositions.length} track(s) not paired: positions ${leftoverPositions.join(', ')}`);
  }

  // Sort pairs by minimum position (ascending)
  pairs.sort((a, b) => {
    const minA = Math.min(a.originalPos, a.sampledPos);
    const minB = Math.min(b.originalPos, b.sampledPos);
    return minA - minB;
  });

  console.log(`\n=== Total pairs created: ${pairs.length} ===\n`);

  return pairs;
}

module.exports = {
  normalizePlan,
  validatePlan,
  buildPairsFromPlan
};

// ============================================================================
// TEST EXAMPLES (for development only)
// ============================================================================

if (require.main === module) {
  console.log('=== Testing Pairing Plan Validation ===\n');

  // Test 1: Valid plan with trio and ranges
  console.log('Test 1: Valid plan with trio and ranges');
  const plan1 = {
    trios: [
      { original: 5, sampleA: 6, sampleB: 7 }
    ],
    ranges: [
      { start: 1, end: 4, mapping: 'EVEN_ORIGINAL' },
      { start: 8, end: 10, mapping: 'ODD_ORIGINAL' }
    ]
  };
  const result1 = validatePlan(plan1, 10);
  console.log('Result:', result1);
  console.log();

  // Test 2: Invalid - trio with duplicate track numbers
  console.log('Test 2: Invalid - trio with duplicate track numbers');
  const plan2 = {
    trios: [
      { original: 5, sampleA: 5, sampleB: 7 }
    ],
    ranges: [
      { start: 1, end: 10, mapping: 'EVEN_ORIGINAL' }
    ]
  };
  const result2 = validatePlan(plan2, 10);
  console.log('Result:', result2);
  console.log();

  // Test 3: Invalid - overlapping ranges
  console.log('Test 3: Invalid - overlapping ranges');
  const plan3 = {
    trios: [],
    ranges: [
      { start: 1, end: 5, mapping: 'EVEN_ORIGINAL' },
      { start: 5, end: 10, mapping: 'ODD_ORIGINAL' }
    ]
  };
  const result3 = validatePlan(plan3, 10);
  console.log('Result:', result3);
  console.log();

  // Test 4: Invalid - track not covered by any range
  console.log('Test 4: Invalid - track not covered by any range');
  const plan4 = {
    trios: [],
    ranges: [
      { start: 1, end: 5, mapping: 'EVEN_ORIGINAL' },
      { start: 7, end: 10, mapping: 'ODD_ORIGINAL' }
    ]
  };
  const result4 = validatePlan(plan4, 10);
  console.log('Result:', result4);
  console.log();

  // Test 5: Valid - touching ranges (not overlapping)
  console.log('Test 5: Valid - touching ranges (not overlapping)');
  const plan5 = {
    trios: [],
    ranges: [
      { start: 1, end: 5, mapping: 'EVEN_ORIGINAL' },
      { start: 6, end: 10, mapping: 'ODD_ORIGINAL' }
    ]
  };
  const result5 = validatePlan(plan5, 10);
  console.log('Result:', result5);
  console.log();

  // Test 6: Invalid - track appears in multiple trios
  console.log('Test 6: Invalid - track appears in multiple trios');
  const plan6 = {
    trios: [
      { original: 1, sampleA: 2, sampleB: 3 },
      { original: 3, sampleA: 4, sampleB: 5 }
    ],
    ranges: [
      { start: 6, end: 10, mapping: 'EVEN_ORIGINAL' }
    ]
  };
  const result6 = validatePlan(plan6, 10);
  console.log('Result:', result6);
  console.log();

  // Test 7: Invalid - no ranges
  console.log('Test 7: Invalid - no ranges');
  const plan7 = {
    trios: [],
    ranges: []
  };
  const result7 = validatePlan(plan7, 10);
  console.log('Result:', result7);
  console.log();

  // =========================================================================
  // Testing buildPairsFromPlan
  // =========================================================================
  console.log('\n\n=== Testing Pair Building ===\n');

  // Create mock tracks
  const mockTracks = [];
  for (let i = 1; i <= 10; i++) {
    mockTracks.push({
      title: `Track ${i}`,
      artist: `Artist ${i}`
    });
  }

  // Test 8: Build pairs with trio and ranges
  console.log('Test 8: Build pairs with trio and ranges');
  const plan8 = {
    trios: [
      { original: 5, sampleA: 6, sampleB: 7 }
    ],
    ranges: [
      { start: 1, end: 4, mapping: 'EVEN_ORIGINAL' },
      { start: 8, end: 10, mapping: 'ODD_ORIGINAL' }
    ]
  };
  try {
    const pairs8 = buildPairsFromPlan(mockTracks, plan8);
    console.log('\nGenerated pairs:');
    pairs8.forEach((pair, idx) => {
      console.log(`  Pair ${idx}: Pos ${pair.originalPos} (${pair.originalTrack.title}) -> Pos ${pair.sampledPos} (${pair.sampledTrack.title})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 9: Build pairs with only ranges (no trios)
  console.log('\n\nTest 9: Build pairs with only ranges (no trios)');
  const plan9 = {
    trios: [],
    ranges: [
      { start: 1, end: 6, mapping: 'EVEN_ORIGINAL' },
      { start: 7, end: 10, mapping: 'ODD_ORIGINAL' }
    ]
  };
  try {
    const pairs9 = buildPairsFromPlan(mockTracks, plan9);
    console.log('\nGenerated pairs:');
    pairs9.forEach((pair, idx) => {
      console.log(`  Pair ${idx}: Pos ${pair.originalPos} (${pair.originalTrack.title}) -> Pos ${pair.sampledPos} (${pair.sampledTrack.title})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 10: Error case - unmatched tracks in range
  console.log('\n\nTest 10: Error case - unmatched tracks in range');
  const plan10 = {
    trios: [],
    ranges: [
      { start: 1, end: 5, mapping: 'EVEN_ORIGINAL' } // 5 tracks: 2 originals, 3 samples (unmatched)
    ]
  };
  try {
    const pairs10 = buildPairsFromPlan(mockTracks.slice(0, 5), plan10);
    console.log('\nGenerated pairs:');
    pairs10.forEach((pair, idx) => {
      console.log(`  Pair ${idx}: Pos ${pair.originalPos} -> Pos ${pair.sampledPos}`);
    });
  } catch (error) {
    console.error('Error (expected):', error.message);
  }
}
