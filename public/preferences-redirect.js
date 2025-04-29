// Constants
const STORAGE_KEY = 'autocross_preferences';

// Check if we're on the main page or a page without specific region/class
document.addEventListener("DOMContentLoaded", function() {
    // Only redirect if we're on the main page or a UI page without specific parameters
    const path = window.location.pathname;
    
    // Don't redirect if we're already on the preferences page
    if (path.includes('/preferences')) {
        return;
    }
    
    // Don't redirect if we're on a specific region/class page
    const pathParts = path.split('/').filter(part => part !== '');
    if (pathParts.length >= 3) {
        return;
    }
    
    // Check if we have saved preferences
    const savedPreferences = localStorage.getItem(STORAGE_KEY);
    if (!savedPreferences) {
        return;
    }
    
    try {
        const preferences = JSON.parse(savedPreferences);
        
        // Only redirect if we have a region
        if (preferences.region) {
            let redirectUrl = `/${preferences.view === 'top10' ? 'top10' : 'ui'}/${preferences.region}`;
            
            // Add class if specified
            if (preferences.class) {
                redirectUrl += `/${preferences.class}`;
            }
            
            // Redirect to the preferred page
            window.location.replace(redirectUrl);
        }
    } catch (error) {
        console.error('Error parsing preferences:', error);
    }
});
