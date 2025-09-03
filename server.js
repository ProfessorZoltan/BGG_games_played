const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors')({ origin: true });

const BGG_API_URL = 'https://boardgamegeek.com/xmlapi2';

// The main serverless function handler
module.exports = (req, res) => {
    // Handle CORS pre-flight requests
    if (req.method === 'OPTIONS') {
        return cors(req, res, () => {
            res.status(204).end();
        });
    }

    // Handle the actual API requests
    return cors(req, res, async () => {
        try {
            if (req.url.startsWith('/api/bgg-plays')) {
                await handlePlays(req, res);
            } else if (req.url.startsWith('/api/bgg-stats')) {
                await handleStats(req, res);
            } else {
                res.status(404).json({ error: 'Not Found' });
            }
        } catch (error) {
            console.error('Unhandled server error:', error);
            // This is the key change to prevent the JSON.parse error
            // Any unhandled exception will now return a proper JSON response
            res.status(500).json({ error: 'An unexpected server error occurred.' });
        }
    });
};

// Function to handle fetching plays from BGG
async function handlePlays(req, res) {
    const { username, startDate, endDate } = req.query;

    if (!username || !startDate || !endDate) {
        return res.status(400).json({ error: 'Username, start date, and end date are required.' });
    }

    try {
        console.log(`Fetching plays for user: ${username} from ${startDate} to ${endDate}`);
        const playsResponse = await axios.get(`${BGG_API_URL}/plays?username=${username}`);
        const playsXml = playsResponse.data;

        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const playsResult = await parser.parseStringPromise(playsXml);

        const gamesWithPlays = {};
        if (playsResult.plays && playsResult.plays.play) {
            const plays = Array.isArray(playsResult.plays.play) ? playsResult.plays.play : [playsResult.plays.play];

            plays.forEach(play => {
                const playDate = play.date;
                if (playDate >= startDate && playDate <= endDate) {
                    const gameId = play.item.objectid;
                    gamesWithPlays[gameId] = (gamesWithPlays[gameId] || 0) + 1;
                }
            });
        }

        const gameIds = Object.keys(gamesWithPlays).map(id => ({
            gameId: id,
            playCount: gamesWithPlays[id]
        }));

        console.log(`Found ${gameIds.length} unique game IDs with play counts.`);
        res.status(200).json({ gameIds });
    } catch (error) {
        console.error('Error fetching BGG plays:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: `Failed to fetch BGG plays: ${error.message}` });
    }
}

// Function to handle fetching game stats from BGG
async function handleStats(req, res) {
    const { gameId } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'Game ID is required.' });
    }

    try {
        console.log(`Fetching stats for game ID: ${gameId}`);
        const statsResponse = await axios.get(`${BGG_API_URL}/thing?id=${gameId}&stats=1`);
        const statsXml = statsResponse.data;

        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const statsResult = await parser.parseStringPromise(statsXml);

        const thing = statsResult.items.item;
        if (!thing) {
            return res.status(404).json({ error: 'Game not found.' });
        }

        const ownedCount = thing.owned ? thing.owned.value : 'N/A';
        const averageRating = thing.statistics.ratings.average ? parseFloat(thing.statistics.ratings.average.value) : 'N/A';
        const name = Array.isArray(thing.name) ? thing.name[0].value : thing.name.value;

        res.status(200).json({
            name,
            ownedCount,
            averageRating
        });
    } catch (error) {
        console.error('Error fetching BGG stats:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: `Failed to fetch BGG stats: ${error.message}` });
    }
}
