// Simulates an AXWare "live results" page for a running event. The page has the
// same shape as a real AXWare upload, so the TEST region is parsed by the same
// format as the other axware regions.

const MAX_RUNS = 8;
const RUN_COLUMNS = 4;

// PAX index per class index, used for the PAX column of the results table
const PAX = {
    AS: 0.830, BS: 0.823, CS: 0.814, DS: 0.811, ES: 0.788, FS: 0.817, GS: 0.809, HS: 0.780,
    AST: 0.836, BST: 0.835, CST: 0.829, DST: 0.820, EST: 0.815,
    CAMC: 0.828, CAMS: 0.847, SM: 0.870
};

const ROSTER = [
    { cclass: "S1", index: "FS", number: "41", driver: "Sam Strano", car: "2021 Ford Mustang Mach 1", pace: 52.6 },
    { cclass: "S1", index: "BS", number: "82", driver: "Tyler Porter", car: "2019 Chevrolet Camaro", pace: 54.1 },
    { cclass: "S1", index: "CS", number: "97", driver: "Michael Potocki", car: "2016 Mazda MX-5", pace: 55.1 },
    { cclass: "S1", index: "DS", number: "7", driver: "Dana Reed", car: "2018 Volkswagen GTI", pace: 55.6 },
    { cclass: "S1", index: "AS", number: "116", driver: "Chris Vail", car: "2020 Chevrolet Corvette", pace: 53.4 },
    { cclass: "T1", index: "AST", number: "19", driver: "Alex Moreno", car: "2019 Mazda MX-5 RF", pace: 54.4 },
    { cclass: "T1", index: "DST", number: "38", driver: "Jamie Frost", car: "2015 Subaru BRZ", pace: 55.2 },
    { cclass: "T1", index: "CST", number: "64", driver: "Robin Estes", car: "2013 Honda Civic Si", pace: 56.0 },
    { cclass: "T1", index: "EST", number: "12", driver: "Pat Lindquist", car: "2011 Mazda 2", pace: 56.8 },
    { cclass: "X", index: "CAMC", number: "25", driver: "Devin Ashby", car: "2018 Chevrolet Camaro SS", pace: 53.9 },
    { cclass: "X", index: "SM", number: "3", driver: "Casey Whitlock", car: "2006 Lotus Elise", pace: 52.2 },
    { cclass: "N", index: "CS", number: "127", driver: "Jordan Pike", car: "2017 Subaru WRX", pace: 58.7 },
    { cclass: "N", index: "BS", number: "9", driver: "Riley Hobbs", car: "2012 BMW 135i", pace: 59.9 }
];

const CLASS_NAMES = {
    S1: "Street 1 Index",
    T1: "Street Touring 1",
    X: "Xtreme Street",
    N: "Novice"
};

// Seeded generator so a replayed event produces the same runs
function mulberry32(seed) {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pad(time) {
    return time.length < 6 ? " " + time : time;
}

class LiveEvent {
    constructor({ seed = 1337, intervalMs = 10000 } = {}) {
        this.seed = seed;
        this.intervalMs = intervalMs;
        this.reset();
    }

    reset() {
        this.random = mulberry32(this.seed);
        this.runOrder = 0;
        this.started = new Date();
        this.updated = new Date();
        this.entries = ROSTER.map(entry => ({ ...entry, times: [] }));
    }

    get complete() {
        return this.entries.every(entry => entry.times.length >= MAX_RUNS);
    }

    // Gives the next driver in the run order one more run
    tick() {
        if (this.complete) {
            return undefined;
        }

        let entry;
        for (let i = 0; i < this.entries.length; i++) {
            const candidate = this.entries[(this.runOrder + i) % this.entries.length];
            if (candidate.times.length < MAX_RUNS) {
                entry = candidate;
                this.runOrder = (this.runOrder + i + 1) % this.entries.length;
                break;
            }
        }

        if (!entry) {
            return undefined;
        }

        entry.times.push(this.newTime(entry));
        this.updated = new Date();
        return entry;
    }

    // Drivers get quicker over the day, with the odd cone or off course
    newTime(entry) {
        const improvement = entry.times.length * 0.35;
        const spread = (this.random() - 0.4) * 1.8;
        const time = (entry.pace - improvement + spread).toFixed(3);

        const roll = this.random();
        if (roll > 0.94) {
            return `${time}+OFF`;
        }
        if (roll > 0.78) {
            return `${time}+${roll > 0.9 ? 2 : 1}`;
        }
        return time;
    }

    // Cones add two seconds, an off course does not count
    static score(time) {
        if (!time || time.includes("OFF") || time.includes("DNS")) {
            return Infinity;
        }
        const [raw, cones] = time.split("+");
        return parseFloat(raw) + (cones ? parseInt(cones, 10) * 2 : 0);
    }

    bestOf(entry) {
        let best = Infinity;
        let bestIdx = -1;
        entry.times.forEach((time, idx) => {
            const score = LiveEvent.score(time);
            if (score < best) {
                best = score;
                bestIdx = idx;
            }
        });
        return { best, bestIdx };
    }

    // Standings for one class, sorted by PAX time like AXWare sorts an index class
    standings(cclass) {
        return this.entries
            .filter(entry => entry.cclass === cclass)
            .map(entry => {
                const { best, bestIdx } = this.bestOf(entry);
                const index = PAX[entry.index] || 1;
                return { ...entry, best, bestIdx, pax: best === Infinity ? Infinity : best * index };
            })
            .sort((a, b) => a.pax - b.pax);
    }

    stamp(date) {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const two = value => String(value).padStart(2, "0");
        const day = `${two(date.getMonth() + 1)}-${two(date.getDate())}-${date.getFullYear()}`;
        return `${days[date.getDay()]} ${day} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
    }

    classRows(cclass) {
        const standings = this.standings(cclass);
        const name = CLASS_NAMES[cclass] || cclass;
        let rows = `   <tr class=rowlow>
   <th nowrap rowspan="1" colspan="9" align="left"><a name="${cclass}"></a> ${cclass} - '${name}' Total Entries: ${standings.length}</th>
   </tr>\n`;

        standings.forEach((entry, idx) => {
            const style = idx % 2 === 0 ? "rowlow" : "rowhigh";
            const position = `${idx + 1}${idx < 3 ? "T" : ""}`;
            const pax = entry.pax === Infinity ? "DNS" : pad(entry.pax.toFixed(3));

            // The leader shows the gap to second place in brackets
            let offset = "";
            if (standings.length > 1) {
                const compare = idx === 0 ? standings[1] : standings[idx - 1];
                const gap = Math.abs(entry.pax - compare.pax);
                offset = Number.isFinite(gap) ? `${idx === 0 ? "[-]" : "+"}${gap.toFixed(3)}` : "";
            }

            const cells = column => {
                let out = "";
                for (let i = 0; i < RUN_COLUMNS; i++) {
                    const runIdx = column * RUN_COLUMNS + i;
                    const time = entry.times[runIdx];
                    const text = time === undefined ? "" : pad(time);
                    const marked = runIdx === entry.bestIdx ? `<font class='bestt'>${text}</font>` : text;
                    out += `   <td valign="top" nowrap >${marked}</td>\n`;
                }
                return out;
            };

            rows += `   <tr class=${style}>
   <td nowrap align="center">${position}</td>
   <td nowrap align="right">${cclass}${entry.index}</td>
   <td nowrap align="right">${entry.number}</td>
   <td nowrap align="left">${entry.driver}</td>
   <td nowrap ><font class='bestt'>${pax}</font></td>
${cells(0)}   </tr>
   <tr class=${style}>
   <td nowrap align="center"></td>
   <td nowrap align="right"></td>
   <td nowrap align="right"></td>
   <td nowrap align="left">${entry.car}</td>
   <td nowrap >${offset}</td>
${cells(1)}   </tr>\n`;
        });

        return rows;
    }

    render() {
        const classes = [...new Set(ROSTER.map(entry => entry.cclass))];
        const generated = this.stamp(this.updated);
        const bookmarks = classes
            .map(cclass => `   <td ><a class='bkmark' href="#${cclass}">${cclass}</a>  </td>`)
            .join("\n");

        return `<HTML>
   <!-- Generated by: AXWare Systems - AXWare TS - 21.10.008 -2021-01-12 -->
   <!-- Licensed to: Autocross API Test Region -->
   <HEAD>
   <TITLE>Live Results - Generated: ${generated} / Every 1 min</TITLE>
   <meta http-equiv="Content-Type" content="text/html; charset=default:iso-8859-1">
   </HEAD>
   <BODY>
   <style > .rowhigh { background-color: #F0F0F0; } .rowlow { background-color: #FFFFFF; } </style>
   <table class='live' width='100%' cellpadding='3' cellspacing='0' style='border-collapse: collapse' align='center'><tbody>
   <tr class=rowlow>
   <th nowrap align=center><div><span class='ttlleft'>Timing By: <a class='ttl' href='http://www.axwaresystems.com'>AXWare Systems</a></span></div>
   </th>
   </tr>
   <tr class=rowlow>
   <th nowrap align=center>Test Region SCCA - #1 - Test Event - ${this.stamp(this.started)}</th>
   </tr>
   <tr class=rowlow>
   <th nowrap align=center>Live Results - Generated: ${generated} / Every 1 min</th>
   </tr>
   <tr class=rowlow>
   <th nowrap align=center><a href='#' class='ttlright Button' onClick='window.location.reload()'>Refresh</a><i>*** Unofficial ***</i></th>
   </tr>
   </tbody></table>
   <a name="#top">
   <table class='live' border=0 cellspacing=5 width=80% cellpadding='3' cellspacing='0' style='border-collapse: collapse' align='center'><tbody>
   <tr >
${bookmarks}
   </tr>
   </tbody></table>
   <table class='live' width='90%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border="1" align='center'><tbody>
   <tr class=rowlow>
   <th nowrap >Heat #1</th>
   <td ></td>
   </tr>
   </tbody></table>
   <table class='live' width='100%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border="1" align='center'><tbody>
${classes.map(cclass => this.classRows(cclass)).join("")}   </tbody></table>
   </BODY>
</HTML>
`;
    }

    status() {
        return {
            started: this.started.toISOString(),
            updated: this.updated.toISOString(),
            intervalMs: this.intervalMs,
            complete: this.complete,
            runs: this.entries.reduce((total, entry) => total + entry.times.length, 0),
            maxRuns: MAX_RUNS * this.entries.length,
            entries: this.entries.map(entry => ({
                driver: entry.driver,
                class: entry.cclass,
                index: entry.index,
                times: entry.times
            }))
        };
    }

    start() {
        if (this.timer) {
            return this;
        }
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        return this;
    }

    stop() {
        clearInterval(this.timer);
        this.timer = undefined;
    }
}

module.exports = { LiveEvent, MAX_RUNS, ROSTER };
