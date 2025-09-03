const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

const parser = new xml2js.Parser();

// New endpoint to fetch a user's play data
app.get('/api/bgg-plays', async (req, res) => {
    const { username, startDate, endDate } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
    }

    const bggApiUrl = `https://boardgamegeek.com/xmlapi2/plays?username=${username}`;
    console.log(`Fetching plays for user: ${username}`);

    try {
        const response = await axios.get(bggApiUrl);
        const result = await parser.parseStringPromise(response.data);

        if (!result.plays || !result.plays.play) {
            return res.status(404).json({ error: 'No plays found for this user.' });
        }

        const plays = result.plays.play;
        const start = new Date(startDate);
        const end = new Date(endDate);

        const gamePlays = {};
        plays.forEach(play => {
            const playDate = new Date(play.$.date);
            if (playDate >= start && playDate <= end) {
                const gameId = play.item[0].$.objectid;
                gamePlays[gameId] = (gamePlays[gameId] || 0) + 1;
            }
        });

        const gamesWithPlays = Object.keys(gamePlays).map(id => ({
            gameId: id,
            playCount: gamePlays[id]
        }));

        console.log(`Found ${gamesWithPlays.length} unique game IDs with play counts.`);
        res.json({ gameIds: gamesWithPlays });
    } catch (error) {
        console.error('Error fetching BGG plays:', error.message);
        res.status(500).json({ error: 'Failed to fetch user plays from BGG.' });
    }
});

// Existing endpoint to get game statistics and name
app.get('/api/bgg-stats', async (req, res) => {
    const { gameId } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'Game ID is required.' });
    }

    const bggApiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
    console.log(`Fetching stats for game ID: ${gameId}`);

    try {
        const response = await axios.get(bggApiUrl);
        const result = await parser.parseStringPromise(response.data);

        if (!result.items || !result.items.item) {
            return res.status(404).json({ error: 'Game not found.' });
        }

        const game = result.items.item[0];
        const name = game.name[0].$.value;
        const ownedCount = game.statistics[0].ratings[0].owned[0].$.value;
        const averageRating = game.statistics[0].ratings[0].average[0].$.value;

        console.log(`Game ID ${gameId}: ${name} - ${ownedCount} owners, ${averageRating} average rating`);

        res.json({ name, ownedCount: parseInt(ownedCount, 10), averageRating: parseFloat(averageRating) });
    } catch (error) {
        console.error('Error fetching BGG stats:', error.message);
        res.status(500).json({ error: 'Failed to fetch game statistics from BGG.' });
    }
});

app.listen(port, () => {
    console.log(`Proxy server listening at http://localhost:${port}`);
});
