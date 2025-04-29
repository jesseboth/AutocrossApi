// Constants
const tourEvents = ["TOUR", "PRO"];
const tourNames = {
    "TOUR": "National Tour",
    "PRO": "Pro Solo"
};
let region = undefined;
let refreshInterval = null;
const REFRESH_INTERVAL_MS = 10000; // 10 seconds

// Store previous positions for highlighting changes
let previousPositions = {};

// Wait for the DOM content to load
document.addEventListener("DOMContentLoaded", function () {
    if (!window.location.pathname.endsWith('/')) {
        window.location.replace(window.location.pathname + '/');
    }
    
    // Set up modal functionality
    const modal = document.getElementById('class-modal');
    const btn = document.getElementById('class-select-button');
    const span = document.getElementsByClassName('close-button')[0];
    
    // Open modal when button is clicked
    btn.onclick = function() {
        modal.style.display = 'block';
    }
    
    // Close modal when X is clicked
    span.onclick = function() {
        modal.style.display = 'none';
    }
    
    // Close modal when clicking outside of it
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    const regionData = getRegion();
    region = regionData.region;
    const tour = regionData.isTour;
    const cclass = getClass(region);

    if (tour) {
        document.getElementById("formContainer").style.display = "block";
        if (!tourEvents.includes(region)) {
            document.getElementById("inputBox").placeholder = region.split("/")[1];
        }
    } else {
        document.getElementById("formContainer").style.display = "none";
    }

    document.title = `${regionData.regionName} Top 10`;

    getClasses(region).then(classes => {
        if (cclass !== undefined) {
            getResults(cclass).then(res => {
                generateTop10Display(res, cclass);
                
                // Set up periodic refresh
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                }
                refreshInterval = setInterval(() => {
                    getResults(cclass).then(newRes => {
                        generateTop10Display(newRes, cclass);
                    }).catch(error => {
                        console.error('Error fetching results:', error);
                    });
                }, REFRESH_INTERVAL_MS);
            }).catch(error => {
                console.error('Error fetching results:', error);
            });
        } else if (classes.length > 0) {
            // Default to first class if none specified
            const defaultClass = classes[0];
            getResults(defaultClass).then(res => {
                generateTop10Display(res, defaultClass);
                
                // Set up periodic refresh
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                }
                refreshInterval = setInterval(() => {
                    getResults(defaultClass).then(newRes => {
                        generateTop10Display(newRes, defaultClass);
                        document.getElementById("updated").innerHTML = `Updated: ${new Date().toLocaleString()}`;
                    }).catch(error => {
                        console.error('Error fetching results:', error);
                    });
                }, REFRESH_INTERVAL_MS);
            }).catch(error => {
                console.error('Error fetching results:', error);
            });
        }

        setClasses(cclass, classes, tour);
    }).catch(error => {
        console.error('Error fetching classes:', error);
    });
});

document.getElementById('eventForm').addEventListener('submit', function(event) {
    event.preventDefault();
    var inputValue = document.getElementById('inputBox').value;

    const path = getPath();
    if (tourEvents.includes(region)) {
        path[2] = inputValue;
    } else {
        path[2] = inputValue;
    }
    
    for (let i = 3; i < path.length; i++) {
        path[i] = "";
    }
    const url = new URL(window.location.href);
    url.pathname = path.join('/');
    url.hash = '';

    window.location.replace(url.toString());
});

function toggleURL(add = "pax") {
    const currentURL = window.location.href;
    const url = new URL(currentURL);

    // Get the current pathname without hash or query parameters
    let pathParts = url.pathname.split('/').filter(part => part !== ''); // Remove empty parts
    const archive = pathParts[0] == "archive" ? true : false;
    
    // Replace 'results' with 'glance' in the path
    for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i] === 'results') {
            pathParts[i] = 'glance';
        }
    }
    
    if (pathParts.includes(add)) {
        // Remove 'pax' or 'raw' from the path
        pathParts.splice(pathParts.indexOf(add), 1);
    } else {
        // Check if we're already in glance view
        if (!pathParts.includes('glance')) {
            pathParts = [archive ? "archive/glance" : "glance", region, add, ""];
        } else {
            // Just add the class
            if (pathParts.length >= 3) {
                pathParts[2] = add;
            } else {
                pathParts.push(add);
            }
        }
        
        if (archive) {
            const archiveArr = region.split("/");
            archiveArr.shift();
            pathParts[1] = archiveArr.join('/');
        }
    }

    // Rebuild the URL path
    url.pathname = (archive ? '' : '/') + pathParts.join('/');

    // Remove the hash from the URL if it exists
    url.hash = '';

    window.location.replace(url.toString());
}

function getPath() {
    const currentURL = window.location.href;
    const url = new URL(currentURL);
    let pathParts = url.pathname.split('/').filter(part => part !== '');
    return pathParts;
}

function getClass(region) {
    const regionTest = region.split("/");
    const regionTestLast = regionTest[regionTest.length - 1];
    const pathParts = getPath();
    
    if (pathParts.join("/").toUpperCase().endsWith(regionTestLast)) {
        return undefined;
    } else {
        return pathParts[pathParts.length - 1].toUpperCase();
    }
}

function getRegion() {
    const pathParts = getPath();  // Get the path parts from getPath()

    const isArchive = pathParts[0] == "archive" ? true : false;
    let isTour = false;
    
    if (isArchive) {
        const split = pathParts[2].split("_");
        isTour = tourEvents.includes(split[0].toUpperCase()) ? true : false;
    } else {
        isTour = tourEvents.includes(pathParts[1].toUpperCase()) ? true : false;
    }

    if (!isTour && !isArchive) {
        return { 
            region: pathParts[1].toUpperCase(), 
            regionName: isTour ? tourNames[pathParts[1].toUpperCase()] : pathParts[1].toUpperCase(),
            isTour: isTour
        };
    } else if (isArchive) {
        return { 
            region: "archive/" + pathParts[2].toUpperCase() + "/" + pathParts[3].toUpperCase(), 
            regionName: isTour ? tourNames[pathParts[3].toUpperCase()] : pathParts[3].toUpperCase(),
            isTour: isTour
        };
    } else if (isTour) {
        const regionTry = pathParts[2];

        // there is a class at regionTry
        if (regionTry && regionTry.length < 5) {
            return {
                region: pathParts[1].toUpperCase(), 
                regionName: isTour ? tourNames[pathParts[1].toUpperCase()] : pathParts[1].toUpperCase(),
                isTour: true
            };
        }
        return {
            region: pathParts[1].toUpperCase() + (regionTry ? "/" + regionTry : ""), 
            regionName: (regionTry ? (pathParts[2].toUpperCase()) + " " : "") + tourNames[pathParts[1].toUpperCase()],
            isTour: true
        };
    }
}

async function getData(path) {
    try {
        const response = await fetch(path);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function getClasses(region) {
    return await getData(`/${region}/classes`);
}

function classesOnly(classes, tour = false) {
    if (tour) {
        return true;
    }
    return classes.length >= 15 ? true : false;
}

function setClasses(cclass, classes, tour = false) {
    // Get the modal button container element
    const modalButtonContainer = document.getElementById('modal-button-container');
    modalButtonContainer.innerHTML = ''; // Clear existing buttons
    
    if (tour) {
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
        
        Object.keys(tourClasses).forEach(category => {
            const categoryLabel = document.createElement('h5');
            categoryLabel.innerHTML = category;

            const buttonBox = document.createElement('div');
            buttonBox.className = 'button-box';
            
            let used = false;

            tourClasses[category].forEach(label => {
                if (classes.includes(label)) {
                    used = true;

                    // Create a new button element
                    const button = document.createElement('button');
                    button.className = 'modal-button';
                    button.innerHTML = label;
                    // Set an onclick handler that navigates to a specific location
                    button.onclick = () => toggleURL(label);

                    if (label == cclass) {
                        button.style.backgroundColor = "#ff0000";
                    }
                    
                    // Append the button to the container
                    buttonBox.appendChild(button);
                }
            });

            if (used) {
                modalButtonContainer.appendChild(categoryLabel);
                modalButtonContainer.appendChild(buttonBox);
            }
        });
    } else {
        // Create a div to hold the class buttons
        const buttonGrid = document.createElement('div');
        buttonGrid.className = 'modal-button-grid';
        
        classes.forEach(label => {
            // Create a new button element
            const button = document.createElement('button');
            button.className = 'modal-button';
            button.innerHTML = label;
            // Set an onclick handler that navigates to a specific location
            button.onclick = () => toggleURL(label);
            
            if (label == cclass) {
                button.style.backgroundColor = "#ff0000";
            }

            // Append the button to the grid
            buttonGrid.appendChild(button);
        });
        
        modalButtonContainer.appendChild(buttonGrid);
    }
    
    // Update the class select button to show current class
    const classSelectButton = document.getElementById('class-select-button');
    classSelectButton.textContent = cclass ? `Class: ${cclass}` : 'Change Class';
}

async function getResults(cclass = "") {
    const path = getPath();
    const newPath = [];
    for (let i = 0; i < path.length; i++) {
        if (path[i] != "glance" && path[i] != cclass) {
            newPath.push(path[i]);
        }
    }
    const pathStr = newPath.join('/');
    return await getData('/' + pathStr + '/' + cclass);
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

function generateTop10Display(entries, cclass) {
    const leftColumn = document.querySelector('.left-column');
    const rightColumn = document.querySelector('.right-column');
    
    // Clear existing content
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    
    if (!entries || !Array.isArray(entries) || (entries.status && entries.status == 404)) {
        leftColumn.innerHTML = '<div class="result-box"><div class="result-header">No results found</div></div>';
        return;
    }
    
    // Process entries to ensure they're in the right format
    let processedEntries = entries;
    
    // If entries is an object with numeric keys (like {"1": {...}, "2": {...}}), convert to array
    if (!Array.isArray(entries) && typeof entries === 'object') {
        processedEntries = Object.values(entries);
    }
    
    // Sort by position if needed
    processedEntries.sort((a, b) => {
        const posA = parseInt(a.position);
        const posB = parseInt(b.position);
        return posA - posB;
    });
    
    // Limit to top 10
    const top10 = processedEntries.slice(0, 10);
    
    // Create a new object to store current positions
    const currentPositions = {};
    
    // Generate HTML for each entry
    top10.forEach((entry, index) => {
        const position = parseInt(entry.position);
        const driver = entry.driver;
        
        // Check for position changes
        if (previousPositions[driver] && previousPositions[driver] !== position) {
            if (previousPositions[driver] > position) {
                // Driver moved up in position
                entry.positionChange = 'up';
            } else if (previousPositions[driver] < position) {
                // Driver moved down in position
                entry.positionChange = 'down';
            }
        }
        
        // Store current position for next comparison
        currentPositions[driver] = position;
        
        const resultBox = createResultBox(entry, cclass);
        
        // Add to appropriate column
        if (position <= 5) {
            leftColumn.appendChild(resultBox);
        } else {
            rightColumn.appendChild(resultBox);
        }
    });
    
    // Update previous positions for next refresh
    previousPositions = currentPositions;
}

function createResultBox(entry, cclass) {
    const resultBox = document.createElement('div');
    resultBox.className = 'result-box';
    
    // Add position change class if applicable
    if (entry.positionChange) {
        resultBox.classList.add(entry.positionChange);
    }
    
    // Create header
    const resultHeader = document.createElement('div');
    resultHeader.className = 'result-header';
    
    // Position container
    const positionContainer = document.createElement('div');
    positionContainer.className = 'position-container';
    
    // Position number
    const position = document.createElement('div');
    position.className = 'position';
    position.textContent = entry.position;
    
    // Class and year
    const classYear = document.createElement('div');
    classYear.className = 'class-year';
    
    // Use the index for the class display
    classYear.textContent = entry.index;
    
    // Add position and class to container
    positionContainer.appendChild(position);
    positionContainer.appendChild(classYear);
    
    // Car number
    const carNumber = document.createElement('div');
    carNumber.className = 'car-number';
    carNumber.textContent = entry.number;
    
    // Driver name
    const driverInfo = document.createElement('div');
    driverInfo.className = 'driver-info';
    
    const driverName = document.createElement('div');
    driverName.className = 'driver-name';
    driverName.textContent = entry.driver;
    
    // Car info
    const carInfo = document.createElement('div');
    carInfo.className = 'car-info';
    carInfo.textContent = `${entry.index} ${entry.car}`;
    
    driverInfo.appendChild(driverName);
    driverInfo.appendChild(carInfo);
    
    // Time info
    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';
    
    const mainTime = document.createElement('div');
    mainTime.className = 'main-time';
    mainTime.textContent = entry.pax;
    
    const timeDiff = document.createElement('div');
    timeDiff.className = 'time-diff';
    timeDiff.textContent = entry.offset;
    
    // Add color based on position change or new time
    if (entry.color) {
        if (entry.color === '#4fb342') {
            mainTime.classList.add('up');
        } else if (entry.color === '#d14545') {
            mainTime.classList.add('down');
        } else if (entry.color === '#1fb9d1') {
            mainTime.classList.add('new-time');
        }
    }
    
    timeInfo.appendChild(mainTime);
    timeInfo.appendChild(timeDiff);
    
    // Assemble header
    resultHeader.appendChild(positionContainer);
    resultHeader.appendChild(carNumber);
    resultHeader.appendChild(driverInfo);
    resultHeader.appendChild(timeInfo);
    
    // Create body for run times
    const resultBody = document.createElement('div');
    resultBody.className = 'result-body';
    
    // Run times
    const runTimes = document.createElement('div');
    runTimes.className = 'run-times';
    
    // Process times
    let timesArray = [];
    if (typeof entry.times === 'string') {
        // If times is a string, split it
        timesArray = entry.times.split('   ').filter(time => time.trim() !== '');
    } else if (Array.isArray(entry.times)) {
        // If times is already an array
        timesArray = entry.times.filter(time => time.trim() !== '');
    }
    
    if (timesArray.length > 0) {
        runTimes.textContent = timesArray.join(' | ');
    } else {
        runTimes.textContent = 'No run times available';
    }
    
    resultBody.appendChild(runTimes);
    
    // Assemble the box
    resultBox.appendChild(resultHeader);
    resultBox.appendChild(resultBody);
    
    return resultBox;
}
