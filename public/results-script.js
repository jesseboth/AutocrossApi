// TODO maybe get from server?
tourEvents = ["TOUR", "PRO"]
tourNames = {
    "TOUR": "National Tour",
    "PRO": "Pro Solo"
}
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

// Global variables for time and offset toggles
let g_timeType = "Pax";
let g_offsetType = "Prev";
let g_paxIndex = {};
let g_currentData = {};

// Wait for the DOM content to load
document.addEventListener("DOMContentLoaded", function () {
    if (!window.location.pathname.endsWith('/')) {
        window.location.replace(window.location.pathname + '/');
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('eventDropdown');
        const inputBox = document.getElementById('inputBox');
        
        if (!dropdown.contains(event.target) && event.target !== inputBox) {
            dropdown.style.display = 'none';
        }
    });

    regionData = getRegion();
    region = regionData.region;
    tour = regionData.isTour;

    if (tour) {
        // For tour events, we need to get the base tour region (TOUR or PRO) for events
        const baseRegion = region.split('/')[0];
        getEvents(baseRegion).then(events => {
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
        }).catch(error => {
            console.error('Error fetching events:', error);
            // If events fetch fails, hide the form
            document.getElementById("eventForm").style.display = "none";
        });
    }


    cclass = getClass(region);

    if(tour){
        document.getElementById("formContainer").style.display = "block";
        if(!tourEvents.includes(region)){
            document.getElementById("inputBox").placeholder = region.split("/")[1];
        }
    }
    else {
        document.getElementById("formContainer").style.display = "none";
    }

    document.title = `${regionData.regionName} Results`
    document.getElementById("region-header").innerHTML = `${regionData.regionName} Results`
    document.getElementById("header").innerHTML = `${regionData.regionName} ${tour ? "" : "Region"}`
    document.getElementById("updated").innerHTML = `Updated: ${new Date().toLocaleString()}`;
    // document.getElementById("toggle-button").style.display = cclass == undefined || cclass == "PAX" ? "block" : "none";
    // document.getElementById("toggle-pax").style.backgroundColor = cclass == "PAX" ? "#ff0000" : "#007BFF";
    // document.getElementById("toggle-raw").style.backgroundColor = cclass == "RAW" ? "#ff0000" : "#007BFF";

    document.getElementById('results').innerHTML = "";  // Clear the results table

    getClasses(region).then(classes => {
        if (classes && !classes.includes("PAX")) {
            classes.unshift("PAX");
        }
        if (classes && !classes.includes("RAW")) {
            classes.unshift("RAW");
        }
        if (!cclass && !classesOnly(classes, tour)) {
            for (let i = 0; i < classes.length; i++) {
                generateClassTable(classes[i]);

                if (classes[i] === "PAX" || classes[i] === "RAW") {
                    continue; // Skip PAX and RAW if they are not needed
                }

                getResults(classes[i]).then(res => {
                    g_currentData[classes[i]] = res; // Store data for toggle operations
                    generateResultsTable(res, classes[i]);
                }).catch(error => {
                    console.error('Error fetching results:', error); // Handle any errors from `getResults`
                });
            }
        }
        else if (cclass !== undefined) {
            generateClassTable(cclass);
            getResults(cclass).then(res => {
                g_currentData[cclass] = res; // Store data for toggle operations
                generateResultsTable(res, cclass);
            }).catch(error => {
                console.error('Error fetching results:', error); // Handle any errors from `getResults`
            });
        }

        setClasses(cclass, classes, tour);

        // Fetch PAX index data
        fetchPaxIndex();

        // this should happen last
        document.body.style.display = "block";

    }).catch(error => {
        console.error('Error fetching classes:', error); // Handle any errors from `getClasses`
    });
});

document.getElementById('eventForm').addEventListener('submit', function(event) {
    event.preventDefault();
    var inputValue = document.getElementById('inputBox').value;

    path = getPath();
    if (tourEvents.includes(region)){
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
    archive = pathParts[0] == "archive" ? true : false
    if (pathParts.includes(add)) {
        // Remove 'pax' from the path
        pathParts.splice(pathParts.indexOf(add), 1);
    } else {
        pathParts = [archive ? "archive/ui" : "ui", region, add, ""];
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

    window.location.replace(url.toString());
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

function setClasses(cclass, classes, tour = false) {
    // Get the button container element
    const buttonContainer = document.getElementById('button-container');
    slash = classesOnly(classes) ? "" : ""

    if(tour) {
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
    else {
        classes.forEach(label => {
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
            buttonContainer.appendChild(button);
        });
        buttonContainer.style.display = "flex";
    }
}


async function getResults(cclass = "") {
    path = getPath();
    newPath = []
    for (let i = 0; i < path.length; i++) {
        if(path[i] != "ui" && path[i] != cclass){
            newPath.push(path[i]);
        }
    }
    path = newPath.join('/');
    return await getData('/' + path + '/' + cclass);
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

function generateTableRows(entries) {
    let rows = '';  // Initialize an empty string to hold the table rows

    if(!entries || !Array.isArray(entries) || (entries.status && entries.status == 404)) {
        return
    }

    entries.forEach((entry, index) => {
        const rowClass = index % 2 === 0 ? 'rowlow' : 'rowhigh';
        
        // Calculate display time and offset based on toggle settings
        let displayTime = '';
        let displayOffset = '';
        
        if (g_timeType === "Pax" && g_offsetType === "Prev") {
            displayTime = entry.pax || '';
            if (entry.position !== "1" && entry.pax !== "" && entry.pax !== "DNS") {
                displayOffset = "+" + (entry.offset || '');
            } else {
                displayOffset = entry.offset || '';
            }
        }
        else if (g_timeType === "Pax" && g_offsetType === "First") {
            if (entry.position === "1" && entry.pax !== "" && entry.pax !== "DNS") {
                displayTime = entry.pax || '';
                displayOffset = entry.offset || '';
            }
            else if (entry.pax !== "" && entry.pax !== "DNS" && entries[0].pax !== "") {
                displayTime = entry.pax || '';
                displayOffset = "+" + (parseFloat(entry.pax) - parseFloat(entries[0].pax)).toFixed(3);
            }
            else {
                displayTime = '';
                displayOffset = '';
            }
        }
        else if (g_timeType === "Raw" && g_offsetType === "Prev") {
            if (entry.position === "1" && entry.raw !== "" && entry.pax !== "DNS") {
                displayTime = entry.raw || '';
                displayOffset = entry.offset || '';
            }
            else if (entry.raw !== "" && entry.pax !== "DNS" && entries[0].pax !== "") {
                displayTime = entry.raw || '';
                
                const prevEntry = entries[index - 1];
                if (prevEntry && g_paxIndex && entry.index && prevEntry.index) {
                    // Get the PAX index for current and previous positions
                    const currIndex = parseFloat(g_paxIndex[entry.index]) || 1;
                    const prevIndex = parseFloat(g_paxIndex[prevEntry.index]) || 1;
                    
                    if (!isNaN(currIndex) && !isNaN(prevIndex)) {
                        // Calculate the PAX time for the previous position
                        const prevPaxTime = parseFloat(prevEntry.raw) * prevIndex;
                        
                        // Calculate what raw time would be needed to match the previous car's PAX time
                        const neededRaw = prevPaxTime / currIndex;
                        
                        // Calculate the offset between actual raw time and needed raw time
                        const actualRaw = parseFloat(entry.raw);
                        const offset = actualRaw - neededRaw;
                        
                        displayOffset = "+" + offset.toFixed(3);
                    } else {
                        // Fallback to direct raw time comparison if PAX indices are not valid
                        displayOffset = "+" + (parseFloat(entry.raw) - parseFloat(prevEntry.raw)).toFixed(3);
                    }
                } else {
                    // Fallback to direct raw time comparison if paxIndex not available
                    const prevEntry = entries[index - 1];
                    if (prevEntry) {
                        displayOffset = "+" + (parseFloat(entry.raw) - parseFloat(prevEntry.raw)).toFixed(3);
                    }
                }
            }
            else {
                displayTime = '';
                displayOffset = '';
            }
        }
        else if (g_timeType === "Raw" && g_offsetType === "First") {
            if (entry.position === "1" && entry.raw !== "" && entry.pax !== "DNS") {
                displayTime = entry.raw || '';
                displayOffset = entry.offset || '';
            }
            else if (entry.raw !== "" && entry.pax !== "DNS" && entries[0].pax !== "") {
                displayTime = entry.raw || '';
                
                const firstEntry = entries[0];
                if (g_paxIndex && entry.index && firstEntry.index) {
                    // Get the PAX index for current and first positions
                    const currIndex = parseFloat(g_paxIndex[entry.index]) || 1;
                    const firstIndex = parseFloat(g_paxIndex[firstEntry.index]) || 1;
                    
                    if (!isNaN(currIndex) && !isNaN(firstIndex)) {
                        // Calculate the PAX time for the first position
                        const firstPaxTime = parseFloat(firstEntry.raw) * firstIndex;
                        
                        // Calculate what raw time would be needed to match the first car's PAX time
                        const neededRaw = firstPaxTime / currIndex;
                        
                        // Calculate the offset between actual raw time and needed raw time
                        const actualRaw = parseFloat(entry.raw);
                        const offset = actualRaw - neededRaw;
                        
                        displayOffset = "+" + offset.toFixed(3);
                    } else {
                        // Fallback to direct raw time comparison if PAX indices are not valid
                        displayOffset = "+" + (parseFloat(entry.raw) - parseFloat(firstEntry.raw)).toFixed(3);
                    }
                } else {
                    // Fallback to direct raw time comparison if paxIndex not available
                    displayOffset = "+" + (parseFloat(entry.raw) - parseFloat(firstEntry.raw)).toFixed(3);
                }
            }
            else {
                displayTime = '';
                displayOffset = '';
            }
        }

        let numTimes = Math.max(4, entry.times.length / 2);  // At least 3 columns for times
        rows += `<tr class="${rowClass}">
          <td style="width:5%;" nowrap align="center">${entry.position}</td>
          <td style="width:7%;" nowrap align="right">${entry.index}</td>
          <td style="width:5%;" nowrap align="right">${entry.number}</td>
          <td style="width:40%;" nowrap align="left">${entry.driver}</td>
          <td style="width:7%;" nowrap><font class='bestt'>${displayTime}</font></td>`;

        bestTimeIndex = findBestTimeIndex(entry.times);
        for (let i = 0; i < numTimes; i++) {
            if(i == bestTimeIndex) {
                rows += `<td valign="top" nowrap><b>${entry.times[i] || ''}</b></td>`;
            }
            else {
                rows += `<td valign="top" nowrap>${entry.times[i] || ''}</td>`;
            }
        }

        // Clean up offset display
        if(displayOffset.startsWith("+") && displayOffset.length > 1) { 
            // Keep the + for positive offsets
        } else if (displayOffset === "+" || displayOffset === "") {
            displayOffset = '';
        }
        
        rows += `</tr>
      <tr class="${rowClass}">
          <td nowrap align="center"></td>
          <td nowrap align="right"></td>
          <td nowrap align="right"></td>
          <td nowrap align="left">${entry.car}</td>
          <td nowrap>${displayOffset}</td>`;

        for (let i = numTimes; i < numTimes * 2; i++) {
            if(i == bestTimeIndex) {
                rows += `<td valign="top" nowrap><b>${entry.times[i] || ''}</b></td>`;
            }
            else {
                rows += `<td valign="top" nowrap>${entry.times[i] || ''}</td>`;
            }
        }

        rows += `</tr>`;
    });

    return rows;  // Return the constructed rows
}

function generateClassTable(cclass = undefined) {
    htmlContent = '';
    if(cclass !== undefined) {
        htmlContent += `
      <table class='live' width='100%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border='1' align='center'>
      <tbody id=${cclass}>
      </tbody>
      </table>`;
    }
    document.getElementById('results').innerHTML += htmlContent;
}

async function generateResultsTable(jsonData, cclass = undefined) {
    if (!jsonData || jsonData.status == 404 || jsonData.length == 0) {
        return;
    }

    let htmlContent = '';  // Initialize the HTML content string
    if (cclass !== undefined) {
        htmlContent += `
      <tr class="rowlow">
      <th nowrap rowspan="1" colspan="100" align="left"><a name="${cclass}"></a> ${cclass} - Total Entries: ${jsonData.length}</th>
      </tr>
      ${generateTableRows(jsonData)}
        `;
    } 
    // else {
    //     for (const category in jsonData) {
    //         if (jsonData.hasOwnProperty(category)) {
    //             htmlContent += `
    //       <table class='live' width='100%' cellpadding='3' cellspacing='1' style='border-collapse: collapse' border='1' align='center'>
    //       <tbody>
    //       <tr class="rowlow">
    //       <th nowrap rowspan="1" colspan="100" align="left"><a name="${category}"></a> ${category} - Total Entries: ${jsonData[category].length}</th>
    //       </tr>
    //       ${generateTableRows(jsonData[category])}
    //       </tbody>
    //       </table>`;
    //         }
    //     }
    // }

    document.getElementById(cclass).innerHTML += htmlContent;
}

// Function to fetch PAX index data
function fetchPaxIndex() {
    getData(`/paxIndex`).then(data => {
        console.log("PAX Index", data);
        g_paxIndex = data;
    }).catch(error => {
        console.error('Error fetching PAX index:', error);
    });
}

// Function to toggle between PAX and RAW time display
function toggleTime() {
    g_timeType = g_timeType === 'Pax' ? 'Raw' : 'Pax';
    document.getElementById('toggle-time').textContent = g_timeType;
    console.log(`Time mode changed to ${g_timeType}`);
    
    // Regenerate the results table with new time display
    regenerateResults();
}

// Function to toggle between PREV and FIRST offset reference
function toggleOffset() {
    g_offsetType = g_offsetType === 'Prev' ? 'First' : 'Prev';
    document.getElementById('toggle-offset').textContent = g_offsetType;
    console.log(`Offset mode changed to ${g_offsetType}`);
    
    // Regenerate the results table with new offset calculation
    regenerateResults();
}

// Function to regenerate results with current toggle settings
function regenerateResults() {
    // Clear current results
    document.getElementById('results').innerHTML = "";
    
    // Get current class and regenerate
    const cclass = getClass(region);
    if (cclass !== undefined) {
        generateClassTable(cclass);
        getResults(cclass).then(res => {
            g_currentData[cclass] = res; // Store data for toggle operations
            generateResultsTable(res, cclass);
        }).catch(error => {
            console.error('Error fetching results:', error);
        });
    } else {
        // Handle multiple classes case
        getClasses(region).then(classes => {
            if (!classesOnly(classes, regionData.isTour)) {
                classes = classes.filter(ccclass => ccclass !== "PAX" && ccclass !== "RAW");
                console.log("Classes", classes);
                for (let i = 0; i < classes.length; i++) {
                    generateClassTable(classes[i]);

                    if (classes[i] === "PAX" || classes[i] === "RAW") {
                        continue; // Skip PAX and RAW if they are not needed
                    }

                    getResults(classes[i]).then(res => {
                        g_currentData[classes[i]] = res;
                        generateResultsTable(res, classes[i]);
                    }).catch(error => {
                        console.error('Error fetching results:', error);
                    });
                }
            }
        });
    }
}
