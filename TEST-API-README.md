# Test API for Autocross Widget

This test API provides a way to test the Autocross Widget with simulated data. It generates test data with 10 positions, new times, position changes, and correct PAX data based on the PAX index.

## How to Use

1. Start the server:
   ```
   node server.js
   ```

2. Access the widget with the test parameter:
   ```
   http://localhost:8000/widgetui/FLR/Pax?test=true
   ```

3. The widget will display test data with 10 positions. The data will update automatically based on the refresh interval.

## URL Parameters

- `test=true`: Enables test mode, which uses the test API instead of the regular API.
- `interval=<milliseconds>`: Sets the refresh interval in milliseconds. Default is 5000 (5 seconds) in test mode.

Example:
```
http://localhost:8000/widgetui/FLR/Pax?test=true&interval=3000
```
This will use the test API and refresh the data every 3 seconds.

## Test Data

The test data includes:
- 10 positions with driver names, car information, and times
- New times are added with each refresh
- Position changes occur based on the new times
- PAX data is calculated correctly based on the PAX index
- Recent drivers are updated with each new time

The test data is designed to simulate a real autocross event, with drivers getting new times and positions changing as they improve their times.

## Recent Drivers

The test API also supports the recent drivers functionality. When a driver gets a new time, they are added to the recent drivers list. The recent drivers list is displayed in the widget and shows the most recent runs.

To access the recent drivers data, use the following URL:
```
http://localhost:8000/test-api/FLR/recent
```

## Implementation Details

The test API is implemented in `test-api.js` and integrated into the server in `server.js`. The widget script (`widget-script.js`) has been modified to use the test API when the `test=true` parameter is present in the URL.

The test API generates initial data with 10 positions, and then updates the data with each request. The updates include a new time for 1 randomly selected driver per refresh, which can result in position changes. The recent drivers list is also updated with each new time.

## Customization

You can customize the test data by modifying the `generateTestData` function in `test-api.js`. For example, you can change the driver names, car information, or initial times.

You can also customize the update behavior by modifying the `updateTestData` function. For example, you can change the probability of getting a better time, a cone, or a DNF/OFF.
