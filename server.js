const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const e = require('express');
const fs = require('fs');

const app = express();
const PORT = 8000;

const url = 'https://live.flr-scca.com/';
// Middleware for redirection
app.use((req, res, next) => {
    if (req.path === '/') { // Checking if the request path is the root
        res.redirect(url);
    } else {
        next(); // Continue to other routes if not the root
    }
});

// Schedule the task to run every Monday at 00:00
cron.schedule('0 0 * * 1', async function() {
    fetchAndSaveWebpage();
});

const classes = ["P", "S1", "S2", "T", "X", "$", "M", "N", "V"]

app.get('/timing-data/:class?', async (req, res) => {
    const classCode = req.params.class;
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        results = reset_results();
        let temp = {};

        driver = 0
        stop = false;
        $('tr.rowlow, tr.rowhigh').each((index, element) => {
            const columns = $(element).find('td');

            if(!stop && $(columns[0]).text().trim() == "Raw time"){
                stop = true;
            }
            else if (!stop && $(columns).length > 1){
                if (driver % 2 === 0) {  // Even index rows contain driver information
                    temp.times = []
                    position = $(columns[0]).text().trim().split("T")[0];
                    fullclass = $(columns[1]).text().trim();
                    classes.forEach(item => {
                        if(fullclass.startsWith(item)){
                            temp.classCode = item;
                        }
                    });
                    temp.carClass = $(columns[1]).text().trim();
                    temp.number = $(columns[2]).text().trim();
                    temp.driver = toTitleCase($(columns[3]).text().trim());
                    temp.pax = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {

                            temp.times.push($(columns[i]).text().trim());
                        }
                    }

                    driver++;
                }
                else {
                    temp.car = $(columns[3]).text().trim();
                    temp.offset = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {
                            temp.times.push($(columns[i]).text().trim());
                        }
                    }

                    elem = {}
                    elem = {...temp}
                    results[temp.classCode].push(elem)
                    temp = {};
                    driver = 0;
                }
            }
        });
        if (classCode != undefined) {
            res.json(results[classCode])
        }
        else {
            res.json(results)
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});



/*
{
"First Last": {
        position: 1
        runs: 0
    }
}
*/
stats = {}
// Schedule a task to run every Sunday at 2:30 AM
cron.schedule('30 2 * * 0', () => {
    stats = {}
});

color_newTime = "#d7d955"
color_upPos = "#4fb342"
color_downPos = "#d14545"
color_newTime = "#1fb9d1"
color_none = "#ffffff"
app.get('/widget/:class?', async (req, res) => {
    const classCode = req.params.class;
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        results = reset_results(true);
        let temp = {};

        driver = 0
        stop = false;
        $('tr.rowlow, tr.rowhigh').each((index, element) => {
            const columns = $(element).find('td');

            if(!stop && $(columns[0]).text().trim() == "Raw time"){
                stop = true;
            }
            else if (!stop && $(columns).length > 1){
                if (driver % 2 === 0) {
                    temp.times = []
                    position = $(columns[0]).text().trim().split("T")[0];
                    temp.position = position;
                    fullclass = $(columns[1]).text().trim();
                    classes.forEach(item => {
                        if(fullclass.startsWith(item)){
                            temp.classCode = item;
                        }
                    });
                    temp.carClass = $(columns[1]).text().trim().slice(temp.classCode.length);
                    temp.number = $(columns[2]).text().trim();
                    temp.driver = toTitleCase($(columns[3]).text().trim());
                    temp.pax = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {
                            temp.times.push(simplifyTime($(columns[i]).text().trim()));
                        }
                    }

                    driver++;
                }
                else {
                    temp.car = $(columns[3]).text().trim();
                    temp.offset = $(columns[4]).text().trim();
                    if(temp.offset == ""){ temp.offset = "-" }
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {
                            temp.times.push(simplifyTime($(columns[i]).text().trim()));
                        }
                    }

                    driver = 0;
                    intPosition = parseInt(position)
                    if (stats.hasOwnProperty(temp.driver)){
                        if(intPosition < stats[temp.driver].position){
                            temp.color = color_upPos;
                        }
                        else if(intPosition > stats[temp.driver].position){
                            temp.color = color_downPos;
                        }
                        else if(temp.times.length > stats[temp.driver].runs){
                            temp.color = color_newTime;
                        }
                        else{
                            temp.color = color_none;
                        }
                    }
                    else {
                        temp.color = color_none;
                    }

                    if(intPosition <= 10){
                        results[temp.classCode][position] = {...temp}
                    }
                    else if(temp.driver == "Jesse Both") {
                        // put me in 10th if I am outisde top 10
                        results[temp.classCode]["10"] = {...temp}
                    }

                    stats[temp.driver] = {"position": intPosition, "runs": temp.times.length}
                    temp = {}
                }
            }
        });
        if (classCode != undefined) {
            res.json(results[classCode])
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

app.use(express.static('public')); // Serve static files from the public directory
app.use('/archives', express.static("archive")); // Serve static files from the archive directory

// Route to list all archived files
app.get('/archives', (req, res) => {
    fs.readdir("archive", (err, files) => {
        if (err) {
            res.status(500).send('Failed to read archive directory');
            return;
        }

        let html = '<h1>Archived Files</h1>';
        html += '<ul>';
        for (let file of files) {
            // Create a list item with a link for each file
            html += `<li><a href="/archives/${file}">${file}</a></li>`;
        }
        html += '</ul>';
        res.send(html);
    });
});

function reset_results(widget=false){
    results = {}

    if(!widget){
        for(i = 0; i < classes.length; i++){
            results[classes[i]] = []
        }
    }
    else {
        for(i = 0; i < classes.length; i++){
            results[classes[i]] = {
                    "1": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "1", "color": "#ffffff"},
                    "2": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "2", "color": "#ffffff"},
                    "3": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "3", "color": "#ffffff"},
                    "4": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "4", "color": "#ffffff"},
                    "5": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "5", "color": "#ffffff"},
                    "6": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "6", "color": "#ffffff"},
                    "7": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "7", "color": "#ffffff"},
                    "8": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "8", "color": "#ffffff"},
                    "9": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "9", "color": "#ffffff"},
                    "10":{"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "10", "color": "#ffffff"}
                }
        }
    }

    return results
}

fetchAndSaveWebpage();
async function fetchAndSaveWebpage(url_local=url) {
    try {
        const response = await axios.get(url_local);
        const htmlContent = response.data;

        // Use the updated regular expression to extract the date
        const eventRegex = /Finger Lakes Region SCCA - #\d+ - Event \d+ - (\d{1,2}\/\d{1,2}\/\d{2})/;
        const match = htmlContent.match(eventRegex);

        // Set a default filename in case no match is found
        let filename = 'default_filename.html';

        // If a match is found, use the date to create a filename
        if (match) {
            // Replace slashes with underscores to create a valid filename
            let event = match[0].replace(/\//g, '-');
            event = event.replace(/ /g, '_');
            event = event.replace(/#/g, '');
            filename = `${event}.html`;
            filename = "archive/"+ filename;
        }

        // Write the HTML content to a file
        fs.writeFileSync(filename, htmlContent, 'utf8');
    } catch (error) {
        console.error('Failed to fetch webpage:', error);
    }
}

function toTitleCase(str) {
    return str.toLowerCase().split(' ').map(function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function simplifyTime(string){
    if(string.includes("OFF")){
        return "OFF"
    }
    else if(string.includes("DNF")){
        return "DNF"
    }

    return string
}

function _timeCompare(time1, time2){

}

function timeCompare(time1, time2) {
    let t1 = time1.split("+");
    let t2 = time2.split("+");

    if(t1.length < t2.length){
        return time1
    }
    else if(t2.length > t1.length){
        return time2
    }


    // DSQ
    // OFF

    float_time1 = parseFloat(time1[0])
    float_time2 = parseFloat(time2[0])

    if (time1.length > 1) {
        float_time1 += (parseFloat(time1[1]) * 2)
    }
    if (time2.length > 1) {
        float_time2 += (parseFloat(time2[1]) * 2)
    }

    if(float_time1 < float_time2) {
        return time1
    }
    else {
        return time2
    }
}
