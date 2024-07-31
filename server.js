const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const fs = require('fs');
const fsp = require('fs').promises;

const app = express();
const PORT = 8000;

// Middleware for redirection
app.use((req, res, next) => {
    if (req.path === '/') { // Checking if the request path is the root
        res.redirect("/archive");
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
        if(regions[key].archive){
            fetchAndSaveWebpage(regions[key].url, key);
        }
    }
});

let event_stats = {};
reset_stats(regions);

// Schedule a task to run every Sunday at 2:30 AM
cron.schedule('30 2 * * 0', () => {
    reset_stats(regions);
});

app.use(express.static('public')); // Serve static files from the public directory
app.use('/archive', express.static("archive")); // Serve static files from the archive directory
app.use('/archiveOther', express.static("archiveOther")); // Serve static files from the archive directory

// Route to list all archived files
app.get('/archive', async (req, res) => {
    let html = '';
    html += '<h1>Autocross</h1>';
    html += '<ul>';
    for (let region in regions) {
        html += `<li><a href="${regions[region].url}">${region}</a></li>`;
        html += `<br>`;
    }
    html += '</ul>';
    html += '<br><br>';
    html += '<h1>Archived Files</h1>';
    html += '<ul>';

    try {
        let files = await fsp.readdir("archive");
        for (let file of files) {
            html += `<li><a href="/archive/${file}">${file}</a></li>`;
        }
    } catch (err) {
        res.status(500).send('Failed to read archive directory');
        return;
    }

    html += '</ul>';
    html += '<h1>Other Archived Files</h1>';
    html += '<ul>';

    try {
        let files = await fsp.readdir("archiveOther");
        for (let file of files) {
            html += `<li><a href="/archiveOther/${file}">${file}</a></li>`;
        }
    } catch (err) {
        res.status(500).send('Failed to read archiveOther directory');
        return;
    }

    html += '</ul>';

    res.send(html);
});


color_newTime = "#d7d955"
color_upPos = "#4fb342"
color_downPos = "#d14545"
color_newTime = "#1fb9d1"
color_none = "#ffffff"
updates = 0;
app.get('/:region/:class?', async (req, res) => {
    const region = req.params.region.toUpperCase();
    classCode = req.params.class;

    if(classCode != undefined){
        classCode = req.params.class.toUpperCase();
    }

    try {
        if (!regions.hasOwnProperty(region)) {
            res.status(404).send('Region not found');
            return;
        }

        const region_dict = regions[region];

        if(region_dict.software == "axware"){
            res.json(await axware(region, region_dict, classCode));
        }
        else if(region_dict.software == "pronto"){
            res.json(await pronto(region, region_dict, classCode));
        }
        else {
            res.status(404).send('Timing Software not defined');
            return;
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});

app.get('/tour/:region/:class?', async (req, res) => {
    const region = req.params.region.toUpperCase();
    classCode = req.params.class;

    if(classCode != undefined){
        classCode = req.params.class.toUpperCase();
    }

    try {
        if (!regions.hasOwnProperty("TOUR")) {
            res.status(404).send('Region not found');
            return;
        }

        let region_dict = { ...regions["TOUR"] };
        region_dict.url = region_dict.url + region + "/";

        if(region_dict.software == "axware"){
            res.json(await axware(region, region_dict, classCode));
        }
        else if(region_dict.software == "pronto"){
            res.json(await pronto("TOUR", region_dict, classCode));
        }
        else {
            res.status(404).send('Timing Software not defined');
            return;
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

async function axware(region_name, region, classCode) {
    const url = region.url;
    let stats = event_stats[region_name];

    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const liveElements = $(region.data.element);
        const targetElement = liveElements.eq(region.data.offset);
        const parse = targetElement.find('tr.rowlow, tr.rowhigh, th');


        const format = region.format;

        results = {};
        let temp = {};
        let eligible = {};
        let valid = true;
        let currentClass = "";

        for (index = 0; index < parse.length; index++) {
            temp = {}
            temp.times = []
            for (row = 0; row < format.length; row++) {
                let columns = $(parse[index]).find('td');
                let classElem = $(parse[index]).find('th');
                if(classElem.length > 0){
                    currentClass = $(classElem).text().trim().split(" ")[0].toUpperCase();
                    results[currentClass] = new_results();
                }
                if (currentClass != "" && columns.length > 1) {
                    let format_offset = 0;
                    for (col = 0; col < columns.length; col++) {
                        element = format[row][col-format_offset];
                        if (element == null || element == undefined) {
                            ;
                        }
                        else if (element == "t") {
                            temp.times.push(simplifyTime($(columns[col]).text().trim()));
                        }
                        else if (element.startsWith("t-")) {
                            const before = parseInt(element.split("-")[1]);
                            for (col; col < columns.length-before-1; col++, format_offset++) {
                                temp.times.push(simplifyTime($(columns[col]).text().trim()));
                            }
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

                temp.classCode = currentClass;
                temp.carClass = temp.carClass.toUpperCase();
                if(temp.carClass.startsWith(currentClass)){
                    temp.carClass = temp.carClass.slice(currentClass.length).trim();
                }

                if (temp.offset == "" || temp.offset.startsWith("[-]")) {
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
                temp.times = beautifyTimes(temp.times, findBestTimeIndex(temp.times));

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
                return results[classCode]
            }
            else {
                return new_results()
            }
        }
        else {
            return results
        }
    } catch (error) {
        console.log(error)
        err = error.stack.split('\n')[0].split(':');
        results = new_results();
        results["1"].driver =  err[0];
        results["1"].number = error.response ? error.response.status : '-1';
        results["1"].times = err[1];
        results["1"].color = color_downPos;

        return results;
    }
}

async function pronto(region_name, region, classCode) {
    const url = region.url + classCode + ".php";
    let stats = event_stats[region_name];

    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const liveElements = $(region.data.element);
        const targetElement = liveElements.eq(region.data.offset);
        const parse = targetElement.find('tr');

        const format = region.format;

        let temp = {};
        let eligible = {};
        let valid = true;
        let currentClass = classCode;
        results = {};
        results[currentClass] = new_results();

        for (index = 1; index < parse.length; index++) {
            temp = {}
            temp.times = []
            bestIndices = []
            for (row = 0; row < format.length; row++) {
                let columns = $(parse[index]).find('td');

                if (columns.length > 1) {
                    for (col = 0; col < columns.length; col++) {
                        element = format[row][col];
                        if (element == null) {
                            ;
                        }
                        else if (element == "t") {
                            let txt = $(columns[col]).text().trim();
                            const html = $(columns[col]).html().trim();
                            if(html.startsWith("<s>")){
                                txt = txt + "+OFF";
                            }
                            if(html.startsWith("<b>")){
                                bestIndices.push(temp.times.length);
                            }
                            temp.times.push(simplifyTime(txt.replace(/\(/g, '+').replace(/\)/g, '')));
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
                
                temp.classCode = currentClass;
                if(temp.carClass == undefined || temp.carClass.trim() == ""){
                    temp.carClass = currentClass.toUpperCase();
                } else {
                    temp.carClass = temp.carClass.toUpperCase();
                }
                if(temp.carClass.startsWith(currentClass) && temp.carClass != currentClass){
                    temp.carClass = temp.carClass.slice(currentClass.length).trim();
                }
                if(temp.offset == undefined || temp.offset == ""){ temp.offset = "-" }
                temp.offset = temp.offset.replace(/\(/g, '+').replace(/\)/g, '');
                
                temp.pax = simplifyTime(temp.pax);

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
                for (i = 0; i < bestIndices.length; i++) {
                    temp.times = bestTime(temp.times, bestIndices[i]);
                }
                temp.times = beautifyTimes(temp.times, -1)

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
                return results[classCode]
            }
            else {
                return new_results()
            }
        }
        else {
            return results
        }
    } catch (error) {
        console.log(error)
        err = error.stack.split('\n')[0].split(':');
        results = new_results();
        results["1"].driver =  err[0];
        results["1"].number = error.response ? error.response.status : '-1';
        results["1"].times = err[1];
        results["1"].color = color_downPos;
        return results;
    }
}

function new_results() {
    return {
        "1": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "1", "color": "#ffffff" },
        "2": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "2", "color": "#ffffff" },
        "3": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "3", "color": "#ffffff" },
        "4": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "4", "color": "#ffffff" },
        "5": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "5", "color": "#ffffff" },
        "6": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "6", "color": "#ffffff" },
        "7": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "7", "color": "#ffffff" },
        "8": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "8", "color": "#ffffff" },
        "9": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "9", "color": "#ffffff" },
        "10": { "driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "10", "color": "#ffffff" }
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

function getYesterdate() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    const year = yesterday.getFullYear();

    return `${month}-${day}-${year}`;
}

async function fetchAndSaveWebpage(local_url, region) {
    try {
        const response = await axios.get(local_url);
        const htmlContent = response.data;

        filepath = "archiveOther/"
        if(htmlContent.includes("Jesse Both")){
            filepath = "archive/"
        }

        const regex = /Live Results - Generated:\s*\w+ (\d{2}-\d{2}-\d{4}) \d{2}:\d{2}:\d{2}/;
        const match = htmlContent.match(regex);

        date = "fixme-"+getYesterdate();
        if (match) {
            date = match[1];
        }

        const filename = filepath+`${region}_${date}.html`;

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

function simplifyTime(_string) {
    if(_string == undefined){
        return "999.99";
    }

    string = _string.toUpperCase()

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

    return string
}

function bestTime(times, bestIdx) {
    split = times[bestIdx].split("+")
    if(split.length > 1){
        split[1] = split[1] + "[/c]"
    }

    split[0] = "[b][c=#ff54ccff]" + split[0] + "[/c][/b]"
    times[bestIdx] = split.join("[c=#ffde6868]+")

    return times;
}

function beautifyTimes(times, bestIdx) {
    for (i = 0; i < times.length; i++) {
        if(times[i].startsWith("[b]")){
            continue;
        }
        split = times[i].split("+")
        if(split.length > 1){
            split[1] = split[1] + "[/c]"
        }
        if(i == bestIdx){
            split[0] = "[b][c=#ff54ccff]" + split[0] + "[/c][/b]"
        }
        times[i] = split.join("[c=#ffde6868]+")

    }
    retval = times.join('   ').trim();
    if(retval == "") { retval = " " }
    return retval;
}

function convertToSeconds(time) {
    if (time == "", time.includes('DNF') || time.includes('OFF') || time.includes('DSQ') || time.includes("RRN")) {
        return Infinity;
    }

    const parts = time.split('+');
    const baseTime = parseFloat(parts[0]);

    if (parts.length > 1) {
        if (parts[1] === 'OFF' || parts[1] === 'DSQ' || parts[1] === 'DNF') {
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

