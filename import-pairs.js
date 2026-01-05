const fs = require('fs');

// The new pairs data from your spotify-samples-export
const newData = require('./new-pairs-data.json');

// Transform to the format expected by the scraper
const transformedPairs = newData.pairs.map(pair => ({
  originalTrack: {
    title: pair.original.title,
    artist: pair.original.artist,
    spotifyUrl: pair.original.spotifyUrl,
    youtubeId: pair.original.youtubeId,
    startSec: pair.original.startSec || 0
  },
  sampledTrack: {
    title: pair.sampled.title,
    artist: pair.sampled.artist,
    spotifyUrl: pair.sampled.spotifyUrl,
    youtubeId: pair.sampled.youtubeId,
    startSec: pair.sampled.startSec || 0
  },
  originalPos: (pair.pairIndex * 2) + 1,
  sampledPos: (pair.pairIndex * 2) + 2
}));

// Write to pairs.enriched.json
fs.writeFileSync(
  './pairs.enriched.json',
  JSON.stringify(transformedPairs, null, 2),
  'utf8'
);

console.log(`✅ Imported ${transformedPairs.length} pairs to pairs.enriched.json`);
