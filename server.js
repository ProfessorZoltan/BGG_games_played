const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');

const app = express();
app.use(cors());

// Global error handler to catch unexpected server errors and return a JSON response.
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err.stack);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// Vercel serverless functions require a handler for each endpoint
// instead of a single listening server. The express app itself
// serves as the handler.
app.get('/api/bgg-plays', async (req, res, next) => {
    const { username, startDate, endDate } = req.query;

    console.log(`Received request for plays: username=${username}, startDate=${startDate}, endDate=${endDate}`);

    if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
    }

    try {
        const response = await axios.get(`https://boardgamegeek.com/xmlapi2/plays?username=${username}&mindate=${startDate}&maxdate=${endDate}`);
        const xml = response.data;

        let parsedXml;
        xml2js.parseString(xml, { explicitArray: false, mergeAttrs: true }, (err, result) => {
            if (err) {
                console.error('XML parsing error:', err);
                return res.status(500).json({ error: 'Error parsing BGG XML.' });
            }
            parsedXml = result;
        });

        const plays = parsedXml?.plays?.play;
        if (!plays) {
            console.log('No plays found for the user in the specified period.');
            return res.status(404).json({ gameIds: [] });
        }

        const gamesWithPlays = {};
        const playsArray = Array.isArray(plays) ? plays : [plays];

        playsArray.forEach(play => {
            const gameId = play.item?.id;
            if (gameId) {
                if (!gamesWithPlays[gameId]) {
                    gamesWithPlays[gameId] = {
                        gameId: gameId,
                        playCount: 0
                    };
                }
                gamesWithPlays[gameId].playCount += 1;
            }
        });

        console.log(`Found ${Object.keys(gamesWithPlays).length} unique games.`);
        res.json({ gameIds: Object.values(gamesWithPlays) });

    } catch (error) {
        console.error('Error fetching BGG plays:', error.message);
        // Pass the error to the global handler
        next(error);
    }
});

app.get('/api/bgg-stats', async (req, res, next) => {
    const { gameId } = req.query;

    console.log(`Received request for stats: gameId=${gameId}`);

    if (!gameId) {
        return res.status(400).json({ error: 'Game ID is required.' });
    }

    try {
        const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`);
        const xml = response.data;

        let parsedXml;
        xml2js.parseString(xml, { explicitArray: false, mergeAttrs: true }, (err, result) => {
            if (err) {
                console.error('XML parsing error:', err);
                return res.status(500).json({ error: 'Error parsing BGG XML.' });
            }
            parsedXml = result;
        });

        const item = parsedXml?.items?.item;
        if (!item) {
            console.log(`Game not found for ID: ${gameId}`);
            return res.status(404).json({ error: 'Game not found.' });
        }

        const name = item.name?.[0]?.value || item.name?.value;
        const ownedCount = item.statistics?.ratings?.owned?.value;
        const averageRating = item.statistics?.ratings?.average?.value;

        res.json({ name, ownedCount, averageRating });

    } catch (error) {
        console.error(`Error fetching BGG stats for game ID ${gameId}:`, error.message);
        // Pass the error to the global handler
        next(error);
    }
});

// For Vercel, we export the app instance.
module.exports = app;
