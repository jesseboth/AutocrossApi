let g_seasonData = null;
let g_seasonMergedData = null;
let g_seasonDefaultKeep = 0;
let g_seasonKeepCount = 0;
let g_seasonFocusClass = '';
let g_seasonIncludeCurrent = false;
let g_seasonCurrentData = null;
let g_seasonCurrentLoadPromise = null;

function getSeasonPath() {
    const pathParts = getPath();
    if (pathParts[0] !== 'archive' || pathParts[1] !== 'ui') {
        return null;
    }
    return {
        year: pathParts[2],
        region: (pathParts[3] || '').toUpperCase(),
        focusClass: (pathParts[5] || '').toUpperCase(),
    };
}

function sumPoints(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function formatSeasonPoints(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '';
}

function clampSeasonCount(value, totalEvents) {
    if (!Number.isFinite(totalEvents) || totalEvents <= 0) {
        return 0;
    }
    return Math.min(totalEvents, Math.max(1, value));
}

function parseSeasonPoints(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildSeasonScoredRuns(entries, eventIndex) {
    const validEntries = (entries || [])
        .map((entry) => ({
            ...entry,
            _paxValue: parseSeasonPoints(entry?.pax),
        }))
        .filter((entry) => entry._paxValue !== null);

    if (validEntries.length === 0) {
        return [];
    }

    validEntries.sort((a, b) => a._paxValue - b._paxValue);
    const winnerPax = validEntries[0]._paxValue;

    return validEntries.map((entry, positionIndex) => {
        const isWinner = Math.abs(entry._paxValue - winnerPax) < 1e-9;
        const points = isWinner ? 101 : (100 * winnerPax / entry._paxValue);
        return {
            eventIndex,
            driver: entry.driver,
            className: entry.class || '',
            position: entry.position || String(positionIndex + 1),
            points: Number(points.toFixed(3)),
        };
    });
}

function normalizeSeasonClassEntries(entries, className) {
    return (entries || []).map((entry) => ({
        ...entry,
        class: entry?.class || className,
    }));
}

function cloneSeasonData(data) {
    return {
        year: data.year,
        region: data.region,
        events: Array.isArray(data.events) ? data.events.map((event) => ({ ...event })) : [],
        overallRuns: Array.isArray(data.overallRuns) ? data.overallRuns.map((run) => ({ ...run })) : [],
        classRuns: Object.fromEntries(
            Object.entries(data.classRuns || {}).map(([className, runs]) => [
                className,
                Array.isArray(runs) ? runs.map((run) => ({ ...run })) : [],
            ])
        ),
        classes: Array.isArray(data.classes) ? [...data.classes] : [],
    };
}

function buildSeasonMergedData() {
    if (!g_seasonData) {
        return null;
    }

    const merged = cloneSeasonData(g_seasonData);
    if (!g_seasonIncludeCurrent || !g_seasonCurrentData) {
        return merged;
    }

    merged.events = [...merged.events, g_seasonCurrentData.event];
    merged.overallRuns = [...merged.overallRuns, ...g_seasonCurrentData.overallRuns];

    const classes = new Set([...(merged.classes || []), ...(g_seasonCurrentData.classes || [])]);
    merged.classes = Array.from(classes);

    for (const [className, runs] of Object.entries(g_seasonCurrentData.classRuns || {})) {
        if (!merged.classRuns[className]) {
            merged.classRuns[className] = [];
        }
        merged.classRuns[className] = [...merged.classRuns[className], ...runs];
    }

    return merged;
}

async function loadSeasonCurrentData(forceRefresh = false) {
    if (!forceRefresh && g_seasonCurrentData) {
        return g_seasonCurrentData;
    }

    if (!forceRefresh && g_seasonCurrentLoadPromise) {
        return g_seasonCurrentLoadPromise;
    }

    if (forceRefresh) {
        g_seasonCurrentData = null;
        g_seasonCurrentLoadPromise = null;
    }

    const seasonPath = getSeasonPath();
    if (!seasonPath || !g_seasonData) {
        return null;
    }

    const eventIndex = g_seasonData.events.length;
    const region = seasonPath.region;
    const classesPromise = getData(`/${region}`);
    const paxPromise = getData(`/${region}/pax`);

    g_seasonCurrentLoadPromise = Promise.all([classesPromise, paxPromise])
        .then(([classData, paxData]) => {
            const classRuns = {};
            const classes = [];

            if (classData && typeof classData === 'object' && !Array.isArray(classData)) {
                Object.entries(classData).forEach(([className, entries]) => {
                    const normalizedEntries = Array.isArray(entries)
                        ? normalizeSeasonClassEntries(entries, className)
                        : normalizeSeasonClassEntries(Object.values(entries || {}), className);
                    const runs = buildSeasonScoredRuns(normalizedEntries, eventIndex);
                    classRuns[className] = runs;
                    classes.push(className);
                });
            }

            const overallRuns = buildSeasonScoredRuns(Array.isArray(paxData) ? paxData : [], eventIndex);

            g_seasonCurrentData = {
                event: { key: 'Current', label: 'Current' },
                overallRuns,
                classRuns,
                classes,
            };

            return g_seasonCurrentData;
        })
        .finally(() => {
            g_seasonCurrentLoadPromise = null;
        });

    return g_seasonCurrentLoadPromise;
}

function buildSeasonDriverRows(runs, eventCount) {
    const driverMap = new Map();

    runs.forEach((run) => {
        if (!run || !run.driver) {
            return;
        }

        const driverKey = run.driver;
        if (!driverMap.has(driverKey)) {
            driverMap.set(driverKey, {
                driver: run.driver,
                scores: Array(eventCount).fill(null),
            });
        }

        const row = driverMap.get(driverKey);
        row.scores[run.eventIndex] = Number.isFinite(run.points) ? run.points : null;
    });

    return Array.from(driverMap.values());
}

function calculateSeasonRows(runs, eventCount) {
    const rows = buildSeasonDriverRows(runs, eventCount).map((row) => {
        const numericScores = row.scores.filter((value) => Number.isFinite(value));
        const total = sumPoints(numericScores);
        const countedScores = [...numericScores].sort((a, b) => b - a).slice(0, g_seasonKeepCount);
        const countedTotal = sumPoints(countedScores);

        return {
            ...row,
            total,
            countedTotal,
        };
    });

    rows.sort((a, b) => {
        if (b.countedTotal !== a.countedTotal) {
            return b.countedTotal - a.countedTotal;
        }
        if (b.total !== a.total) {
            return b.total - a.total;
        }
        return a.driver.localeCompare(b.driver);
    });

    return rows;
}

function renderSeasonControls() {
    const controls = document.getElementById('season-controls');
    if (!controls || !g_seasonData) {
        return;
    }

    const seasonData = g_seasonMergedData || g_seasonData;
    const totalEvents = seasonData.events.length;
    const drops = Math.max(0, totalEvents - g_seasonKeepCount);

    controls.innerHTML = `
        <div class="season-drop-box">
            <button class="season-button button-blue" type="button" onclick="adjustSeasonKeep(1)">-</button>
            <span class="season-summary">Drops: ${drops} | ${g_seasonKeepCount} / ${totalEvents}</span>
            <button class="season-button button-blue" type="button" onclick="adjustSeasonKeep(-1)">+</button>
        </div>
        <button class="season-toggle" type="button" onclick="toggleSeasonCurrent()">${g_seasonIncludeCurrent ? 'Current On' : 'Current Off'}</button>
    `;
    controls.style.display = 'flex';
}

function renderSeasonClassButtons(classNames, focusClass) {
    const buttonContainer = document.getElementById('button-container');
    if (!buttonContainer) {
        return;
    }

    buttonContainer.innerHTML = '';
    buttonContainer.style.display = 'flex';

    const labels = ['PAX', ...classNames.filter((label) => String(label).toUpperCase() !== 'PAX')];
    labels.forEach((label) => {
        const button = document.createElement('button');
        button.className = 'staggered-button button-blue';
        button.textContent = label;
        button.onclick = () => toggleURL(label);
        if (String(label).toUpperCase() === String(focusClass || '').toUpperCase()) {
            button.style.backgroundColor = '#ff0000';
        }
        buttonContainer.appendChild(button);
    });
}

function buildSeasonTable(title, rows, events) {
    const eventHeaders = events.map((event, index) => `
        <th nowrap title="${event.label || event.key}">${index + 1}</th>
    `).join('');

    let html = `
        <table class='live' width='100%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border='1' align='center'>
            <tbody>
                <tr class="rowlow">
                    <th nowrap colspan="${events.length + 4}" align="left">${title} - Total Entries: ${rows.length}</th>
                </tr>
                <tr class="rowlow">
                    <th nowrap>Pos.</th>
                    <th nowrap>Driver</th>
                    <th nowrap>Pax Points</th>
                    <th nowrap>Pax W/Drops</th>
                    ${eventHeaders}
                </tr>
    `;

    rows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? 'rowlow' : 'rowhigh';
        html += `
                <tr class="${rowClass}">
                    <td nowrap align="center">${index + 1}</td>
                    <td nowrap align="left">${row.driver}</td>
                    <td nowrap align="right">${formatSeasonPoints(row.total)}</td>
                    <td nowrap align="right">${formatSeasonPoints(row.countedTotal)}</td>
                    ${row.scores.map((score) => `<td nowrap align="right">${formatSeasonPoints(score)}</td>`).join('')}
                </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    return html;
}

function renderSeasonView() {
    if (!g_seasonData) {
        return;
    }

    const results = document.getElementById('results');
    const controls = document.getElementById('season-controls');
    const seasonData = g_seasonMergedData || g_seasonData;
    const eventCount = seasonData.events.length;
    const focusClass = String(g_seasonFocusClass || '').toUpperCase();

    g_seasonKeepCount = clampSeasonCount(g_seasonKeepCount || g_seasonDefaultKeep, eventCount);

    results.innerHTML = '';

    renderSeasonClassButtons(seasonData.classes || [], focusClass);
    renderSeasonControls();

    if (focusClass === 'PAX') {
        const overallRows = calculateSeasonRows(seasonData.overallRuns, eventCount);
        results.innerHTML += buildSeasonTable('Overall PAX Season', overallRows, seasonData.events);
    } else if (focusClass) {
        const classRows = calculateSeasonRows(seasonData.classRuns[focusClass] || [], eventCount);
        results.innerHTML += buildSeasonTable(focusClass, classRows, seasonData.events);
    } else {
        const overallRows = calculateSeasonRows(seasonData.overallRuns, eventCount);
        results.innerHTML += buildSeasonTable('Overall PAX Season', overallRows, seasonData.events);

        const classNames = (seasonData.classes || []).slice().sort((a, b) => a.localeCompare(b));
        classNames.forEach((className) => {
            const classRows = calculateSeasonRows(seasonData.classRuns[className] || [], eventCount);
            results.innerHTML += buildSeasonTable(className, classRows, seasonData.events);
        });
    }

    if (controls) {
        controls.style.display = 'flex';
    }
}

async function loadSeasonView() {
    const seasonPath = getSeasonPath();
    if (!seasonPath) {
        return;
    }

    const data = await getData(`/archive/${seasonPath.year}/${seasonPath.region}/season`);
    if (!data || !Array.isArray(data.events)) {
        throw new Error('Season data unavailable');
    }

    g_seasonData = data;
    const defaultKeep = data.events.length <= 4 ? data.events.length : Math.max(4, Math.round(data.events.length * 0.63));
    g_seasonDefaultKeep = clampSeasonCount(defaultKeep, data.events.length);
    g_seasonKeepCount = g_seasonDefaultKeep;
    g_seasonFocusClass = seasonPath.focusClass;
    g_seasonMergedData = buildSeasonMergedData();
    renderSeasonView();
}

function adjustSeasonKeep(delta) {
    if (!g_seasonData) {
        return;
    }

    const totalEvents = (g_seasonMergedData || g_seasonData).events.length;
    g_seasonKeepCount = clampSeasonCount(g_seasonKeepCount + delta, totalEvents);
    renderSeasonView();
}

async function toggleSeasonCurrent() {
    if (!g_seasonData) {
        return;
    }

    g_seasonIncludeCurrent = !g_seasonIncludeCurrent;

    if (g_seasonIncludeCurrent) {
        await loadSeasonCurrentData(true);
    }

    g_seasonMergedData = buildSeasonMergedData();
    const totalEvents = g_seasonMergedData.events.length;
    g_seasonKeepCount = clampSeasonCount(g_seasonKeepCount, totalEvents);
    renderSeasonView();
}
