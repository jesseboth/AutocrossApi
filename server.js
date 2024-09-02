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
    next();
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
const settings = getJsonData('data/settings.json');
const user_driver = settings.user;

// Schedule the task to run every Monday at 00:00
cron.schedule('0 0 * * 1', async function () {
    for (const key in regions) {
        if(regions[key].archive){
            // fetchAndSaveWebpage(regions[key].url, key);
            archiveJson(key, regions[key]);
        }
    }
});
for (const key in regions) {
    if(regions[key].archive){
        archiveJson(key, regions[key]);
    }
}

let event_stats = {};
reset_stats();

// Schedule a task to run every Sunday at 2:30 AM
cron.schedule('30 2 * * 0', () => {
    reset_stats();
});

app.use(express.static('public')); // Serve static files from the public directory
app.use('/archive', express.static("archive")); // Serve static files from the archive directory

style = `  <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                    background-color: #e6e6e8;
                }
                .container {
                    padding: 20px;
                }
                h1 {
                    margin: 0 0 20px 0;
                    font-size: 24px;
                    color: #333;
                }
                ul {
                    list-style: none;
                    padding: 0;
                }
                li {
                    margin-bottom: 10px;
                    display: flex;
                    justify-content: center; /* Center the button */
                }
                a {
                    display: block;
                    width: 25%; /* Each button takes 25% of the total width */
                    padding: 10px 15px;
                    background-color: #007BFF;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    text-align: center;
                    margin-left: 10px;
                }
                a:hover {
                    background-color: #0056b3;
                }
            </style>`;

// Route to list all archived files
app.get('/archive', async (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${style}
        </head>
        <body>
            <div class="container">
                <h1>Archived Files</h1>
                <ul>
    `;

    try {

        let files = await fsp.readdir("archive");
        for (let file of files) {
            if(file.includes(".json")){
                const fileName = file.split(".")[0];
                html += `
                    <li>
                        <a href="/archive/ui/${fileName}">${fileName}</a>
                    </li>
                `;
            }
        }
        html += `
        <li>
            <a style="background-color: #ff0000" href="/">Main Page</a>
        </li>
    `;
    } catch (err) {
        res.status(500).send('Failed to read archive directory');
        return;
    }

    html += `
                </ul>
            </div>
        </body>
        </html>
    `;

    res.send(html);
});


app.get('/', async (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${style}
        </head>
        <body>
            <div class="container">
                <h1>Autocross</h1>
                <ul>
                    ${Object.keys(regions).map(region => `
                        <li>
                            <a href="ui/${region}">${region}</a>
                            <a href="${regions[region].url}">${regions[region].software}</a>
                        </li>
                    `).join('')}
                </ul>
                <ul>
                    <li>
                        <a href="/archive">Archive</a>
                    </li>
                </ul>
            </div>
        </body>
        </html>
    `;

    res.send(html);
});

// /archive/events -> get events
// /archive/<region>_<date> -> get region
// /archive/<region>_<date>/classes -> get classes
app.get('/archive/:a?/:b?/:c?', async (req, res) => {
    getEvents = false;
    event_key = ""
    ui = false;
    ppax = false;
    getClasses = false;
    cclass = undefined;

    try{
        switch (req.params.a.toLowerCase()) {
            case "events":
                getEvents = true;
                break;
            case "ui":
                ui = true;
                break;
            default:
                event_key = req.params.a.toUpperCase();
                break;
        }

        if(req.params.b && !getEvents){
            switch (req.params.b.toLowerCase()) {
                case "classes":
                    getClasses = true;
                    break;
                case "pax":
                    ppax = true;
                    break;
                default:
                    if(event_key == ""){
                        event_key = req.params.b.toUpperCase();
                    }
                    else {
                        cclass = req.params.b.toUpperCase();
                    }
                    break;
            }
        }

        if(req.params.c && !getEvents){
            switch (req.params.c.toLowerCase()) {
                case "pax":
                    ppax = true;
                    break;
                default:
                    cclass = req.params.c.toUpperCase();
                    break;
            }
        }

        if(!ui && getEvents){
            arr = []
            let files = await fsp.readdir("archive");
            for (let file of files) {
                file = file.split(".");
                if(file[1] == "json"){
                    arr.push(file[0]);
                }
            }
            res.json(arr);
            return;
        }
        else if(!ui && getClasses){
            res.json(Object.keys(getJsonData(`archive/${event_key}.json`)));
            return;
        }

        if(ui){
            event_info = event_key.split("_");
            if(cclass == undefined){
                if(ppax){
                    res.send(uiBuilder(pax(getJsonData(`archive/${event_key}.json`)), event_info[0], event_info[1], ppax));
                }
                else {
                    res.send(uiBuilder(getJsonData(`archive/${event_key}.json`), event_info[0], event_info[1], ppax));
                }
            }
            else {
                res.send(uiBuilder(getJsonData(`archive/${event_key}.json`)[cclass], event_info[0], event_info[1], true, false));
            }
            return;
        }
        else {
            if(ppax){
                res.json(pax(getJsonData(`archive/${event_key}.json`)));
            }
            else if(cclass == undefined){
                res.json((getJsonData(`archive/${event_key}.json`)));
            }
            else {
                res.json((getJsonData(`archive/${event_key}.json`))[cclass]);
            }
        }

    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to read archive directory', err);
        return;
    }

});

color_newTime = "#d7d955"
color_upPos = "#4fb342"
color_downPos = "#d14545"
color_newTime = "#1fb9d1"
color_none = "#ffffff"
updates = 0;
app.get('/:a/:b?/:c?/:d?', async (req, res) => {
// app.get('/:widget?/:region/:class?', async (req, res) => {
    let widget = false;
    let tour = false;
    let ui = false;
    let tourType = "";
    let region = "";
    let cclass = "";

    try {
        switch (req.params.a.toUpperCase()) {
            case "WIDGET":
                widget = true;
                break;
            case "UI":
                ui = true;
                break;
            default:
                region = req.params.a.toUpperCase();
                if (regions[region] && regions[region].tour){
                    tour = true;
                    tourType = region;
                }
                break;
        }

        if(req.params.b != undefined){
            region = req.params.b.toUpperCase();
            if (regions[region] && regions[region].tour){
                tour = true;
                tourType = region;
            }
        }

        if((widget && tour) || (ui && tour)){
            region = req.params.c != undefined ? req.params.c.toUpperCase() : undefined;
            cclass = req.params.d != undefined ? req.params.d.toUpperCase() : undefined;
        }
        else if(widget || tour || ui){
            region = req.params.b != undefined ? req.params.b.toUpperCase() : undefined;
            cclass = req.params.c != undefined ? req.params.c.toUpperCase() : undefined;
        }
        else{
            region = req.params.a != undefined ? req.params.a.toUpperCase() : undefined;
            cclass = req.params.b != undefined ? req.params.b.toUpperCase() : undefined;
        }

        if (!tour && !regions.hasOwnProperty(region)) {
            ret = new_results(widget);
            ret["1"].driver = "Region not found " + region;
            res.status(500).json(ret);
            return;
        }

        let region_dict = {}
        if(tour){
            region_dict = {...regions[tourType]};
            if(region != undefined){
                region_dict.url = region_dict.url + region + "/";
            }
            else {
                region_dict.url = region_dict.url;
            }
        }
        else{
            region_dict = regions[region];
        }

        ppax = cclass != undefined ? true : false;
        toggle = cclass != undefined && cclass != "PAX" ? false : true;
        if(region_dict.software == "axware"){
            data = await axware(region, region_dict, cclass, widget)
            if(ui){
                res.send(uiBuilder(data, region, new Date().toLocaleString(), ppax, toggle));
            }
            else {
                res.json(data);
            }
        }
        else if(region_dict.software == "pronto"){
            data = await pronto(region, region_dict, cclass, widget)
            if(ui){
                res.send(uiBuilder(data, region, new Date().toLocaleString(), ppax, toggle));
            }
            else {
                res.json(data);
            }
        }
        else {
            ret = new_results(widget);
            ret["1"].driver = "Timing Software not defined";
            res.status(500).json(ret);
            return;
        }
    } catch (error) {
        console.error(error);
        ret = new_results();
        ret["1"].driver = "Error fetching data";
        res.status(500).json(ret);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

async function axware(region_name, region, cclass, widget = false) {
    const url = region.url;
    if(!event_stats.hasOwnProperty(region_name)){
        event_stats[region_name] = {};
    }
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
                    results[currentClass] = new_results(widget);
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
                            temp[element] = $(columns[col]).text().trim() == "" ? "-" : $(columns[col]).text().trim();
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

                temp.class = currentClass;
                temp.index = temp.index.toUpperCase();
                if(temp.index.startsWith(currentClass)){
                    temp.index = temp.index.slice(currentClass.length).trim();
                }

                if (temp.offset == "" || temp.offset.startsWith("[-]")) {
                    temp.offset = "-"
                }

                temp.pax = simplifyTime(temp.pax);

                temp.position = temp.position.split("T")[0];
                intPosition = parseInt(temp.position)
                if(widget){
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
                }

                runs = temp.times.length;
                temp.times = beautifyTimes(temp.times, findBestTimeIndex(temp.times), widget);

                if (!results.hasOwnProperty(temp.class)) {
                    ;
                }
                else if (!widget || intPosition <= 10) {
                    results[temp.class][temp.position] = { ...temp }
                }
                else if (temp.driver == user_driver) {
                    // put me in 10th if I am outisde top 10
                    results[temp.class]["10"] = { ...temp }
                }
                stats[temp.driver] = { "position": intPosition, "runs": runs }
                temp = {}
            }
            else {
                valid = true;
            }

        };

        if (cclass != undefined) {
            if(cclass == "PAX"){
                return pax(results, widget);
            }
            else if (widget && results.hasOwnProperty(cclass)) {
                return  results[cclass];
            }
            else if (results.hasOwnProperty(cclass)){
                return Object.values(results[cclass]);
            }
            else {
                return new_results(widget)
            }
        }
        else {
            for(const key in results){
                results[key] = Object.values(results[key]);
            }
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

async function pronto(region_name, region, cclass, widget = false) {
    let classes = [cclass];
    if(cclass == undefined){
        classes = await getProntoClasses(region.url, region.data.classes_offset)
    }

    if(!event_stats.hasOwnProperty(region_name)){
        event_stats[region_name] = {};
    }
    let stats = event_stats[region_name];

    try {
        // loop through all classes
    let results = {};
    for (let idx = 0; idx < classes.length; idx++) {
        let url = "";
        let currentClass = classes[idx];

        if(currentClass == "PAX"){
            if(checkUrlExists(region.url + "PaxIndexOverall.html")){
                url = region.url + "PaxIndexOverall.html";
            }
            else if(checkUrlExists(region.url + "PaxIndexDay1.html")){
                url = region.url + "PaxIndexDay1.html";
            }
            else {
                return new_results(widget);
            }
        }
        else {
            url = region.url + currentClass + ".php";
        }

        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const liveElements = $(region.data.element);
        const targetElement = liveElements.eq(region.data.offset);
        const parse = targetElement.find('tr');

        const format = cclass == "PAX" ? region.pax : region.format;

        let temp = {};
        let eligible = {};
        let valid = true;
        results[currentClass] = new_results(widget);


        start_index = region.data.row_offset ? region.data.row_offset : 1;
        for (index = start_index; index < parse.length; index++) {
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
                            temp[element] = $(columns[col]).text().trim() == "" ? "-" : $(columns[col]).text().trim();
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
                store = temp.class;
                temp.class = currentClass;
                if(temp.index == undefined || temp.index.trim() == ""){
                    temp.index = currentClass.toUpperCase();
                } else {
                    temp.index = temp.index.toUpperCase();
                }
                if(temp.index.startsWith(currentClass) && temp.index != currentClass){
                    temp.index = temp.index.slice(currentClass.length).trim();
                }
                if(temp.offset == undefined || temp.offset == ""){ temp.offset = "-" }
                temp.offset = temp.offset.replace(/\(/g, '+').replace(/\)/g, '');
                temp.pax = simplifyTime(temp.pax);

                intPosition = parseInt(temp.position)
                if(widget){
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
                }

                runs = temp.times.length;
                for (i = 0; i < bestIndices.length; i++) {
                    temp.times = bestTime(temp.times, bestIndices[i], widget);
                }
                temp.times = beautifyTimes(temp.times, -1, widget)

                if (!results.hasOwnProperty(temp.class)) {
                    ;
                }
                else if (!widget || intPosition <= 10) {
                    results[temp.class][temp.position] = { ...temp }
                    results[temp.class][temp.position].class = store;
                }
                else if (temp.driver == user_driver) {
                    // put me in 10th if I am outisde top 10
                    results[temp.class]["10"] = { ...temp }
                    results[temp.class]["10"].class = store;
                }
                stats[temp.driver] = { "position": intPosition, "runs": runs }
                temp = {}
            }
            else {
                valid = true;
            }

        };
    }
        if (cclass != undefined) {
            if(cclass == "PAX"){
                return widget ? results["PAX"] : flatten(results);
            }
            else if (results.hasOwnProperty(cclass)) {
                return widget ? results[cclass] : flatten(results);
            }
            else {
                return new_results(widget)
            }
        }
        else {
            for(const key in results){
                results[key] = Object.values(results[key]);
            }
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

function new_results(widget) {

    const not_found = "Class not found";
    if (!widget) {
        return {"1": {"driver": not_found}}
    }

    return {
        "1": { "driver": not_found, "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "1", "color": "#ffffff" },
        "2": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "2", "color": "#ffffff" },
        "3": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "3", "color": "#ffffff" },
        "4": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "4", "color": "#ffffff" },
        "5": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "5", "color": "#ffffff" },
        "6": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "6", "color": "#ffffff" },
        "7": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "7", "color": "#ffffff" },
        "8": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "8", "color": "#ffffff" },
        "9": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "9", "color": "#ffffff" },
        "10": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": " ", "offset": " ", "times": " ", "position": "10", "color": "#ffffff" },
    }
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

// async function covertotoJson() {
//     let files = await fsp.readdir("archiveOther");
//     for (let file of files) {
//         if(file.includes(".html")){
//             rname = file.split("_")[0];
//             region = {...regions[rname]};
//             region.url = "http://192.168.4.199:8000/archiveOther/" + file;
//             console.log(region.url)
//             await archiveJson(rname, region);
//         }
//     }
// }

// archiveJson("TOUR", regions["TOUR"]);
async function archiveJson(name, region) {
    try {
        const response = await axios.get(region.url);
        const htmlContent = response.data;
        const filepath = "archive/"

        date = "fixme-"+getYesterdate();
        const regex = /Live Results - Generated:\s*\w+ (\d{2}-\d{2}-\d{4}) \d{2}:\d{2}:\d{2}/;
        match = htmlContent.match(regex);

        if (match) {
            const [month, day, year] = match[1].split('-');
            const formattedYear = year.slice(2);
            date = `${month}-${day}-${formattedYear}`;
        }
        else if(region.tour){
            const regex = /Sportity Event Password:\s*([A-Za-z0-9]+)/;
            match = htmlContent.match(regex);
            date = match ? match[1] : date;
        }

        const filename = filepath+`${name}_${date}.json`;
        let content = {};
        if(region.software == "axware"){
            content = await axware(name, region, undefined, false);
        }
        else if(region.software == "pronto"){
            content = await pronto(name, region, undefined, false);
        }
        else {
            console.error("Software not defined: ", region.software, "Can not archive");
            return;
        }

        // Write the HTML content to a file
        if(Object.keys(content).length > 0){
            fs.writeFileSync(filename, JSON.stringify(content), 'utf8');
        }
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

function bestTime(times, bestIdx, widget) {
    if(!widget){
        return times;
    }

    split = times[bestIdx].split("+")
    if(split.length > 1){
        split[1] = split[1] + "[/c]"
    }

    split[0] = "[b][c=#ff54ccff]" + split[0] + "[/c][/b]"
    times[bestIdx] = split.join("[c=#ffde6868]+")

    return times;
}

function beautifyTimes(times, bestIdx, widget) {
    if(!widget){
        return times;
    }
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

function reset_stats() {
    for (const key in Object.keys(event_stats)) {
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

function flatten(results){
    const flattenedData = [];
    Object.keys(results).forEach(cclass => {
    Object.keys(results[cclass]).forEach(entryId => {
        const entryData = results[cclass][entryId];
        if (typeof entryData === 'object' && entryData !== null) {
            flattenedData.push(entryData);
        }
    });
    });

    return flattenedData;
}

function pax(results, widget){
    ret = {}

    const flattenedData = flatten(results)
    paxSort(flattenedData);

    for(i = 0; i < flattenedData.length; i++){
        flattenedData[i].position = (i+1).toString();
        if(i > 0){
            const paxA = parseFloat(flattenedData[i-1].pax);
            const paxB = parseFloat(flattenedData[i].pax);
            if(paxB == NaN){
                flattenedData[i].offset = "-";
            }

            flattenedData[i].offset = ((paxB - paxA).toFixed(3)).toString();
        }

        if(widget){
            if(i < 10){
                ret[(i+1).toString()] = flattenedData[i];
            }
            else if(flattenedData[i].driver == user_driver){
                ret["10"] = flattenedData[i];
                break;
            }
        }
    }
    return widget ? ret : flattenedData;
}

// Custom sort function to handle numeric and non-numeric 'pax' values
function paxSort(data) {
    return data.sort((a, b) => {
        let stringA = a.pax.trim();
        let stringB = b.pax.trim();
        if(stringA == "OFF" || stringA == "DNF" || stringA == "DSQ" || stringA == ""){
            stringA = "DNF";
        }
        if(stringB == "OFF" || stringB == "DNF" || stringB == "DSQ" || stringB == ""){
            stringB = "DNF";
        }

        if(stringA == "DNS" && stringB == "DNS"){
            return 0;
        }
        else if(stringA == "DNS"){
            return 1;
        }
        else if(stringB == "DNS"){
            return -1;
        }
        else

        if(stringA == "DNF" && stringB == "DNF"){
            return 0;
        }
        else if(stringA == "DNF"){
            return 1;
        }
        else if(stringB == "DNF"){
            return -1;
        }
        const paxA = parseFloat(a.pax);
        const paxB = parseFloat(b.pax);

        return paxA - paxB; // Both are numeric, sort in ascending order
    });
}

// Function to check if a URL exists and return a boolean
async function checkUrlExists(url) {
    try {
        await axios.head(url);
        return true;
    } catch (error) {
        return false;
    }
}

async function getProntoClasses(url, offset) {
    try {
        // Fetch the HTML from the URL
        const { data: html } = await axios.get(url);

        // Load the HTML into Cheerio
        const $ = cheerio.load(html);

        // Select all table elements
        const liveElements = $("table");

        // Use offset to get the specific table you want
        const targetElement = liveElements.eq(offset); // This selects the third table (0-based index)

        // Initialize an array to store the extracted links without '.php'
        const linksArray = [];

        // Select all <a> elements within the targeted table
        targetElement.find('a').each((index, element) => {
            let link = $(element).attr('href');
            if (link) {
            // Remove the '.php' extension if it exists
            link = link.replace('.php', '');
            linksArray.push(link);
            }
        });

        // Return the array of links
        return linksArray;

    } catch (error) {
        console.error('Error fetching or parsing HTML:', error);
        return [];
    }
}

function uiBuilder(jsonData, name = "AutoX", date = new Date().toLocaleString(), pax = false, toggle = true) {
    // Function to generate table rows for each entry
    function generateTableRows(entries) {
        let rows = '';
        entries.forEach((entry, index) => {
            const rowClass = index % 2 === 0 ? 'rowlow' : 'rowhigh';
            if(entry.times.length > 0){
                bestTimeIndex = findBestTimeIndex(entry.times);
                entry.times[bestTimeIndex] = `<b style="border: 1px solid black; padding: 2px; color: black;">${entry.times[bestTimeIndex]}</b>`;
            }
            rows += `<tr class="${rowClass}">
                <td nowrap align="center">${entry.position}</td>
                <td nowrap align="right">${entry.index}</td>
                <td nowrap align="right">${entry.number}</td>
                <td nowrap align="left">${entry.driver}</td>
                <td nowrap ><font class='bestt'>${entry.pax}</font></td>
                <td valign="top" nowrap >${entry.times[0] || ''}</td>
                <td valign="top" nowrap >${entry.times[1] || ''}</td>
                <td valign="top" nowrap >${entry.times[2] || ''}</td>
                <td valign="top" nowrap >${entry.times[3] || ''}</td>
            </tr>
            <tr class="${rowClass}">
                <td nowrap align="center"></td>
                <td nowrap align="right"></td>
                <td nowrap align="right"></td>
                <td nowrap align="left">${entry.car}</td>
                <td nowrap >${entry.offset}</td>
                <td valign="top" nowrap >${entry.times[4] || ''}</td>
                <td valign="top" nowrap >${entry.times[5] || ''}</td>
                <td valign="top" nowrap ></td>
                <td valign="top" nowrap ></td>
            </tr>`;
        });
        return rows;
    }

    // Generate the HTML content
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>Updated: ${date}</title>
        <style>
            body { margin: 0; padding: 0; width: 98vw; max-width: 100%; font-family: Verdena; }
            .rowhigh { background-color: #e6e6e8; }
            .rowlow { background-color: #FFFFFF; }
            h1, h2, h3 { text-align: center; font-family: Arial; color: #0000FF; }
            th { color: #FFFFFF; background-color: #152bed; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; text-align: center; }
            a { color: blue; text-decoration: none; }
            .bestt { font-weight: bold; }
            .toggle-button {
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 10px 20px;
                background-color: #6495ed;
                color: white;
                border: none;
                cursor: pointer;
                font-size: 14px;
                border-radius: 5px;
            }
        </style>
        <script>
function toggleURL() {
    const currentURL = window.location.href;
    const url = new URL(currentURL);
    let pathParts = url.pathname.split('/').filter(part => part !== ''); // Remove empty parts

    if (pathParts.includes('pax')) {
        // Remove 'pax' from the path
        pathParts.splice(pathParts.indexOf('pax'), 1);
    } else {
        // Add 'pax' to the end of the path
        pathParts.push('pax');
    }

    // Rebuild the URL path and navigate, ensuring no trailing slash unless it's the root
    url.pathname = '/' + pathParts.join('/');
    window.location.href = url.toString();
}
        </script>
    </head>
    <body>
        <button class="toggle-button" onClick="toggleURL()" style="display: ${toggle ? 'block' : 'none'}">Toggle ${pax ? 'Class' : 'PAX'}</button>
        <h1>${name.toUpperCase()} Results</h1>
        <table class='live' cellpadding='3' cellspacing='1' style='border-collapse: collapse' align='center'>
            <tbody>
                <tr class="rowlow">
                    <th nowrap align="center">Region - ${name}</th>
                </tr>
                <tr class="rowlow">
                    <th nowrap align="center">Updated: ${date}</th>
                </tr>
            </tbody>
        </table>
        <a name="#top"></a>
            <table class='live' border='0' cellspacing='5' width='80%' cellpadding='3' style='border-collapse: collapse; word-wrap: break-word; table-layout: fixed;' align='center'>
                <tbody>
                    <tr>
                        ${pax ? '' : Object.keys(jsonData).map(category => `<td style="word-wrap: break-word; white-space: normal;"><a class='bkmark' href="#${category}">${category}</a></td>`).join('')}
                    </tr>
                </tbody>
            </table>
    `;

    // Iterate over each category (P, T, S, etc.)
    if (pax) {
        htmlContent += `
        <table class='live' width='100%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border='1' align='center'>
        <tbody>
        <tr class="rowlow">
        <th nowrap rowspan="1" colspan="9" align="left"><a name="PAX"></a> PAX - Total Entries: ${jsonData.length}</th>
        </tr>

        ${generateTableRows(jsonData)}
        </tbody>
        </table>`;
    } else {
        for (const category in jsonData) {
            if (jsonData.hasOwnProperty(category)) {
                htmlContent += `
                <table class='live' width='100%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border='1' align='center'>
                <tbody>
                <tr class="rowlow">
                <th nowrap rowspan="1" colspan="9" align="left"><a name="${category}"></a> ${category} - Total Entries: ${jsonData[category].length}</th>
                </tr>
                    ${generateTableRows(jsonData[category])}
                </tbody>
                </table>`;
            }
        }
    }

    htmlContent += `
    </body>
    </html>`;

    return htmlContent;
}
