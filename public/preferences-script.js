// DOM Elements
const regionSelect = document.getElementById('region-select');
const classSelect = document.getElementById('class-select');
const viewSelect = document.getElementById('view-select');
const saveButton = document.getElementById('save-button');
const clearButton = document.getElementById('clear-button');
const statusMessage = document.getElementById('status-message');
const resultsLink = document.getElementById('results-link');

// Constants
const STORAGE_KEY = 'autocross_preferences';
const tourEvents = ["TOUR", "PRO"];

// Event Listeners
document.addEventListener('DOMContentLoaded', initializePreferences);
regionSelect.addEventListener('change', handleRegionChange);
saveButton.addEventListener('click', savePreferences);
clearButton.addEventListener('click', clearPreferences);
viewSelect.addEventListener('change', updateResultsLink);

// Initialize the preferences page
async function initializePreferences() {
    try {
        // Fetch regions
        const regions = await fetchRegions();
        populateRegionDropdown(regions);
        
        // Load saved preferences
        loadPreferences();
        
        // If a region is already selected, fetch its classes
        if (regionSelect.value) {
            await fetchAndPopulateClasses(regionSelect.value);
            
            // If a class was saved, select it
            if (localStorage.getItem(STORAGE_KEY)) {
                const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (prefs.class) {
                    classSelect.value = prefs.class;
                }
            }
        }
        
        // Update the results link based on current selections
        updateResultsLink();
    } catch (error) {
        console.error('Error initializing preferences:', error);
        showStatusMessage('Error loading preferences. Please try again.', 'error');
    }
}

// Fetch available regions from the API
async function fetchRegions() {
    try {
        const response = await fetch('/REGIONS');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching regions:', error);
        showStatusMessage('Error fetching regions. Please try again.', 'error');
        return [];
    }
}

// Populate the region dropdown with fetched regions
function populateRegionDropdown(regions) {
    // Clear existing options except the first one
    while (regionSelect.options.length > 1) {
        regionSelect.remove(1);
    }
    
    // Add regions to dropdown
    regions.forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        regionSelect.appendChild(option);
    });
}

// Handle region selection change
async function handleRegionChange() {
    const selectedRegion = regionSelect.value;
    
    if (selectedRegion) {
        await fetchAndPopulateClasses(selectedRegion);
    } else {
        // Clear class dropdown if no region selected
        while (classSelect.options.length > 1) {
            classSelect.remove(1);
        }
    }
    
    updateResultsLink();
}

// Fetch classes for the selected region and populate the class dropdown
async function fetchAndPopulateClasses(region) {
    try {
        const isTour = tourEvents.includes(region);
        const url = isTour ? `/${region}/CLASSES` : `/${region}/classes`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const classes = await response.json();
        populateClassDropdown(classes);
    } catch (error) {
        console.error('Error fetching classes:', error);
        showStatusMessage('Error fetching classes. Please try again.', 'error');
    }
}

// Populate the class dropdown with fetched classes
function populateClassDropdown(classes) {
    // Clear existing options except the first one
    while (classSelect.options.length > 1) {
        classSelect.remove(1);
    }
    
    // Add PAX and RAW options first if they're not already in the list
    if (!classes.includes('PAX')) {
        const paxOption = document.createElement('option');
        paxOption.value = 'PAX';
        paxOption.textContent = 'PAX';
        classSelect.appendChild(paxOption);
    }
    
    if (!classes.includes('RAW')) {
        const rawOption = document.createElement('option');
        rawOption.value = 'RAW';
        rawOption.textContent = 'RAW';
        classSelect.appendChild(rawOption);
    }
    
    // Add classes to dropdown
    classes.forEach(cls => {
        // Skip PAX and RAW if we already added them
        if (cls === 'PAX' || cls === 'RAW') return;
        
        const option = document.createElement('option');
        option.value = cls;
        option.textContent = cls;
        classSelect.appendChild(option);
    });
}

// Save preferences to localStorage
function savePreferences() {
    const region = regionSelect.value;
    const cls = classSelect.value;
    const view = viewSelect.value;
    
    if (!region) {
        showStatusMessage('Please select a region.', 'error');
        return;
    }
    
    const preferences = {
        region: region,
        class: cls,
        view: view
    };
    
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        showStatusMessage('Preferences saved successfully!', 'success');
        
        // Update the results link
        updateResultsLink();
    } catch (error) {
        console.error('Error saving preferences:', error);
        showStatusMessage('Error saving preferences. Please try again.', 'error');
    }
}

// Load preferences from localStorage
function loadPreferences() {
    try {
        const savedPreferences = localStorage.getItem(STORAGE_KEY);
        
        if (savedPreferences) {
            const preferences = JSON.parse(savedPreferences);
            
            if (preferences.region) {
                regionSelect.value = preferences.region;
            }
            
            if (preferences.view) {
                viewSelect.value = preferences.view;
            }
        }
    } catch (error) {
        console.error('Error loading preferences:', error);
    }
}

// Clear saved preferences
function clearPreferences() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        
        // Reset form
        regionSelect.value = '';
        classSelect.value = '';
        viewSelect.value = 'results';
        
        // Clear class dropdown except first option
        while (classSelect.options.length > 1) {
            classSelect.remove(1);
        }
        
        showStatusMessage('Preferences cleared successfully!', 'success');
        
        // Update the results link
        updateResultsLink();
    } catch (error) {
        console.error('Error clearing preferences:', error);
        showStatusMessage('Error clearing preferences. Please try again.', 'error');
    }
}

// Update the "View Results" link based on current selections
function updateResultsLink() {
    const region = regionSelect.value;
    const cls = classSelect.value;
    const view = viewSelect.value;
    
    if (region) {
        let url = `/${view === 'top10' ? 'top10' : 'ui'}/${region}`;
        
        if (cls) {
            url += `/${cls}`;
        }
        
        resultsLink.href = url;
    } else {
        resultsLink.href = '/';
    }
}

// Show a status message
function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message';
    statusMessage.classList.add(type);
    statusMessage.style.display = 'block';
    
    // Hide the message after 3 seconds
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 3000);
}
