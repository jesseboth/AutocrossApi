# Autocross API

Welcome to the Autocross API. This API provides access to real-time and archived data for autocross events. You can retrieve data based on regions, classes, or PAX (Performance Adjusted Index). Additionally, data for specific events can be accessed through the archive endpoints.

## Setup

To get started with the Autocross API, follow these setup instructions:

### 1. Running the Docker Container

Use the `docker.sh` script to manage the Docker container for the API. This script provides commands to start, stop, restart, or run the container in daemon mode.

```bash
./docker.sh start   # Start the Docker container
./docker.sh stop    # Stop the Docker container
./docker.sh restart # Restart the Docker container
./docker.sh daemon  # Run the container as a daemon
./docker.sh log     # Output the logs
```

### 2. Adding New Regions

To add a new region to the API:

- Follow the existing structure for adding regions.
- Ensure that the **region keys** are specified in **all uppercase** (e.g., `CNY`, `FLR`).
- Update the necessary configuration files to include the new region.

### 3. Configuring Widget Mode

The API can operate in a widget mode, providing data formatted for widgets such as KWGT or Tasker. 

- To enable or disable widget mode, modify the `settings.json` file located in the project root.
- Set the appropriate configuration flags in `settings.json` to enable or disable widget functionality as needed.

Ensure that the settings in `settings.json` align with your requirements before starting the server.

## Base URL

```
http://<your-server-address>
```

## API Endpoints

### 1. Real-Time Event Data

The following endpoints provide real-time data for events based on region and class:

- **Get Data by Region and Class**:  
  Retrieve data for a specific region and class.
  ```
  GET /<region>/<class>
  ```
  - `<region>`: The specific region code (e.g., "FLR").
  - `<class>`: The specific class (e.g., "S1", "S2", etc.). Optional.

- **Get PAX Data for a Region**:  
  Retrieve PAX data for a specific region.
  ```
  GET /<region>/pax
  ```
  - `<region>`: The specific region code.

### 2. Widget Data

You can retrieve data formatted for KWGT (Kustom Widget) or Tasker:
* Using KWGT, import Autocross.kwgt in Widget directory
* Using Tasker, import Autocross_Data.tsk.xml

- **Get Widget Data by Region and Class**:  
  Retrieve widget data for a specific region and class.
  ```
  GET /widget/<region>/<class>
  ```
  - `<region>`: The specific region code.
  - `<class>`: The specific class. Optional.

- **Get PAX Widget Data for a Region**:  
  Retrieve PAX widget data for a specific region.
  ```
  GET /widget/<region>/pax
  ```
  - `<region>`: The specific region code.

### 3. Archived Event Data

The following endpoints provide access to archived event data:

- **Get List of All Archived Events**:  
  Retrieve a list of all archived events.
  ```
  GET /archive/events
  ```

- **Get Data for a Specific Archived Event**:  
  Retrieve all data for a specific archived event.
  ```
  GET /archive/<event>
  ```
  - `<event>`: The specific event identifier (e.g., "FLR_07-21-24").

- **Get Class Data for a Specific Archived Event**:  
  Retrieve class-specific data for an archived event.
  ```
  GET /archive/<event>/<class>
  ```
  - `<event>`: The specific event identifier.
  - `<class>`: The specific class. Optional.

- **Get PAX Data for a Specific Archived Event**:  
  Retrieve PAX data for a specific archived event.
  ```
  GET /archive/<event>/pax
  ```
  - `<event>`: The specific event identifier.

## Example Usage

1. **Get data for the FLR region and class S1:**
   ```
   GET /FLR/S1
   ```

2. **Get PAX data for the FLR region:**
   ```
   GET /FLR/pax
   ```

3. **Get widget data for the FLR region and class S1:**
   ```
   GET /widget/FLR/S1
   ```

4. **Get all archived events:**
   ```
   GET /archive/events
   ```

5. **Get all data for an archived event FLR_07-21-24:**
   ```
   GET /archive/FLR_07-21-24
   ```

6. **Get class data for the archived event FLR_07-21-24 and class S1:**
   ```
   GET /archive/FLR_07-21-24/S1
   ```

7. **Get PAX data for the archived event FLR_07-21-24:**
   ```
   GET /archive/FLR_07-21-24/pax
   ```

## Notes

- **Region** and **class** are not case-sensitive.
- **Class** and **pax** parameters are optional for both real-time and archived endpoints.
- Widget data can be accessed by prefixing the path with `widget/`.
- Archived events can be accessed by using the `/archive/` prefix.

## Conclusion

This API offers a flexible way to retrieve autocross data in both real-time and archived formats. By understanding the endpoint structure, users can access a wide range of data tailored to their needs.
