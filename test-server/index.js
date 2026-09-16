// Debug-only routes that host a simulated live event. Mounted by server.js at
// /debug when DEBUG is set, and runnable on its own for page-level debugging.

const express = require('express');
const { LiveEvent } = require('./live-event');

function createDebugRouter({ intervalMs = 10000, seed = 1337 } = {}) {
    const router = express.Router();
    const event = new LiveEvent({ intervalMs, seed }).start();

    router.get('/live.html', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.type('html').send(event.render());
    });

    router.get('/status', (req, res) => {
        res.json(event.status());
    });

    // Rewinds to an empty event so a session can be replayed from the first run
    router.get('/reset', (req, res) => {
        event.reset();
        res.json({ reset: true, ...event.status() });
    });

    // Adds runs without waiting for the interval
    router.get('/tick/:count?', (req, res) => {
        const count = Math.min(parseInt(req.params.count, 10) || 1, 200);
        for (let i = 0; i < count; i++) {
            event.tick();
        }
        res.json({ ticked: count, ...event.status() });
    });

    router.event = event;
    return router;
}

if (require.main === module) {
    const port = process.env.TEST_PORT || 6969;
    const app = express();
    app.use('/debug', createDebugRouter({ intervalMs: Number(process.env.TEST_INTERVAL_MS) || 10000 }));
    app.listen(port, () => {
        console.log(`Test live event on http://localhost:${port}/debug/live.html`);
    });
}

module.exports = { createDebugRouter };
