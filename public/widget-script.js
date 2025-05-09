// TODO maybe get from server?
tourEvents = ["TOUR", "PRO"]
tourNames = {
    "TOUR": "National Tour",
    "PRO": "Pro Solo"
}

g_class = undefined;
g_cclasses = undefined;
g_tour = undefined;

// Array to store recent drivers (max 6)
const recentDrivers = [];
const MAX_RECENT_DRIVERS = 6;

const tourClasses = {
    "Street": ["SS", "AS", "BS", "CS", "DS", "ES", "FS", "GS", "HS"],
    "Street Touring (old)": ["STH", "STS", "STX", "STU", "STR"],
    "Street Touring": ["GST", "DST", "CST", "BST", "AST", "SST", "SSC", "EVX"],
    "Street Prep": ["SSP", "CSP", "DSP", "ESP", "FSP", "LS"],
    "Index": ["S1", "S3", "S4", "S5"],
    "Spec": ["XP", "CP", "DP", "EP", "FP", "CSM"],
    "Race Tire": ["R1", "R2", "R3"],
    "Street Mod": ["SM", "SSM", "SMF", "XA", "XB", "XU", "CAM", "CAMC", "CAMT", "CAMS"],
    "Modified": ["AM", "BM", "CM", "DM", "EM", "FM", "KM", "FSAE"],
    "Ladies": ["L1", "L2", "L3", "L4"]
};
region = undefined;
let setup = false;

const link = "widgetui"

loop();
let intervalId = setInterval(loop, 30000);

function refreshLoop() {
    clearInterval(intervalId);
    intervalId = setInterval(loop, 30000);
    loop();
}

function refresh() {
    document.getElementById("refresh-icon").style.display = "inline-block";
    document.getElementById("refresh-icon").style.animation = "spin 1s linear infinite";

    setTimeout(() => {
        document.getElementById("refresh-icon").style.animation = "none";
    }
    , 1000);
    refreshLoop();
}

async function loop() {
    i = 0;
    while(!setup) {
        await sleep(100);
        i++;
        if(i > 100) {
            return;
        }
    }

    console.log(g_class);
    
    // Fetch recent drivers
    if (region) {
        fetchRecentDrivers().catch(error => {
            console.error('Error fetching recent drivers:', error);
        });
    }
    
    getResults(g_class).then(data => {
        // populate grid here
        const gridContainer = document.querySelector('.grid-container');
        if (!gridContainer) return;

        // Loop through positions 1-10
        for (let i = 1; i <= 10; i++) {
            const position = i.toString();
            const gridItem = document.getElementById(position);
            
            if (gridItem && data[position]) {
                // Update driver information
                const driverRow = gridItem.querySelector('.driver-row');
                const positionSpan = driverRow.querySelector('.position');
                const numberSpan = driverRow.querySelector('.number');
                const driverSpan = driverRow.querySelector('.driver');
                
                positionSpan.textContent = position;
                numberSpan.textContent = data[position].number || '';
                driverSpan.textContent = data[position].driver || '';
                
                // Update car information
                const carRow = gridItem.querySelector('.car-row');
                const indexSpan = carRow.querySelector('.index');
                const carSpan = carRow.querySelector('.car');
                
                indexSpan.textContent = data[position].index || '';
                carSpan.textContent = data[position].car || '';
                
                // Update PAX time
                const paxRow = gridItem.querySelector('.pax-row');
                const paxSpan = paxRow.querySelector('.pax');
                
                paxSpan.textContent = data[position].pax || '';
                
                // Update offset
                const offsetRow = gridItem.querySelector('.offset-row');
                const offsetSpan = offsetRow.querySelector('.offset');
                
                offsetSpan.textContent = data[position].offset || '';
                
                // Update times
                const timesRow = gridItem.querySelector('.times-row');
                const timesSpan = timesRow.querySelector('.times');
                timesSpan.textContent = '';

                for(j = data[position].times.length - 6; j < data[position].times.length; j++) {
                    time = data[position].times[j];
                    if(time != undefined && time != "") {
                        cones = time.split("+")[1] ? "+<span class='cone'>" + time.split("+")[1] + "</span>" : "";
                        time = time.split("+")[0]
                        if(j == data[position].rawidx) {
                            timesSpan.innerHTML += '<span class="tab best-time"><b>'+time+cones+'</b></span>';
                        }
                        else {
                            if(time != undefined && time.trim() != "") {
                                timesSpan.innerHTML += '<span class="tab">'+time+cones+'</span>';
                            }
                        }
                    }
                }
            }
        }

    }).catch(error => {
        console.error('Error fetching results:', error); // Handle any errors from `getResults`
    });
}

// Function to fetch recent drivers from the server
async function fetchRecentDrivers() {
    try {
        const data = await getData(`/${region}/recent`);
        if (data && Array.isArray(data)) {
            // Clear the current array
            recentDrivers.length = 0;
            
            // Add each driver from the server data
            data.forEach(driver => {
                // Format the time display
                let timeDisplay = `${driver.runs} runs`;
                if (driver.time) {
                    // Check if it's a valid time format (e.g., "30.123")
                    if (!isNaN(parseFloat(driver.time))) {
                        timeDisplay = driver.time; // It's a valid time
                    } else if (driver.time.trim() !== '') {
                        timeDisplay = driver.time; // It's some other non-empty string
                    }
                }
                
                recentDrivers.push({
                    number: driver.number || '', // Use the driver number from the server
                    name: driver.driver,
                    time: timeDisplay
                });
            });

            console.log('Recent drivers fetched successfully:', recentDrivers);
            
            // Update the display
            updateRecentDriversDisplay();
        }
    } catch (error) {
        console.error('Error fetching recent drivers:', error);
    }
}

// Function to update the recent drivers display
function updateRecentDriversDisplay() {
    const container = document.getElementById('recent-drivers-list');
    if (!container) return;
    
    // Clear the container
    container.innerHTML = '';
    
    // Always create 6 cells
    for (let i = 0; i < MAX_RECENT_DRIVERS; i++) {
        const driverItem = document.createElement('div');
        driverItem.className = 'recent-driver-item';
        
        // If we have data for this position, fill it
        if (i < recentDrivers.length) {
            const driver = recentDrivers[i];
            
            const driverInfo = document.createElement('div');
            
            const numberSpan = document.createElement('span');
            numberSpan.className = 'recent-driver-number';
            numberSpan.textContent = driver.number;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'recent-driver-name';
            nameSpan.textContent = driver.name;
            
            driverInfo.appendChild(numberSpan);
            driverInfo.appendChild(nameSpan);
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'recent-driver-time';
            timeDiv.textContent = driver.time;
            
            driverItem.appendChild(driverInfo);
            driverItem.appendChild(timeDiv);
        } else {
            // Create empty cell with placeholder structure
            const driverInfo = document.createElement('div');
            
            const numberSpan = document.createElement('span');
            numberSpan.className = 'recent-driver-number';
            numberSpan.textContent = '';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'recent-driver-name';
            nameSpan.textContent = '';
            
            driverInfo.appendChild(numberSpan);
            driverInfo.appendChild(nameSpan);
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'recent-driver-time';
            timeDiv.textContent = '';
            
            driverItem.appendChild(driverInfo);
            driverItem.appendChild(timeDiv);
        }
        
        container.appendChild(driverItem);
    }
}

// Wait for the DOM content to load
document.addEventListener("DOMContentLoaded", function () {
    if (!window.location.pathname.endsWith('/')) {
        window.location.replace(window.location.pathname + '/');
    }

    regionData = getRegion();
    region = regionData.region;
    tour = regionData.isTour;

    if (false && tour) {
        getEvents(region).then(events => {
            console.log("Tour event", events);
            if (events.length > 1) {
                document.getElementById("eventForm").style.display = "block";
                document.getElementById("inputBox").placeholder = "Event Name";
                
                // Populate dropdown with event options
                const dropdown = document.getElementById('eventDropdown');
                dropdown.innerHTML = ''; // Clear existing options
                
                events.forEach(event => {
                    const item = document.createElement('div');
                    item.className = 'dropdown-item';
                    item.textContent = event;
                    item.addEventListener('click', function() {
                        document.getElementById('inputBox').value = event;
                        dropdown.style.display = 'none';
                    });
                    dropdown.appendChild(item);
                });
                
                // Add input event listener to filter dropdown options
                const inputBox = document.getElementById('inputBox');
                
                inputBox.addEventListener('input', function() {
                    const filterValue = this.value.toLowerCase();
                    const items = dropdown.getElementsByClassName('dropdown-item');
                    
                    for (let i = 0; i < items.length; i++) {
                        const text = items[i].textContent.toLowerCase();
                        if (text.includes(filterValue)) {
                            items[i].style.display = '';
                        } else {
                            items[i].style.display = 'none';
                        }
                    }
                });
                
                // Show dropdown when input is focused
                inputBox.addEventListener('focus', function() {
                    dropdown.style.display = 'block';
                });
                
                return;
            }
        });
    }


    cclass = getClass(region);

    document.title = `${regionData.regionName} Widget`

    getClasses(region).then(classes => {

        if(tour){
            classes.shift();
            classes.shift();
        }

        classes.unshift("Pax");
        classes.unshift("Raw");

        setClasses(cclass, classes, tour, true);

        g_cclasses = classes;
        g_class = cclass;
        g_tour = tour;

        setup = true;

    }).catch(error => {
        console.error('Error fetching classes:', error); // Handle any errors from `getClasses`
    });
});

// Variables to track current time and offset state
let currentTimeMode = 'Pax'; // 'PAX' or 'RAW'
let currentOffsetMode = 'Prev'; // 'PREV' or 'FIRST'

// Function to toggle between PAX and RAW time display
function toggleTime() {
    currentTimeMode = currentTimeMode === 'Pax' ? 'Raw' : 'Pax';
    document.getElementById('toggle-time').textContent = currentTimeMode;
    console.log(`Time mode changed to ${currentTimeMode}`);
    // Here you would update the display based on the new time mode
}

// Function to toggle between PREV and FIRST offset reference
function toggleOffset() {
    currentOffsetMode = currentOffsetMode === 'Prev' ? 'First' : 'Prev';
    document.getElementById('toggle-offset').textContent = currentOffsetMode;
    console.log(`Offset mode changed to ${currentOffsetMode}`);
    // Here you would update the display based on the new offset mode
}

// Function to handle back button click
function goBack() {
    console.log("Going back to widget UI...");
    // Extract the base URL (protocol + hostname + port)
    const baseUrl = window.location.protocol + "//" + window.location.host;
    // Navigate to the widget UI
    window.location.href = baseUrl + "/widgetui";
}

function toggleURL(add = "pax") {
    const currentURL = window.location.href;
    const url = new URL(currentURL);

    // Get the current pathname without hash or query parameters
    let pathParts = url.pathname.split('/').filter(part => part !== ''); // Remove empty parts
    oldcclass = pathParts[pathParts.length - 1];
    if (oldcclass == add) {
        return;
    }

    archive = pathParts[0] == "archive" ? true : false
    if (pathParts.includes(add)) {
        // Remove 'pax' from the path
        pathParts.splice(pathParts.indexOf(add), 1);
    } else {
        pathParts = [archive ? "archive/ui" : link, region, add, ""];
        if (archive) {
            archiveArr = region.split("/")
            archiveArr.shift()
            pathParts[1] = archiveArr.join('/')
        }
    }

    // Rebuild the URL path
    url.pathname = (archive ? '' : '/') + pathParts.join('/');

    // Remove the hash from the URL if it exists
    url.hash = '';

    // set window url but don't refresh

    window.history.pushState({}, '', url.toString());
    setClasses(add, g_cclasses, g_tour);
}

function getPath() {
    const currentURL = window.location.href;
    const url = new URL(currentURL);
    let pathParts = url.pathname.split('/').filter(part => part !== '');
    return pathParts;
}

function getClass(region) {
    regionTest = region.split("/")
    regionTest = regionTest[regionTest.length - 1]
    pathParts = getPath()
    if (pathParts.join("/").toUpperCase().endsWith(regionTest)) {
        return undefined;
    }
    else {
        return pathParts[pathParts.length - 1].toUpperCase();
    }
}

function getRegion() {
    const pathParts = getPath();  // Get the path parts from getPath()

    isArchive = pathParts[0] == "archive" ? true : false;
    if(isArchive) {
        split = pathParts[2].split("_")
        isTour = tourEvents.includes(split[0].toUpperCase()) ? true : false;
    }
    else {
        isTour = tourEvents.includes(pathParts[1].toUpperCase()) ? true : false;
    }

    if (!isTour && !isArchive) {
        return { 
            region: pathParts[1].toUpperCase(), 
            regionName: isTour ? tourNames[pathParts[1].toUpperCase()] : pathParts[1].toUpperCase(),
            isTour: isTour
        };
    } 
    else if(isArchive) {
        return { 
            region: "archive/" + pathParts[2].toUpperCase() + "/" + pathParts[3].toUpperCase(), 
            regionName: isTour ? tourNames[pathParts[3].toUpperCase()] : pathParts[3].toUpperCase(),
            isTour: isTour
        };
    }
    else if (isTour){
        regionTry = pathParts[2]

        // there is a class at regionTry
        if(regionTry && regionTry.length < 5) {
            return {
                region: pathParts[1].toUpperCase(), 
                regionName: isTour ? tourNames[pathParts[1].toUpperCase()] : pathParts[1].toUpperCase(),
                isTour: true
            };
        }
        return {
            region: pathParts[1].toUpperCase() + (regionTry ? "/" + regionTry : ""), 
            regionName: (regionTry ? ( pathParts[2].toUpperCase()) + " ": "") + tourNames[pathParts[1].toUpperCase()],
            isTour: true
        };
    }
}

async function getData(path) {
    try {
        const response = await fetch(path);
        const data = await response.json();
        console.log('Data fetched successfully:', data);
        return data; // Data is returned here
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function getClasses(region) {
    return await getData(`/${region}/classes`);
}

async function getEvents(region) {
    return await getData(`/${region}/events`);
}

function classesOnly(classes, tour = false) {
    if(tour) {
        return true;
    }

    return classes.length >= 15 ? true : false
}

function setClasses(cclass, classes, tour = false, create = false) {
    // Get the button container element
    const buttonContainer = document.getElementById('button-container');
    slash = classesOnly(classes) ? "" : ""

    if(false && tour) {
        Object.keys(tourClasses).forEach(category => {
            const categoryLabel = document.createElement('h5');
            categoryLabel.innerHTML = category;

            const buttonBox = document.createElement('div');
            buttonBox.className = 'button-box';
            
            used = false;

            tourClasses[category].forEach(label => {
                if(classes.includes(label)) {
                    used = true;

                    // Create a new button element
                    const button = document.createElement('button');
                    button.className = 'staggered-button';
                    button.innerHTML = label;
                    // Set an onclick handler that navigates to a specific location
                    button.onclick = () => toggleURL(label);

                    if(label == cclass) {
                        button.style.backgroundColor = "#ff0000";
                    }

                    
                    // Append the button to the container
                    buttonBox.appendChild(button);
                }
            });

            if(used) {
                buttonContainer.appendChild(categoryLabel);
                buttonContainer.appendChild(buttonBox);
            }
        });
        buttonContainer.style.padding = "0px";
        buttonContainer.style.marginTop = "-10px";
        buttonContainer.style.paddingBottom = "10px";
        buttonContainer.style.display = "block";
    }
    else if (create) {
        classes.forEach(label => {
            // Create a new button element
            const button = document.createElement('button');
            button.className = 'staggered-button';
            button.innerHTML = label;
            // Set an onclick handler that navigates to a specific location
            button.onclick = () => toggleURL(label);
            
            if(label.toUpperCase() == cclass.toUpperCase()) {
                button.style.backgroundColor = "#ff0000";
                g_class = label;
            }

            // Append the button to the container
            buttonContainer.appendChild(button);
        });
        buttonContainer.style.display = "flex";
    }
    else {
        console.log("Setting classes")
        // loop through buttons
        const buttons = buttonContainer.getElementsByTagName('button');
        for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            if (button.innerHTML == cclass) {
                console.log("here", button.innerHTML, cclass)
                button.style.backgroundColor = "#ff0000";

                if (g_class != cclass) {
                    refreshLoop();
                }

                g_class = cclass;
            }
            else {
                button.style.backgroundColor = "";
            }
        }
    }
}


async function getResults(cclass = "") {
    path = getPath();
    newPath = []
    for (let i = 0; i < path.length; i++) {
        if(path[i] != link && path[i] != cclass){
            newPath.push(path[i]);
        }
    }
    path = newPath.join('/');
    return await getData('/widget/' + path + '/' + cclass);
}

function convertToSeconds(time) {
    if (time == "" || time.includes('DNF') || time.includes('OFF') || time.includes('DSQ') || time.includes("RRN") || time == "NO TIME") {
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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
