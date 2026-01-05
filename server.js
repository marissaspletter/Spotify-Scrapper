require('dotenv').config();
const express = require('express');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
const { normalizePlan, validatePlan, buildPairsFromPlan } = require('./pairingPlan');

const app = express();
const PORT = 3000;

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper: Parse playlist ID from URL or URI
function parsePlaylistId(input) {
  // Match: https://open.spotify.com/playlist/{id} or spotify:playlist:{id}
  const urlMatch = input.match(/playlist[\/:]([a-zA-Z0-9]+)/);
  return urlMatch ? urlMatch[1] : null;
}

// Helper: Get Spotify access token
async function getAccessToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    return true;
  } catch (error) {
    console.error('Error getting access token:', error);
    return false;
  }
}

// Helper: Fetch all playlist tracks with pagination
async function fetchAllPlaylistTracks(playlistId) {
  const allTracks = [];
  let offset = 0;
  const limit = 100;
  let total = 0;

  do {
    const data = await spotifyApi.getPlaylistTracks(playlistId, {
      offset,
      limit,
      fields: 'items(track(name,artists)),total'
    });

    total = data.body.total;
    const tracks = data.body.items
      .filter(item => item.track && item.track.name) // Filter out null tracks
      .map(item => ({
        title: item.track.name,
        artist: item.track.artists.map(a => a.name).join(', ')
      }));

    allTracks.push(...tracks);
    offset += limit;
  } while (offset < total);

  return allTracks;
}

// Helper: Detect duplicates
function detectDuplicates(tracks) {
  const seen = new Map();
  const duplicates = [];

  tracks.forEach((track, index) => {
    const key = `${track.title}|${track.artist}`;
    if (seen.has(key)) {
      duplicates.push({ track, positions: [seen.get(key), index + 1] });
    } else {
      seen.set(key, index + 1);
    }
  });

  return duplicates;
}

// Helper: Generate playlist pairs text from tracks (default pairing)
function generatePlaylistPairsText(tracks) {
  let text = '';
  for (let i = 0; i < tracks.length; i += 2) {
    const pairNumber = i / 2;
    const original = tracks[i];
    const sampled = tracks[i + 1];

    text += `Pair ${pairNumber}\n`;
    text += `Original: ${original.title} — ${original.artist}\n`;
    text += `Sampled: ${sampled.title} — ${sampled.artist}\n\n`;
  }
  return text;
}

// Helper: Generate playlist pairs text from pairs array (advanced pairing)
function generatePlaylistPairsTextFromPairs(pairs) {
  let text = '';
  pairs.forEach((pair, index) => {
    text += `Pair ${index}\n`;
    text += `Original: ${pair.originalTrack.title} — ${pair.originalTrack.artist}\n`;
    text += `Sampled: ${pair.sampledTrack.title} — ${pair.sampledTrack.artist}\n\n`;
  });
  return text;
}

// POST /api/create-list
app.post('/api/create-list', async (req, res) => {
  const { spotifyUrl, cutoffTrackNumber, advancedPairingPlan } = req.body;
  
  if (!spotifyUrl) {
    return res.status(400).json({ error: 'Spotify URL is required' });
  }

  // Parse playlist ID
  const playlistId = parsePlaylistId(spotifyUrl);
  if (!playlistId) {
    return res.status(400).json({ error: 'Invalid Spotify playlist URL or URI' });
  }

  try {
    // Get access token
    const authenticated = await getAccessToken();
    if (!authenticated) {
      return res.status(500).json({ error: 'Failed to authenticate with Spotify API' });
    }

    // Fetch all tracks
    let tracks = await fetchAllPlaylistTracks(playlistId);
    const totalTracks = tracks.length;

    // Handle cutoff if provided
    if (cutoffTrackNumber) {
      const cutoff = parseInt(cutoffTrackNumber);
      
      // Validate cutoff
      if (isNaN(cutoff) || cutoff < 1 || cutoff > totalTracks) {
        return res.status(400).json({ 
          error: `Invalid cutoff track number. Must be between 1 and ${totalTracks}.` 
        });
      }
      
      if (cutoff % 2 !== 0) {
        return res.status(400).json({ 
          error: 'Cutoff track number must be even to form complete pairs.' 
        });
      }
      
      // Slice tracks (cutoff is 1-based and inclusive)
      tracks = tracks.slice(0, cutoff);
    }

    let txtContent;
    let useAdvancedPairing = false;

    // Try advanced pairing plan if provided
    if (advancedPairingPlan) {
      try {
        console.log('\n=== Using Advanced Pairing Plan ===');
        
        // Normalize and validate the plan
        const normalizedPlan = normalizePlan(advancedPairingPlan, tracks.length);
        const validation = validatePlan(normalizedPlan, tracks.length);
        
        if (!validation.ok) {
          console.warn('Advanced pairing plan validation failed:', validation.errors);
          return res.status(400).json({ 
            error: 'Invalid pairing plan',
            details: validation.errors
          });
        }
        
        // Build pairs using advanced plan
        const pairs = buildPairsFromPlan(tracks, normalizedPlan);
        txtContent = generatePlaylistPairsTextFromPairs(pairs);
        useAdvancedPairing = true;
        
        console.log('✓ Advanced pairing plan applied successfully\n');
      } catch (error) {
        console.error('Error applying advanced pairing plan:', error.message);
        return res.status(400).json({ 
          error: 'Failed to apply advanced pairing plan',
          details: error.message
        });
      }
    }

    // Fall back to default pairing if no advanced plan
    if (!useAdvancedPairing) {
      // Check for odd number of tracks (if no cutoff was provided)
      if (tracks.length % 2 !== 0) {
        return res.status(400).json({ 
          error: 'odd',
          totalTracks: totalTracks
        });
      }

      // Detect duplicates and log warning
      const duplicates = detectDuplicates(tracks);
      if (duplicates.length > 0) {
        console.warn('⚠️  Duplicate tracks detected:');
        duplicates.forEach(dup => {
          console.warn(`  "${dup.track.title}" by ${dup.track.artist} at positions ${dup.positions.join(', ')}`);
        });
      }

      // Generate text content using default pairing
      txtContent = generatePlaylistPairsText(tracks);
    }
    
    // Set headers to trigger download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist_pairs.txt"');
    res.send(txtContent);

  } catch (error) {
    console.error('Error fetching playlist:', error);
    
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch playlist from Spotify',
      details: error.message 
    });
  }
});

// Helper: Parse confirmed text into pairs
function parsePairsFromText(confirmedText) {
  const lines = confirmedText.split('\n').map(line => line.trim());
  const pairs = [];
  let currentPair = null;
  let pairNumber = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip blank lines
    if (!line) continue;

    // Check for "Pair N" line
    const pairMatch = line.match(/^Pair\s+(\d+)/i);
    if (pairMatch) {
      // Save previous pair if exists
      if (currentPair !== null) {
        pairs.push({ pairNumber, ...currentPair });
      }
      // Start new pair
      pairNumber = parseInt(pairMatch[1]);
      currentPair = { original: null, sampled: null };
      continue;
    }

    // Check for "Original:" line
    const originalMatch = line.match(/^Original:\s*(.+?)\s*—\s*(.+)$/i);
    if (originalMatch && currentPair !== null) {
      currentPair.original = {
        title: originalMatch[1].trim(),
        artist: originalMatch[2].trim()
      };
      continue;
    }

    // Check for "Sampled:" line
    const sampledMatch = line.match(/^Sampled:\s*(.+?)\s*—\s*(.+)$/i);
    if (sampledMatch && currentPair !== null) {
      currentPair.sampled = {
        title: sampledMatch[1].trim(),
        artist: sampledMatch[2].trim()
      };
      continue;
    }
  }

  // Don't forget the last pair
  if (currentPair !== null) {
    pairs.push({ pairNumber, ...currentPair });
  }

  return pairs;
}

// Helper: Validate pairs
function validatePairs(pairs) {
  for (const pair of pairs) {
    if (!pair.original) {
      return { valid: false, error: `Pair ${pair.pairNumber} is missing the Original track` };
    }
    if (!pair.sampled) {
      return { valid: false, error: `Pair ${pair.pairNumber} is missing the Sampled track` };
    }
  }
  return { valid: true };
}

// Helper: Search for track on Spotify
async function searchSpotifyTrack(title, artist) {
  try {
    const query = `track:${title} artist:${artist}`;
    const data = await spotifyApi.searchTracks(query, { limit: 1 });
    
    if (data.body.tracks.items.length > 0) {
      const track = data.body.tracks.items[0];
      return {
        found: true,
        spotifyUrl: track.external_urls.spotify,
        album: track.album.name
      };
    }
    return { found: false };
  } catch (error) {
    console.error(`Error searching for "${title}" by ${artist}:`, error.message);
    return { found: false };
  }
}

// Helper: Create enriched track object
function createTrackObject(title, artist, spotifyData) {
  const obj = {
    title,
    artist,
    era: "",
    youtubeId: "",
    startSec: 0,
    rawTitle: "",
    releaseDate: "",
    spotifyUrl: "",
    album: ""
  };

  if (spotifyData.found) {
    obj.spotifyUrl = spotifyData.spotifyUrl;
    obj.album = spotifyData.album;
  } else {
    obj.placeholder = true;
  }

  return obj;
}

// Helper: Detect duplicates in pairs
function detectDuplicatesInPairs(pairs) {
  const seen = new Map();
  const duplicates = [];

  pairs.forEach((pair) => {
    [pair.original, pair.sampled].forEach((track) => {
      const key = `${track.title}|${track.artist}`;
      if (seen.has(key)) {
        duplicates.push(`"${track.title}" by ${track.artist}`);
      } else {
        seen.set(key, true);
      }
    });
  });

  return [...new Set(duplicates)]; // Remove duplicate warnings
}

// POST /api/create-json
app.post('/api/create-json', async (req, res) => {
  const { confirmedText } = req.body;
  
  if (!confirmedText) {
    return res.status(400).json({ error: 'Please upload or paste playlist pairs text to create JSON' });
  }

  try {
    // Parse pairs from confirmed text
    const pairs = parsePairsFromText(confirmedText);

    if (pairs.length === 0) {
      return res.status(400).json({ error: 'No valid pairs found in the uploaded text. Please check the format.' });
    }

    // Validate pairs
    const validation = validatePairs(pairs);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Detect duplicates (non-blocking)
    const duplicates = detectDuplicatesInPairs(pairs);
    if (duplicates.length > 0) {
      console.warn('⚠️  Duplicate tracks detected in confirmed text:');
      duplicates.forEach(dup => console.warn(`  ${dup}`));
    }

    // Get access token
    const authenticated = await getAccessToken();
    if (!authenticated) {
      return res.status(500).json({ error: 'Failed to authenticate with Spotify API' });
    }

    // Enrich each track with Spotify data
    const enrichedPairs = [];
    let pairIndex = 0;
    
    for (const pair of pairs) {
      // Search for original track
      const originalData = await searchSpotifyTrack(pair.original.title, pair.original.artist);
      const originalObj = createTrackObject(pair.original.title, pair.original.artist, originalData);

      // Search for sampled track
      const sampledData = await searchSpotifyTrack(pair.sampled.title, pair.sampled.artist);
      const sampledObj = createTrackObject(pair.sampled.title, pair.sampled.artist, sampledData);

      // Create pair object with single pairIndex
      enrichedPairs.push({
        pairIndex: pairIndex,
        original: originalObj,
        sampled: sampledObj
      });
      
      pairIndex++;
    }

    // Set headers to trigger download
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist_pairs.json"');
    
    // Add warning header if duplicates exist
    if (duplicates.length > 0) {
      res.setHeader('X-Warning', `Duplicate tracks detected: ${duplicates.join('; ')}`);
    }
    
    // Send properly formatted JSON with 2-space indentation
    res.send(JSON.stringify(enrichedPairs, null, 2));

  } catch (error) {
    console.error('Error creating JSON:', error);
    return res.status(500).json({ 
      error: 'Failed to create JSON list',
      details: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
