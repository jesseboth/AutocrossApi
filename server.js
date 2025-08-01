const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8000;
const DEBUG = process.env.DEBUG || false;

function debug(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// Middleware for redirection and parsing JSON
app.use((req, res, next) => {
    next();
});
app.use(express.json());

// Store user drivers by machine ID
const userDrivers = {};

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

paxIndex = {}
fetchPaxIndex().then(classIndexDict => {
    paxIndex = classIndexDict;
});

// Schedule the task to run every Monday at 00:00
cron.schedule('0 0 * * 1', async function () {
    for (const key in regions) {
        if (regions[key].archive) {
            // fetchAndSaveWebpage(regions[key].url, key);
            archiveJson(key, regions[key]);
        }
    }

    fetchPaxIndex().then(classIndexDict => {
        paxIndex = classIndexDict;
    });
});

let event_stats = {};
// Track the most recent runs (driver name and number of runs)
let recent_runs = {};
// Track the last time axware or pronto was called for each region
let last_api_call = {};
// Store the last parameters used for each region
let last_params = {};
// Store the timers for each region
let region_timers = {};

const RESET_TIMEOUT = 3600000;
const TIMER_INTERVAL = 60000;
const DNFTimes = ["DNF", "OFF", "DSQ", "RR"]
const DNSTimes = ["DNS", "NO TIME"]

// Twitch chat integration
const TWITCH_CHANNEL = 'jesse___9';
let twitchChatMessages = [];
let twitchWs = null;

// Initialize Twitch chat connection
function initTwitchChat() {
    try {
        twitchWs = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
        
        twitchWs.on('open', () => {
            debug('Connected to Twitch IRC');
            // Send authentication for anonymous read-only access
            // PASS SCHMOOPIIE is Twitch's standard anonymous password
            // justinfan + random numbers creates an anonymous username
            twitchWs.send('PASS SCHMOOPIIE');
            twitchWs.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
            twitchWs.send(`JOIN #${TWITCH_CHANNEL}`);
        });
        
        twitchWs.on('message', (data) => {
            const message = data.toString();
            
            // Handle PING/PONG to keep connection alive
            if (message.startsWith('PING')) {
                twitchWs.send('PONG :tmi.twitch.tv');
                return;
            }
            
            // Parse chat messages
            const chatMatch = message.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
            if (chatMatch) {
                const [, username, chatMessage] = chatMatch;
                
                // Filter out commands (messages starting with !, /, etc.)
                if (!chatMessage.startsWith('!') && !chatMessage.startsWith('/') && !chatMessage.startsWith('.')) {
                    const newMessage = {
                        username: username,
                        message: chatMessage.trim(),
                        timestamp: Date.now()
                    };
                    
                    // Add to beginning of array (most recent first)
                    twitchChatMessages.unshift(newMessage);
                    
                    // Keep only the last 10 messages
                    if (twitchChatMessages.length > 10) {
                        twitchChatMessages = twitchChatMessages.slice(0, 10);
                    }
                    
                    debug(`Twitch chat: ${username}: ${chatMessage}`);
                }
            }
        });
        
        twitchWs.on('error', (error) => {
            console.error('Twitch WebSocket error:', error);
        });
        
        twitchWs.on('close', () => {
            debug('Twitch WebSocket closed, attempting to reconnect in 5 seconds...');
            setTimeout(initTwitchChat, 5000);
        });
        
    } catch (error) {
        console.error('Error initializing Twitch chat:', error);
        setTimeout(initTwitchChat, 5000);
    }
}

// Start Twitch chat connection
initTwitchChat();

reset_stats();

// Function to start a timer for a region
function startRegionTimer(region_name, region_dict, cclass, widget, user_driver, uuid, software) {
    // Store the parameters for this region
    last_params[region_name] = {
        region_dict,
        cclass,
        widget,
        user_driver,
        uuid,
        software
    };

    // Clear any existing timer for this region
    if (region_timers[region_name]) {
        clearInterval(region_timers[region_name].timer);
    }

    // Set the start time
    const startTime = Date.now();

    // Create a new timer
    const timer = setInterval(() => {
        const currentTime = Date.now();

        // If it's been more than an hour since the timer started, stop it
        if (currentTime - startTime > RESET_TIMEOUT) {
            clearInterval(timer);
            delete region_timers[region_name];
            return;
        }

        // Call the appropriate function with the stored parameters
        if (software === 'axware') {
            axware(region_name, region_dict, cclass, widget, user_driver, uuid)
                .catch(error => console.error(`Error refreshing axware data for ${region_name}:`, error));
        } else if (software === 'pronto') {
            pronto(region_name, region_dict, cclass, widget, user_driver, uuid)
                .catch(error => console.error(`Error refreshing pronto data for ${region_name}:`, error));
        }
    }, TIMER_INTERVAL);

    // Store the timer and start time
    region_timers[region_name] = {
        timer,
        startTime
    };
}

// Schedule a task to run every Sunday at 2:30 AM
cron.schedule('30 2 * * 0', () => {
    reset_stats();
});

app.use(express.static('public')); // Serve static files from the public directory

// Set up a route to serve the HTML file
app.get('/ui/:b/:c?/:d?', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results-index.html'));
});

app.get('/widgetui/:b/:c?/:d?', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'widget-index.html'));
});

app.get('/archive/ui/:b/:c?/:d?', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results-index.html'));
});

app.get('/fetch/:a/:b/:c?', async (req, res) => {
    res.sendFile(path.join(__dirname, req.params.a ? req.params.a : "", req.params.b ? req.params.b : "", req.params.c ? req.params.c : ""));
});

app.get('/debug', async (req, res) => {
    if (DEBUG) {
        res.sendFile(path.join(__dirname, 'public', 'debug.js'));
    }
    else {
        res.sendFile(path.join(__dirname, 'public', 'noDebug.js'));
    }
});

app.get('/paxIndex', async (req, res) => {
    res.json(paxIndex);
});

// Route to get recent Twitch chat messages
app.get('/twitch-chat', (req, res) => {
    // Filter out messages older than 1 hour (3600000 milliseconds)
    const oneHourAgo = Date.now() - 3600000;
    const recentMessages = twitchChatMessages.filter(message => message.timestamp > oneHourAgo);
    
    // Update the stored messages to only keep recent ones
    twitchChatMessages = recentMessages;
    
    res.json(twitchChatMessages);
});

// Route to set user driver name
app.post('/set-user-driver', (req, res) => {
    const { user_driver } = req.body;
    const machineId = req.headers['x-machine-id'] || req.headers['x-device-id'] || 'default';
    
    if (!user_driver) {
        return res.status(400).json({ success: false, message: 'Driver name is required' });
    }
    
    // Store the user driver name by machine ID
    // make sure user driver is valid and nothing bad
    if (user_driver.includes("/") || user_driver.includes("\\") || user_driver.includes(".") || user_driver.includes(",")) {
        return res.json({ success: false, message: 'Invalid Character' });
    }
    else if (user_driver.length > 30) {
        return res.json({ success: false, message: 'Driver name too long' });
    }
    else if (user_driver.length < 3) {
        return res.json({ success: false, message: 'Driver name too short' });
    }

    userDrivers[machineId] = user_driver;
    debug(`Set user driver for ${machineId}: ${user_driver}`);
    
    return res.json({ success: true, message: 'Driver name set successfully' });
});

// Route to get user driver name
app.get('/get-user-driver', (req, res) => {
    const machineId = req.headers['x-machine-id'] || req.headers['x-device-id'] || 'default';
    const driverName = userDrivers[machineId] || '';
    
    return res.json({ success: true, driver_name: driverName });
});


app.use('/archive', express.static("archive")); // Serve static files from the archive directory

// Route to list all archived files
app.get(['/archive', '/archive/ui' ], async (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="/menu-styles.css">
            <script src="/id.js"></script>
            <script src="/menu-script.js"></script>
        </head>
        <body>
            <div class="container">
                <h1>Archived Files</h1>
                <ul>
    `;

    try {

        let dirs = await fsp.readdir("archive");
        for (let dir of dirs) {
            // Create a container for each directory
            const dirId = `dir-${dir.replace(/\s+/g, '-')}`; // Unique ID for each directory

            // Add a clickable heading for each directory
            html += `
            <li>
                <a style="width: 65%" onclick="toggleVisibility('${dirId}')">${dir}</a>
            </li>
        `;

            // Add a hidden unordered list to group the files under this directory
            html += `<ul id="${dirId}" class="file-list" style="display: none;">`;

            let years = await fsp.readdir(`archive/${dir}`);
            for (let year of years) {
                const yearId = `${dirId}-${year.replace(/\s+/g, '-')}`;
                html += `
                    <li>
                        <a style="width: 58%" onclick="toggleVisibility('${yearId}')">${year}</a>
                    </li>
                `;

                html += `<ul id="${yearId}" class="file-list" style="display: none;">`;
                let files = await fsp.readdir(`archive/${dir}/${year}`);
                for (let file of files) {
                    if (file.includes(".json")) {
                        const fileName = file.split(".")[0];
                        html += `
                            <li>
                                <a href="/archive/ui/${year}/${fileName}">${fileName}</a>
                            </li>
                        `;
                    }
                }
                html += `</ul>`;
            }

            // Close the unordered list
            html += `</ul>`;
        }
        html += `
        <li>
            <a style="background-color: #ff0000; width: 65%;" href="/">Main Page</a>
        </li>
    `;
    } catch (err) {
        res.status(500).send(errorCode('Failed to read archive directory', false));
        return;
    }

    html += `
                </ul>
                
                <!-- Search functionality -->
                <div class="search-container">
                    <input type="text" id="searchInput" class="search-box" placeholder="Search for a driver name...">
                    <button id="searchButton" class="search-button">Search</button>
                </div>
                <div id="searchResults" class="search-results" style="display: none;">
                    <h2>Search Results</h2>
                    <ul id="resultsContainer"></ul>
                </div>
            </div>
            
            <script>
                document.getElementById('searchButton').addEventListener('click', function() {
                    performSearch();
                });
                
                document.getElementById('searchInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        performSearch();
                    }
                });
                
                function performSearch() {
                    const searchTerm = document.getElementById('searchInput').value.trim();
                    if (searchTerm === '') return;
                    
                    const resultsContainer = document.getElementById('resultsContainer');
                    resultsContainer.innerHTML = '<li>Searching...</li>';
                    document.getElementById('searchResults').style.display = 'block';
                    
                    fetch('/archive/search?name=' + encodeURIComponent(searchTerm))
                        .then(response => response.json())
                        .then(data => {
                            resultsContainer.innerHTML = '';
                            
                            if (data.length === 0) {
                                resultsContainer.innerHTML = '<li>No results found</li>';
                                return;
                            }
                            
                            data.forEach(result => {
                                const li = document.createElement('li');
                                const a = document.createElement('a');
                                a.href = result.url + "?highlight=" + encodeURIComponent(searchTerm);
                                a.textContent = \`\${result.region} - \${result.event} - \${result.class} - \${result.position}. \${result.driver}\`;
                                li.appendChild(a);
                                resultsContainer.appendChild(li);
                            });
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            resultsContainer.innerHTML = '<li>Error searching. Please try again.</li>';
                        });
                }
            </script>
        </body>
        </html>
    `;

    res.send(html);
});

// Route to search through archive files
app.get('/archive/search', async (req, res) => {
    const searchName = req.query.name;
    if (!searchName) {
        return res.status(400).json({ error: 'Search name is required' });
    }
    
    const searchResults = [];
    
    try {
        // Get all regions
        const regions = await fsp.readdir("archive");
        
        // Loop through each region
        for (const region of regions) {
            // Get all years for this region
            const years = await fsp.readdir(`archive/${region}`);
            
            // Loop through each year
            for (const year of years) {
                // Get all files for this year
                const files = await fsp.readdir(`archive/${region}/${year}`);
                
                // Loop through each file
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = `archive/${region}/${year}/${file}`;
                        const eventName = file.split('.')[0];
                        
                        // Read and parse the JSON file
                        const fileData = getJsonData(filePath);
                        
                        // Search through all classes in the file
                        for (const className in fileData) {
                            const classData = fileData[className];
                            
                            // Handle both array and object formats
                            const entries = Array.isArray(classData) ? classData : Object.values(classData);
                            
                            // Search for the name in each entry
                            for (const entry of entries) {
                                if (entry.driver && entry.driver.toLowerCase().includes(searchName.toLowerCase())) {
                                    searchResults.push({
                                        region: region,
                                        event: eventName,
                                        class: className,
                                        position: entry.position || '',
                                        driver: entry.driver,
                                        url: `/archive/ui/${year}/${eventName}`
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        res.json(searchResults);
    } catch (error) {
        console.error('Error searching archive:', error);
        res.status(500).json({ error: 'Error searching archive' });
    }
});


app.get(['/', '/ui'], async (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <link rel="manifest" href="/fetch/data/manifest.json">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="/menu-styles.css">
            <script src="/id.js"></script>
            <script src="/menu-script.js"></script>
        </head>
        <body>
            <div class="container">
                <h1>Autocross</h1>
                <ul>
    `;

    // Add TOUR and PRO regions with event dropdowns, and regular regions
    for (const region of Object.keys(regions)) {
        if (["TOUR", "PRO"].includes(region)) {
            try {
                // Fetch events for this region
                let redirect = await getRedirectURL(regions[region].url);
                let events = [];
                
                if (redirect.includes("TwoEvents")) {
                    events = await fetchEventCodes(redirect);
                } else {
                    // Parse out the event code
                    const code = redirect.split("/");
                    events = [code[3]];
                }
                
                // If there's only one event, redirect directly to it
                if (events.length === 1) {
                    html += `
                        <li>
                            <a href="/ui/${region}/${events[0]}">${region}</a>
                            <a href="${regions[region].url}">${regions[region].software}</a>
                        </li>
                    `;
                } else {
                    // Multiple events - show dropdown
                    const regionId = `region-${region.toLowerCase()}`;
                    
                    // Add the region with a click handler to toggle the dropdown
                    html += `
                        <li>
                            <a onclick="toggleVisibility('${regionId}')">${region}</a>
                            <a href="${regions[region].url}">${regions[region].software}</a>
                        </li>
                    `;
                    
                    // Add a hidden list for the events
                    html += `<ul id="${regionId}" class="file-list" style="display: none;">`;
                    
                    // Add each event as a link
                    for (const event of events) {
                        html += `
                            <li>
                                <a href="/ui/${region}/${event}">${event}</a>
                            </li>
                        `;
                    }
                    
                    // Close the events list
                    html += `</ul>`;
                }
            } catch (error) {
                console.error(`Error fetching events for ${region}:`, error);
                html += `
                    <li>
                        <a href="/ui/${region}">Error Event</a>
                        <a href="${regions[region].url}">${regions[region].software}</a>
                    </li>
                `;
            }
        } else {
            // Regular region without dropdown
            html += `
                <li>
                    <a href="/ui/${region}">${region}</a>
                    <a href="${regions[region].url}">${regions[region].software}</a>
                </li>
            `;
        }
    }

    html += `
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

app.get(['/', '/widgetui'], async (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <link rel="manifest" href="/fetch/data/manifest.json">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="/menu-styles.css">
            <script src="/id.js"></script>
            <script src="/menu-script.js"></script>
        </head>
        <body class="dark">
            <div class="container">
                <h1 class="dark">Autocross</h1>
                <ul>
    `;

    // Add TOUR and PRO regions with event dropdowns
    for (const region of Object.keys(regions)) {
        if (["TOUR", "PRO"].includes(region)) {
            // Create a unique ID for this region's dropdown
            const regionId = `region-${region.toLowerCase()}`;
            
            // Add the region with a click handler to toggle the dropdown
            html += `
                <li>
                    <a onclick="toggleVisibility('${regionId}')">${region}</a>
                </li>
            `;
            
            // Add a hidden list for the events
            html += `<ul id="${regionId}" class="file-list" style="display: none;">`;
            
            try {
                // Fetch events for this region
                let redirect = await getRedirectURL(regions[region].url);
                let events = [];
                
                if (redirect.includes("TwoEvents")) {
                    events = await fetchEventCodes(redirect);
                } else {
                    // Parse out the event code
                    const code = redirect.split("/");
                    events = [code[3]];
                }
                
                // Add each event as a link
                for (const event of events) {
                    html += `
                        <li>
                            <a href="/widgetui/${region}/${event}/Pax">${event}</a>
                        </li>
                    `;
                }
            } catch (error) {
                console.error(`Error fetching events for ${region}:`, error);
                html += `
                    <li>
                        <a href="/widgetui/${region}/pax">Error Event</a>
                    </li>
                `;
            }
            
            // Close the events list
            html += `</ul>`;
        } else {
            // Regular region without dropdown
            html += `
                <li>
                    <a href="/widgetui/${region}/Pax">${region}</a>
                </li>
            `;
        }
    }

    html += `
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
app.get('/archive/:year?/:a?/:b?/:c?', async (req, res) => {
    getEvents = false;
    event_key = ""
    ppax = false;
    rraw = false;
    year = req.params.year;
    getClasses = false;
    cclass = undefined;

    try {
        switch (req.params.a.toLowerCase()) {
            case "events":
                getEvents = true;
                break;
            case "widget":
                res.status(500).send(errorCode("Widget not available for archived data", true));
                return;
            default:
                event_key = req.params.a.toUpperCase();
                break;
        }

        if (req.params.b && !getEvents) {
            switch (req.params.b.toLowerCase()) {
                case "classes":
                    getClasses = true;
                    break;
                case "pax":
                    ppax = true;
                    break;
                case "raw":
                    rraw = true;
                    break;
                default:
                    if (event_key == "") {
                        event_key = req.params.b.toUpperCase();
                    }
                    else {
                        cclass = req.params.b.toUpperCase();
                    }
                    break;
            }
        }

        if (req.params.c && !getEvents) {
            switch (req.params.c.toLowerCase()) {
                case "pax":
                    ppax = true;
                    break;
                case "raw":
                    rraw = true;
                    break;
                default:
                    cclass = req.params.c.toUpperCase();
                    break;
            }
        }

        let dir = "archive/" + event_key.split("_")[0] + "/" + year;
        if (getEvents) {
            arr = []
            let dirs = await fsp.readdir("archive");
            for(let dir of dirs){
                let files = await fsp.readdir(`archive/${dir}`);
                for (let file of files) {
                    file = file.split(".");
                    if (file[1] == "json") {
                        arr.push(file[0]);
                    }
                }
            }
            res.json(arr);
            return;
        }
        else if (getClasses) {
            res.json(Object.keys(getJsonData(`${dir}/${event_key}.json`)));
            return;
        }

        if (ppax) {
            res.json(pax(getJsonData(`${dir}/${event_key}.json`)));
        }
        else if (rraw) {
            res.json(raw(getJsonData(`${dir}/${event_key}.json`)));
        }
        else if (cclass == undefined) {
            res.json((getJsonData(`${dir}/${event_key}.json`)));
        }
        else {
            res.json((getJsonData(`${dir}/${event_key}.json`))[cclass]);
        }

    } catch (err) {
        console.error(err);
        res.status(500).send(errorCode(err, false));
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
    const uuid = req.headers['x-device-id'] || req.headers['x-machine-id'];
    const userDriver = (userDrivers[uuid]|| req.headers['user'] || "").toLowerCase();

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
                if (regions[region] && regions[region].tour) {
                    tour = true;
                    tourType = region;
                }
                break;
        }

        if (req.params.b != undefined) {
            region = req.params.b.toUpperCase();
            if (regions[region] && regions[region].tour) {
                tour = true;
                tourType = region;
            }
        }

        if ((widget && tour) || (ui && tour)) {
            region = req.params.c != undefined ? req.params.c.toUpperCase() : undefined;
            cclass = req.params.d != undefined ? req.params.d.toUpperCase() : undefined;
            if(region == "CLASSES"){
                cclass = region;
                region = undefined;
            }
            else if(region == "EVENTS"){
                redirect = await getRedirectURL(regions["TOUR"].url);
                if(redirect.includes("TwoEvents")){
                    res.json(await fetchEventCodes(redirect));
                    return;
                } else {
                    // parse out the event code
                    code = redirect.split("/")
                    res.json([code[3]])
                    return
                }
            }
        }
        else if(tour){
            region = req.params.b != undefined ? req.params.b.toUpperCase() : undefined;
            cclass = req.params.c != undefined ? req.params.c.toUpperCase() : undefined;
            if(region == "CLASSES"){
                cclass = region;
                region = undefined;
            }
            else if(region == "EVENTS"){
                redirect = await getRedirectURL(regions["TOUR"].url);
                if(redirect.includes("TwoEvents")){
                    res.json(await fetchEventCodes(redirect));
                    return;
                } else {
                    // parse out the event code
                    code = redirect.split("/")
                    res.json([code[3]])
                    return
                }
            }
        }
        else if (widget || ui) {
            region = req.params.b != undefined ? req.params.b.toUpperCase() : undefined;
            cclass = req.params.c != undefined ? req.params.c.toUpperCase() : undefined;
        }
        else {
            region = req.params.a != undefined ? req.params.a.toUpperCase() : undefined;
            cclass = req.params.b != undefined ? req.params.b.toUpperCase() : undefined;
        }

        if (tour &&  !region && cclass == "CLASSES") {
            const { _url, _region } = await getRedirect(regions[tourType].url, undefined);
            region = _region;
        }
        else if(tour && (!region || region.length < 5)){
            cclass = region;
            const { _url, _region } = await getRedirect(regions[tourType].url, undefined);
            region = _region;
        }

        if (!tour && (ui && !region)) {
            res.redirect('/');
            return;
        }

        if(region == "REGIONS"){
            res.json(Object.keys(regions));
            return;
        }

        // Handle request for recent runs
        if(req.params.b && req.params.b.toLowerCase() === "recent"){
            if (recent_runs[region]) {
                res.json(recent_runs[region]);
            } else {
                res.json([]);
            }
            return;
        } else if (tour && req.params.c && req.params.c.toLowerCase() === "recent") {
            if (recent_runs[region]) {
                res.json(recent_runs[region]);
            } else {
                res.json([]);
            }
            return;
        }

        if (!tour && !regions.hasOwnProperty(region)) {
            res.status(500).send(errorCode("Region not found", widget));
            return;
        }

        let region_dict = {}
        if (tour) {
            region_dict = { ...regions[tourType] };
            if (region != undefined) {
                region_dict.url = region_dict.url + region + "/";
            }
            else {
                region_dict.url = region_dict.url;
            }
        }
        else {
            region_dict = regions[region];
        }

        ppax = cclass != undefined ? true : false;
        toggle = cclass != undefined && cclass != "PAX" ? false : true;
        if (region_dict.software == "axware") {
            data = await axware(region, region_dict, cclass, widget, userDriver, uuid)

            if(widget && cclass != "CLASSES"){
                incUpdates();
                data["updates"] = updates;
            }

            res.json(data);
        }
        else if (region_dict.software == "pronto") {
            data = await pronto(region, region_dict, cclass, widget, userDriver, uuid)
            if(widget && cclass != "CLASSES"){
                incUpdates();
                data["updates"] = updates;
            }
            res.json(data);
        }
        else {
            res.status(500).send(errorCode("Timing Software not defined", widget));
            return;
        }
    } catch (error) {
        console.error(error);
        res.status(500).json(errorCode(error, widget, "error"));
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

async function axware(region_name, region, cclass, widget = false, user_driver = undefined, uuid = undefined) {
    // Update the last API call time
    const currentTime = Date.now();
    last_api_call[region_name] = currentTime;

    // Reset recent runs if this is a new session
    if (!recent_runs[region_name]) {
        recent_runs[region_name] = [];
    }

    // Start or reset the timer for this region
    startRegionTimer(region_name, region, cclass, widget, user_driver, uuid, 'axware');

    const url = region.url;

    let stats = {}
    if(widget){
        if(uuid == undefined){
            uuid = "default";
        }

        if (!event_stats.hasOwnProperty(uuid+region_name+cclass)) {
            event_stats[uuid+region_name+cclass] = {};
        }

        stats = event_stats[uuid+region_name+cclass];
    }

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
                if (classElem.length > 0) {
                    currentClass = $(classElem).text().trim().split(" ")[0].toUpperCase();
                    results[currentClass] = new_results(widget);
                }
                if (currentClass != "" && columns.length > 1) {
                    let format_offset = 0;
                    for (col = 0; col < columns.length; col++) {
                        element = format[row][col - format_offset];
                        if (element == null || element == undefined) {
                            ;
                        }
                        else if (element == "t") {
                            simpletime = simplifyTime($(columns[col]).text().trim())
                            if (simpletime != ""){
                                temp.times.push(simpletime);
                            }
                        }
                        else if (element.startsWith("t-")) {
                            const before = parseInt(element.split("-")[1]) || 0;
                            for (col; col < columns.length - before; col++, format_offset++) {
                                simpletime = simplifyTime($(columns[col]).text().trim())
                                if (simpletime != ""){
                                    temp.times.push(simpletime);
                                }
                                else {
                                    break;
                                }
                            }

                            for (col; col < columns.length; col++, format_offset++) {
                                if ($(columns[col+1]).text().trim() != "") {
                                    break;
                                }
                            }

                        }
                        else if(element == "-"){
                            // loop columns until we find a non-empty value
                            for (col; col < columns.length; col++, format_offset++) {
                                if ($(columns[col+1]).text().trim() != "") {
                                    break;
                                }
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
                if (temp.index.startsWith(currentClass) && temp.index != currentClass && temp.index.length > 2) {
                    temp.index = temp.index.slice(currentClass.length).trim();
                }

                if (!temp.offset || temp.offset == "" || temp.offset.startsWith("[-]")) {
                    temp.offset = "-"
                }
                temp.offset = temp.offset.replace(/(\+)/g, '');

                temp.pax = simplifyTime(temp.pax);

                temp.position = temp.position.split("T")[0];
                intPosition = parseInt(temp.position)

                runs = temp.times.length;
                bestIndex = findBestTimeIndex(temp.times)
                bestRawTime = convertToSeconds(temp.times[bestIndex]);
                temp.raw = String(bestRawTime.toFixed(3));
                if(bestIndex > 0 && bestRawTime == convertToSeconds(temp.pax) && paxIndex[temp.index] != undefined){
                    temp.pax = String((bestRawTime * paxIndex[temp.index]).toFixed(3));
                }

                temp.rawidx = bestIndex;

                if (!results.hasOwnProperty(temp.class)) {
                    ;
                }
                else if (!widget || intPosition <= 10) {
                    results[temp.class][temp.position] = { ...temp }
                }
                else if (temp.driver.toLowerCase() == user_driver) {
                    // put me in 10th if I am outisde top 10
                    temp.offset = temp.pax - results[temp.class]["9"].pax;
                    results[temp.class]["10"] = { ...temp }
                }
                if (widget) {
                    if (stats[temp.driver] != undefined && stats[temp.driver].runs < runs) {
                        // Get the most recent time (last time in the array)
                        const lastTime = temp.times.length > 0 ? temp.times[temp.times.length - 1] : '';
                        updateRecentRuns(region_name, temp.driver, temp.number, runs, lastTime);
                    }

                    // Update recent runs tracking
                    stats[temp.driver] = { "position": intPosition, "runs": runs }
                }

                temp = {}
            }
            else {
                valid = true;
            }

        };

        if (cclass != undefined) {
            if (cclass == "PAX") {
                return pax(results, widget, stats, user_driver);
            }
            else if (cclass == "RAW") {
                if(widget){
                    return pax(results, widget, stats, user_driver);
                }
                else {
                    return raw(results, widget);
                }
            }
            else if (widget && results.hasOwnProperty(cclass)) {
                return results[cclass];
            }
            else if (results.hasOwnProperty(cclass)) {
                return Object.values(results[cclass]);
            }
            else if (cclass != "CLASSES") {
                return errorCode("Class not found", widget);
            }
            else if (cclass == "CLASSES") {
                ret = []
                if(widget){
                    ret.push("PAX");
                    ret.push("RAW");
                }
                for (const key in results) {
                    ret.push(key);
                }
                return ret
            }
        }
        else {
            for (const key in results) {
                results[key] = Object.values(results[key]);
            }
            return results
        }
    } catch (error) {
        // Log concise error info instead of full stack trace
        const errorMsg = error.response 
            ? `HTTP ${error.response.status}: ${error.config?.url || 'Unknown URL'}`
            : `${error.code || 'Error'}: ${error.message || 'Unknown error'}`;
        console.error(`Axware error for ${region_name}: ${errorMsg}`);
        return errorCode(error, widget, "error");
    }
}

async function pronto(region_name, region, cclass, widget = false, user_driver = undefined, uuid = undefined) {
    // Update the last API call time
    const currentTime = Date.now();
    last_api_call[region_name] = currentTime;

    // Reset recent runs if this is a new session
    if (!recent_runs[region_name]) {
        recent_runs[region_name] = [];
    }

    // For Pronto systems, try to fetch recent runs from Run Ticker
    try {
        const runTickerData = await fetchProntoRunTicker(region.url);
        if (runTickerData.length > 0) {
            // Reverse the data since Run Ticker shows most recent first, but we want to process chronologically
            const reversedData = runTickerData.reverse();
            
            // Update recent runs using the existing updateRecentRuns function
            for (const run of reversedData) {
                updateRecentRuns(region_name, run.driver, run.number, run.runs, run.time);
            }
            debug(`Updated recent runs for ${region_name} with ${runTickerData.length} entries from Run Ticker`);
        }
    } catch (error) {
        debug(`Failed to fetch Run Ticker for ${region_name}:`, error.message);
        // Continue with normal processing if Run Ticker fails
    }

    // Start or reset the timer for this region
    startRegionTimer(region_name, region, cclass, widget, user_driver, uuid, 'pronto');

    let classes = [cclass];
    let backup = [];
    let doPax = false;
    let doRaw = false;

    if (cclass == undefined) {
        if (region_name) {
            class_offset = region_name.includes("NATS") ? region.data.nats_offset : region.data.classes_offset
        }
        classes = await getProntoClasses(region.url, class_offset);
    }
    else {
        if (region_name) {
            class_offset = region_name.includes("NATS") ? region.data.nats_offset : region.data.classes_offset
        }
        backup = await getProntoClasses(region.url, class_offset);
    }

    if (cclass == "CLASSES") {
        return await getProntoClasses(region.url, class_offset, true);
    }

    let stats = {}
    if(widget){
        if(uuid == undefined){
            uuid = "default";
        }

        if (!event_stats.hasOwnProperty(uuid+region_name+cclass)) {
            event_stats[uuid+region_name+cclass] = {};
        }

        stats = event_stats[uuid+region_name+cclass];
    }

    try {
        // loop through all classes
        let results = {};
        if(region.tour && classes.length > 1){
            return errorCode("Please select a specific class", widget);
        }

        carIdx = [0, region.format[0].indexOf("car")];

        for (let idx = 0; idx < classes.length; idx++) {
            let url = "";
            let currentClass = classes[idx];
            debug("Current Class: ", currentClass)

            if (currentClass == "PAX") {
                if (await checkUrlExists(region.url + "PaxIndexOverall.html")) {
                    url = region.url + "PaxIndexOverall.html";
                }
                else if (await checkUrlExists(region.url + "PaxIndexDay1.html")) {
                    url = region.url + "PaxIndexDay1.html";
                }
                else {
                    doPax = true;
                    classes = backup;
                    currentClass = classes[idx];
                    url = region.url + currentClass + ".php";
                    cclass = undefined;
                }
            }
            else if (currentClass == "RAW") {
                if (checkUrlExists(region.url + "RawOverall.html")) {
                    url = region.url + "RawOverall.html";
                }
                else if (checkUrlExists(region.url + "RawDay1.html")) {
                    url = region.url + "RawDay1.html";
                }
                else {
                    doRaw = true;
                    classes = backup;
                    currentClass = classes[idx];
                    url = region.url + currentClass + ".php";
                    cclass = undefined;
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

            const format = cclass == "PAX" || cclass == "RAW" ? region.pax : region.format;

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
                    if (index == start_index) {
                        for (test = 0; test < 5; test++) {
                            let columns = $(parse[index]).find('td');
                            test_value = $(columns[0]).text().trim();
                            if (test_value == "T" || test_value == "1") {
                                break;
                            }
                            index++;
                        }
                    }
                    let columns = $(parse[index]).find('td');

                    let execute = true;
                    if (row != carIdx[0]) {
                        // Check if the row contains a car - if it does there are not yet times listed
                        execute = !isCar($(columns[carIdx[1]]).text().trim());
                    }

                    if (columns.length > 1 && execute) {
                        for (col = 0; col < columns.length; col++) {
                            element = format[row][col];
                            if (element == null) {
                                ;
                            }
                            else if (element == "t") {
                                let txt = $(columns[col]).text().trim();
                                const html = $(columns[col]).html().trim();
                                if (html.startsWith("<s>")) {
                                    txt = txt + "+OFF";
                                }
                                if (html.startsWith("<b>")) {
                                    bestIndices.push(temp.times.length);
                                }
                                temp.times.push(simplifyTime(txt.replace(/\(/g, '+').replace(/\)/g, '')));
                            }
                            else {
                                temp[element] = $(columns[col]).text().trim() == "" ? "-" : $(columns[col]).text().trim();
                            }
                        }
                        
                        // Check if we need to advance to the next row
                        if (row + 1 < format.length) {
                            // Check if the next row exists and belongs to this driver
                            let nextRowIndex = index + 1;
                            if (nextRowIndex < parse.length) {
                                let nextColumns = $(parse[nextRowIndex]).find('td');
                                
                                // If next row has car info in the car column, it's a new driver
                                // If it has times or is mostly empty, it belongs to current driver
                                let nextRowHasCar = nextColumns.length > carIdx[1] && 
                                                   isCar($(nextColumns[carIdx[1]]).text().trim());
                                
                                // Also check if next row looks like a driver info row (has position number)
                                let nextRowHasPosition = nextColumns.length > 1 && 
                                                        !isNaN(parseInt($(nextColumns[1]).text().trim()));
                                
                                if (!nextRowHasCar && !nextRowHasPosition) {
                                    // Next row belongs to current driver, advance
                                    index++;
                                } else {
                                    // Next row is a new driver, break out of format loop
                                    break;
                                }
                            } else {
                                // No next row exists, break out of format loop
                                break;
                            }
                        }
                    }
                    else if(columns.length <= 1) {
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
                    if (temp.index == undefined || temp.index.trim() == "-") {
                        temp.index = currentClass.toUpperCase();
                    } else {
                        temp.index = temp.index.toUpperCase();
                    }
                    if (temp.index.startsWith(currentClass) && temp.index != currentClass) {
                        temp.index = temp.index.slice(currentClass.length).trim();
                    }
                    if (temp.offset == undefined || temp.offset == "") { temp.offset = "-" }
                    temp.offset = temp.offset.replace(/\(/g, '').replace(/\)/g, '');

                    // Handle missing pax time
                    if (temp.pax == undefined || temp.pax == "") {
                        temp.pax = "No Time";
                    } else {
                        temp.pax = simplifyTime(temp.pax);
                    }

                    intPosition = parseInt(temp.position)

                    runs = temp.times.length;
                    
                    // If no times were recorded, add a default "No Time" entry
                    if (runs == 0) {
                        temp.times.push("No Time");
                        runs = 1;
                    }
                    // if(widget){
                    //     for (i = 0; i < bestIndices.length; i++) {
                    //         temp.times = bestTime(temp.times, bestIndices[i], widget);
                    //     }
                    // }

                    if(temp.index[temp.index.length - 1] == "L"){
                        temp.index = temp.index.slice(0, -1);
                    }

                    if((doPax || doRaw) && region.tour) {
                        const midpoint = Math.ceil(temp.times.length / 2);

                        const day1 = temp.times.slice(0, midpoint);
                        const day2 = temp.times.slice(midpoint);

                        bestIndex = findBestTimeIndex(day1)
                        bestIndex2 = findBestTimeIndex(day2)

                        bestRawTime = convertToSeconds(day1[bestIndex], true) + convertToSeconds(day2[bestIndex2], true);
                        temp.raw = String(bestRawTime.toFixed(3));
                        if(doRaw){
                            temp.pax = String(bestRawTime.toFixed(3));
                        }
                        else if (doPax) {
                            temp.pax = String((bestRawTime * (paxIndex[temp.index] ? paxIndex[temp.index] : 1)).toFixed(3));
                        }
                    }
                    else {
                        if(region.tour && region_name.includes("NATS") || region_name.endsWith("NT")){
                            const midpoint = 3;
                            const day1 = temp.times.slice(0, midpoint);
                            const day2 = temp.times.slice(midpoint);
                            bestIndex = findBestTimeIndex(day1)
                            bestIndex2 = findBestTimeIndex(day2)

                            if(bestIndex == -1){
                                bestRawTime = Infinity
                            } else if(bestIndex2 == -1){
                                bestRawTime = convertToSeconds(day1[bestIndex], true)
                            }
                            else {
                                bestRawTime = convertToSeconds(day1[bestIndex], true) + convertToSeconds(day2[bestIndex2], true);
                            }
                            temp.raw = String(bestRawTime.toFixed(3));
                        }
                        else {
                            bestIndex = findBestTimeIndex(temp.times)
                            bestRawTime = convertToSeconds(temp.times[bestIndex]);
                            
                            if (bestRawTime == Infinity) {
                                temp.raw = "No Time";
                            } else {
                                temp.raw = String(bestRawTime.toFixed(3));
                            }
                        }

                        if(widget && cclass == "RAW"){
                            if (bestRawTime == Infinity) {
                                temp.pax = "No Time";
                            } else {
                                temp.pax = String(bestRawTime.toFixed(3));
                            }
                        }
                        else if(bestIndex > -1 && paxIndex[temp.index] != undefined && bestRawTime != Infinity){
                            temp.pax = String((bestRawTime * paxIndex[temp.class]).toFixed(3));
                        }
                        else if (bestRawTime == Infinity) {
                            temp.pax = "No Time";
                        }
                    }

                    if (!results.hasOwnProperty(temp.class)) {
                        ;
                    }
                    else if (!widget || intPosition <= 10) {
                        results[temp.class][temp.position] = { ...temp }
                        results[temp.class][temp.position].class = store;
                    }
                    else if (temp.driver.toLowerCase() == user_driver) {
                        // put me in 10th if I am outisde top 10
                        temp.offset = temp.pax - results[temp.class]["9"].pax;
                        results[temp.class]["10"] = { ...temp }
                        results[temp.class]["10"].class = store;
                    }
                    if (widget) {
                        // Update recent runs tracking (Run Ticker now handles recent runs data)
                        stats[temp.driver] = { "position": intPosition, "runs": runs }
                    }
                    temp = {}
                }
                else {
                    valid = true;
                }

            };
        }
        if (cclass != undefined) {
            if (cclass == "PAX") {
                return widget ? results["PAX"] : flatten(results);
            }
            if (cclass == "RAW") {
                return widget ? results["RAW"] : flatten(results);
            }
            else if (results.hasOwnProperty(cclass)) {
                return widget ? results[cclass] : flatten(results);
            }
            else {
                return new_results(widget)
            }
        }
        else {
            for (const key in results) {
                results[key] = Object.values(results[key]);
            }

            if (doPax || doRaw) {
                return pax(results, widget, stats, user_driver);
            }

            return results
        }
    } catch (error) {
        // Log concise error info instead of full stack trace
        const errorMsg = error.response 
            ? `HTTP ${error.response.status}: ${error.config?.url || 'Unknown URL'}`
            : `${error.code || 'Error'}: ${error.message || 'Unknown error'}`;
        console.error(`Pronto error for ${region_name}: ${errorMsg}`);
        return errorCode(error, widget, "error");
    }
}

function new_results(widget) {

    if (!widget) {
        return {}
    }

    return {
        "1":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "1",  "raw": "" },
        "2":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "2",  "raw": "" },
        "3":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "3",  "raw": "" },
        "4":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "4",  "raw": "" },
        "5":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "5",  "raw": "" },
        "6":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "6",  "raw": "" },
        "7":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "7",  "raw": "" },
        "8":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "8",  "raw": "" },
        "9":  { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "9",  "raw": "" },
        "10": { "driver": " ", "car": " ", "index": " ", "number": " ", "pax": "", "offset": " ", "times": " ", "position": "10", "raw": "" },
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

async function archiveJson(name, region) {
    try {
        const response = await axios.get(region.url);
        const htmlContent = response.data;

        date = "fixme-" + getYesterdate();
        const regex = /Live Results - Generated:\s*\w+ (\d{2}-\d{2}-\d{4}) \d{2}:\d{2}:\d{2}/;
        match = htmlContent.match(regex);
        let yeardir = ""

        if (match) {
            const [month, day, year] = match[1].split('-');
            const formattedYear = year.slice(2);
            date = `${month}-${day}-${formattedYear}`;
            yeardir = formattedYear;
        }
        else if (region.tour) {
            const regex = /Sportity Event Password:\s*([A-Za-z0-9]+)/;
            match = htmlContent.match(regex);
            date = match ? match[1] : date;
            year = date.slice(0, 2);
            yeardir = year;

        }

        const filepath = `archive/${name}/${yeardir}/`;
        fs.mkdir(filepath, { recursive: true }, (err) => {
            if (err) {
                console.error('Error creating directories:', err);
            }
        });

        const filename = filepath + `${name}_${date}.json`;
        let content = {};
        if (region.software == "axware") {
            content = await axware(name, region, undefined, false);
        }
        else if (region.software == "pronto") {
            content = await pronto(name, region, undefined, false);
        }
        else {
            console.error("Software not defined: ", region.software, "Can not archive");
            return;
        }

        // Write the HTML content to a file
        if (Object.keys(content).length > 0) {
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
    if (_string == undefined) {
        return "999.99";
    }

    string = _string.toUpperCase()

    split = string.split("+")
    if (split.length > 1 && split[0] == split[1]) {
        return ""
    }

    for(let i = 0; i < DNFTimes.length; i++){
        if (string.includes(DNFTimes[i])) {
            return DNFTimes[i]
        }
    }

    for(let i = 0; i < DNSTimes.length; i++){
        if (string.includes(DNSTimes[i])) {
            return DNSTimes[i]
        }
    }

    return string
}

function bestTime(times, bestIdx, widget) {
    if (!widget) {
        return times;
    }

    split = times[bestIdx].split("+")
    if (split.length > 1) {
        split[1] = split[1] + "[/c]"
    }

    split[0] = "[b][c=#ff54ccff]" + split[0] + "[/c][/b]"
    times[bestIdx] = split.join("[c=#ffde6868]+")

    return times;
}

function convertToSeconds(time, tour = false) {
    if (time == undefined || time == "" || time.includes('DNF') || time.includes('OFF') || time.includes('DSQ') || time.includes("RRN") || time == "NO TIME" || time == "No Time") {
        return Infinity;
    }

    const parts = time.split('+');
    const baseTime = parseFloat(parts[0]);

    if (isNaN(baseTime)) {
        return Infinity;
    }

    if (parts.length > 1) {
        if (parts[1] === 'OFF' || parts[1] === 'DSQ' || parts[1] === 'DNF') {
            return Infinity;
        }
        if(tour){
            return baseTime
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
    event_stats = {};
    recent_runs = {};
    last_api_call = {};
    last_params = {};

    // Clear all active timers
    for (const region in region_timers) {
        if (region_timers[region] && region_timers[region].timer) {
            clearInterval(region_timers[region].timer);
        }
    }
    region_timers = {};
}

// Function to update the most recent runs
function updateRecentRuns(region, driverName, driverNumber, runCount, lastTime) {
    if (!recent_runs[region]) {
        recent_runs[region] = [];
    }

    // Add the driver to the beginning of the array
    recent_runs[region].unshift({
        driver: driverName,
        number: driverNumber || '',
        runs: runCount,
        time: lastTime || '' // Store the most recent time
    });

    // Keep only the 6 most recent runs
    if (recent_runs[region].length > 6) {
        recent_runs[region] = recent_runs[region].slice(0, 6);
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

function flatten(results) {
    const flattenedData = [];
    Object.keys(results).forEach(cclass => {
        Object.keys(results[cclass]).forEach(entryId => {
            const entryData = results[cclass][entryId];
            if (typeof entryData === 'object' && entryData !== null && entryData.driver.trim() !== "") {
                flattenedData.push(entryData);
            }
        });
    });

    return flattenedData;
}

function pax(results, widget, stats, user_driver = undefined) {
    ret = {}

    const flattenedData = flatten(results)
    paxSort(flattenedData);

    for (i = 0; i < flattenedData.length; i++) {
        flattenedData[i].position = (i + 1).toString();
        if (i > 0) {
            const paxA = parseFloat(flattenedData[i - 1].pax);
            const paxB = parseFloat(flattenedData[i].pax);

            if (isNaN(paxB)) {
                flattenedData[i].offset = "-";
            }
            else {
                flattenedData[i].offset = ((paxB - paxA).toFixed(3)).toString();
            }
        }

        if (widget) {
            const runs = flattenedData[i].times.length;
            stats[flattenedData[i].driver] = { "position": i + 1, "runs": runs }

            if (i < 10) {
                ret[(i + 1).toString()] = flattenedData[i];
            }
            else if (flattenedData[i].driver.toLowerCase() == user_driver) {
                flattenedData[i].offset = (flattenedData[i].pax - ret["9"].pax).toFixed(3);
                ret["10"] = flattenedData[i];
            }

            if(i >= 25-1){
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

        // check if stringA is in DNFtimes array
        if (DNFTimes.includes(stringA)) {
            stringA = "DNF";
        }
        if (DNFTimes.includes(stringB)) {
            stringB = "DNF";
        }

        if (DNSTimes.includes(stringA)) {
            stringA = "DNS";
        }
        if (DNSTimes.includes(stringB)) {
            stringB = "DNS";
        }

        if (stringA == "DNS" && stringB == "DNS") {
            return 0;
        }
        else if (stringA == "DNS") {
            return 1;
        }
        else if (stringB == "DNS") {
            return -1;
        }
        else

            if (stringA == "DNF" && stringB == "DNF") {
                return 0;
            }
            else if (stringA == "DNF") {
                return 1;
            }
            else if (stringB == "DNF") {
                return -1;
            }
        const paxA = parseFloat(a.pax);
        const paxB = parseFloat(b.pax);

        return paxA - paxB; // Both are numeric, sort in ascending order
    });
}

function raw(results, widget, stats, user_driver = undefined) {
    ret = {}

    const flattenedData = flatten(results)
    rawSort(flattenedData);

    for (i = 0; i < flattenedData.length; i++) {
        flattenedData[i].position = (i + 1).toString();
        if (i > 0) {
            const paxA = parseFloat(flattenedData[i - 1].pax);
            const paxB = parseFloat(flattenedData[i].pax);

            if (isNaN(paxB)) {
                flattenedData[i].offset = "-";
            }
            else {
                flattenedData[i].offset = ((paxB - paxA).toFixed(3)).toString();
            }
        }

        if (widget) {
            const runs = flattenedData[i].times.split("   ").filter(item => item.trim() !== "").length;
            flattenedData[i].color = getColor(i+1, stats, flattenedData[i].driver, runs);
            stats[flattenedData[i].driver] = { "position": i + 1, "runs": runs }

            if (i < 10) {
                ret[(i + 1).toString()] = flattenedData[i];
            }
            else if (flattenedData[i].driver.toLowerCase() == user_driver) {
                flattenedData[i].offset = flattenedData[i].pax - ret["9"].pax;
                ret["10"] = flattenedData[i];
            }

            if(i >= 25-1){
                break;
            }
        }

    }
    return widget ? ret : flattenedData;
}

// Custom sort function to handle numeric and non-numeric 'pax' values
function rawSort(data) {
    return data.sort((a, b) => {
        let stringA = convertToSeconds(a.times[findBestTimeIndex(a.times)]);
        let stringB = convertToSeconds(b.times[findBestTimeIndex(b.times)]);
        a.pax = stringA;
        b.pax = stringB;

        if (DNFTimes.includes(stringA)) {
            stringA = "DNF";
        }
        if (DNFTimes.includes(stringB)) {
            stringB = "DNF";
        }

        if (DNSTimes.includes(stringA)) {
            stringA = "DNS";
        }
        if (DNSTimes.includes(stringB)) {
            stringB = "DNS";
        }

        if (stringA == "DNS" && stringB == "DNS") {
            return 0;
        }
        else if (stringA == "DNS") {
            return 1;
        }
        else if (stringB == "DNS") {
            return -1;
        }
        else

            if (stringA == "DNF" && stringB == "DNF") {
                return 0;
            }
            else if (stringA == "DNF") {
                return 1;
            }
            else if (stringB == "DNF") {
                return -1;
            }
            const rawA = parseFloat(stringA);
            const rawB = parseFloat(stringB);

        return rawA - rawB; // Both are numeric, sort in ascending order
    });
}

// Function to check if a URL exists and return a boolean
async function checkUrlExists(url) {
    try {
        const response = await axios.head(url);
        if (response.status === 200) {
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function getProntoClasses(url, offset, only=false) {
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

        if(only){
            linksArray.push("Pax");
            linksArray.push("Raw");
        }

        // Select all <a> elements within the targeted table
        targetElement.find('a').each((index, element) => {
            let link = $(element).attr('href');
            if (link) {

                // only push if its a class
                if(link.split("/").length == 1){
                    // Remove the '.php' extension if it exists
                    link = link.replace('.php', '');
                    linksArray.push(link);
                }
            }
        });

        // Return the array of links
        return linksArray;

    } catch (error) {
        // Log concise error info instead of full stack trace
        const errorMsg = error.response 
            ? `HTTP ${error.response.status}: ${error.config?.url || 'Unknown URL'}`
            : `${error.code || 'Error'}: ${error.message || 'Unknown error'}`;
        debug(`Pronto classes error: ${errorMsg}`);
        return [];
    }
}

async function fetchProntoRunTicker(baseUrl) {
    try {
        // Fetch the main index page
        const { data: html } = await axios.get(baseUrl + 'index.php');
        
        // Load the HTML into Cheerio
        const $ = cheerio.load(html);
        
        // Find the Run Ticker table
        const runTickerTable = $('#tblRunTicker');
        
        if (runTickerTable.length === 0) {
            debug('Run Ticker table not found');
            return [];
        }
        
        const recentRuns = [];
        
        // Parse each row in the Run Ticker table (skip header rows)
        runTickerTable.find('tr').each((index, row) => {
            // Skip the first row (header row)
            if (index <= 1) {
                return;
            }
            
            const $row = $(row);
            const cells = $row.find('td');
            
            // Skip header rows and rows without enough cells
            if (cells.length < 5) {
                return;
            }
            
            // Extract data from each cell
            const timestamp = $(cells[0]).text().trim();
            const carClassText = $(cells[1]).text().trim();
            const driverName = $(cells[2]).text().trim();
            const runNumber = $(cells[3]).text().trim();
            const timeText = $(cells[4]).text().trim();

            // Skip empty rows
            if (!timestamp || !carClassText || !driverName) {
                return;
            }
            
            // Parse car number and class from "121 EST" format
            const carClassMatch = carClassText.match(/^(\d+)\s+(.+)$/);
            let carNumber = '';
            let carClass = '';
            
            if (carClassMatch) {
                carNumber = carClassMatch[1];
                carClass = carClassMatch[2];
            } else {
                // Fallback if format is different
                carNumber = carClassText;
                carClass = '';
            }
            
            // Clean up the time (handle penalties)
            const cleanTime = simplifyTime(timeText);
            
            recentRuns.push({
                timestamp: timestamp,
                driver: toTitleCase(driverName),
                number: carNumber,
                class: carClass,
                runs: parseInt(runNumber) || 1,
                time: cleanTime,
                rawTime: timeText // Keep original for reference
            });
        });
        
        debug(`Fetched ${recentRuns.length} recent runs from Run Ticker`);
        return recentRuns;
        
    } catch (error) {
        // Log concise error info instead of full stack trace
        const errorMsg = error.response 
            ? `HTTP ${error.response.status}: ${error.config?.url || 'Unknown URL'}`
            : `${error.code || 'Error'}: ${error.message || 'Unknown error'}`;
        debug(`Run Ticker error: ${errorMsg}`);
        return [];
    }
}

function errorCode(error, widget, type = "string", res = undefined) {
    if (widget) {
        if (type == "error") {
            err = error.stack.split('\n')[0].split(':');
            results = new_results(true);
            results["1"].driver = err[0];
            results["1"].number = error.response ? error.response.status : '-1';
            results["1"].times = err[1];
            results["1"].car = "Error";
            return results;
        }
        else {
            results = new_results(true);
            results["1"].driver = error;
            results["1"].number = 500;
            results["1"].car = "Error";
            return results;
        }
    }
    else {
        return error;
    }
}

async function getRedirectURL(url) {
    return new Promise((resolve, reject) => {
        axios.get(url)
            .then(response => {
                const redirectMatch = response.data.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
                if (redirectMatch && redirectMatch[1]) {
                    const redirectUrl = new URL(redirectMatch[1], url).href; // Resolve relative URL
                    resolve(redirectUrl);
                } else {
                    resolve(url);
                }
            })
            .catch(error => {
                resolve(error.config.url);
            });
    });
}

async function getRedirect(url, region = undefined) {
    // Fetch the HTML from the URL
    let html = "";

    try {
        const response = await axios.get(url);

        // Extract potential redirect URL from <script> tag
        const redirectMatch = response.data.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);

        if (redirectMatch && redirectMatch[1]) {
            const redirectUrl = new URL(redirectMatch[1], url).href; // Resolve relative URL

            redirectArr = redirectUrl.split("index.php")[0].split("/")
            region = redirectArr[redirectArr.length - 2].toUpperCase();
            return { _url: url, _region: region };
        } else {
            return { _url: url, _region: undefined };
        }
    } catch (error) {
        console.error('Error fetching URL:', error);
    }

    return html;
}

async function fetchPaxIndex() {
    try {
        const url = "https://www.solotime.info/pax/";

        // Step 1: Fetch the HTML page using Axios
        const response = await axios.get(url);
        const html = response.data;

        // Step 2: Load the HTML content into cheerio for parsing
        const $ = cheerio.load(html);

        // Find the target table (assuming the first table is the one you want)
        const tableRows = $("table").eq(0).find('tr');

        const classIndexDict = {};

        // Step 3: Iterate over the table rows
        for (let index = 0; index < tableRows.length; index++) {
            let cells = $(tableRows[index]).find('td'); // Get all the <td> elements

            // Iterate over the cells and extract pairs of class and index
            for (let i = 0; i < cells.length; i += 1) {
                let carClass = $(cells[i]).text().trim(); // Get class from the current cell
                if(carClass == ""){
                    continue;
                }
                carClass = carClass.split("(")[0].trim();
                i++;

                let indexValue = ""
                for(; i < cells.length; i++){
                    indexValue = $(cells[i]).text().trim();
                    if(indexValue != ""){
                        break;
                    }
                }

                // Check if both class and index are valid and a number before adding them
                if (carClass && indexValue && !isNaN(parseFloat(indexValue))) {
                    carClass = carClass.replace(/-/g, "");
                    classIndexDict[carClass] = parseFloat(indexValue); // Add to dictionary
                }
            }
        }

        // Step 4: Log or return the final dictionary
        return classIndexDict;

    } catch (error) {
        console.error('Error fetching or parsing the table:', error);
    }
}

async function fetchEventCodes(url) {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      const eventCodes = [];

      $('a[href*="index.php"]').each((_, el) => {
        const href = $(el).attr('href');
        const match = href.match(/\.\.\/([^/]+)\/index\.php/);
        if (match && match[1]) {
          eventCodes.push(match[1]);
        }
      });

      // Remove duplicates
      return [...new Set(eventCodes)];
    } catch (error) {
      console.error('Error fetching or parsing HTML:', error.message);
      return [];
    }
  }

function isCar(str) {
    const regex = /^\d{4}\s+.+/;
    return regex.test(str);
}

function incUpdates() {
    updates += 1;
    if (updates > 1000) {
        updates = 0;
    }
    return updates;
}
