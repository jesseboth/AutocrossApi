// Constants
const UPDATE_INTERVAL = 30000; // 30 seconds
const POSITION_HIGHLIGHT_DURATION = 15000; // 15 seconds
const GREEN_COLOR = "#2cab37";
const RED_COLOR = "#b53636";

// Global variables
let currentData = null;
let previousPosition = null;
let region = null;
let currentClass = null;
let driverName = "Jesse Both"; // Default driver name
let positionHighlightTimeout = null;

// Initialize the overlay
document.addEventListener("DOMContentLoaded", function() {
    parseURL();
    if (region && currentClass) {
        startDataLoop();
    } else {
        showError("Invalid URL format. Use: /stream/REGION/CLASS");
    }
});

// Get URL parameter value
function getURLParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Parse URL to get region, class, and driver name
function parseURL() {
    const pathParts = window.location.pathname.split('/').filter(part => part !== '');
    
    if (pathParts.length >= 3 && pathParts[0] === 'stream') {
        region = pathParts[1].toUpperCase();
        currentClass = pathParts[2].toUpperCase();
        
        // Handle tour events (TOUR/PRO with event codes)
        if (pathParts.length >= 4 && (region === 'TOUR' || region === 'PRO')) {
            region = region + '/' + pathParts[2].toUpperCase();
            currentClass = pathParts[3].toUpperCase();
        }
    }
    
    // Get driver name from query parameter or use default
    const driverParam = getURLParameter('driver');
    if (driverParam) {
        driverName = decodeURIComponent(driverParam);
    }
}

// Start the data fetching loop
function startDataLoop() {
    fetchData();
    setInterval(fetchData, UPDATE_INTERVAL);
}

// Fetch data from the API
async function fetchData() {
    try {
        const response = await fetch(`/${region}/${currentClass}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        processData(data);
        
    } catch (error) {
        console.error('Error fetching data:', error);
        showError(`Failed to fetch data: ${error.message}`);
    }
}

// Process the fetched data
function processData(data) {
    // Handle different data formats
    let drivers = [];
    
    if (Array.isArray(data)) {
        // Data is an array of drivers
        drivers = data;
    } else if (typeof data === 'object' && data !== null) {
        // Data might be an object with classes or positions
        if (data["1"] && data["1"].car === "Error") {
            showError(`${data["1"].driver}: ${data["1"].times}`);
            return;
        }
        
        // Convert object to array
        drivers = Object.values(data).filter(item => 
            item && typeof item === 'object' && item.driver
        );
    }
    
    if (drivers.length === 0) {
        showError("No driver data found");
        return;
    }
    
    // Find the specified driver in the data (case-insensitive)
    let driverData = null;
    let driverPosition = null;
    
    for (let i = 0; i < drivers.length; i++) {
        const driver = drivers[i];
        if (driver.driver && 
            driver.driver.toLowerCase().includes(driverName.toLowerCase())) {
            driverData = driver;
            driverPosition = parseInt(driver.position) || (i + 1);
            break;
        }
    }
    
    if (!driverData) {
        showNoData();
        return;
    }
    
    // Check for position change
    if (previousPosition !== null && previousPosition !== driverPosition) {
        handlePositionChange(driverPosition, previousPosition);
    }
    
    previousPosition = driverPosition;
    currentData = driverData;
    
    updateDisplay(driverData, driverPosition);
}

// Handle position changes with highlighting
function handlePositionChange(newPosition, oldPosition) {
    const overlay = document.getElementById('overlay');
    
    // Clear any existing timeout
    if (positionHighlightTimeout) {
        clearTimeout(positionHighlightTimeout);
    }
    
    // Remove existing position classes
    overlay.classList.remove('position-up', 'position-down');
    
    // Add appropriate class based on position change
    if (newPosition < oldPosition) {
        // Position improved (lower number = better)
        overlay.classList.add('position-up');
    } else if (newPosition > oldPosition) {
        // Position got worse
        overlay.classList.add('position-down');
    }
    
    // Add animation class
    overlay.classList.add('position-change');
    
    // Remove highlighting after duration
    positionHighlightTimeout = setTimeout(() => {
        overlay.classList.remove('position-up', 'position-down', 'position-change');
    }, POSITION_HIGHLIGHT_DURATION);
}

// Update the display with Jesse's data
function updateDisplay(data, position) {
    const overlay = document.getElementById('overlay');
    
    // Get position styling
    let positionClass = '';
    if (position === 1) positionClass = 'first';
    else if (position === 2) positionClass = 'second';
    else if (position === 3) positionClass = 'third';
    
    // Format run times
    const runTimesHtml = formatRunTimes(data.times, data.rawidx);
    
    // Get class name for display
    const classDisplay = data.class || currentClass;
    
    overlay.innerHTML = `
        <div class="driver-header">
            <div class="position ${positionClass}">${position}${getOrdinalSuffix(position)}</div>
            <div class="driver-name">${driverName}</div>
            <div class="pax-time">${data.pax || 'No Time'}</div>
        </div>
        <div class="class-info">Class: ${classDisplay}</div>
        <div class="runs-container">
            <div class="runs-label"></div>
            <div class="run-times">
                ${runTimesHtml}
            </div>
        </div>
    `;
}

// Format run times with best time highlighting
function formatRunTimes(times, bestIndex) {
    if (!times || times.length === 0) {
        return '<div class="run-time">No runs yet</div>';
    }
    
    return times.map((time, index) => {
        if (!time || time.trim() === '') return '';
        
        const isBest = index === bestIndex;
        const bestClass = isBest ? 'best' : '';
        
        // Handle cone penalties
        let displayTime = time;
        if (time.includes('+')) {
            const parts = time.split('+');
            const baseTime = parts[0];
            const penalty = parts[1];
            displayTime = `${baseTime}<span class="cone-penalty">+${penalty}</span>`;
        }
        
        return `<div class="run-time ${bestClass}">${displayTime}</div>`;
    }).filter(html => html !== '').join('');
}

// Get ordinal suffix for position (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
}

// Show error state
function showError(message) {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `
        <div class="error-state">
            <div style="font-weight: bold; margin-bottom: 10px;">Error</div>
            <div>${message}</div>
        </div>
    `;
}

// Show no data state
function showNoData() {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `
        <div class="no-data">
            ${driverName} not found in current results
        </div>
    `;
}

// Get machine ID (from existing id.js)
function getMachineId() {
    // This function should be available from id.js
    if (typeof window.getMachineId === 'function') {
        return window.getMachineId();
    }
    
    // Fallback implementation
    let machineId = localStorage.getItem('machineId');
    if (!machineId) {
        machineId = 'stream-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('machineId', machineId);
    }
    return machineId;
}
