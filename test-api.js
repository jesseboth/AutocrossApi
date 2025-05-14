const fs = require('fs');

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

// Load PAX index
let paxIndex = {};
try {
    // This will be populated when the server starts
    paxIndex = {};
} catch (error) {
    console.error('Error loading PAX index:', error);
}

// Function to generate test data with 10 positions
function generateTestData(userDriver = '') {
    // Create a base set of 10 drivers with initial data
    const drivers = [
        { position: "1", driver: "John Smith", number: "7", car: "2023 Toyota GR86", index: "DS", times: ["54.556", "54.662", "54.570", "54.009", "54.100"] },
        { position: "2", driver: "Sarah Johnson", number: "42", car: "2022 Mazda Miata", index: "ES", times: ["56.015", "55.920", "55.294", "55.211+1"] },
        { position: "3", driver: "Michael Brown", number: "18", car: "2021 Subaru BRZ", index: "DST", times: ["53.959+1", "53.223", "53.702", "52.280+1", "51.916"] },
        { position: "4", driver: "Emily Davis", number: "33", car: "2022 Honda Civic Si", index: "GS", times: ["57.376", "56.542+1", "57.628+4", "56.948", "56.957"] },
        { position: "5", driver: "David Wilson", number: "21", car: "2020 BMW M2", index: "BS", times: ["56.795", "56.226", "55.535", "55.687", "55.022+1"] },
        { position: "6", driver: "Jessica Martinez", number: "99", car: "2021 Porsche Cayman", index: "AS", times: ["59.587", "58.997", "58.445", "57.455", "56.732"] },
        { position: "7", driver: "Robert Taylor", number: "11", car: "2019 Ford Mustang GT", index: "FS", times: ["56.526+1", "56.239", "57.930+1", "OFF", "56.968"] },
        { position: "8", driver: "Jennifer Anderson", number: "5", car: "2022 Volkswagen GTI", index: "GS", times: ["58.437+1", "57.073+1", "57.638", "58.196", "57.097"] },
        { position: "9", driver: "William Thomas", number: "27", car: "2020 Chevrolet Corvette", index: "AS", times: ["61.117", "59.587", "58.997", "58.445", "57.455"] },
        { position: "10", driver: "Lisa Jackson", number: "63", car: "2021 Subaru WRX", index: "DS", times: ["60.773", "60.297", "60.367+1", "60.141+1", "93.369+4"] }
    ];

    // If a user driver is specified and not already in the top 10, replace position 10
    if (userDriver && !drivers.some(d => d.driver.toLowerCase() === userDriver.toLowerCase())) {
        drivers[9] = {
            position: "10",
            driver: userDriver,
            number: "88",
            car: "2022 Toyota GR86",
            index: "DS",
            times: ["61.211", "61.321", "61.272", "60.317", "59.987"]
        };
    }

    // Calculate PAX times and offsets based on the PAX index
    for (let i = 0; i < drivers.length; i++) {
        const driver = drivers[i];
        
        // Find the best time index
        const bestTimeIndex = findBestTimeIndex(driver.times);
        
        // Calculate raw time
        const rawTime = bestTimeIndex >= 0 ? convertToSeconds(driver.times[bestTimeIndex]) : 999.999;
        driver.raw = rawTime.toFixed(3);
        driver.rawidx = bestTimeIndex;
        
        // Calculate PAX time using the PAX index
        const paxMultiplier = paxIndex[driver.index] || 0.82; // Default to 0.82 if index not found
        const paxTime = rawTime * paxMultiplier;
        driver.pax = paxTime.toFixed(3);
        
        // Calculate offset from previous position
        if (i > 0) {
            const prevPaxTime = parseFloat(drivers[i-1].pax);
            const currPaxTime = parseFloat(driver.pax);
            driver.offset = (currPaxTime - prevPaxTime).toFixed(3);
        } else {
            driver.offset = "-";
        }
    }

    return createResultObject(drivers);
}

// Function to create a result object with position keys
function createResultObject(drivers) {
    const result = {};
    drivers.forEach(driver => {
        result[driver.position] = driver;
    });
    return result;
}

// Helper function to convert time string to seconds
function convertToSeconds(time) {
    if (!time || time === "DNF" || time === "OFF" || time === "DSQ" || time === "RRN" || time === "NO TIME") {
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

// Helper function to find the index of the best time
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

// Function to update the test data with new times and position changes
function updateTestData(currentData, iteration = 1) {
    const newData = JSON.parse(JSON.stringify(currentData)); // Deep copy
    const positions = Object.keys(newData);
    
    // Randomly select 2-3 drivers to update
    const numDriversToUpdate = Math.floor(Math.random() * 2) + 2; // 2-3 drivers
    const driversToUpdate = [];
    
    while (driversToUpdate.length < numDriversToUpdate) {
        const randomPos = positions[Math.floor(Math.random() * positions.length)];
        if (!driversToUpdate.includes(randomPos)) {
            driversToUpdate.push(randomPos);
        }
    }
    
    // Update each selected driver
    driversToUpdate.forEach(pos => {
        const driver = newData[pos];
        
        // Add a new time (50% chance of improvement, 30% chance of cone, 20% chance of DNF/OFF)
        const lastTime = parseFloat(driver.raw);
        const rand = Math.random();
        
        let newTimeValue;
        if (rand < 0.5) {
            // Improvement - between 0.1 and 0.8 seconds faster
            const improvement = 0.1 + Math.random() * 0.7;
            newTimeValue = (lastTime - improvement).toFixed(3);
        } else if (rand < 0.8) {
            // Slightly slower with cone
            const slower = Math.random() * 0.3;
            newTimeValue = (lastTime + slower).toFixed(3) + "+1";
        } else {
            // DNF or OFF
            newTimeValue = Math.random() < 0.5 ? "DNF" : "OFF";
        }
        
        // Ensure times is an array
        if (!driver.times) {
            driver.times = [];
        }
        // Add the new time to the times array
        driver.times.push(newTimeValue);
        
        // Recalculate best time and PAX
        const bestTimeIndex = findBestTimeIndex(driver.times);
        const rawTime = bestTimeIndex >= 0 ? convertToSeconds(driver.times[bestTimeIndex]) : 999.999;
        driver.raw = rawTime.toFixed(3);
        driver.rawidx = bestTimeIndex;
        
        // Recalculate PAX time
        const paxMultiplier = paxIndex[driver.index] || 0.82;
        const paxTime = rawTime * paxMultiplier;
        driver.pax = paxTime.toFixed(3);
    });
    
    // Sort drivers by PAX time to determine new positions
    const driverArray = Object.values(newData).sort((a, b) => {
        return parseFloat(a.pax) - parseFloat(b.pax);
    });
    
    // Update positions and offsets
    for (let i = 0; i < driverArray.length; i++) {
        driverArray[i].position = (i + 1).toString();
        
        if (i > 0) {
            const prevPaxTime = parseFloat(driverArray[i-1].pax);
            const currPaxTime = parseFloat(driverArray[i].pax);
            driverArray[i].offset = (currPaxTime - prevPaxTime).toFixed(3);
        } else {
            driverArray[i].offset = "-";
        }
    }
    
    // Add an "updates" counter for the widget
    const result = createResultObject(driverArray);
    result.updates = iteration;
    
    return result;
}

// Function to set the PAX index
function setPaxIndex(index) {
    paxIndex = index;
}

// Test API handler function
function testApiHandler(req, res) {
    const uuid = req.headers['x-device-id'] || req.headers['x-machine-id'];
    const userDriver = (req.headers['user'] || "").toLowerCase();
    
    // Get the current iteration from app.locals or initialize to 1
    if (!req.app.locals.testIteration) {
        req.app.locals.testIteration = 1;
    } else {
        // Increment the iteration counter for each request
        req.app.locals.testIteration++;
    }
    
    const iteration = req.app.locals.testIteration;
    
    // Generate or update test data
    let testData;
    if (iteration === 1) {
        testData = generateTestData(userDriver);
    } else {
        // Get the previous data from a cache or generate new data
        const prevData = req.app.locals.testData || generateTestData(userDriver);
        testData = updateTestData(prevData, iteration);
    }
    
    // Store the data for the next request
    req.app.locals.testData = testData;
    
    res.json(testData);
}

module.exports = {
    testApiHandler,
    setPaxIndex
};
