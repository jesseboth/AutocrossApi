// Function to toggle visibility of elements
function toggleVisibility(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
}

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add user driver form to the page
    const container = document.querySelector('.container');
    if (container) {
        const formDiv = document.createElement('div');
        formDiv.style.marginTop = '20px';
        formDiv.style.padding = '10px';
        formDiv.style.textAlign = 'center';

        if(!window.location.href.includes('widgetui')) {
            return;
        }
        
        // Add styles to keep input background color consistent
        const style = document.createElement('style');
        style.textContent = `
            #user-driver-input {
                background-color: #222 !important;
                color: white !important;
            }
            #user-driver-input:focus {
                background-color: #222 !important;
                color: white !important;
                outline: none;
            }
        `;
        document.head.appendChild(style);
        
        formDiv.innerHTML = `
            <form id="user-driver-form" style="display: flex; flex-direction: row; align-items: center; justify-content: center;">
                <input type="text" id="user-driver-input" placeholder="Enter your driver name" 
                       autocomplete="off" 
                       style="padding: 8px; width: 80%; max-width: 300px; 
                       border: 1px solid #007BFF; background-color: #222; color: white; border-radius: 4px 0 0 4px;">
                <button type="submit" 
                        style="padding: 8px 12px; background-color: #007BFF; color: white; 
                        border: none; cursor: pointer; border-radius: 0 4px 4px 0; margin-left: -1px;">
                    &#10132;
                </button>
            </form>
            <div id="status-message" style="margin-top: 10px; color: #28a745; display: none;"></div>
        `;
        
        container.appendChild(formDiv);
        
        // Fetch and set the user driver name as placeholder if it exists
        const userDriverInput = document.getElementById('user-driver-input');
        if (userDriverInput) {
            fetch('/get-user-driver', {
                headers: {
                    'X-Machine-ID': getMachineId()
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.driver_name) {
                    userDriverInput.placeholder = data.driver_name;
                }
            })
            .catch(error => {
                console.error('Error fetching user driver:', error);
            });
        }
        
        // Add event listener to the form
        const form = document.getElementById('user-driver-form');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                const driverName = document.getElementById('user-driver-input').value.trim();
                if (driverName) {
                    fetch('/set-user-driver', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Machine-ID': getMachineId()
                        },
                        body: JSON.stringify({ user_driver: driverName })
                    })
                    .then(response => response.json())
                    .then(data => {
                        const statusMessage = document.getElementById('status-message');
                        statusMessage.textContent = data.message;
                        statusMessage.style.display = 'block';
                        setTimeout(() => {
                            statusMessage.style.display = 'none';
                        }, 3000);
                    })
                    .catch(error => {
                        console.error('Error:', error);
                    });
                }
            });
        }
    }
});
