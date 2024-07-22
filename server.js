const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const e = require('express');
const fs = require('fs');

const app = express();
const PORT = 8000;

// Middleware for redirection
app.use((req, res, next) => {
    if (req.path === '/') { // Checking if the request path is the root
        res.redirect("/archives");
    } else {
        next(); // Continue to other routes if not the root
    }
});

// Function to read and parse the JSON file
const getJsonData = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading or parsing file: ${err}`);
        return null;
    }
};
const regions = getJsonData('data/regions.json');

// Schedule the task to run every Monday at 00:00
cron.schedule('0 0 * * 1', async function () {
    for (const key in regions) {
        fetchAndSaveWebpage(regions[key].url);
    }
});

let event_stats = {};
reset_stats(regions);

// Schedule a task to run every Sunday at 2:30 AM
cron.schedule('30 2 * * 0', () => {
    reset_stats(regions);
});

app.use(express.static('public')); // Serve static files from the public directory
app.use('/archives', express.static("archive")); // Serve static files from the archive directory

// Route to list all archived files
app.get('/archives', (req, res) => {
    fs.readdir("archive", (err, files) => {
        if (err) {
            res.status(500).send('Failed to read archive directory');
            return;
        }

        let html = '';
        html += '<h1>Autocross</h1>';
        html += '<ul>';
        html += `<li><a href="https://live.flr-scca.com">FLR</a></li>`;
        html += `<li><a href="https://live.cny-scca.com">CNY</a></li>`;
        html += '</ul>';
        html += '<br><br>'
        html += '<h1>Archived Files</h1>';
        html += '<ul>';
        for (let file of files) {
            // Create a list item with a link for each file
            html += `<li><a href="/archives/${file}">${file}</a></li>`;
        }
        html += '</ul>';
        res.send(html);
    });
});

color_newTime = "#d7d955"
color_upPos = "#4fb342"
color_downPos = "#d14545"
color_newTime = "#1fb9d1"
color_none = "#ffffff"
updates = 0;
app.get('/:region/:class?', async (req, res) => {
    const region = req.params.region.toUpperCase();
    const classCode = req.params.class;

    try {
        if (!regions.hasOwnProperty(region)) {
            res.status(404).send('Region not found');
            return;
        }

        const url = regions[region].url;
        const classes = regions[region].classes;
        let stats = event_stats[region];

        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const liveElements = $('.live');
        const targetElement = liveElements.eq(regions[region].data);
        const parse = targetElement.find('tr.rowlow, tr.rowhigh');

        const format = regions[region].format;

        results = reset_results(classes, true);
        let temp = {};
        let eligible = {};
        let valid = true;

        for (index = 0; index < parse.length; index++) {
            temp = {}
            temp.times = []
            for (row = 0; row < format.length; row++) {
                let columns = $(parse[index]).find('td');
                if (columns.length > 1) {
                    for (col = 0; col < columns.length; col++) {
                        element = format[row][col];
                        if (element == null) {
                            ;
                        }
                        else if (element == "t") {
                            temp.times.push(simplifyTime($(columns[col]).text().trim()));
                        }
                        else {
                            temp[element] = $(columns[col]).text().trim();
                        }
                    }
                    if (row + 1 < format.length) {
                        index++;
                    }
                }
                else {
                    valid = false;
                    break;
                }
            }

            if (valid) {
                temp.driver = toTitleCase(temp.driver);
            }

            if (valid && eligibleName(temp.driver, eligible)) {

                classes.forEach(item => {
                    if (temp.carClass.startsWith(item)) {
                        temp.classCode = item;
                    }
                });

                if (temp.classCode != undefined) {
                    temp.carClass = (temp.carClass).slice(temp.classCode.length).toUpperCase();

                    if (temp.carClass == "") { temp.carClass = classCode }
                }
                else {
                    console.log("Problem: ", temp.carClass)
                    temp.classCode = temp.carClass;
                }

                if (temp.offset == "") {
                    temp.offset = "-"
                }

                temp.pax = simplifyTime(temp.pax);

                temp.position = temp.position.split("T")[0];
                intPosition = parseInt(temp.position)
                if (stats.hasOwnProperty(temp.driver)) {
                    if (intPosition < stats[temp.driver].position) {
                        temp.color = color_upPos;
                    }
                    else if (intPosition > stats[temp.driver].position) {
                        temp.color = color_downPos;
                    }
                    else if (temp.times.length > stats[temp.driver].runs) {
                        temp.color = color_newTime;
                    }
                    else {
                        temp.color = color_none;
                    }
                }
                else {
                    temp.color = color_none;
                }

                runs = temp.times.length;
                bestIdx = findBestTimeIndex(temp.times);
                temp.times[bestIdx] = "[b][c=#ff54ccff]" + temp.times[bestIdx] + "[/c][/b]";
                temp.times = temp.times.join('   ').trim();

                if (!results.hasOwnProperty(temp.classCode)) {
                    ;
                }
                else if (intPosition <= 10) {
                    results[temp.classCode][temp.position] = { ...temp }
                }
                else if (temp.driver == "Jesse Both") {
                    // put me in 10th if I am outisde top 10
                    results[temp.classCode]["10"] = { ...temp }
                }
                stats[temp.driver] = { "position": intPosition, "runs": runs }
                temp = {}
            }
            else {
                valid = true;
            }

        };
        updates++;
        if (updates > 100) { updates = 0; }
        if (classCode != undefined) {
            if (results.hasOwnProperty(classCode)) {
                results[classCode]["updates"] = updates;
                res.json(results[classCode])
            }
            else {
                res.json(new_results())
            }
        }
        else {
            res.json(results)
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

function new_results() {
    return {
        "1": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "1", "color": "#ffffff" },
        "2": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "2", "color": "#ffffff" },
        "3": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "3", "color": "#ffffff" },
        "4": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "4", "color": "#ffffff" },
        "5": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "5", "color": "#ffffff" },
        "6": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "6", "color": "#ffffff" },
        "7": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "7", "color": "#ffffff" },
        "8": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "8", "color": "#ffffff" },
        "9": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "9", "color": "#ffffff" },
        "10": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "10", "color": "#ffffff" }
    }
}

function reset_results(classes, widget = false) {
    results = {}

    if (!widget) {
        for (i = 0; i < classes.length; i++) {
            results[classes[i]] = []
        }
    }
    else {
        for (i = 0; i < classes.length; i++) {
            results[classes[i]] = new_results();
        }
    }

    return results
}

async function fetchAndSaveWebpage(local_url) {
    try {
        const response = await axios.get(local_url);
        const htmlContent = response.data;

        // Use the updated regular expression to extract the date
        // const eventRegex = /Finger Lakes Region SCCA - #\d+ - Event \d+ - (\d{1,2}\/\d{1,2}\/\d{2})/;
        // const eventRegex = new RegExp(`${region.name} SCCA - #\\d+ - Event \\d+ - (\\d{1,2}/\\d{1,2}/\\d{2})`);
        const eventRegex = /(.*?) SCCA - #(\d+) - (?:Event \d+ - )?(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{1,2}-\d{1,2})/g;
        const match = htmlContent.match(eventRegex);

        // Set a default filename in case no match is found
        let filename = 'default_filename.html';

        // If a match is found, use the date to create a filename
        if (match) {
            // Replace slashes with underscores to create a valid filename
            let event = match[0].replace(/\//g, '-');
            event = event.replace(/ /g, '_');
            event = event.replace(/#/g, '');
            filename = `${event}.html`.split(">")[1];
            filename = "archive/" + filename;
        }

        // Write the HTML content to a file
        fs.writeFileSync(filename, htmlContent, 'utf8');
    } catch (error) {
        console.error('Failed to fetch webpage:', error);
    }
}

function toTitleCase(str) {
    return str.toLowerCase().split(' ').map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function simplifyTime(string) {

    split = string.split("+")
    if (split.length > 1 && split[0] == split[1]) {
        return ""
    }

    if (string.includes("OFF")) {
        return "OFF"
    }
    else if (string.includes("DNF")) {
        return "DNF"
    }
    else if (string.includes("DSQ")) {
        return "DSQ"
    }


    return string.toUpperCase()
}

function convertToSeconds(time) {
    if (time == "", time.includes('DNF') || time.includes('OFF') || time.includes('DSQ')) {
        return Infinity;
    }

    const parts = time.split('+');
    const baseTime = parseFloat(parts[0]);

    if (parts.length > 1) {
        if (parts[1] === 'OFF' || parts[1] === 'DSQ') {
            return Infinity;
        }
        const penalties = parseInt(parts[1], 10);
        return baseTime + (penalties * 2);
    }

    return baseTime;
}

function findBestTimeIndex(times) {
    let bestTimeIndex = -1;
    let bestTime = Infinity;

    for (let i = 0; i < times.length; i++) {
        const adjustedTime = convertToSeconds(times[i]);

        if (adjustedTime < bestTime) {
            bestTime = adjustedTime;
            bestTimeIndex = i;
        }
    }

    return bestTimeIndex;
}

function reset_stats(regions) {
    for (const key in regions) {
        event_stats[key] = {};
    }
}

// Function to add a name if it doesn't already exist
function eligibleName(name, namesObj) {
    if (!namesObj.hasOwnProperty(name)) {
        namesObj[name] = true;
        return true;
    } else {
        return false;
    }
}

