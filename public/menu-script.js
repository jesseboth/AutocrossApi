
// Function to toggle the visibility of the file list
function toggleVisibility(id) {
    const element = document.getElementById(id);
    if (element.style.display === "none") {
        element.style.display = "block";  // Show the file list
    } else {
        element.style.display = "none";   // Hide the file list
    }
}