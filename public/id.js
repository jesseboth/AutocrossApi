// Function to get or generate a machine ID
function getMachineId() {
    let machineId = localStorage.getItem('MachineId');
    
    if (!machineId) {
        // Check if crypto.randomUUID is available
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            machineId = crypto.randomUUID();
        } else {
            // Fallback to a custom UUID generator
            machineId = generateFallbackUUID();
        }
        localStorage.setItem('MachineId', machineId);
    }

    return machineId;
}

// Fallback UUID generator function
function generateFallbackUUID() {
    // Create a timestamp-based prefix
    const timestamp = new Date().getTime().toString(36);
    
    // Generate random components
    const randomPart1 = Math.random().toString(36).substring(2, 10);
    const randomPart2 = Math.random().toString(36).substring(2, 10);
    
    // Add some browser-specific information if available
    let browserInfo = '';
    if (navigator.userAgent) {
        browserInfo = navigator.userAgent.split('').reduce((acc, char) => {
            return acc + char.charCodeAt(0);
        }, 0).toString(36).substring(0, 4);
    }
    
    // Combine all parts to create a UUID-like string
    return `${timestamp}-${randomPart1}-${randomPart2}-${browserInfo}`;
}
