const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RUN_FULL_API = process.env.RUN_FULL_API === '1';
const BASE_URL = process.env.BASE_URL;

function buildUrl(routePath) {
    return new URL(routePath, BASE_URL).toString();
}

async function request(routePath, { expectStatus = 200, timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(buildUrl(routePath), { signal: controller.signal });
    clearTimeout(timer);

    const body = await res.text();
    assert.equal(
        res.status,
        expectStatus,
        `Unexpected status for ${routePath}: got ${res.status}, body=${body.slice(0, 300)}`
    );

    return { res, body };
}

async function requestJson(routePath, opts = {}) {
    const { body } = await request(routePath, opts);
    try {
        return JSON.parse(body);
    } catch (err) {
        throw new Error(`Expected JSON for ${routePath}, got: ${body.slice(0, 300)}`);
    }
}

function findArchiveSample(repoRoot) {
    const archiveRoot = path.join(repoRoot, 'archive');
    if (!fs.existsSync(archiveRoot)) {
        return null;
    }

    const regions = fs.readdirSync(archiveRoot).filter((name) =>
        fs.statSync(path.join(archiveRoot, name)).isDirectory()
    );

    for (const region of regions) {
        const years = fs.readdirSync(path.join(archiveRoot, region)).filter((name) =>
            fs.statSync(path.join(archiveRoot, region, name)).isDirectory()
        );
        for (const year of years) {
            const files = fs
                .readdirSync(path.join(archiveRoot, region, year))
                .filter((f) => f.endsWith('.json'));
            if (files.length > 0) {
                return { year, eventKey: files[0].replace(/\.json$/, '') };
            }
        }
    }
    return null;
}

test('Full API smoke test (live + widget + archive)', { skip: !RUN_FULL_API || !BASE_URL }, async () => {
    const repoRoot = process.cwd();
    const regionConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'regions.json'), 'utf8'));
    const configuredRegions = Object.keys(regionConfig);

    // Core pages/endpoints
    await request('/');
    await request('/ui');
    await request('/widgetui');
    await request('/paxIndex');
    await request('/debug');

    const regionList = await requestJson('/REGIONS');
    assert.ok(Array.isArray(regionList), 'Expected /REGIONS to return an array');

    // Per-region API checks
    for (const region of configuredRegions) {
        const classes = await requestJson(`/${region}/classes`);
        assert.ok(Array.isArray(classes), `Expected classes array for ${region}`);

        await requestJson(`/${region}/pax`);
        await requestJson(`/${region}/raw`);
        await requestJson(`/${region}/recent`);

        await requestJson(`/widget/${region}/classes`);
        await requestJson(`/widget/${region}/pax`);
        await requestJson(`/widget/${region}/raw`);

        const candidateClass =
            classes.find((c) => !['PAX', 'RAW'].includes(String(c).toUpperCase())) || classes[0];
        if (candidateClass) {
            await requestJson(`/${region}/${candidateClass}`);
            await requestJson(`/widget/${region}/${candidateClass}`);
        }
    }

    // Archive API checks (if local archive data exists)
    const sample = findArchiveSample(repoRoot);
    if (sample) {
        const { year, eventKey } = sample;
        const region = eventKey.split('_')[0];
        const events = await requestJson(`/archive/${year}/events`);
        assert.ok(Array.isArray(events), 'Expected /archive/<year>/events to return array');
        assert.ok(events.includes(eventKey), `Expected sample event ${eventKey} in /archive/${year}/events`);

        const archiveEvent = await requestJson(`/archive/${year}/${eventKey}`);
        assert.ok(archiveEvent && typeof archiveEvent === 'object', 'Expected archive event object');

        const season = await requestJson(`/archive/${year}/${region}/season`);
        assert.ok(season && typeof season === 'object', 'Expected season points object');
        assert.ok(Array.isArray(season.events), 'Expected season data to include events');
        assert.ok(Array.isArray(season.overallRuns), 'Expected season data to include overall runs');

        await request(`/archive/ui/${year}/${region}/season`);
        await request(`/archive/ui/${year}/${region}/season/S2`);

        const seasonClass = await requestJson(`/archive/${year}/${region}/season/S2`);
        assert.ok(seasonClass && typeof seasonClass === 'object', 'Expected class-filtered season JSON');
        assert.equal(seasonClass.className, 'S2', 'Expected requested class name in class-filtered season response');

        const seasonPax = await requestJson(`/archive/${year}/${region}/season/PAX`);
        assert.ok(seasonPax && typeof seasonPax === 'object', 'Expected PAX-filtered season JSON');
        assert.equal(seasonPax.className, 'PAX', 'Expected PAX class filter to be echoed back');

        await requestJson(`/archive/${year}/${eventKey}/classes`);
        await requestJson(`/archive/${year}/${eventKey}/pax`);
        await requestJson(`/archive/${year}/${eventKey}/raw`);
        await request(`/archive/ui/${year}/${eventKey}`);

        // Archive search sanity check (use a generic query to avoid fixture coupling)
        await requestJson(`/archive/search?name=a`);
    }

    // Security guard sanity
    await request('/fetch/%2e%2e/%2e%2e/server.js', { expectStatus: 400 });
});
