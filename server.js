const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());

// Vercel serverless function entry point
module.exports = async (req, res) => {
    // Check for the API endpoint in the request URL
    if (req.url.startsWith('/api/bgg-plays')) {
        await handlePlays(req, res);
    } else if (req.url.startsWith('/api/bgg-stats')) {
        await handleStats(req, res);
    } else {
        res.status(404).json({ error: 'Not Found' });
    }
};

async function handlePlays(req, res) {
    try {
        const username = req.query.username;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        console.log(`Fetching plays for user: ${username}`);
        const playsResponse = await axios.get(`https://boardgamegeek.com/xmlapi2/plays?username=${username}`);
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

async function handleStats(req, res) {
    try {
        const gameId = req.query.gameId;

        if (!gameId) {
            return res.status(400).json({ error: 'Game ID is required.' });
        }

        console.log(`Fetching stats for game ID: ${gameId}`);
        const statsResponse = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`);
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

// Keep the old app.listen for local testing
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Proxy server listening at http://localhost:${port}`);
    });
}
