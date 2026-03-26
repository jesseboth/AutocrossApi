const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

function waitForServer(child, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for server startup.\n${buffer}`));
        }, timeoutMs);

        function onData(data) {
            const text = data.toString();
            buffer += text;
            if (text.includes('Server is running on port')) {
                cleanup();
                resolve();
            }
        }

        function onExit(code, signal) {
            cleanup();
            reject(new Error(`Server exited early (code=${code}, signal=${signal}).\n${buffer}`));
        }

        function cleanup() {
            clearTimeout(timeout);
            child.stdout.off('data', onData);
            child.stderr.off('data', onData);
            child.off('exit', onExit);
        }

        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', onExit);
    });
}

async function getJson(baseUrl, path) {
    const res = await fetch(`${baseUrl}${path}`);
    const body = await res.text();
    let json = null;
    try {
        json = JSON.parse(body);
    } catch (err) {
        // Keep null; caller can inspect raw text with assertion message.
    }
    return { res, json, body };
}

const runApiTests = process.env.RUN_API_TESTS === '1';

test('API regressions: archive routes and fetch traversal guard', { skip: !runApiTests }, async (t) => {
    const port = 38000 + Math.floor(Math.random() * 1000);
    const child = spawn('node', ['server.js'], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(port), DEBUG: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    t.after(() => {
        child.kill('SIGTERM');
    });

    await waitForServer(child);
    const baseUrl = `http://127.0.0.1:${port}`;

    const eventsRes = await getJson(baseUrl, '/archive/24/events');
    assert.equal(eventsRes.res.status, 200, `Expected 200 from /archive/24/events, got ${eventsRes.res.status}: ${eventsRes.body}`);
    assert.ok(Array.isArray(eventsRes.json), 'Expected events response to be an array');
    assert.ok(eventsRes.json.length > 0, 'Expected at least one archived event in /archive/24/events');

    const sampleEvent = eventsRes.json[0];
    const eventRes = await getJson(baseUrl, `/archive/24/${sampleEvent}`);
    assert.equal(eventRes.res.status, 200, `Expected 200 from /archive/24/${sampleEvent}, got ${eventRes.res.status}: ${eventRes.body}`);
    assert.ok(eventRes.json && typeof eventRes.json === 'object', 'Expected archived event payload object');

    const rawRes = await getJson(baseUrl, `/archive/24/${sampleEvent}/raw`);
    assert.equal(rawRes.res.status, 200, `Expected 200 from /archive/24/${sampleEvent}/raw, got ${rawRes.res.status}: ${rawRes.body}`);
    assert.ok(Array.isArray(rawRes.json), 'Expected /raw response to be an array');

    const traversal = await fetch(`${baseUrl}/fetch/%2e%2e/%2e%2e/server.js`);
    assert.equal(traversal.status, 400, `Expected path traversal to be blocked with 400, got ${traversal.status}`);
});
