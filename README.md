# Spotify Scrapper

A Node.js + Express application for managing Spotify playlist data.

## Setup

1. Get Spotify API credentials:
   - Go to https://developer.spotify.com/dashboard
   - Create an app
   - Copy your Client ID and Client Secret

2. Configure environment variables:
```bash
cp .env.example .env
```
Then edit `.env` and add your credentials:
```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

3. Install dependencies:
```bash
npm install
```

4. Start the server:
```bash
npm start
```

Or use nodemon for development:
```bash
npm run dev
```

5. Open your browser to `http://localhost:3000`

## Features

- Fetch Spotify playlists using Web API
- Parse playlist URLs (https://open.spotify.com/playlist/{id}) or URIs (spotify:playlist:{id})
- Validate even number of tracks for pairing
- Detect duplicate tracks with console warnings
- Generate playlist_pairs.txt with Original/Sampled pairs
- Upload and edit playlist text
- Generate JSON format of playlist pairs
- Download results as files

## API Endpoints

- `POST /api/create-list` - Fetch playlist from Spotify and generate playlist_pairs.txt
  - Request: `{ "spotifyUrl": "https://open.spotify.com/playlist/..." }`
  - Returns: playlist_pairs.txt download
  - Error if playlist has odd number of tracks

- `POST /api/create-json` - Generate playlist_pairs.json
  - Request: `{ "spotifyUrl": "...", "confirmedText": "..." }`
  - Returns: playlist_pairs.json download
