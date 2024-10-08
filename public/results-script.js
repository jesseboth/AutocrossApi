
// TODO maybe get from server?
tourEvents = ["TOUR", "PRO"]
tourNames = {
    "TOUR": "National Tour",
    "PRO": "Pro Solo"
}
const tourClasses = {
    "Street": ["SS", "AS", "BS", "CS", "DS", "ES", "FS", "GS", "HS"],
    "Street Touring": ["STH", "STS", "STX", "STU", "STR", "SST", "SSC", "EVX"],
    "Street Prep": ["SSP", "CSP", "DSP", "ESP", "FSP", "LS"],
    "Index": ["S1", "S3", "S4", "S5"],
    "Spec": ["XP", "CP", "DP", "EP", "FP", "CSM"],
    "Race Tire": ["R1", "R2", "R3"],
    "Street Mod": ["SM", "SSM", "SMF", "XA", "XB", "XU", "CAM", "CAMC", "CAMT", "CAMS"],
    "Modified": ["AM", "BM", "CM", "DM", "EM", "FM", "KM", "FSAE"],
    "Ladies": ["L1", "L2", "L3", "L4"]
};
region = undefined;

// Wait for the DOM content to load
document.addEventListener("DOMContentLoaded", function () {
    if (!window.location.pathname.endsWith('/')) {
        window.location.replace(window.location.pathname + '/');
    }

    regionData = getRegion();
    region = regionData.region;
    tour = regionData.isTour;
    cclass = getClass(region);

    document.title = `${regionData.regionName} Results`
    document.getElementById("region-header").innerHTML = `${regionData.regionName} Results`
    document.getElementById("header").innerHTML = `${regionData.regionName} ${tour ? "" : "Region"}`
    document.getElementById("updated").innerHTML = `Updated: ${new Date().toLocaleString()}`;
    // document.getElementById("toggle-button").style.display = cclass == undefined || cclass == "PAX" ? "block" : "none";
    document.getElementById("toggle-button").style.backgroundColor = cclass == "PAX" ? "#ff0000" : "#007BFF";

    document.getElementById('results').innerHTML = "";  // Clear the results table

    getClasses(region).then(classes => {
        if (!cclass && !classesOnly(classes)) {
            for (let i = 0; i < classes.length; i++) {
                generateClassTable(classes[i]);
                getResults(classes[i]).then(res => {
                    generateResultsTable(res, classes[i]);
                }).catch(error => {
                    console.error('Error fetching results:', error); // Handle any errors from `getResults`
                });
            }
        }
        else if (cclass !== undefined) {
            generateClassTable(cclass);
            getResults(cclass).then(res => {
                generateResultsTable(res, cclass);
            }).catch(error => {
                console.error('Error fetching results:', error); // Handle any errors from `getResults`
            });
        }

        setClasses(cclass, classes, tour);

        // this should happen last
        document.body.style.display = "block";

    }).catch(error => {
        console.error('Error fetching classes:', error); // Handle any errors from `getClasses`
    });
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
        pathParts = [archive ? "" : "ui", region, add, ""];
        if (archive) {
            archiveArr = pathParts[1].split("/")
            uiArr = [archiveArr[0], "ui", archiveArr[1]]
            pathParts[1] = uiArr.join('/')
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
            region: "archive/" + pathParts[2].toUpperCase(), 
            regionName: isTour ? tourNames[pathParts[2].toUpperCase()] : pathParts[2].toUpperCase(),
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
        return data; // Data is returned here
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function getClasses(region) {
    return await getData(`/${region}/classes`);
}

function classesOnly(classes) {
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

function generateTableRows(entries) {
    let rows = '';  // Initialize an empty string to hold the table rows
    entries.forEach((entry, index) => {
        const rowClass = index % 2 === 0 ? 'rowlow' : 'rowhigh';

        // Optional: Highlight best time if needed
        // if (entry.times.length > 0) {
        //     bestTimeIndex = findBestTimeIndex(entry.times);
        //     entry.times[bestTimeIndex] = `<b style="border: 1px solid black; padding: 2px; color: black;">${entry.times[bestTimeIndex]}</b>`;
        // }

        let numTimes = Math.max(3, entry.times.length / 2);  // At least 3 columns for times
        rows += `<tr class="${rowClass}">
          <td style="width:5%;" nowrap align="center">${entry.position}</td>
          <td style="width:7%;" nowrap align="right">${entry.index}</td>
          <td style="width:5%;" nowrap align="right">${entry.number}</td>
          <td style="width:40%;" nowrap align="left">${entry.driver}</td>
          <td style="width:7%;" nowrap><font class='bestt'>${entry.pax}</font></td>`;

        for (let i = 0; i < numTimes; i++) {
            rows += `<td valign="top" nowrap>${entry.times[i] || ''}</td>`;
        }

        rows += `</tr>
      <tr class="${rowClass}">
          <td nowrap align="center"></td>
          <td nowrap align="right"></td>
          <td nowrap align="right"></td>
          <td nowrap align="left">${entry.car}</td>
          <td nowrap>${entry.offset}</td>`;

        for (let i = numTimes; i < numTimes * 2; i++) {
            rows += `<td valign="top" nowrap>${entry.times[i] || ''}</td>`;
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