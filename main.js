// ============================================= Global Variables ==================================================

var defaultNumOfHeaters = 14; // 4 extruder heaters + 10 bed heaters
var defaultNumOfExtruderHeaters = 4;
var defaultNumOfBedHeaters = 10;
var defaultNumOfChamberHeaters = 0;

const heaterFaults = new Array(defaultNumOfHeaters).fill(false); // global array to store heater fault data
let globalObjectModelResult;
let settings, heatProfiles;
let spindleSpeed = document.getElementById("speedValue").textContent;
let spindleOff = true;
let cncCurrentRPM = "";
let updatedSpindleSpeed = "";
let selectedHeatsinkFan = "0";
let selectedBarrelFan = "0";
// let spindleRunning = false; // already declared in embedded code

// Configuration for Duet connection - can be modified via UI or localStorage
let duetIP = localStorage.getItem('duetIP') || "10.10.10.100";
let duetExpansionIP = localStorage.getItem('duetExpansionIP') || "10.10.10.101";
let activeStatusURL = `http://${duetIP}/rr_model`;
let activeCodeURL = `http://${duetIP}/rr_gcode`;
let activeConnectURL = `http://${duetIP}/rr_connect`;
let expansionStatusURL = `http://${duetExpansionIP}/rr_model`;
let expansionCodeURL = `http://${duetExpansionIP}/rr_gcode`;
let expansionConnectURL = `http://${duetExpansionIP}/rr_connect`;

// Session management
let isConnected = false;
let isExpansionConnected = false;

// Network configuration
const NETWORK_TIMEOUT = 5000; // 5 seconds timeout for requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay

// Mode detection and caching
let duetMode = null; // null = not detected, 'sbc' = SBC mode, 'standalone' = standalone mode
let modeDetectionAttempts = 0;
const MAX_MODE_DETECTION_ATTEMPTS = 3;

// Helper function to create timeout-enabled fetch requests
function fetchWithTimeout(url, options = {}, timeout = NETWORK_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    fetch(url, options)
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Helper function to validate if an IP is potentially reachable
async function validateConnection(ip) {
  try {
    const testUrl = `http://${ip}/rr_connect?password=test`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // Quick 2s test
    
    const response = await fetch(testUrl, { 
      signal: controller.signal,
      mode: 'no-cors' // Allow checking even if CORS fails
    });
    clearTimeout(timeoutId);
    return true; // If we get any response, IP is reachable
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`Connection validation timeout for IP: ${ip}`);
    }
    return false;
  }
}

// FUNCTION: Reset Duet mode detection (for debugging or manual override)
function resetDuetModeDetection() {
  duetMode = null;
  modeDetectionAttempts = 0;
  console.log("Duet mode detection reset - will re-detect on next request");
}

// FUNCTION: Update Duet IP address and reset connection
function updateDuetIP(newIP) {
  if (!newIP || newIP === duetIP) return;
  
  console.log(`Updating Duet IP from ${duetIP} to ${newIP}`);
  duetIP = newIP;
  localStorage.setItem('duetIP', newIP);
  
  // Update all URLs
  activeStatusURL = `http://${duetIP}/rr_model`;
  activeCodeURL = `http://${duetIP}/rr_gcode`;
  activeConnectURL = `http://${duetIP}/rr_connect`;
  
  // Reset connection state
  isConnected = false;
  resetDuetModeDetection();
  
  console.log(`Duet endpoints updated. New status URL: ${activeStatusURL}`);
}

// FUNCTION: Test connectivity to current Duet IP
async function testDuetConnection() {
  console.log(`Testing connection to Duet at ${duetIP}...`);
  
  try {
    // First validate basic connectivity
    const isReachable = await validateConnection(duetIP);
    if (!isReachable) {
      console.error(`Cannot reach device at ${duetIP}. Please check the IP address and network connection.`);
      return { success: false, error: 'Device unreachable' };
    }

    // Try to establish RRF connection
    const result = await connectToRRF();
    console.log('Connection test successful:', result);
    return { success: true, data: result };
    
  } catch (error) {
    console.error('Connection test failed:', error);
    return { success: false, error: error.message };
  }
}

// FUNCTION: Get connection status for UI display
function getConnectionStatus() {
  return {
    isConnected,
    duetIP,
    duetMode,
    urls: {
      status: activeStatusURL,
      code: activeCodeURL,
      connect: activeConnectURL
    }
  };
}

// FUNCTION: Update connection status indicator in UI
function updateConnectionStatusUI(status, message = null) {
  const indicator = document.getElementById('connection-indicator');
  const text = document.getElementById('connection-text');
  
  if (!indicator || !text) return; // Elements not found
  
  switch (status) {
    case 'connected':
      indicator.style.backgroundColor = '#44ff44';
      text.textContent = message || 'Connected';
      text.className = 'toggle-text-on';
      break;
    case 'connecting':
      indicator.style.backgroundColor = '#ffaa44';
      text.textContent = message || 'Connecting...';
      text.className = 'toggle-text-off';
      break;
    case 'disconnected':
      indicator.style.backgroundColor = '#ff4444';
      text.textContent = message || 'Disconnected';
      text.className = 'toggle-text-off';
      break;
    case 'error':
      indicator.style.backgroundColor = '#ff0044';
      text.textContent = message || 'Connection Error';
      text.className = 'toggle-text-off';
      break;
    default:
      indicator.style.backgroundColor = '#888888';
      text.textContent = message || 'Status Unknown';
      text.className = 'toggle-text-off';
  }
}

// FUNCTION: Initialize connection status on page load
function initializeConnectionStatus() {
  // Set initial status
  updateConnectionStatusUI('connecting');
  
  // Try to establish connection
  setTimeout(async () => {
    try {
      const result = await testDuetConnection();
      if (result.success) {
        updateConnectionStatusUI('connected');
      } else {
        updateConnectionStatusUI('disconnected', result.error);
      }
    } catch (error) {
      updateConnectionStatusUI('error', error.message);
    }
  }, 1000);
}

// FUNCTION: Force Duet mode (for debugging or manual override)
function forceDuetMode(mode) {
  if (mode === 'sbc' || mode === 'standalone') {
    duetMode = mode;
    modeDetectionAttempts = 0;
    console.log(`Duet mode manually set to: ${mode}`);
  } else {
    console.error("Invalid mode. Use 'sbc' or 'standalone'");
  }
}

// Make functions available globally for debugging
window.resetDuetModeDetection = resetDuetModeDetection;
window.forceDuetMode = forceDuetMode;

// ============================= Dual Mode Object Model Fetching ===============================
//
// This system automatically detects whether the Duet controller is running in:
// - SBC Mode: Returns full object model with data in a single request
// - Standalone Mode: Returns only object model structure, requires key-specific requests for data
//
// The detection happens automatically on first request and is cached for performance.
// 
// Debug functions available in browser console:
// - resetDuetModeDetection(): Reset detection to re-test mode
// - forceDuetMode('sbc' | 'standalone'): Manually override detection
//
// ==================================================================================

// ========================================== HTTP requests with Duet Mainboard ========================================

// FUNCTION: Establish connection to RRF with timeout
async function connectToRRF(password = "reprap") {
  try {
    console.log(`Attempting to connect to RRF at ${duetIP}...`);
    const response = await fetchWithTimeout(`${activeConnectURL}?password=${encodeURIComponent(password)}`, {}, NETWORK_TIMEOUT);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.err === 0) {
      console.log("Successfully connected to RRF");
      isConnected = true;
      updateConnectionStatusUI('connected');
      return data;
    } else {
      console.error(`RRF connection failed with error code: ${data.err}`);
      isConnected = false;
      updateConnectionStatusUI('error', `Connection failed: ${data.err}`);
      throw new Error(`RRF connection failed: ${data.err}`);
    }
  } catch (error) {
    console.error("Failed to connect to RRF:", error);
    isConnected = false;
    updateConnectionStatusUI('error', error.message);
    throw error;
  }
}

// FUNCTION: Enhanced async GET/POST requests to Duet Mainboard with timeouts and retry logic
async function fetchData(url, options = {}, retryCount = 0) {
  try {
    // Ensure we're connected before making requests
    if (!isConnected && !url.includes('rr_connect')) {
      await connectToRRF();
    }
    
    // Use timeout-enabled fetch
    const response = await fetchWithTimeout(url, options, NETWORK_TIMEOUT);

    // Handle 401 Unauthorized - need to reconnect
    if (response.status === 401) {
      console.warn("Received 401 Unauthorized, attempting to reconnect...");
      isConnected = false;
      await connectToRRF();
      // Retry the original request
      const retryResponse = await fetchWithTimeout(url, options, NETWORK_TIMEOUT);
      if (!retryResponse.ok) {
        console.error(`Error: Network response was not ok. Status: ${retryResponse.status}`);
        throw new Error(`HTTP error! Status: ${retryResponse.status}`);
      }
      return await parseResponse(retryResponse);
    }

    if (!response.ok) {
      console.error(`Error: Network response was not ok. Status: ${response.status}`);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await parseResponse(response);
  } catch (error) {
    // Implement retry logic for network errors
    if (retryCount < MAX_RETRIES && (
      error.name === 'TypeError' || 
      error.message.includes('timeout') ||
      error.message.includes('ERR_CONNECTION_RESET') ||
      error.message.includes('Failed to fetch')
    )) {
      const delay = RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
      console.warn(`Network error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return await fetchData(url, options, retryCount + 1);
    }

    // Log specific error types
    if (error.name === 'TypeError') {
      console.error("Network or SSL error, unable to fetch data. Please check your connection or SSL settings.");
    } else if (error.message.includes('timeout')) {
      console.error(`Request timeout after ${NETWORK_TIMEOUT}ms. The device may be slow to respond or unreachable.`);
    } else {
      console.error("There has been a problem with your fetch operation:", error);
    }
    
    // Mark as disconnected for network-related errors
    if (error.name === 'TypeError' || error.message.includes('timeout')) {
      isConnected = false;
      updateConnectionStatusUI('disconnected', 'Connection lost');
    }
    
    throw error;
  }
}

// Helper function to parse response
async function parseResponse(response) {
  const contentType = response.headers.get("content-type");
  const data =
    contentType && contentType.includes("application/json")
      ? await response.json()
      : await response.text();
  return data;
}

// FUNCTION: Establish connection to expansion controller with timeout
async function connectToExpansionRRF(password = "reprap") {
  try {
    console.log(`Attempting to connect to expansion controller at ${duetExpansionIP}...`);
    const response = await fetchWithTimeout(`${expansionConnectURL}?password=${encodeURIComponent(password)}`, {}, NETWORK_TIMEOUT);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.err === 0) {
      console.log("Successfully connected to expansion controller");
      isExpansionConnected = true;
      return data;
    } else {
      console.error(`Expansion controller connection failed with error code: ${data.err}`);
      isExpansionConnected = false;
      throw new Error(`Expansion controller connection failed: ${data.err}`);
    }
  } catch (error) {
    console.error("Failed to connect to expansion controller:", error);
    isExpansionConnected = false;
    throw error;
  }
}

// FUNCTION: Enhanced async GET/POST requests to expansion controller with timeouts and retry logic
async function fetchExpansionData(url, options = {}, retryCount = 0) {
  try {
    // Ensure we're connected before making requests
    if (!isExpansionConnected && !url.includes('rr_connect')) {
      await connectToExpansionRRF();
    }
    
    // Use timeout-enabled fetch
    const response = await fetchWithTimeout(url, options, NETWORK_TIMEOUT);

    // Handle 401 Unauthorized - need to reconnect
    if (response.status === 401) {
      console.warn("Expansion controller received 401 Unauthorized, attempting to reconnect...");
      isExpansionConnected = false;
      await connectToExpansionRRF();
      // Retry the original request
      const retryResponse = await fetchWithTimeout(url, options, NETWORK_TIMEOUT);
      if (!retryResponse.ok) {
        console.error(`Expansion controller error: Network response was not ok. Status: ${retryResponse.status}`);
        throw new Error(`HTTP error! Status: ${retryResponse.status}`);
      }
      return await parseResponse(retryResponse);
    }

    if (!response.ok) {
      console.error(`Expansion controller error: Network response was not ok. Status: ${response.status}`);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await parseResponse(response);
  } catch (error) {
    // Implement retry logic for network errors
    if (retryCount < MAX_RETRIES && (
        error.message.includes('timeout') ||
        error.message.includes('fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('Failed to fetch')
    )) {
      console.warn(`Expansion controller request failed, retrying in ${RETRY_DELAY}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return await fetchExpansionData(url, options, retryCount + 1);
    } else {
      console.error("Network or SSL error with expansion controller, unable to fetch data. Please check your connection or SSL settings.");
      throw error;
    }
  }
}



// FUNCTION: Detect Duet mode (SBC vs Standalone)
async function detectDuetMode() {
  if (duetMode !== null && modeDetectionAttempts < MAX_MODE_DETECTION_ATTEMPTS) {
    return duetMode; // Return cached result if available and within attempt limit
  }
  
  try {
    modeDetectionAttempts++;
    console.log(`Attempting Duet mode detection (attempt ${modeDetectionAttempts})`);
    
    const data = await fetchData(activeStatusURL);
    
    // Check if we got a standalone response format with result wrapper
    if (data.result && typeof data.result === 'object') {
      const actualData = data.result;
      
      // Check if any of the key sections have actual data beyond empty objects
      const heatData = actualData.heat || {};
      const globalData = actualData.global || {};
      const stateData = actualData.state || {};
      
      // Test if we have meaningful data in any section
      const hasHeatData = heatData.heaters && Array.isArray(heatData.heaters) && 
                         heatData.heaters.some(heater => heater && typeof heater === 'object' && Object.keys(heater).length > 0);
      const hasGlobalData = Object.keys(globalData).length > 0;
      const hasStateData = Object.keys(stateData).length > 0;
      
      if (hasHeatData || hasGlobalData || hasStateData) {
        duetMode = 'sbc';
        console.log("Detected SBC mode - full object model contains data");
      } else {
        duetMode = 'standalone';
        console.log("Detected Standalone mode - object model structure only");
      }
    } else if (data && typeof data === 'object') {
      // Direct data without result wrapper - likely SBC mode
      duetMode = 'sbc';
      console.log("Detected SBC mode - direct object model format");
    } else {
      throw new Error("Unexpected response format");
    }
    
    return duetMode;
  } catch (error) {
    console.warn(`Mode detection attempt ${modeDetectionAttempts} failed:`, error);
    
    if (modeDetectionAttempts >= MAX_MODE_DETECTION_ATTEMPTS) {
      // Default to standalone mode after max attempts
      duetMode = 'standalone';
      console.log("Defaulting to Standalone mode after failed detection attempts");
    }
    
    return duetMode;
  }
}

// FUNCTION: Fetch object model data using key-specific requests (Standalone mode)
async function fetchObjectModelByKeys() {
  try {
    console.log("Fetching object model using key-specific requests (Standalone mode)");
    
    // Define the keys we need and fetch them in parallel
    const keyRequests = [
      fetchData(`${activeStatusURL}?key=heat&flags=vn`),
      fetchData(`${activeStatusURL}?key=global&flags=vn`), 
      fetchData(`${activeStatusURL}?key=state&flags=vn`),
      fetchData(`${activeStatusURL}?key=boards&flags=vn`),
      fetchData(`${activeStatusURL}?key=fans&flags=vn`),
      fetchData(`${activeStatusURL}?key=spindles&flags=vn`)
    ];
    
    const [heatResponse, globalResponse, stateResponse, boardsResponse, fansResponse, spindlesResponse] = 
      await Promise.all(keyRequests);
    
    // Construct the consolidated data structure
    const consolidatedData = {
      result: {
        heat: heatResponse.result || {},
        global: globalResponse.result || {},
        state: stateResponse.result || {},
        boards: boardsResponse.result || [],
        fans: fansResponse.result || [],
        spindles: spindlesResponse.result || []
      }
    };
    
    console.log("Successfully consolidated standalone mode data", consolidatedData);
    return consolidatedData;
    
  } catch (error) {
    console.error("Error fetching object model by keys:", error);
    
    // Fallback: try to get basic structure from full model call
    console.log("Attempting fallback to full model request");
    try {
      const fallbackData = await fetchData(activeStatusURL);
      console.log("Fallback successful");
      return fallbackData;
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      throw error; // Throw original error
    }
  }
}

// FUNCTION: Fetch & update Duet Object Model via HTTP GET requests with dual-stream support
function updateObjectModel() {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch from both controllers in parallel
      console.log("Fetching data from both main controller and expansion controller...");
      
      // Detect mode for main controller only (expansion uses simple heat endpoint)
      const mainMode = await detectDuetMode();
      
      // Fetch data from both controllers based on their modes
      let mainDataPromise, expansionDataPromise;
      
      if (mainMode === 'standalone') {
        mainDataPromise = fetchObjectModelByKeys();
      } else {
        mainDataPromise = fetchData(activeStatusURL);
      }
      
      // Expansion controller only needs heat data - always use the specific heat endpoint
      expansionDataPromise = fetchExpansionData(`${expansionStatusURL}?key=heat&flags=vn`);
      
      // Fetch data with error handling for expansion controller
      let mainData, expansionData;
      try {
        [mainData, expansionData] = await Promise.all([mainDataPromise, expansionDataPromise]);
      } catch (error) {
        console.warn("Error fetching from one or both controllers:", error);
        // If expansion controller fails, still try to get main controller data
        try {
          mainData = await mainDataPromise;
          console.log("Main controller data retrieved despite expansion controller error");
        } catch (mainError) {
          console.error("Main controller also failed:", mainError);
          throw mainError;
        }
        
        // Create empty expansion heat data if expansion controller failed
        expansionData = { 
          key: "heat", 
          flags: "vn", 
          result: { 
            heaters: [],
            bedHeaters: [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]
          } 
        };
        console.log("Using empty expansion heat data due to controller unavailability");
      }
      
      console.log(`Fetched main data using ${mainMode} mode, expansion data using heat endpoint`);

      // Extract data from both controllers
      const mainActualData = mainData.result || mainData;
      const expansionActualData = expansionData.result || expansionData;
      
      // Merge heating data - combine main controller (extruders + beds 0-3) with expansion (beds 4-9)
      const mainHeatData = mainActualData.heat || {};
      const expansionHeatData = expansionActualData.heat || {};
      
      // Create merged heater arrays
      const mergedHeaters = [...(mainHeatData.heaters || [])]; // Start with all main heaters
      const mergedBedHeaters = [...(mainHeatData.bedHeaters || [])]; // Start with main bed heaters (0-3)
      
      // Ensure mergedBedHeaters array is properly sized (initialize empty slots for beds 4-9)
      while (mergedBedHeaters.length < 10) {
        mergedBedHeaters.push(-1); // Initialize unused slots with -1
      }
      
      // Add expansion bed heaters (4-9) from heater indices 8-13
      if (expansionHeatData.heaters && expansionHeatData.heaters.length > 8) {
        // Expansion controller has bed heaters at indices 8-13 (mapping to beds 4-9)
        for (let i = 8; i < Math.min(14, expansionHeatData.heaters.length); i++) {
          const expansionHeater = expansionHeatData.heaters[i];
          
          // Check if this is a valid heater (not null and has properties)
          if (expansionHeater !== null && expansionHeater !== undefined) {
            // Add to merged heaters array (append to main heaters)
            const mergedHeaterIndex = mergedHeaters.length;
            mergedHeaters.push(expansionHeater);
            
            // Map expansion heater index 8-13 to bed positions 4-9
            const bedHeaterIndex = i - 4; // 8->4, 9->5, 10->6, 11->7, 12->8, 13->9
            if (bedHeaterIndex < 10) { // Maximum 10 bed heaters supported
              mergedBedHeaters[bedHeaterIndex] = mergedHeaterIndex;
            }
          }
        }
      }
      
      // Create merged heat data structure
      const mergedHeatData = {
        ...mainHeatData,
        heaters: mergedHeaters,
        bedHeaters: mergedBedHeaters
      };
      
      // Create consolidated actualData with merged heating information
      const actualData = {
        ...mainActualData,
        heat: mergedHeatData
      };
      
      // Use the existing variable names for compatibility
      const data = { result: actualData };
      
      console.log("Merged heating data from both controllers:", {
        totalHeaters: mergedHeaters.length,
        totalBedHeaters: mergedBedHeaters.length,
        mainHeaters: mainHeatData.heaters?.length || 0,
        expansionHeaters: expansionHeatData.heaters?.length || 0
      });

      // FUNCTION: Find configured heaters in Duet Object Model
      function findHeaters(targetObject) {
        return targetObject
          .map((element, index) => (element !== -1 ? [element, index] : null))
          .filter(Boolean);
      }

      /**
       * ~~~ FUNCTION updateUIdata ~~~
       *
       * Updates the user interface elements with specified class based on the provided data.
       *
       * @param {Array} targetObject - The array of data objects to extract values from.
       * @param {string} targetProperty - The property of each object in targetObject to be extracted and updated.
       * @param {string} targetClass - The class name of the HTML elements to be updated.
       * @returns {Array|null} - An array containing the extracted values if the update is successful,
       *                        or null if there is a mismatch in the number of elements and data objects.
       */

      function updateUIdata(
        objectDescription,
        targetObject,
        targetProperty,
        targetClass,
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters,
        endText = ""
      ) {
        let outputData = [];

        for (let i = 0; i < targetObject.length; i++) {
          outputData[i] = targetObject[i][targetProperty];
        }

        let elementsWithClass = [];

        switch (objectDescription) {
          case "extruderHeaters":
            outputData = outputData.slice(0, 4);
            elementsWithClass = document.querySelectorAll(targetClass);
            outputData = updateText(elementsWithClass, outputData, endText);
            return outputData;
          case "bedHeaters":
            outputData = outputData.slice(4, 8);
            elementsWithClass = document.querySelectorAll(targetClass);
            outputData = updateText(elementsWithClass, outputData, endText);
            return outputData;
          case "chamberHeaters":
            elementsWithClass = document.querySelectorAll(targetClass);
            outputData = updateText(elementsWithClass, outputData, endText);
            return outputData;
          case "allHeaters":
            return outputData;
          case "activePreheatAllHeaters":
            elementsWithClass = document.querySelectorAll(targetClass);
            outputData = updateText(elementsWithClass, outputData, endText);
            return outputData;
          default: {
            console.error("Invalid objectDescription:", objectDescription);
            return null;
          }
        }
      }

      function updateText(heater, outputData, endText) {
        heater.forEach((element, index) => {
          if (typeof outputData[index] === "string") {
            element.textContent = outputData[index] === "standby"
                ? "preheat"
                : outputData[index] + endText;
            element.style.color = outputData[index] === "Fault" ? "red" : "white";
          } else {
            if (Math.round(Number(element.textContent)) === -273) {
              element.textContent = "0" + endText;
            } else {
              element.textContent = outputData[index] + endText;
            }
          }
        });
        return outputData; // Output extracted values
      }

      // Debug: Log the response to understand structure
      console.log("RRF Response:", data);
      
      // actualData is already created above with merged heating information
      
      // Call FUNCTIONS - Handle RRF object model structure with fallbacks
      const heatData = actualData.heat || {};
      const globalData = actualData.global || {};
      const stateData = actualData.state || {};
      const boardsData = actualData.boards || [];
      const fansData = actualData.fans || [];
      const spindlesData = actualData.spindles || [];
      
      const configuredHeatersAll = findHeaters(heatData.heaters || []);
      const configuredBedHeaters = findHeaters(heatData.bedHeaters || []);
      const configuredChamberHeaters = findHeaters(heatData.chamberHeaters || []);
      const configuredExtruderHeaters = configuredHeatersAll.slice(
        0,
        defaultNumOfExtruderHeaters
      );
      const cncSpindle = spindlesData[0] || {};

      // Show only the configured main controller bed heaters (0-3)
      // Beds 4-9 are permanently visible, so only process beds 0-3 here
      const mainConfiguredBedHeaters = configuredBedHeaters.slice(0, 4); // Only take first 4 beds
      
      mainConfiguredBedHeaters.forEach((element, index) => {
        document
          .querySelectorAll(`.bed${index}`)
          .forEach((element) => (element.style.visibility = "visible"));
      });

      mainConfiguredBedHeaters.forEach((element, index) => {
        const tabElement = document.querySelectorAll(`.temp-tab-link.heater`)[index + 4];
        if (tabElement) {
          tabElement.style.display = "flex";
        }
      });

      // update Extruder Current Temp
      const extruderHeaterTemps = updateUIdata(
        "extruderHeaters",
        heatData.heaters || [],
        "current",
        ".temp-data.extruder",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters,
        "°C"
      );

      // update Extruder Active Temp
      const extruderHeaterActiveTemps = updateUIdata(
        "activePreheatAllHeaters",
        heatData.heaters || [],
        "active",
        ".user-input-temp.active",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // update Extruder Preheat (Standby) Temp
      const extruderHeaterPreheatTemps = updateUIdata(
        "activePreheatAllHeaters",
        heatData.heaters || [],
        "standby",
        ".user-input-temp.preheat",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      const extruderHeaterStates = updateUIdata(
        "extruderHeaters",
        heatData.heaters || [],
        "state",
        ".temp-state.extruder",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      const bedHeaterTemps = updateUIdata(
        "bedHeaters",
        heatData.heaters || [],
        "current",
        ".temp-data.bed",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters,
        "°C"
      );

      // update Bed Active Temp
      const bedHeaterActiveTemps = updateUIdata(
        "activePreheatAllHeaters",
        heatData.heaters || [],
        "active",
        ".user-input-temp.active",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // update Bed Preheat (Standby) Temp
      const bedHeaterPreheatTemps = updateUIdata(
        "activePreheatAllHeaters",
        heatData.heaters || [],
        "standby",
        ".user-input-temp.preheat",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      const bedHeaterStates = updateUIdata(
        "bedHeaters",
        heatData.heaters || [],
        "state",
        ".temp-state.bed",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // const chamberHeaterTemps = updateUIdata('chamberHeaters', actualData.heat.heaters, 'current', '.temp-data.chamber', configuredExtruderHeaters, configuredBedHeaters, configuredChamberHeaters, '°C');
      // const chamberHeaterStates = updateUIdata('chamberHeaters', actualData.heat.heaters, 'state', '.temp-state.chamber', configuredExtruderHeaters, configuredBedHeaters, configuredChamberHeaters);

      const allHeaterTemps = updateUIdata(
        "allHeaters",
        heatData.heaters || [],
        "current",
        ".temp-data",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters,
        "°C"
      );
      const allHeaterStates = updateUIdata(
        "allHeaters",
        heatData.heaters || [],
        "state",
        ".temp-state",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // You can assign these elements to a global variable if needed
      globalObjectModelResult = {
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters,
        extruderHeaterTemps,
        extruderHeaterStates,
        bedHeaterTemps,
        bedHeaterStates,
        //chamberHeaterTemps,
        //chamberHeaterStates,
        allHeaterTemps,
        allHeaterStates,
        cncSpindle,
      };

      // Change extruder glow
      if (extruderHeaterStates.includes("active") || extruderHeaterStates.includes("standby") || extruderHeaterStates.includes("tuning")) {
        document
          .querySelectorAll(".radial-gradient-background.extruder")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-orange.extruder")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-red.extruder")
          .forEach((element) => (element.style.display = "inline-block"));
        // Warning On
        document.getElementById("extruder-hot-icon").style.display = "flex";
      } else {
        if (extruderHeaterTemps.some((temp) => temp > 50 && temp < 2000)) {
          // cool temp = 50 °C
          document
            .querySelectorAll(".radial-gradient-background.extruder")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background-red.extruder")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background-orange.extruder")
            .forEach((element) => (element.style.display = "inline-block"));
          // Warning On
          document.getElementById("extruder-hot-icon").style.display = "flex";
        } else {
          document
            .querySelectorAll(".radial-gradient-background-red.extruder")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background-orange.extruder")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background.extruder")
            .forEach((element) => (element.style.display = "inline-block"));
          // Warning Off
          document.getElementById("extruder-hot-icon").style.display = "none";
        }
      }

      // Change bed glow
      if (bedHeaterStates.includes("active") || bedHeaterStates.includes("standby") || bedHeaterStates.includes("tuning")) {
        document
          .querySelectorAll(".radial-gradient-background.bed")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-orange.bed")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-red.bed")
          .forEach((element) => (element.style.display = "inline-block"));
        // Warning On
        document.getElementById("bed-hot-icon").style.display = "flex";
      } else {
        if (bedHeaterTemps.some((temp) => temp > 50 && temp < 2000)) {
          // cool temp = 50 °C
          document
            .querySelectorAll(".radial-gradient-background.bed")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background-red.bed")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background-orange.bed")
            .forEach((element) => (element.style.display = "inline-block"));
          // Warning On
          document.getElementById("bed-hot-icon").style.display = "flex";
        } else {
          document
            .querySelectorAll(".radial-gradient-background-red.bed")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background-orange.bed")
            .forEach((element) => (element.style.display = "none"));
          document
            .querySelectorAll(".radial-gradient-background.bed")
            .forEach((element) => (element.style.display = "inline-block"));
          // Warning Off
          document.getElementById("bed-hot-icon").style.display = "none";
        }
      }

      // Enhanced Heater fault error Popup with debugging and timing controls
      let anyHeaterHasFault = false;
      
      // Check if fault detection should be suspended
      const currentTime = Date.now();
      const timeSinceLastReset = currentTime - lastFaultResetTime;
      const globalSuspension = faultDetectionSuspended || (timeSinceLastReset < FAULT_RESET_DELAY);
      
      if (globalSuspension && (window.epicurusDebug && window.epicurusDebug.debugHeaterFaults)) {
        console.log(`Global fault detection suspended. Time since last reset: ${timeSinceLastReset}ms, Suspended: ${faultDetectionSuspended}`);
      }
      
      for (let i = 0; i < allHeaterStates.length; i++) {
        const currentState = allHeaterStates[i];
        const isFaulted = heaterFaults[i];
        
        // Check if this specific heater should have suspension (per-heater + global)
        const heaterSuspensionTime = perHeaterSuspension[i] || 0;
        const heaterSuspended = heaterSuspensionTime > 0 && (currentTime - heaterSuspensionTime < FAULT_RESET_DELAY);
        const shouldSuspendThisHeater = globalSuspension || heaterSuspended;
        
        // Check both the processed state and raw heater data for fault conditions
        const hasStateFault = currentState && (
          currentState.toString().toLowerCase().includes("fault") ||
          currentState.toString().toUpperCase().includes("FAULT")
        );
        
        const hasRawFault = heatData.heaters && heatData.heaters[i] && 
          heatData.heaters[i].state && 
          heatData.heaters[i].state.toLowerCase() === "fault";
        
        const isFaultCondition = hasStateFault || hasRawFault;
        
        // Track if any heater has a fault (for reset button visibility) - this should always work
        if (isFaultCondition) {
          anyHeaterHasFault = true;
        }
        
        // Only log when a fault is detected or for debugging
        if (isFaultCondition || (window.epicurusDebug && window.epicurusDebug.debugHeaterFaults)) {
          console.log(`Heater ${i}: state="${currentState}", rawState="${heatData.heaters?.[i]?.state}", faulted=${isFaulted}, hasFault=${isFaultCondition}, suspended=${shouldSuspendThisHeater} (global: ${globalSuspension}, heater: ${heaterSuspended})`);
        }
        
        // Skip popup if fault detection is suspended for this heater
        if (isFaultCondition && !isFaulted && !shouldSuspendThisHeater) {
          console.warn(`⚠️  HEATER FAULT DETECTED: Heater ${i + 1} has faulted!`);
          
          // Use setTimeout to ensure the popup doesn't interfere with the update loop
          setTimeout(() => {
            const resetFault = window.confirm(
              `🔥 HEATER FAULT DETECTED! 🔥\n\nHeater ${i + 1} has a temperature fault.\n\nReset the fault? If fault persists, contact local distributor or Rapid Fusion for support.`
            );
            
            if (resetFault) {
              console.log(`User chose to reset fault for heater ${i + 1}`);
              sendGcode(`M292`); // Clear all messages first
              sendGcode(`M562 P${i}`); // Reset specific heater fault
              heaterFaults[i] = true;
              
              // Set per-heater suspension timestamp
              perHeaterSuspension[i] = Date.now();
              
              // Also suspend global fault detection to prevent duplicate popups
              suspendFaultDetection(`Individual heater ${i + 1} fault reset`);
              
              // Reset the fault flag after extended delay (longer than suspension)
              setTimeout(() => {
                heaterFaults[i] = false;
                console.log(`Fault flag cleared for heater ${i + 1}`);
              }, FAULT_RESET_DELAY + 1000); // 1 second longer than suspension to ensure no race conditions
            } else {
              console.log(`User declined to reset fault for heater ${i + 1} - will not ask again`);
              heaterFaults[i] = true; // Mark as handled permanently to prevent repeated popups
            }
          }, 100); // Small delay to avoid blocking the update loop
        }
      }

      // Show/hide Reset All Heater Faults button in header
      const resetAllFaultsButton = document.getElementById("reset-all-heater-faults");
      if (resetAllFaultsButton) {
        // Hide button if no faults OR if we just sent a reset command (give time for Duet to clear)
        if (!anyHeaterHasFault || globalSuspension) {
          resetAllFaultsButton.style.display = "none";
        } else {
          resetAllFaultsButton.style.display = "flex";
        }
      }

      // CNC Spindle Speed Live Control
      if (spindleRunning === true && globalData.EstopFault === false) {
        document.getElementById(
          "radial-gradient-background-cnc-white"
        ).style.display = "none";
        document.getElementById(
          "radial-gradient-background-cnc-red"
        ).style.display = "inline-block";
        // Warning On
        document.getElementById("cnc-running-icon").style.display = "flex";

        // Update Spindle RPM from Duet Object Model
        // document.getElementById("speedSlider").value = cncSpindle.current;
        // updateSliderBackground();
        // spindleSpeed = cncSpindle.current;

        updatedSpindleSpeed = document.getElementById("speedValue").textContent;
        sendGcode(`M3 P0 S${spindleSpeed}`); // run spindle clockwise at slider rpm
        spindleSpeed = updatedSpindleSpeed;
        spindleOff == false;

      } else {
        document.getElementById(
          "radial-gradient-background-cnc-red"
        ).style.display = "none";
        document.getElementById(
          "radial-gradient-background-cnc-white"
        ).style.display = "inline-block";
        // Warning Off
        document.getElementById("cnc-running-icon").style.display = "none";
        if (spindleOff == false) {
          sendGcode(`M5`);
          spindleOff == true;
        }
      }

      // Fault Detection - E-stop Popup
      const popup = document.getElementById('e-stop-popup');
      const popupSpace = document.getElementById('e-stop-popup-space');

      if (globalData.EstopFault === true) {
        popupSpace.style.display = "flex"; // Show Background blur
        popup.style.display = "flex"; // Ensure popup is visible
      } else {
        popupSpace.style.display = "none"; // Remove Background blur
        popup.style.display = "none"; // Disable popup
      }      

      // Major Fault Detection - Extruder Servo & Spindle Motor
      // JavaScript to control the visibility and flashing effect
      if (globalData.toolState === "PE320" && globalData.ExtruderFault === true) {
        document.getElementById("fault-condition-1").textContent = "Extruder Servo Fault";
        document.getElementById("fault-condition-1").style.display = "flex";
        document.getElementById("fault-warning-container").style.display = "flex";
      } else if (globalData.toolState === "CNC" && globalData.CNCFault === true) {
        document.getElementById("fault-condition-2").textContent = "Spindle Motor Fault";
        document.getElementById("fault-condition-2").style.display = "flex";
        document.getElementById("fault-warning-container").style.display = "flex";
      } else if (globalData.toolState === "No Tool" || globalData.toolState === "Open Circuit" || globalData.toolState === "Short Circuit") {
        document.getElementById("fault-condition-1").textContent = globalData.toolState;
        document.getElementById("fault-condition-1").style.display = "flex";
        document.getElementById("fault-warning-container").style.display = "flex";
      } else {
        document.getElementById("fault-condition-1").style.display = "none";
        document.getElementById("fault-condition-2").style.display = "none";
        document.getElementById("fault-warning-container").style.display = "none";
      }

      // Fault Detection - CNC Mill Fault Popup
      if (globalData.CNCFault === true) {
        sendGcode(`M5`);
        confirmationModal.style.display = 'none';
        slider.disabled = true; // Ensure slider is disabled on page load
        speedControlTitle.textContent = 'Speed Control Locked'; // Set initial state to locked
        sliderUnlocked = false; // Initial state is locked
        updateLockIcon(); // Ensure icon is correctly set on load
        speedValueDisplay.classList.add('grayed-out');
        spindleOff == true;
      }

      switch (globalData.toolState) {
        case "PE320":
          console.log("Tool state: PE320 Pellet Extruder Connected");
          document.getElementById("tool-detection-pe320").style.display = "flex";
          document.getElementById("extruder-warning-icon").style.display = "none";
          document.getElementById("tool-detection-cnc").style.display = "flex";
          document.getElementById("cnc-warning-icon").style.display = "none";

          document.getElementById("tool-detection-pe320").textContent = "\u00A0- Connected";
          document.getElementById("tool-detection-pe320").style.color = "#a74e9e"; // Resetting color if previously set
          document.getElementById("tool-detection-cnc").textContent = "\u00A0- Disconnected";
          document.getElementById("tool-detection-cnc").style.color = ""; // Resetting color if previously set

          document.getElementById("extruder-state-container").style.opacity = 1;
          document.getElementById("cnc-state-container").style.opacity = 0.6;
          document.getElementById("extruder-state-container").style.pointerEvents = "auto";
          document.getElementById("cnc-state-container").style.pointerEvents = "none";

          resetCNCUI();
          document.querySelector(".start-text").innerHTML = `
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="#a74e9e" viewBox="0 0 24 24" style="vertical-align: middle;">
                <rect x="5" y="0" width="4" height="18"></rect>
                <rect x="15" y="0" width="4" height="18"></rect>
            </svg> Not Ready`;
          document.getElementById("startSpindle").style.pointerEvents = "none";
          document.getElementById("unlockButtonContainer").style.pointerEvents = "none";
          document.getElementById("indicatorText").textContent = "Spindle is Not Ready";
          document.getElementById("indicatorLight").style.backgroundColor = "Yellow";
          break;
          
        case "CNC":
          console.log("Tool state: CNC Mill Connected");
          document.getElementById("tool-detection-pe320").style.display = "flex";
          document.getElementById("extruder-warning-icon").style.display = "none";
          document.getElementById("tool-detection-cnc").style.display = "flex";
          document.getElementById("cnc-warning-icon").style.display = "none";

          document.getElementById("tool-detection-pe320").textContent = "\u00A0- Disconnected";
          document.getElementById("tool-detection-pe320").style.color = "";
          document.getElementById("tool-detection-cnc").textContent = "\u00A0- Connected";
          document.getElementById("tool-detection-cnc").style.color = "#a74e9e"; // Resetting color if previously set
          
          document.getElementById("extruder-state-container").style.opacity = 0.6;
          document.getElementById("cnc-state-container").style.opacity = 1;
          document.getElementById("extruder-state-container").style.pointerEvents = "none";
          document.getElementById("cnc-state-container").style.pointerEvents = "auto";

          document.getElementById("startSpindle").style.pointerEvents = "auto";
          document.getElementById("unlockButtonContainer").style.pointerEvents = "auto";

          document.querySelector(".start-text").textContent = "▶ Start Spindle";
          if (globalData.EstopFault === false && globalData.CNCFault === false) {
            if (spindleRunning == false) {
              document.getElementById("indicatorText").textContent = "Spindle is Ready";
              document.getElementById("indicatorLight").style.backgroundColor = "Green";
              // Stop Spindle is handled in .stop-text class which is hidden by default
            } else {
              document.getElementById("indicatorText").textContent = "Caution: Spindle is Running";
              document.getElementById("indicatorLight").style.backgroundColor = "Red";
            }
          } else {
              document.getElementById("stopSpindle").click();
              document.getElementById("confirmYes").click();
              document.getElementById("indicatorText").textContent = "Spindle is Not Ready";
              document.getElementById("indicatorLight").style.backgroundColor = "Yellow";
              resetCNCUI();
          }
          break;
      
        case "No Tool":
          console.log("Tool state: No Tool Connected");
          document.getElementById("tool-detection-pe320").style.display = "flex";
          document.getElementById("extruder-warning-icon").style.display = "none";
          document.getElementById("tool-detection-cnc").style.display = "flex";
          document.getElementById("cnc-warning-icon").style.display = "none";

          document.getElementById("tool-detection-pe320").textContent = "\u00A0- Disconnected";
          document.getElementById("tool-detection-pe320").style.color = "";
          document.getElementById("tool-detection-cnc").textContent = "\u00A0- Disconnected";
          document.getElementById("tool-detection-cnc").style.color = ""; // Resetting color if previously set

          document.getElementById("extruder-state-container").style.opacity = 0.6;
          document.getElementById("cnc-state-container").style.opacity = 0.6;
          document.getElementById("extruder-state-container").style.pointerEvents = "none";
          document.getElementById("cnc-state-container").style.pointerEvents = "none";

          resetCNCUI();
          document.querySelector(".start-text").innerHTML = `
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="#a74e9e" viewBox="0 0 24 24" style="vertical-align: middle;">
                <rect x="5" y="0" width="4" height="18"></rect>
                <rect x="15" y="0" width="4" height="18"></rect>
            </svg> Not Ready`;
          document.getElementById("startSpindle").style.pointerEvents = "none";
          document.getElementById("unlockButtonContainer").style.pointerEvents = "none";
          document.getElementById("indicatorText").textContent = "Spindle is Not Ready";
          document.getElementById("indicatorLight").style.backgroundColor = "Yellow";
          break;

        case "Open Circuit":
          console.log("Tool state: Smart Loom Open Circuit");
          document.getElementById("tool-detection-pe320").style.display = "none";
          document.getElementById("extruder-warning-icon").style.display = "flex";
          document.getElementById("tool-detection-cnc").style.display = "none";
          document.getElementById("cnc-warning-icon").style.display = "flex";

          document.getElementById("tool-detection-pe320").textContent = "\u00A0- Smart Loom Open Circuit";
          document.getElementById("tool-detection-pe320").style.color = "red";
          document.getElementById("tool-detection-cnc").textContent = "\u00A0- Smart Loom Open Circuit";
          document.getElementById("tool-detection-cnc").style.color = "red"; // Resetting color if previously set

          document.getElementById("extruder-state-container").style.opacity = 0.6;
          document.getElementById("cnc-state-container").style.opacity = 0.6;
          document.getElementById("extruder-state-container").style.pointerEvents = "none";
          document.getElementById("cnc-state-container").style.pointerEvents = "none";

          resetCNCUI();
          document.querySelector(".start-text").innerHTML = `
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="#a74e9e" viewBox="0 0 24 24" style="vertical-align: middle;">
                <rect x="5" y="0" width="4" height="18"></rect>
                <rect x="15" y="0" width="4" height="18"></rect>
            </svg> Not Ready`;
          document.getElementById("startSpindle").style.pointerEvents = "none";
          document.getElementById("unlockButtonContainer").style.pointerEvents = "none";
          document.getElementById("indicatorText").textContent = "Spindle is Not Ready";
          document.getElementById("indicatorLight").style.backgroundColor = "Yellow";
          break;

        case "Short Circuit":
          console.log("Tool state: Smart Loom Short Circuit");
          document.getElementById("tool-detection-pe320").style.display = "none";
          document.getElementById("extruder-warning-icon").style.display = "flex";
          document.getElementById("tool-detection-cnc").style.display = "none";
          document.getElementById("cnc-warning-icon").style.display = "flex";

          document.getElementById("tool-detection-pe320").textContent = "\u00A0- Smart Loom Short Circuit";
          document.getElementById("tool-detection-pe320").style.color = "red";
          document.getElementById("tool-detection-cnc").textContent = "\u00A0- Smart Loom Short Circuit";
          document.getElementById("tool-detection-cnc").style.color = "red"; // Resetting color if previously set

          document.getElementById("extruder-state-container").style.opacity = 0.6;
          document.getElementById("cnc-state-container").style.opacity = 0.6;
          document.getElementById("extruder-state-container").style.pointerEvents = "none";
          document.getElementById("cnc-state-container").style.pointerEvents = "none";

          resetCNCUI();
          document.querySelector(".start-text").innerHTML = `
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="#a74e9e" viewBox="0 0 24 24" style="vertical-align: middle;">
                <rect x="5" y="0" width="4" height="18"></rect>
                <rect x="15" y="0" width="4" height="18"></rect>
            </svg> Not Ready`;
          document.getElementById("startSpindle").style.pointerEvents = "none";
          document.getElementById("unlockButtonContainer").style.pointerEvents = "none";
          document.getElementById("indicatorText").textContent = "Spindle is Not Ready";
          document.getElementById("indicatorLight").style.backgroundColor = "Yellow";
          break;
      
        default:
          console.log("Tool state: Duet Disconnected");
          document.getElementById("tool-detection-pe320").style.display = "none";
          document.getElementById("extruder-warning-icon").style.display = "flex";
          document.getElementById("tool-detection-cnc").style.display = "none";
          document.getElementById("cnc-warning-icon").style.display = "flex";
          
          document.getElementById("tool-detection-pe320").textContent = "\u00A0- null";
          document.getElementById("tool-detection-pe320").style.color = "";
          document.getElementById("tool-detection-cnc").textContent = "\u00A0- null";
          document.getElementById("tool-detection-cnc").style.color = ""; // Resetting color if previously set

          document.getElementById("extruder-state-container").style.pointerEvents = "none";
          document.getElementById("cnc-state-container").style.pointerEvents = "none";

          if (localStorage.getItem("toolDetectionState") === "on") {
            document.getElementById("extruder-state-container").style.opacity = 0.6;
            document.getElementById("cnc-state-container").style.opacity = 0.6;
          } else {
            document.getElementById("extruder-state-container").style.opacity = 1;
            document.getElementById("cnc-state-container").style.opacity = 1;
          }

          resetCNCUI();
          document.querySelector(".start-text").innerHTML = `
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="#a74e9e" viewBox="0 0 24 24" style="vertical-align: middle;">
                <rect x="5" y="0" width="4" height="18"></rect>
                <rect x="15" y="0" width="4" height="18"></rect>
            </svg> Not Ready`;
          document.getElementById("startSpindle").style.pointerEvents = "none";
          document.getElementById("unlockButtonContainer").style.pointerEvents = "none";
          document.getElementById("indicatorText").textContent = "Spindle is Not Ready";
          document.getElementById("indicatorLight").style.backgroundColor = "Yellow";
          break;
      }    
      
      // Data Feedback ---------------------------------------------------------------------------------------

      // System Info 

      // Get uptime in seconds
      const uptimeInSeconds = stateData.upTime;
      // Calculate hours, minutes, and seconds
      const hours = Math.floor(uptimeInSeconds / 3600);
      const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
      const seconds = Math.round(uptimeInSeconds % 60); // Round seconds to nearest integer
      // Format the result as "hh:mm:ss"
      const formattedUptime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      // Update the text content
      document.getElementById("uptime-count").textContent = formattedUptime;

      // document.getElementById("controller-version").textContent = see system-pe320/apollo/zeus
      // document.getElementById("product-family").textContent = see system-pe320/apollo/zeus
      // document.getElementById("product-family-tools").textContent = see system-pe320/apollo/zeus
      // document.getElementById("software-version").textContent = see GitHub repo
      document.getElementById("firmware-version").textContent = (boardsData[0] || {}).firmwareVersion;
      document.getElementById("bed-count").textContent = configuredBedHeaters.length;

      // Update & Restart Firmware
      // check-for-updates -- see buttonId
      // restart-firmware -- see buttonId

      // Tool Status
      if (globalData.toolState === null) {
        document.getElementById("connected-tool").textContent = "null";
      } else {
        document.getElementById("connected-tool").textContent = globalData.toolState;
      }
    
      // PE320 Pellet Extruder
      // document.getElementById("extruder-state-container").textContent = "available by default";
      // Check if any heater is in "fault" state
      if (
        ((heatData.heaters || [])[0] || {}).state === "fault" ||
        ((heatData.heaters || [])[1] || {}).state === "fault" ||
        ((heatData.heaters || [])[2] || {}).state === "fault" ||
        ((heatData.heaters || [])[3] || {}).state === "fault"
      ) {
        document.getElementById("extruder-state").textContent = "FAULT";
      }
      // Check if any heater is in "active" state
      else if (
        ((heatData.heaters || [])[0] || {}).state === "active" ||
        ((heatData.heaters || [])[1] || {}).state === "active" ||
        ((heatData.heaters || [])[2] || {}).state === "active" ||
        ((heatData.heaters || [])[3] || {}).state === "active"
      ) {
        document.getElementById("extruder-state").textContent = "ACTIVE";
      }
      // Check if any heater is in "standby" state
      else if (
        ((heatData.heaters || [])[0] || {}).state === "standby" ||
        ((heatData.heaters || [])[1] || {}).state === "standby" ||
        ((heatData.heaters || [])[2] || {}).state === "standby" ||
        ((heatData.heaters || [])[3] || {}).state === "standby"
      ) {
        document.getElementById("extruder-state").textContent = "preheat";
      }
      // Check if all heaters are in "off" state
      else if (
        ((heatData.heaters || [])[0] || {}).state === "off" &&
        ((heatData.heaters || [])[1] || {}).state === "off" &&
        ((heatData.heaters || [])[2] || {}).state === "off" &&
        ((heatData.heaters || [])[3] || {}).state === "off"
      ) {
        document.getElementById("extruder-state").textContent = "OFF";
      }
      // Default to the state of the nozzle heater (heater 3)
      else {
        document.getElementById("extruder-state").textContent = (((heatData.heaters || [])[3] || {}).state || "unknown");
      }

      // document.getElementById("extruder-runtime").textContent = "n/a";
      document.getElementById("material-sensor-left").textContent = globalData.materialSensorLEFT;
      document.getElementById("material-sensor-right").textContent = globalData.materialSensorRIGHT;
      // document.getElementById("heatsink-fan").textContent = see Embedded;
      // document.getElementById("barrel-fan").textContent = see Embedded;

      // Switch case for heatsink fan selection
      switch (document.querySelector('.heatsink-fan-button div').textContent) {
        case "Heatsink Fan 1":
          document.getElementById("heatsink-fan-tach").textContent = (fansData[0] || {}).rpm;
          selectedHeatsinkFan = "0";
          break;
        case "Heatsink Fan 2":
          document.getElementById("heatsink-fan-tach").textContent = (fansData[1] || {}).rpm;
          selectedHeatsinkFan = "0";
          break;
        case "Heatsink Fan 3":
          document.getElementById("heatsink-fan-tach").textContent = (fansData[2] || {}).rpm;
          selectedHeatsinkFan = "0";
          break;
        case "Heatsink Fan 4":
          document.getElementById("heatsink-fan-tach").textContent = (fansData[3] || {}).rpm;
          selectedHeatsinkFan = "0";
          break;
        default:
          document.getElementById("heatsink-fan-tach").textContent = "Config Error";
      }

      // Switch case for barrel fan selection
      switch (document.querySelector('.barrel-fan-button div').textContent) {
        case "Barrel Fan 1":
          document.getElementById("barrel-fan-tach").textContent = (fansData[4] || {}).rpm;
          selectedBarrelFan = "4";
          break;
        case "Barrel Fan 2":
          document.getElementById("barrel-fan-tach").textContent = (fansData[5] || {}).rpm;
          selectedBarrelFan = "5";
          break;
        case "Barrel Fan 3":
          document.getElementById("barrel-fan-tach").textContent = (fansData[6] || {}).rpm;
          selectedBarrelFan = "6";
          break;
        default:
          document.getElementById("barrel-fan-tach").textContent = "Config Error";
      }

      // CNC Mill
      // document.getElementById("cnc-state-container").textContent = formattedUptime;
      document.getElementById("cnc-state").textContent = ((spindlesData[0] || {}).state);
      // document.getElementById("cnc-runtime").textContent = "n/a";
      document.getElementById("cnc-speed").textContent = (spindlesData[0] || {}).current;
      
      // Resolve the promise with the result
      resolve(globalObjectModelResult);
    } catch (error) {
      console.error("Error updating Object Model:", error);
      // Reject the promise with the error
      reject(error);
    }
  });
}

// Polling configuration
const POLL_INTERVAL = 1000; // 1 second - faster updates for better responsiveness
const POLL_INTERVAL_SLOW = 5000; // 5 seconds - when errors occur
const POLL_INTERVAL_FAST = 500; // 0.5 seconds - when actively monitoring (optional)

let currentPollInterval = POLL_INTERVAL;
let consecutiveErrors = 0;
let updateIntervalId = null;

// Fault detection timing controls
let lastFaultResetTime = 0;
const FAULT_RESET_DELAY = 8000; // 8 seconds after M562 before resuming fault detection (increased for better stability)
let faultDetectionSuspended = false;
let perHeaterSuspension = new Array(defaultNumOfHeaters).fill(0); // Track individual heater suspension timestamps

// FUNCTION: Suspend fault detection after M562 commands
function suspendFaultDetection(reason = "M562 command sent") {
  console.log(`🔇 Suspending fault detection: ${reason}`);
  faultDetectionSuspended = true;
  lastFaultResetTime = Date.now();
  
  // Auto-resume after delay
  setTimeout(() => {
    faultDetectionSuspended = false;
    console.log(`🔔 Fault detection resumed after ${FAULT_RESET_DELAY}ms delay`);
  }, FAULT_RESET_DELAY);
}

// Function to continuously check the server status and send commands once on state change from error to available
async function pollServerAndSendOnceOnStateChange() {
  let serverWasUnavailable = true; // Track whether the server was previously in an error state

  while (true) {
    try {
      // Use the same dual strategy approach for polling
      const mode = await detectDuetMode();
      let response;
      
      if (mode === 'standalone') {
        response = await fetchObjectModelByKeys();
      } else {
        response = await fetchData(activeStatusURL);
      }

      // Check if response includes a 503 status
      if (response.status && response.status === 503) {
        console.log("503 Service Unavailable. Polling again after delay...");
        serverWasUnavailable = true; // Update the server state as unavailable
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue; // Keep polling if the server is unavailable
      }

      console.log("Server is available.");

      // Only send commands once after server becomes available
      if (serverWasUnavailable) {
        console.log("Server state changed to available. Sending G-code commands once...");
        await sendCommandsOnce();
        serverWasUnavailable = false; // Update state to reflect that commands have been sent
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    } catch (error) {
      console.error(`Error checking server status: ${error}`);
      serverWasUnavailable = true; // Treat any fetch error as a temporary unavailability
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL)); // Delay before retrying
    }
  }
}

// Function to send G-code commands based on states in localStorage using fetchData
async function sendCommandsOnce() {
  try {
    const partCoolingState = localStorage.getItem("partCoolingState") || "off";
    console.log(`Sending G-code for partCoolingState: ${partCoolingState}`);

    if (partCoolingState === "on") {
      if (document.getElementById("part-cooling-on").style.display === "none") {
        document.getElementById("part-cooling-toggle").click();
      }
      await sendGcode('set global.partCooling = true');
      await sendGcode('M98 P"Part cooling on.g"');
    } else {
      await sendGcode('set global.partCooling = false');
      await sendGcode('M98 P"Part cooling off.g"');
    }

    const bedFixturePlateState = localStorage.getItem("bedFixturePlateState") || "off";
    console.log(`Sending G-code for bedFixturePlateState: ${bedFixturePlateState}`);

    if (bedFixturePlateState === "on") {
      if (document.getElementById("bed-fixture-plate-on").style.display === "none") {
        document.getElementById("bed-fixture-plate-toggle").click();
      }
      await sendGcode('set global.bedFixturePlate = true');
      await sendGcode('M98 P"Bed_PID_fixture_plate_on.g"');
    } else {
      await sendGcode('set global.bedFixturePlate = false');
      await sendGcode('M98 P"Bed_PID_fixture_plate_off.g"');
    }

    console.log("All commands executed successfully.");

  } catch (error) {
    console.error(`Error executing G-code commands: ${error}`);
  }
}

// Function to send individual G-code command with retry logic for 503 and unknown variable errors using fetchData
async function sendGcode(gcode) {
  while (true) {
    try {
      const response = await fetchData(`${activeCodeURL}?gcode=${encodeURIComponent(gcode)}`);

      if (response.status && response.status === 503) {
        console.warn("503 Service Unavailable while sending G-code. Retrying...");
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue; // Retry if server returns 503 error
      }

      // Check for unknown variable error in the response text
      if (typeof response === "string" && response.includes("Error: unknown variable")) {
        console.warn(`Unknown variable error detected in response. Retrying G-code '${gcode}'...`);
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue; // Retry if unknown variable error is present
      }

      console.log(`Response from sending G-code '${gcode}': ${response}`);
      return response; // Exit loop on successful command execution without errors

    } catch (error) {
      console.error(`Error sending G-code '${gcode}': ${error}`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL)); // Delay before retrying
    }
  }
}

// Function to send individual G-code command to expansion controller with retry logic
async function sendExpansionGcode(gcode) {
  while (true) {
    try {
      const response = await fetchExpansionData(`${expansionCodeURL}?gcode=${encodeURIComponent(gcode)}`);

      if (response.status && response.status === 503) {
        console.warn("503 Service Unavailable while sending G-code to expansion controller. Retrying...");
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue; // Retry if server returns 503 error
      }

      // Check for unknown variable error in the response text
      if (typeof response === "string" && response.includes("Error: unknown variable")) {
        console.warn(`Unknown variable error detected in expansion controller response. Retrying G-code '${gcode}'...`);
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue; // Retry if unknown variable error is present
      }

      console.log(`Response from expansion controller sending G-code '${gcode}': ${response}`);
      return response; // Exit loop on successful command execution without errors

    } catch (error) {
      console.error(`Error sending G-code to expansion controller '${gcode}': ${error}`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL)); // Delay before retrying
    }
  }
}

// Start the continuous polling process
pollServerAndSendOnceOnStateChange();

// FUNCTION: call updateObjectModel & retrieve results with adaptive polling
async function update() {
  try {
    ({
      configuredExtruderHeaters,
      configuredBedHeaters,
      configuredChamberHeaters,
      extruderHeaterTemps,
      extruderHeaterStates,
      bedHeaterTemps,
      bedHeaterStates,
      //chamberHeaterTemps,
      //chamberHeaterStates,
      allHeaterTemps,
      allHeaterStates,
      cncSpindle,
    } = await updateObjectModel());
    
    // Success - reset error count and use normal polling
    consecutiveErrors = 0;
    if (currentPollInterval !== POLL_INTERVAL) {
      console.log("Connection stable, returning to normal polling interval");
      currentPollInterval = POLL_INTERVAL;
      restartPolling();
    }
    
  } catch (error) {
    console.error("Error in update():", error);
    consecutiveErrors++;
    
    // Adaptive polling - slow down when errors occur
    if (consecutiveErrors >= 3 && currentPollInterval !== POLL_INTERVAL_SLOW) {
      console.log(`${consecutiveErrors} consecutive errors, slowing polling to ${POLL_INTERVAL_SLOW}ms`);
      currentPollInterval = POLL_INTERVAL_SLOW;
      restartPolling();
    }
  }
}

// FUNCTION: Restart polling with new interval
function restartPolling() {
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
  }
  updateIntervalId = setInterval(update, currentPollInterval);
  console.log(`Polling restarted with ${currentPollInterval}ms interval`);
}

// FUNCTION: Stop polling (useful for debugging or manual control)
function stopPolling() {
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
    updateIntervalId = null;
    console.log("Polling stopped");
  }
}

// FUNCTION: Start polling (useful for debugging or manual control)  
function startPolling(interval = POLL_INTERVAL) {
  stopPolling();
  currentPollInterval = interval;
  updateIntervalId = setInterval(update, currentPollInterval);
  console.log(`Polling started with ${currentPollInterval}ms interval`);
}

// FUNCTION: Get current polling status (useful for debugging)
function getPollingStatus() {
  return {
    isPolling: updateIntervalId !== null,
    currentInterval: currentPollInterval,
    consecutiveErrors,
    isConnected,
    availableIntervals: {
      normal: POLL_INTERVAL,
      slow: POLL_INTERVAL_SLOW, 
      fast: POLL_INTERVAL_FAST
    }
  };
}

// Expose polling controls globally for debugging
window.epicurusDebug = {
  stopPolling,
  startPolling,
  getPollingStatus,
  testConnection: testDuetConnection,
  updateIP: updateDuetIP,
  getConnectionStatus,
  toggleHeaterState: (state, index) => toggleHeaterStates(state, index),
  sendGcode: (command) => sendGcode(command),
  testHeaterClick: (index) => {
    const containers = document.querySelectorAll(".temp-state-container");
    if (containers[index]) {
      containers[index].click();
    } else {
      console.error(`No heater container found at index ${index}`);
    }
  },
  simulateFault: (heaterIndex) => {
    console.log(`🧪 Simulating fault on heater ${heaterIndex}`);
    heaterFaults[heaterIndex] = false; // Reset flag to allow popup
    
    const resetFault = window.confirm(
      `🔥 HEATER FAULT DETECTED! 🔥\n\nHeater ${heaterIndex + 1} has a temperature fault.\n\nReset the fault? If fault persists, contact local distributor or Rapid Fusion for support.`
    );
    
    if (resetFault) {
      console.log(`User chose to reset fault for heater ${heaterIndex + 1}`);
      sendGcode(`M292`); // Clear all messages first
      sendGcode(`M562 P${heaterIndex}`); // Reset specific heater fault
      heaterFaults[heaterIndex] = true; // Mark as handled
      
      // Use same suspension mechanism as real faults
      suspendFaultDetection(`Simulated heater ${heaterIndex + 1} fault reset`);
      
      setTimeout(() => {
        heaterFaults[heaterIndex] = false; // Reset after delay for monitoring
      }, FAULT_RESET_DELAY);
    } else {
      console.log(`User declined to reset fault for heater ${heaterIndex + 1} - will not ask again`);
      heaterFaults[heaterIndex] = true; // Mark as handled permanently
    }
  },
  checkHeaterStates: () => {
    console.log("Current heater states:", {
      heaterFaults: heaterFaults,
      elements: Array.from(document.querySelectorAll('.temp-state')).map(el => el.textContent)
    });
  },
  triggerFaultCheck: () => {
    console.log("🔍 Manually triggering fault check...");
    // This will be called during the next update cycle
  },
  debugHeaterFaults: false, // Set to true to enable verbose fault logging
  enableFaultDebug: () => {
    window.epicurusDebug.debugHeaterFaults = true;
    console.log("🐛 Heater fault debugging enabled - will log all heater states");
  },
  disableFaultDebug: () => {
    window.epicurusDebug.debugHeaterFaults = false;
    console.log("🐛 Heater fault debugging disabled");
  },
  getFaultDetectionStatus: () => {
    const currentTime = Date.now();
    const timeSinceReset = currentTime - lastFaultResetTime;
    const perHeaterStatus = perHeaterSuspension.map((suspensionTime, index) => {
      const timeSinceSuspension = suspensionTime > 0 ? currentTime - suspensionTime : 0;
      const isHeaterSuspended = suspensionTime > 0 && (timeSinceSuspension < FAULT_RESET_DELAY);
      return {
        heater: index + 1,
        suspended: isHeaterSuspended,
        lastSuspensionTime: suspensionTime > 0 ? new Date(suspensionTime).toLocaleTimeString() : 'Never',
        timeSinceSuspension: suspensionTime > 0 ? `${timeSinceSuspension}ms` : 'N/A',
        resumesIn: isHeaterSuspended ? `${FAULT_RESET_DELAY - timeSinceSuspension}ms` : 'N/A'
      };
    });
    const status = {
      globalSuspended: faultDetectionSuspended,
      lastResetTime: new Date(lastFaultResetTime).toLocaleTimeString(),
      timeSinceReset: `${timeSinceReset}ms`,
      globalResumesIn: faultDetectionSuspended ? `${FAULT_RESET_DELAY - timeSinceReset}ms` : 'N/A',
      globalSuspensionActive: faultDetectionSuspended || (timeSinceReset < FAULT_RESET_DELAY),
      perHeaterStatus: perHeaterStatus
    };
    console.log("Fault Detection Status:", status);
    return status;
  },
  suspendFaultDetection: (reason) => {
    suspendFaultDetection(reason || "Manual debug suspension");
  },
  resumeFaultDetection: () => {
    faultDetectionSuspended = false;
    lastFaultResetTime = 0;
    console.log("🔔 Fault detection manually resumed");
  },
  checkSettings: () => {
    console.log("Current settings state:", {
      settings: settings,
      settingsType: typeof settings,
      keys: settings ? Object.keys(settings) : 'No keys (settings is null/undefined)'
    });
    return settings;
  },
  reloadSettings: () => {
    console.log("🔄 Reloading settings...");
    settings = loadSettings();
    console.log("Settings reloaded:", settings);
    return settings;
  },
  testResetAllFaults: () => {
    console.log("🧪 Testing Reset All Heater Faults button");
    showResetAllHeaterFaultsPopup();
  },
  showResetButton: () => {
    const resetButton = document.getElementById("reset-all-heater-faults");
    if (resetButton) {
      resetButton.style.display = "flex";
      console.log("✅ Reset All Heater Faults header button is now visible");
    } else {
      console.error("❌ Reset All Heater Faults header button not found");
    }
  },
  hideResetButton: () => {
    const resetButton = document.getElementById("reset-all-heater-faults");
    if (resetButton) {
      resetButton.style.display = "none";
      console.log("✅ Reset All Heater Faults header button is now hidden");
    } else {
      console.error("❌ Reset All Heater Faults header button not found");
    }
  }
};

// =====================================================================================================================

// ================================= Heaters: Top, Middle, Bottom, Nozzle, Bed, Chamber =================================

// FUNCTION: Toggle heater states with dual-controller support
function toggleHeaterStates(heaterState, heaterIndex) {
  let heaterType = [
    "top",
    "middle",
    "bottom",
    "nozzle",
    "bed0",
    "bed1",
    "bed2",
    "bed3",
    "bed4",
    "bed5",
    "bed6",
    "bed7",
    "bed8",
    "bed9"
  ];
  
  // Normalize state to uppercase and handle Duet terminology
  const normalizedState = heaterState.toUpperCase();
  const duetState = normalizedState === "STANDBY" || normalizedState === "PREHEAT" ? "PREHEAT" : normalizedState;
  
  console.log(`Heater ${heaterIndex} (${heaterType[heaterIndex] || `heater-${heaterIndex}`}) clicked: "${heaterState}" -> "${duetState}"`);
  
  // Determine which controller to use and the appropriate heater index
  let sendFunction = sendGcode;
  let targetHeaterIndex = heaterIndex;
  
  // Route bed heaters 8-13 (bed4-bed9) to expansion controller
  if (heaterIndex >= 8 && heaterIndex <= 13) {
    sendFunction = sendExpansionGcode;
    targetHeaterIndex = heaterIndex - 8; // Map to expansion heater indices 0-5
    console.log(`Routing heater ${heaterIndex} (${heaterType[heaterIndex] || `bed${heaterIndex-4}`}) to expansion controller as heater ${targetHeaterIndex}`);
  }
  
  let setTemp = "";
  
  switch (duetState) {
    case "OFF":
      setTemp = document.getElementById(
        `user-input-preheat-${heaterType[heaterIndex]}`
      ).textContent;
      console.log(`Switching heater ${heaterIndex} to preheat (standby) at ${setTemp}°C`);
      sendFunction(`M568 P${targetHeaterIndex} R${setTemp} A1`); // switch to preheat (standby)
      break;
      
    case "PREHEAT":
      setTemp = document.getElementById(
        `user-input-active-${heaterType[heaterIndex]}`
      ).textContent;
      console.log(`Switching heater ${heaterIndex} to active at ${setTemp}°C`);
      sendFunction(`M568 P${targetHeaterIndex} S${setTemp} A2`); // switch to active
      break;
      
    case "ACTIVE":
      console.log(`Switching heater ${heaterIndex} to off`);
      sendFunction(`M568 P${targetHeaterIndex} A0`); // switch to off
      break;
      
    case "FAULT":
      // Prompt the user to reset the fault
      const resetFault = window.confirm(
        `Heater ${
          heaterIndex + 1
        } has a temperature fault. Reset the fault? If fault persists, contact local distributor or Rapid Fusion for support.`
      );
      if (resetFault) {
        console.log(`Resetting fault for heater ${heaterIndex}`);
        sendFunction(`M292 M562 P${targetHeaterIndex}`); // reset heater fault
      } else {
        heaterFaults[heaterIndex] = true;
        console.log(`User declined to reset fault for heater ${heaterIndex}`);
      }
      break;
      
    default:
      console.warn(`Unknown heater state: "${heaterState}" (normalized: "${duetState}") for heater ${heaterIndex}`);
      break;
  }
}

// FUNCTION: configureHeaters
function configureHeaters(mode, configuredExtruderHeaters) {
  let gcodeString = "";
  let heaterType = ["top", "middle", "bottom", "nozzle"];
  configuredExtruderHeaters.forEach((heater, index) => {
    preheatTemp = document.getElementById(
      `user-input-preheat-${heaterType[index]}`
    ).textContent;
    activeTemp = document.getElementById(
      `user-input-active-${heaterType[index]}`
    ).textContent;
    gcodeString += `M568 P${index} S${activeTemp} R${preheatTemp} A${mode} `;
  });
  sendGcode(gcodeString);
}

// FUNCTION: configureBedHeaters with dual-controller support
function configureBedHeaters(mode, configuredBedHeaters) {
  let mainGcodeString = "";
  let expansionGcodeString = "";
  let heaterType = ["bed0", "bed1", "bed2", "bed3", "bed4", "bed5", "bed6", "bed7", "bed8", "bed9"];
  
  configuredBedHeaters.forEach((heater, index) => {
    const heaterElement = document.getElementById(`user-input-preheat-${heaterType[index]}`);
    const activeElement = document.getElementById(`user-input-active-${heaterType[index]}`);
    
    // Only proceed if elements exist (for beds that are actually configured)
    if (heaterElement && activeElement) {
      preheatTemp = heaterElement.textContent;
      activeTemp = activeElement.textContent;
      
      // Route bed heaters 0-3 to main controller, 4-9 to expansion controller
      if (index < 4) {
        // Main controller: bed heaters 0-3
        mainGcodeString += `M568 P${
          index + configuredExtruderHeaters.length
        } S${activeTemp} R${preheatTemp} A${mode} `;
      } else {
        // Expansion controller: bed heaters 4-9 (map to expansion heater indices 0-5)
        const expansionHeaterIndex = index - 4;
        expansionGcodeString += `M568 P${expansionHeaterIndex} S${activeTemp} R${preheatTemp} A${mode} `;
      }
    }
  });
  
  // Send commands to appropriate controllers
  if (mainGcodeString.trim()) {
    console.log(`Sending bed heater commands to main controller: ${mainGcodeString.trim()}`);
    sendGcode(mainGcodeString);
  }
  
  if (expansionGcodeString.trim()) {
    console.log(`Sending bed heater commands to expansion controller: ${expansionGcodeString.trim()}`);
    sendExpansionGcode(expansionGcodeString);
  }
}
// =====================================================================================================================

// ================================================ LOCALSTORAGE =======================================================

// FUNCTION: save temperature settings to localStorage
function saveSettings() {
  const categories = [
    "top",
    "middle",
    "bottom",
    "nozzle",
    "bed0",
    "bed1",
    "bed2",
    "bed3",
    "bed4",
    "bed5",
    "bed6",
    "bed7",
    "bed8",
    "bed9",
  ];

  const settings = categories.reduce((acc, category) => {
    acc[category] = {
      popup:
        document.querySelector(`.tab-pane-${category} .temp-popup-user-input`)
          .textContent || "0",
      active:
        document.getElementById(`user-input-active-${category}`).textContent ||
        "0",
      preheat:
        document.getElementById(`user-input-preheat-${category}`).textContent ||
        "0",
    };
    return acc;
  }, {});

  localStorage.setItem("temperatureSettings", JSON.stringify(settings));
}

// FUNCTION: load temperature settings from localStorage
function loadSettings() {
  const storedSettings = localStorage.getItem("temperatureSettings") || "{}";

  // If temperatureSettings is not set, initialize with default values
  if (!storedSettings) {
    const defaultSettings = initializeDefaultSettings();
    localStorage.setItem(
      "temperatureSettings",
      JSON.stringify(defaultSettings)
    );
    return defaultSettings;
  }

  const settings = Object.entries(JSON.parse(storedSettings)).reduce(
    (acc, [category, values]) => {
      acc[category] = {
        popup: values.popup || "0",
        active: values.active || "0",
        preheat: values.preheat || "0",
      };
      return acc;
    },
    {}
  );

  const setValuesInForm = (category) => {
    document.querySelector(
      `.tab-pane-${category} .temp-popup-user-input`
    ).textContent = settings[category].popup;
    // Uncomment to display stored active and preheat values in dropdowns
    document.getElementById(`user-input-active-${category}`).textContent =
      settings[category].active;
    document.getElementById(`user-input-preheat-${category}`).textContent =
      settings[category].preheat;
  };

  Object.keys(settings).forEach(setValuesInForm);

  return settings;
}

// FUNCTION: initialize default temperature settings
function initializeDefaultSettings() {
  const categories = [
    "top",
    "middle",
    "bottom",
    "nozzle",
    "bed0",
    "bed1",
    "bed2",
    "bed3",
  ];

  return categories.reduce((acc, category) => {
    acc[category] = { popup: "0", active: "0", preheat: "0" };
    return acc;
  }, {});
}
// =====================================================================================================================

// ================================================ Page Load Settings =================================================

// Load temperature settings on page load
settings = loadSettings();

// Hide temp popup tabs on startup - only hide beds 0-3, show beds 4-9 permanently
var elements = document.querySelectorAll(".temp-tab-link.heater");
for (var i = 4; i < 8; i++) { // Only hide beds 0-3 tabs (indices 4-7)
  elements[i].style.display = "none";
}
for (var i = 8; i < elements.length; i++) { // Show beds 4-9 tabs (indices 8+) permanently
  elements[i].style.display = "flex";
}

// Hide only main controller beds (0-3) on startup, make expansion beds (4-9) permanently visible
for (let i = 0; i < 4; i++) { // Only hide beds 0-3
  document
    .querySelectorAll(`.bed${i}`)
    .forEach((element) => (element.style.visibility = "hidden"));
}
for (let i = 4; i < 10; i++) { // Make beds 4-9 permanently visible
  document
    .querySelectorAll(`.bed${i}`)
    .forEach((element) => (element.style.visibility = "visible"));
}

// Start adaptive polling system
startPolling();

document.addEventListener("DOMContentLoaded", function () { 
  // Select Default Tabs on page load
  document.getElementById("default-tab").click();
  document.getElementById("system-info").click();

  // Initialize connection status indicator
  initializeConnectionStatus();

  // Call the function to set up the click listener
  enableDeveloperSettings();

  // Add the CSS for flashing effect dynamically
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes flash {
      0% { opacity: 1; }
      50% { opacity: 0; }
      100% { opacity: 1; }
    }

    .flash {
      animation: flash 2s infinite;
    }

    /* Fix dropdown clipping */
    .settings-popup .w-tab-content {
      overflow: visible !important;
    }
  `;
  document.head.appendChild(style);

  document.getElementById("fault-warning-container").classList.add("flash");  // Add flashing effect

  // Initialise heating profiles on startup
  heatProfiles = loadHeatingProfiles();
  updateHeatingProfiles();
  loadTempsOnEdit();

  sendGcode(`M5`);
});

// Set software version
document.getElementById('software-version').textContent = 'v3.2';

// ================================================ Developer Settings =================================================

// Developer Settings Click Timer
function enableDeveloperSettings() {
  let clickCount = 0;
  let lastClickTime = 0;

  document.getElementById("software-version").addEventListener("click", function() {
      const currentTime = new Date().getTime();

      if (currentTime - lastClickTime < 5000) { // Check if within 5 seconds
          clickCount++;
          if (clickCount === 7) { // If clicked 7 times
              const devSettings = document.getElementById("developer-settings");
              
              // Toggle display between 'block' and 'none'
              devSettings.style.display = devSettings.style.display === "block" ? "none" : "block";
              
              clickCount = 0; // Reset click count
          }
      } else {
          clickCount = 1; // Reset if more than 5 seconds have passed
      }

      lastClickTime = currentTime; // Update the last click time
  });
}

// Reset CNC UI
function resetCNCUI() {
  sendGcode(`M5`);
  spindleRunning = false;
  confirmationModal.style.display = 'none';
  slider.disabled = true; // Ensure slider is disabled on page load
  speedControlTitle.textContent = 'Speed Control Locked'; // Set initial state to locked
  sliderUnlocked = false; // Initial state is locked
  updateLockIcon(); // Ensure icon is correctly set on load
  speedValueDisplay.classList.add('grayed-out');
  spindleOff = true; // Set spindleOff to true
}

// Developer Options Toggle
// Check saved state from local storage on load and initialize
window.addEventListener("load", () => {
  const savedAisyncState = localStorage.getItem("aisyncState");
  switch (savedAisyncState) {
    case "on":
      document.getElementById("aisync-slicer").style.display = "block";
      break;
    default: // off state
      document.getElementById("aisync-slicer").style.display = "none";
  }

  const savedCncState = localStorage.getItem("cncState");
  switch (savedCncState) {
    case "on":
      document.getElementById("cnc-mill").style.display = "block";
      break;
    default: // off state
      document.getElementById("cnc-mill").style.display = "none";
  }

  const toolDetectionState = localStorage.getItem("toolDetectionState");
  switch (toolDetectionState) {
    case "on":
      document.getElementById("extruder-detection-container").style.display = "flex";
      document.getElementById("cnc-detection-container").style.display = "flex";
      break;
    default: // off state
      document.getElementById("extruder-detection-container").style.display = "none";
      document.getElementById("cnc-detection-container").style.display = "none";
  }

  const systemFamilyState = localStorage.getItem("systemFamily");
  switch (systemFamilyState) {
    case "apollo":
      document.getElementById("system-apollo").click();
      break;
    case "zeus":
      document.getElementById("system-zeus").click();
      break;
    default: // pe320 as default
      document.getElementById("system-pe320").click();
  }

  // const partCoolingState = localStorage.getItem("partCoolingState");
  // switch (partCoolingState) {
  //   case "on":
  //     document.getElementById("part-cooling-toggle").click();
  //     sendGcode('set global.partCooling = true');  
  //     // sendGcode('M98 P"Part cooling on.g"');
  //     break;
  //   default: // off state
  //     sendGcode('set global.partCooling = false');  
  //     // sendGcode('M98 P"Part cooling off.g"');
  // }

  // const bedFixturePlateState = localStorage.getItem("bedFixturePlateState");
  // switch (bedFixturePlateState) {
  //   case "on":
  //     document.getElementById("bed-fixture-plate-toggle").click();
  //     sendGcode('set global.bedFixturePlate = true');  
  //     // sendGcode('M98 P"Bed_PID_fixture_plate_on.g"');
  //     break;
  //   default: // off state
  //     sendGcode('set global.partCooling = false');
  //     // sendGcode('M98 P"Bed_PID_fixture_plate_off.g"');
  // }
});

// FUNCTION: Show Reset All Heater Faults Popup
function showResetAllHeaterFaultsPopup() {
  const popup = window.confirm(
    "🔥 RESET ALL HEATER FAULTS 🔥\n\nThis will reset all heater fault conditions.\n\nAre you sure you want to continue?"
  );
  
  if (popup) {
    console.log("User confirmed reset of all heater faults");
    sendGcode("M562"); // Reset all heater faults
    
    // Suspend fault detection to prevent duplicate popups after reset
    suspendFaultDetection("Reset all heater faults command");
    
    // Set per-heater suspension timestamps for all heaters
    const currentTime = Date.now();
    for (let i = 0; i < perHeaterSuspension.length; i++) {
      perHeaterSuspension[i] = currentTime;
    }
    
    // Clear all heater fault flags after delay
    setTimeout(() => {
      for (let i = 0; i < heaterFaults.length; i++) {
        heaterFaults[i] = false;
      }
      console.log("All heater fault flags cleared after delay");
    }, FAULT_RESET_DELAY + 1000); // Longer than suspension to ensure no race conditions
    
    // Hide the reset button immediately since faults are being cleared
    const resetButton = document.getElementById("reset-all-heater-faults");
    if (resetButton) {
      resetButton.style.display = "none";
    }
    
    console.log("All heater faults reset command sent (M562) - fault detection suspended");
  } else {
    console.log("User cancelled reset of all heater faults");
  }
}

// ========================================= Tool Temperature Panel: Button Clicks =====================================
const buttonIds = [
  "boost-pellets",
  "heaters-off",
  "preheat-extruder",
  "emergency-stop",
  "part-cooling-on",
  "part-cooling-on-icon",
  "part-cooling-off",
  "part-cooling-off-icon",
  "reset-machine",
  "bed-heaters-off",
  "preheat-bed",
  "confirmYes",
  "reset-speed",
  "aisync-on",
  "aisync-off",
  "open-settings",
  "close-settings",
  "cnc-on",
  "cnc-off",
  "system-pe320",
  "system-apollo",
  "system-zeus",
  "tool-detection-on",
  "tool-detection-off",
  "bed-fixture-plate-on",
  "bed-fixture-plate-on-icon",
  "bed-fixture-plate-off",
  "bed-fixture-plate-off-icon",
  "check-for-updates",
  "restart-firmware",
  "reload-ui",
  "heatsink-fan-off",
  "heatsink-fan-half",
  "heatsink-fan-full",
  "barrel-fan-off",
  "barrel-fan-half",
  "barrel-fan-full",
];

let currentSpindleAction = "";

buttonIds.forEach((buttonId) => {
  document.getElementById(buttonId).addEventListener("click", () => {
    switch (buttonId) {
      case "boost-pellets":
        sendGcode('M98 P"Pellet boost.g"');
        break;
      case "heaters-off":
        document
          .querySelectorAll(".user-input-temp.extruder.active")
          .forEach((element) => (element.textContent = "0")); // set text to 0
        configureHeaters(0, configuredExtruderHeaters); // mode 0 == off
        break;
      case "preheat-extruder":
        configureHeaters(1, configuredExtruderHeaters); // mode 1 == preheat (standby)
        break;
      case "bed-heaters-off":
        document
          .querySelectorAll(".user-input-temp.bed.active")
          .forEach((element) => (element.textContent = "0")); // set text to 0
        configureBedHeaters(0, configuredBedHeaters); // mode 0 == off
        break;
      case "preheat-bed":
        configureBedHeaters(1, configuredBedHeaters); // mode 1 == preheat (standby)
        break;
      case "emergency-stop":
        sendGcode("M112");
        break;
      case "part-cooling-on":
      case "part-cooling-on-icon":
        sendGcode('set global.partCooling = false');
        sendGcode('M98 P"Part cooling off.g"');
        localStorage.setItem("partCoolingState", "off");
        break;
      case "part-cooling-off":
      case "part-cooling-off-icon":
        sendGcode('set global.partCooling = true');
        sendGcode('M98 P"Part cooling on.g"');
        localStorage.setItem("partCoolingState", "on");
        break;
      case "reset-machine":
        sendGcode("M999");
        break;
      case "confirmYes":
        if (spindleRunning == true) {
          let spindleSpeed = document.getElementById("speedValue").textContent;
          sendGcode(`M3 P0 S${spindleSpeed}`); // run spindle clockwise at slider rpm
        } else {
          sendGcode(`M5`);
        }
        break;
      case "reset-speed":
        slider.value = 10000;
        speedValueDisplay.textContent = 10000; // Update the display to show 10000 RPM
        updateSliderBackground(); // Ensure the slider's background is updated accordingly
        updatedSpindleSpeed = 10000;
        break;
      case "aisync-on":
        const elementOn = document.getElementById("aisync-slicer");
        elementOn.style.display = "block";
        document.getElementById("aisync-on").style.backgroundColor = ""; // Pressed State (default)
        document.getElementById("aisync-off").style.backgroundColor = "#a8a8a8"; // Inactive State
        document.getElementById("aisync-slicer").click();
        // Save state to local storage
        localStorage.setItem("aisyncState", "on");
        break;
      case "aisync-off":
        const elementOff = document.getElementById("aisync-slicer");
        elementOff.style.display = "none";
        document.getElementById("aisync-on").style.backgroundColor = "#a8a8a8"; // Inactive State
        document.getElementById("aisync-off").style.backgroundColor = ""; // Pressed State (default)
        // Save state to local storage
        localStorage.setItem("aisyncState", "off");
        document.getElementById("default-tab").click();
        break;
      case "open-settings":
        sendGcode("set global.fanOverride = true");
        break;
      case "close-settings":
        document.getElementById("system-info").click();
        sendGcode("M106 P0 S1 M106 P4 S0.5 M106 P5 S0.5 M106 P6 S0.5");
        sendGcode("set global.fanOverride = false");
        break;
      case "cnc-on":
        // MUST enable tool detection for CNC!!!
        document.getElementById("tool-detection-on").click();
        const cncOn = document.getElementById("cnc-mill");
        cncOn.style.display = "block";
        document.getElementById("cnc-on").style.backgroundColor = ""; // Pressed State (default)
        document.getElementById("cnc-off").style.backgroundColor = "#a8a8a8"; // Inactive State
        document.getElementById("cnc-mill").click();
        // Display CNC
        document.getElementById("cnc-profile-heading").style.display = "flex";
        document.getElementById("cnc-user-input-popup").style.display = "flex";
        document.getElementById("cnc-profile-heading-popup").style.display =
          "flex";
        document
          .querySelectorAll(".popup-temp.cnc-container")
          .forEach((element) => {
            element.style.display = "flex";
          });
        document
          .querySelectorAll(".set-cnc-profile-button")
          .forEach((element) => {
            element.style.display = "flex";
          });
        // Adjust Action Column
        document.getElementById("heating-profiles-action-header").style.width = "325px";
        document.querySelectorAll(".popup-action-container").forEach((element) => {
            element.style.width = "310px";
        });
        // Save state to local storage
        localStorage.setItem("cncState", "on");
        document.getElementById("cnc-state-container").style.display = "flex";
        document.getElementById("tool-detection-off").style.display = "none";
        break;
      case "cnc-off":
        const cncOff = document.getElementById("cnc-mill");
        cncOff.style.display = "none";
        document.getElementById("cnc-on").style.backgroundColor = "#a8a8a8"; // Inactive State
        document.getElementById("cnc-off").style.backgroundColor = ""; // Pressed State (default)
        // Hide CNC
        document.getElementById("cnc-profile-heading").style.display = "none";
        document.getElementById("cnc-user-input-popup").style.display = "none";
        document.getElementById("cnc-profile-heading-popup").style.display =
          "none";
        document
          .querySelectorAll(".popup-temp.cnc-container")
          .forEach((element) => {
            element.style.display = "none";
          });
        document
          .querySelectorAll(".set-cnc-profile-button")
          .forEach((element) => {
            element.style.display = "none";
          });
        // Adjust Action Column
        document.getElementById("heating-profiles-action-header").style.width = "235px";
        document.querySelectorAll(".popup-action-container").forEach((element) => {
            element.style.width = "220px";
        });
        // Save state to local storage
        localStorage.setItem("cncState", "off");
        document.getElementById("default-tab").click();
        document.getElementById("cnc-state-container").style.display = "none";
        document.getElementById("tool-detection-off").style.display = "flex";
        break;
      case "system-pe320":
        localStorage.setItem("systemFamily", "pe320");
        document.getElementById("logo-text").textContent = "- PE320";
        document.getElementById("logo-text").style.display = "flex";
        document.getElementById("aisync-slicer-option").style.display = "none"; // no AiSync
        document.getElementById("cnc-mill-option").style.display = "none"; // no CNC
        document.getElementById("aisync-off").click();
        document.getElementById("cnc-off").click();
        document.getElementById("default-tab").click();
        if (localStorage.getItem("toolDetectionState") === "on") {
          document.getElementById("tool-detection-on").click();
        } else {
          document.getElementById("tool-detection-off").click();
        }
        document.getElementById("controller-version").textContent = "Epicurus Controller";
        document.getElementById("product-family").textContent = "PE320";
        document.getElementById("product-family-tools").textContent = "PE320 Pellet Extruder";
        break;
      case "system-apollo":
        localStorage.setItem("systemFamily", "apollo");
        document.getElementById("logo-text").textContent = "- APOLLO";
        document.getElementById("logo-text").style.display = "flex";
        document.getElementById("aisync-slicer-option").style.display = "flex"; // AiSync option
        document.getElementById("cnc-mill-option").style.display = "none"; // no CNC
        if (localStorage.getItem("toolDetectionState") === "on") {
          document.getElementById("tool-detection-on").click();
        } else {
          document.getElementById("tool-detection-off").click();
        }
        if (localStorage.getItem("aisyncState") === "on") {
          document.getElementById("aisync-on").click();
        } else {
          document.getElementById("aisync-off").click();
        }
        document.getElementById("cnc-off").click();
        document.getElementById("default-tab").click();
        document.getElementById("controller-version").textContent = "Epicurus Controller PRO";
        document.getElementById("product-family").textContent = "Apollo";
        document.getElementById("product-family-tools").textContent = "PE320 Pellet Extruder";
        break;
      case "system-zeus":
        localStorage.setItem("systemFamily", "zeus");
        document.getElementById("logo-text").textContent = "- ZEUS";
        document.getElementById("logo-text").style.display = "flex";
        document.getElementById("aisync-slicer-option").style.display = "flex"; // AiSync option
        document.getElementById("cnc-mill-option").style.display = "flex"; // CNC option
        if (localStorage.getItem("toolDetectionState") === "on") {
          document.getElementById("tool-detection-on").click();
        } else {
          document.getElementById("tool-detection-off").click();
        }
        if (localStorage.getItem("aisyncState") === "on") {
          document.getElementById("aisync-on").click();
        } else {
          document.getElementById("aisync-off").click();
        }
        if (localStorage.getItem("cncState") === "on") {
          document.getElementById("cnc-on").click();
        } else {
          document.getElementById("cnc-off").click();
        }
        document.getElementById("default-tab").click();
        document.getElementById("controller-version").textContent = "Epicurus Controller PRO";
        document.getElementById("product-family").textContent = "Zeus";
        document.getElementById("product-family-tools").textContent = "PE320 Pellet Extruder, CNC Mill";
        break;
      case "tool-detection-on":
        document.getElementById("extruder-detection-container").style.display = "flex";
        document.getElementById("cnc-detection-container").style.display = "flex";
        document.getElementById("tool-detection-cnc").style.display = "flex";
        document.getElementById("tool-detection-on").style.backgroundColor = ""; // Pressed State (default)
        document.getElementById("tool-detection-off").style.backgroundColor = "#a8a8a8"; // Inactive State
        document.getElementById("connected-tool-container").style.display = "flex";
        // Save state to local storage
        localStorage.setItem("toolDetectionState", "on");
        break;
      case "tool-detection-off":
        document.getElementById("extruder-detection-container").style.display = "none";
        document.getElementById("cnc-detection-container").style.display = "none";
        document.getElementById("tool-detection-cnc").style.display = "none";
        document.getElementById("tool-detection-on").style.backgroundColor = "#a8a8a8"; // Inactive State
        document.getElementById("tool-detection-off").style.backgroundColor = ""; // Pressed State (default)
        document.getElementById("connected-tool-container").style.display = "none";
        // Save state to local storage
        localStorage.setItem("toolDetectionState", "off");
        break;
      case "bed-fixture-plate-on":
      case "bed-fixture-plate-on-icon":
        sendGcode('set global.bedFixturePlate = false');
        sendGcode('M98 P"Bed_PID_fixture_plate_off.g"');
        localStorage.setItem("bedFixturePlateState", "off");
        break;
      case "bed-fixture-plate-off":
      case "bed-fixture-plate-off-icon":
        sendGcode('set global.bedFixturePlate = true');
        sendGcode('M98 P"Bed_PID_fixture_plate_on.g"');
        localStorage.setItem("bedFixturePlateState", "on");
        break;
      case "check-for-updates":
        window.alert(`System up to date.`)
        break;
      case "restart-firmware":
        // Warn the user about the consequences of restarting firmware
        const restartFirmware = window.confirm(`⚠️ WARNING: RESTART FIRMWARE ⚠️\n\nConfirming will RESET ALL Extruder Heater & Bed temperatures to OFF.\n\nAll heating processes will be stopped immediately.\n\nAre you sure you want to proceed?`);
        if (restartFirmware) {
          sendGcode('M999');
          location.reload();
        }
        break;
      case "reload-ui":
        // Reload the UI immediately
        location.reload();
        break;
      case "heatsink-fan-off":
        sendGcode(`M106 P${selectedHeatsinkFan} S0`);
        break;
      case "heatsink-fan-half":
        sendGcode(`M106 P${selectedHeatsinkFan} S0.54`);
        break;
      case "heatsink-fan-full":
        sendGcode(`M106 P${selectedHeatsinkFan} S1`);
        break;
      case "barrel-fan-off":
        sendGcode(`M106 P${selectedBarrelFan} S0`);
        break;
      case "barrel-fan-half":
        sendGcode(`M106 P${selectedBarrelFan} S0.75`);
        break;
      case "barrel-fan-full":
        sendGcode(`M106 P${selectedBarrelFan} S1`);
        break;
    }
  });
});

// === Toggle Heater States on Click ===
document.querySelectorAll(".temp-state-container").forEach((element, index) => {
  element.addEventListener("click", () => {
    const tempStateElement = element.querySelector(".temp-state");
    if (tempStateElement) {
      const currentState = tempStateElement.textContent.trim();
      console.log(`Click detected on heater ${index}, current state: "${currentState}"`);
      toggleHeaterStates(currentState, index);
    } else {
      console.error(`No .temp-state element found in container ${index}:`, element);
    }
  });
  
  // Add visual feedback for clickable elements
  element.style.cursor = 'pointer';
  element.title = `Click to cycle heater state`;
});

console.log(`Initialized ${document.querySelectorAll(".temp-state-container").length} heater state click handlers`);

// === Reset All Heater Faults Button in Header ===
document.addEventListener("DOMContentLoaded", function() {
  const resetAllButton = document.getElementById("reset-all-heater-faults");
  if (resetAllButton) {
    resetAllButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log("Reset All Heater Faults button clicked from header");
      showResetAllHeaterFaultsPopup();
    });
    console.log("Reset All Heater Faults header button event listener initialized");
  }
});

// =====================================================================================================================

// ================================================ Temperautre Popup ==================================================

// FUNCTION: Temp Popup Table - Switch to Correct Heater Tab on click
function heaterTabSwitch(className) {
  document
    .querySelectorAll(`.dropdown-wrapper${className}`)
    .forEach((element, index) =>
      element.addEventListener("click", () => {
        let tempTabLink = document.querySelector(
          `.temp-tab-link:nth-child(${index + 1})`
        ); // nth-child starts at 1 (+1 to bypass heating profiles)
        tempTabLink
          ? tempTabLink.click()
          : console.error(
              `No corresponding element with index ${index} found.`
            );
      })
    );
}
// Run Heater Tab Switch function for active and preheat columns
[".active", ".preheat"].forEach(heaterTabSwitch);
// load saved temps on popup exit
document
  .querySelector(".temp-popup-space")
  .addEventListener("click", () => (settings = loadSettings()));

// FUNCTION: NumPad Click
function numPadClick(tabpane, buttonIndex) {
  let tempInput = document.querySelector(`${tabpane} .temp-popup-user-input`);
  let inputValue = tempInput.textContent;
  let heaters = tabpane.match(/[^-]+$/)[0];

  // Ensure settings exists and has the heater configuration
  if (!settings) {
    console.warn("Settings not loaded, attempting to load...");
    settings = loadSettings();
  }
  
  // Ensure the specific heater exists in settings
  if (!settings || !settings[heaters]) {
    console.warn(`Settings for heater '${heaters}' not found, using defaults`);
    if (!settings) settings = {};
    if (!settings[heaters]) {
      settings[heaters] = { popup: "0", active: "0", preheat: "0" };
    }
  }

  // Get saved popup value safely
  const savedPopupValue = settings[heaters]?.popup || "0";

  // default value = 0
  if (inputValue === 0) {
    inputValue = inputValue.slice(0, -1);
  }

  if (buttonIndex <= 8) {
    if (inputValue === savedPopupValue) {
      //saved value in local storage
      inputValue = buttonIndex + 1;
    } else {
      inputValue += buttonIndex + 1;
    }
  } else if (buttonIndex === 9) {
    // Clear input
    inputValue = 0; // reset default value
  } else if (buttonIndex === 10) {
    if (inputValue === savedPopupValue) {
      //saved value in local storage
      inputValue = 0;
    } else {
      inputValue += 0;
    }
  } else {
    inputValue = inputValue.slice(0, -1); // backspace
    if (inputValue === "") {
      // reset default value
      inputValue = 0;
    }
  }

  // limit input to 3 digits and less than 400 deg Celcius
  if (inputValue.length === 4) inputValue = inputValue.slice(0, -1);
  inputValue = Math.min(parseFloat(inputValue) || 0, 400);

  // Set textContent to the final value
  tempInput.textContent = inputValue;
}

// FUNCTION: Set active & preheat temperatures in temp popup
function setTemp(tabpane, buttonIndex) {
  let displayTemp = document.querySelector(
    `${tabpane} .temp-popup-user-input`
  ).textContent;
  let [activeTemp, preheatTemp, heater] = (() => {
    switch (tabpane) {
      case ".tab-pane-top":
        return [
          document.getElementById("user-input-active-top"),
          document.getElementById("user-input-preheat-top"),
          "P0",
        ];
      case ".tab-pane-middle":
        return [
          document.getElementById("user-input-active-middle"),
          document.getElementById("user-input-preheat-middle"),
          "P1",
        ];
      case ".tab-pane-bottom":
        return [
          document.getElementById("user-input-active-bottom"),
          document.getElementById("user-input-preheat-bottom"),
          "P2",
        ];
      case ".tab-pane-nozzle":
        return [
          document.getElementById("user-input-active-nozzle"),
          document.getElementById("user-input-preheat-nozzle"),
          "P3",
        ];
      case ".tab-pane-bed0":
        return [
          document.getElementById("user-input-active-bed0"),
          document.getElementById("user-input-preheat-bed0"),
          "P4",
        ];
      case ".tab-pane-bed1":
        return [
          document.getElementById("user-input-active-bed1"),
          document.getElementById("user-input-preheat-bed1"),
          "P5",
        ];
      case ".tab-pane-bed2":
        return [
          document.getElementById("user-input-active-bed2"),
          document.getElementById("user-input-preheat-bed2"),
          "P6",
        ];
      case ".tab-pane-bed3":
        return [
          document.getElementById("user-input-active-bed3"),
          document.getElementById("user-input-preheat-bed3"),
          "P7",
        ];
      case ".tab-pane-bed4":
        return [
          document.getElementById("user-input-active-bed4"),
          document.getElementById("user-input-preheat-bed4"),
          "P8",
        ];
      case ".tab-pane-bed5":
        return [
          document.getElementById("user-input-active-bed5"),
          document.getElementById("user-input-preheat-bed5"),
          "P9",
        ];
      case ".tab-pane-bed6":
        return [
          document.getElementById("user-input-active-bed6"),
          document.getElementById("user-input-preheat-bed6"),
          "P10",
        ];
      case ".tab-pane-bed7":
        return [
          document.getElementById("user-input-active-bed7"),
          document.getElementById("user-input-preheat-bed7"),
          "P11",
        ];
      case ".tab-pane-bed8":
        return [
          document.getElementById("user-input-active-bed8"),
          document.getElementById("user-input-preheat-bed8"),
          "P12",
        ];
      case ".tab-pane-bed9":
        return [
          document.getElementById("user-input-active-bed9"),
          document.getElementById("user-input-preheat-bed9"),
          "P13",
        ];
    }
  })();

  // Determine which controller to use based on heater parameter
  let sendFunction = sendGcode;
  let targetHeater = heater;
  
  // Route bed heaters P8-P13 (bed4-bed9) to expansion controller as P0-P5
  if (heater >= "P8" && heater <= "P13") {
    sendFunction = sendExpansionGcode;
    const heaterNum = parseInt(heater.substring(1)); // Extract number from P8, P9, etc.
    targetHeater = `P${heaterNum - 8}`; // Map P8->P0, P9->P1, P10->P2, P11->P3, P12->P4, P13->P5
    console.log(`Routing ${heater} to expansion controller as ${targetHeater}`);
  }

  switch (buttonIndex) {
    case 0: // active
      activeTemp.textContent = displayTemp;
      sendFunction(`M568 ${targetHeater} S${displayTemp} A2`);
      saveSettings();
      break;
    case 1: // preheat
      preheatTemp.textContent = displayTemp;
      sendFunction(`M568 ${targetHeater} R${displayTemp}`);
      saveSettings();
      break;
    case 2: // both
      activeTemp.textContent = displayTemp;
      sendFunction(`M568 ${targetHeater} S${displayTemp} A2`);
      preheatTemp.textContent = displayTemp;
      sendFunction(`M568 ${targetHeater} R${displayTemp}`);
      saveSettings();
      break;
  }
}

[
  ".tab-pane-top",
  ".tab-pane-middle",
  ".tab-pane-bottom",
  ".tab-pane-nozzle",
  ".tab-pane-bed0",
  ".tab-pane-bed1",
  ".tab-pane-bed2",
  ".tab-pane-bed3",
  ".tab-pane-bed4",
  ".tab-pane-bed5",
  ".tab-pane-bed6",
  ".tab-pane-bed7",
  ".tab-pane-bed8",
  ".tab-pane-bed9",
].forEach((tabpane) => {
  document
    .querySelectorAll(`${tabpane} .number-container`)
    .forEach((element, index) => {
      element.addEventListener("click", () => numPadClick(tabpane, index));
    });
  document
    .querySelectorAll(`${tabpane} .temp-button-container`)
    .forEach((element, index) => {
      element.addEventListener("click", () => setTemp(tabpane, index));
    });
});
// =====================================================================================================================

// ======================================= Temp Overshoot Fan Control =================================================
function generateDiscreteNumbers(lowerLimit, upperLimit, incrementCount) {
  return Array.from({ length: incrementCount + 1 }, (_, i) =>
    Math.round((i / incrementCount) * (upperLimit - lowerLimit) + lowerLimit)
  );
}

const overshootLower = 1;
const overshootUpper = 15;
const increment = 5;

const minFanSpeed = 0;
const maxFanSpeed = 255;

const overshootTempRange = generateDiscreteNumbers(
  overshootLower,
  overshootUpper,
  increment
);
// const fanSpeedRange = generateDiscreteNumbers(minFanSpeed, maxFanSpeed, tempIncrement);
const fanSpeedRange = [0, 0.78, 0.91, 0.977, 0.9782, 1];

// Overshoot Fan control for top, middle and bottom heater pwm fans
function overshootFanControl() {
  for (let i = 0; i < configuredExtruderHeaters.length - 1; i++) {
    let [extruder, fanType] = configuredExtruderHeaters[i];
    let overshoot = extruder.current - extruder.active;
    let fan = fanType + 1;

    // Start fans when temp overshoot occurs
    if (
      overshoot > 0 &&
      extruder.current > 50 &&
      heaterStates[fanType] !== "off"
    ) {
      for (let i = 0; i < overshootTempRange.length - 1; i++) {
        if (
          overshoot > overshootTempRange[i] &&
          overshoot <= overshootTempRange[i + 1]
        ) {
          sendGcode(`M106 P${fan} S${fanSpeedRange[i + 1]}`); // adjust fan speed
        }
      }
      if (overshoot < overshootTempRange[0]) {
        sendGcode(`M106 P${fan} S${fanSpeedRange[i + 1]}`); // adjust fan speed
      } else if (
        overshoot > overshootTempRange[overshootTempRange.length - 1]
      ) {
        sendGcode(`M106 P${fan} S${fanSpeedRange[i + 1]}`); // adjust fan speed
      }
    } else if (heaterStates[fanType] == "off") {
      // heaters off -- max fan cooling
      if (extruder.current > 50) {
        sendGcode(`M106 P${fan} S1`);
      } else {
        sendGcode(`M106 P${fan} S0`);
      }
    } else {
      sendGcode(`M106 P${fan} S0`);
    }
  }
}

// Call checkTemperature every 1 second
// setInterval(overshootFanControl, 1000);
// =====================================================================================================================

// ====================================== Heating Profiles Tab: Button Clicks ==========================================

// SET Button

// Heating Profiles - Switch to 'Tool Temp Tab' on 'Set Button' click
document
  .querySelectorAll(".heating-profile-material .set-profile-button")
  .forEach((element, index) => {
    element.addEventListener("click", () => {
      let topTemp = document.querySelectorAll(
        ".heating-profiles-text.top-temp"
      )[index].textContent;
      let middleTemp = document.querySelectorAll(
        ".heating-profiles-text.middle-temp"
      )[index].textContent;
      let bottomTemp = document.querySelectorAll(
        ".heating-profiles-text.bottom-temp"
      )[index].textContent;
      let nozzleTemp = document.querySelectorAll(
        ".heating-profiles-text.nozzle-temp"
      )[index].textContent;
      let bedTemp = document.querySelectorAll(
        ".heating-profiles-text.bed-temp"
      )[index].textContent;

      // Set Extruder Temps
      document.getElementById("user-input-active-top").textContent = topTemp;
      document.getElementById("user-input-preheat-top").textContent = topTemp;
      document.getElementById("user-input-active-middle").textContent =
        middleTemp;
      document.getElementById("user-input-preheat-middle").textContent =
        middleTemp;
      document.getElementById("user-input-active-bottom").textContent =
        bottomTemp;
      document.getElementById("user-input-preheat-bottom").textContent =
        bottomTemp;
      document.getElementById("user-input-active-nozzle").textContent =
        nozzleTemp;
      document.getElementById("user-input-preheat-nozzle").textContent =
        nozzleTemp;

      // Set Bed Temps for all configured beds
      for (let i = 0; i < configuredBedHeaters.length && i < 10; i++) {
        const activeElement = document.getElementById(`user-input-active-bed${i}`);
        const preheatElement = document.getElementById(`user-input-preheat-bed${i}`);
        if (activeElement) activeElement.textContent = bedTemp;
        if (preheatElement) preheatElement.textContent = bedTemp;
      }

      // Preheat Extruder Heaters
      sendGcode(
        `M568 P0 S${topTemp} R${topTemp} A1 M568 P1 S${middleTemp} R${middleTemp} A1 M568 P2 S${bottomTemp} R${bottomTemp} A1 M568 P3 S${nozzleTemp} R${nozzleTemp} A1`
      );

      // Preheat Bed Heaters with dual-controller routing
      let mainGcodeString = "";
      let expansionGcodeString = "";
      
      configuredBedHeaters.forEach((heater, index) => {
        if (index < 4) {
          // Main controller: bed heaters 0-3
          mainGcodeString += `M568 P${index + 4} S${bedTemp} R${bedTemp} A1 `;
        } else {
          // Expansion controller: bed heaters 4-9 (map to expansion heater indices 0-5)
          const expansionHeaterIndex = index - 4;
          expansionGcodeString += `M568 P${expansionHeaterIndex} S${bedTemp} R${bedTemp} A1 `;
        }
      });
      
      // Send commands to appropriate controllers
      if (mainGcodeString.trim()) {
        console.log(`Heating profile: Sending bed commands to main controller: ${mainGcodeString.trim()}`);
        sendGcode(mainGcodeString);
      }
      
      if (expansionGcodeString.trim()) {
        console.log(`Heating profile: Sending bed commands to expansion controller: ${expansionGcodeString.trim()}`);
        sendExpansionGcode(expansionGcodeString);
      }

      saveSettings();
      document.getElementById("default-tab").click();
    });
  });

// CNC Profiles - Switch to 'Tool Temp Tab' on 'Set Button' click
document
  .querySelectorAll(".heating-profile-material .set-cnc-profile-button")
  .forEach((element, index) => {
    element.addEventListener("click", () => {
      let cncSpeed = document.querySelectorAll(".heating-profiles-text.cnc")[index].textContent;

      // Set CNC Speed
      slider.value = cncSpeed;
      speedValueDisplay.textContent = cncSpeed; // Update the display to show cncSpeed RPM
      updateSliderBackground(); // Ensure the slider's background is updated accordingly
      updatedSpindleSpeed = cncSpeed;

      saveSettings();
      document.getElementById("cnc-mill").click();
    });
  });

document.getElementById("reset-profiles").addEventListener("click", () => {
  const resetFault = window.confirm(`Reset to default heating profiles?`);
  if (resetFault) {
    resetlocalStorageSettings(); // reset to default heating profiles
  }
});
// =====================================================================================================================

// =============================================== On-screen Keyboard ==================================================

/**
 * Virtual Keyboard Initialization Script
 *
 * This script initializes on-screen keyboards for specific input fields using the jQuery Keyboard plugin.
 * It includes custom behavior for touch events, input validation, and dynamic interaction with .edit-profile elements.
 */

// Initialize and store references to keyboards
var keyboards = [];

$(document).ready(function () {
  const touchHandler = function (event) {
    event.target.style.opacity = event.type === "touchstart" ? 0.4 : "";
  };

  // FUNCTION: Handle touch events
  function handleTouchEvents(keyboard) {
    const events = ["touchstart", "touchend", "touchcancel"];

    keyboard.$keyboard.find("button.ui-keyboard-button").each(function () {
      events.forEach((event) => {
        this.removeEventListener(event, touchHandler, { passive: true }); // Remove existing listeners to avoid duplicates
        this.addEventListener(event, touchHandler, { passive: true }); // Add the event listener
      });
    });
  }

  // NumPad logic
  var maxFractional = 2, regex1 = /^0\d$/;

  function getRegex(maxInt) {
    return new RegExp(`([+-]?\\d{0,${maxInt}}(?:\\.\\d{0,${maxFractional}})?)`);
  }

  $.keyboard.defaultOptions.usePreview = false;
  $.keyboard.defaultOptions.autoAccept = true;

  // Material Name Keyboard
  keyboards.push(
    $("#material-name-input")
      .keyboard({
        alwaysOpen: true,
        userClosed: false,
        stickyShift: true,  // Keeps Shift active until pressed again (toggle behavior)
        shiftToggle: true,  // Makes all characters uppercase when Shift is active

        visible: function (e, keyboard, el) {
          keyboard.$preview[0].select(); // Highlight text on visible
        },

        accepted: function (e, keyboard, el) {
          // Use existing save_index and set to "Default [save_index + 1]" if input is empty
          if (!keyboard.$preview.val().trim()) {
            keyboard.$preview.val(`Default ${save_index + 1}`);
          }
        },

        layout: "custom",
        customLayout: {
          'normal': [
            "` 1 2 3 4 5 6 7 8 9 0 - = {b}",
            "q w e r t y u i o p [ ] \\",
            "a s d f g h j k l ; '",
            "{shift} z x c v b n m , . /",
            "{space} {clear}"
          ],
          'shift': [
            "~ ! @ # $ % ^ & * ( ) _ + {b}",
            "Q W E R T Y U I O P { } |",
            "A S D F G H J K L : \"",
            "{shift} Z X C V B N M < > ?",
            "{space} {clear}"
          ]
        },

        display: {
          'clear': 'CLEAR' // Set display text for the clear button
        }
      })
      .getkeyboard()
  );

  handleTouchEvents(keyboards[0]); // Add touch event listeners only once
  keyboards[0].$keyboard.hide();

  // Temp Keyboards (Numpad)
  $(".material-data-temp-input.user-input").each(function (index) {
    let maxInteger = index === 5 ? 5 : 3; // Set maxInteger based on index
    let regex = getRegex(maxInteger);

    keyboards.push(
      $(this)
        .keyboard({
          alwaysOpen: true,
          userClosed: false,

          visible: function (e, keyboard, el) {
            keyboard.$preview[0].select(); // highlight text on visible
          },

          layout: "custom",
          customLayout: {
            normal: ["7 8 9", "4 5 6", "1 2 3", "{clear} 0 {b}"],
          },
          restrictInput: true,
          change: function (e, keyboard, el) {
            var val = keyboard.$preview.val().replace(/[^\d-.]/g, ""),
              c = $.keyboard.caret(keyboard.$preview),
              start = c.start,
              end = c.end,
              restrict = val.match(regex);

            if (restrict) {
              restrict = restrict.slice(1).join("");
            } else {
              restrict = val;
            }

            if (restrict === "") {
              restrict = "0"; // Set input to 0 by default is nothing is entered
            }

            if (regex1.test(restrict)) {
              restrict = restrict.slice(1); // Replace leading zero with the integer just entered
            }

            // Apply specific range restrictions based on index
            var numericVal = parseFloat(restrict);
            if (index === 5) {
              // Restriction for index 5: range 3000 to 21000
              // if (numericVal < 3000) restrict = "3000";
              if (numericVal > 21000) restrict = "21000";
            } else {
              // Check if value exceeds 400
              if (parseFloat(restrict) > 400) {
                restrict = "400";
              }
            }

            keyboard.$preview.val(restrict);
            let change = restrict.length - val.length;
            start += change;
            end += change;
            $.keyboard.caret(keyboard.$preview, start, end);
          },
        })
        .getkeyboard()
    );

    handleTouchEvents(keyboards[index + 1]); // Add touch event listeners only once
    keyboards[index + 1].$keyboard.hide(); // index + 1 because 0 is for the first input
  });

  // Show the corresponding keyboard when an input field is clicked
  $(".user-input").on("click", function () {
    var index = $(".user-input").index(this);
    keyboards.forEach(function (keyboard, i) {
      if (i === index) {
        keyboard.$keyboard.show();
      } else {
        keyboard.$keyboard.hide();
      }
    });
  });
});

// Triggers to show & hide on-screen keyboards
$(document).ready(function () {
  $(".edit-profile").click(function () {
    setTimeout(() => keyboards[0].$keyboard.show(), 100);
    document.getElementById("material-name-input").click();
  });
  $(".save-profile-edit").click(function () {
    let row = document.querySelectorAll(
      ".heating-profiles-content .heating-profile-material"
    )[save_index];
    row.querySelector(".heating-profiles-text.material").textContent =
      document.getElementById("material-name-input").value;
    row.querySelector(".heating-profiles-text.top-temp").textContent =
      document.getElementById("top-heater-temp-input").value;
    row.querySelector(".heating-profiles-text.middle-temp").textContent =
      document.getElementById("middle-heater-temp-input").value;
    row.querySelector(".heating-profiles-text.bottom-temp").textContent =
      document.getElementById("bottom-heater-temp-input").value;
    row.querySelector(".heating-profiles-text.nozzle-temp").textContent =
      document.getElementById("nozzle-heater-temp-input").value;
    row.querySelector(".heating-profiles-text.bed-temp").textContent =
      document.getElementById("bed-heater-temp-input").value;
    row.querySelector(".heating-profiles-text.cnc").textContent =
      document.getElementById("cnc-input").value;

    saveHeatingProfiles();
    heatProfiles = loadHeatingProfiles();
    updateHeatingProfiles();
    loadTempsOnEdit();
    keyboards.forEach((keyboard) => keyboard.$keyboard.hide());
  });
  $(".cancel-profile-edit").click(function () {
    keyboards.forEach((keyboard) => keyboard.$keyboard.hide());
  });
});

var save_index = 0;
document.querySelectorAll(".edit-profile").forEach((element, index) => {
  element.addEventListener("click", () => {
    save_index = index;
  });
});
// =====================================================================================================================

// ====================================== LOAD & SAVE Heating Profiles from Local Storage ==============================================

// FUNCTION: Save heating profiles from UI to localStorage
function saveHeatingProfileFromUI() {
  const tableRows = document.querySelectorAll(
    ".heating-profiles-container .heating-profiles-content .heating-profile-material"
  );
  let heatingProfiles = [];

  tableRows.forEach((row) => {
    if (row.style.display !== "") {
      let profile = {
        Material: row.querySelector(".material").textContent,
        Top: row.querySelector(".top-temp").textContent,
        Middle: row.querySelector(".middle-temp").textContent,
        Bottom: row.querySelector(".bottom-temp").textContent,
        Nozzle: row.querySelector(".nozzle-temp").textContent,
        Bed: row.querySelector(".bed-temp").textContent,
        Cnc: row.querySelector(".cnc").textContent,
      };
      heatingProfiles.push(profile);
    }
  });

  return heatingProfiles;
}

// FUNCTION: Main function to save heating profiles to localStorage
function saveHeatingProfiles() {
  const heatingProfiles = saveHeatingProfileFromUI();
  localStorage.setItem("HeatingProfiles", JSON.stringify(heatingProfiles));
}

// FUNCTION: Load heating profiles from localStorage
function loadHeatingProfiles() {
  const storedHeatingProfiles = localStorage.getItem("HeatingProfiles");
  return storedHeatingProfiles
    ? JSON.parse(storedHeatingProfiles)
    : initializeDefaultHeatingProfiles();
}

// FUNCTION: Initialize default heating profiles
function initializeDefaultHeatingProfiles() {
  // Example default values, modify as needed
  defaultHeatingProfiles = [
    {
      Material: "Airtech PC-GF",
      Top: 110,
      Middle: 200,
      Bottom: 250,
      Nozzle: 270,
      Bed: 100,
      Cnc: 10000,
    },
    {
      Material: "Airtech PP-GF",
      Top: 110,
      Middle: 190,
      Bottom: 220,
      Nozzle: 250,
      Bed: 90,
      Cnc: 10000,
    },
    {
      Material: "Airtech ABS-GF",
      Top: 110,
      Middle: 200,
      Bottom: 270,
      Nozzle: 290,
      Bed: 100,
      Cnc: 10000,
    },
    {
      Material: "Airtech PETG-GF",
      Top: 85,
      Middle: 10,
      Bottom: 160,
      Nozzle: 205,
      Bed: 50,
      Cnc: 21000,
    },
    {
      Material: "Recycled PP-GF",
      Top: 110,
      Middle: 190,
      Bottom: 220,
      Nozzle: 250,
      Bed: 90,
      Cnc: 21000,
    },
    {
      Material: "Default PLA",
      Top: 80,
      Middle: 100,
      Bottom: 160,
      Nozzle: 180,
      Bed: 40,
      Cnc: 10000,
    },
    {
      Material: "Default PETG",
      Top: 85,
      Middle: 120,
      Bottom: 160,
      Nozzle: 205,
      Bed: 60,
      Cnc: 10000,
    },
    {
      Material: "Default PC",
      Top: 110,
      Middle: 200,
      Bottom: 250,
      Nozzle: 270,
      Bed: 100,
      Cnc: 10000,
    },
    {
      Material: "Default PP",
      Top: 110,
      Middle: 190,
      Bottom: 220,
      Nozzle: 250,
      Bed: 90,
      Cnc: 10000,
    },
    {
      Material: "Default ABS",
      Top: 110,
      Middle: 200,
      Bottom: 270,
      Nozzle: 290,
      Bed: 100,
      Cnc: 10000,
    },
  ];
  localStorage.setItem(
    "HeatingProfiles",
    JSON.stringify(defaultHeatingProfiles)
  ); // save default heating profiles to localStorage
  return defaultHeatingProfiles;
}

// FUNCTION: Update heating profiles in UI display
function updateHeatingProfiles() {
  const heatingProfiles = loadHeatingProfiles();
  const tableRows = document.querySelectorAll(
    ".heating-profiles-container .heating-profiles-content .heating-profile-material"
  );
  // const tableRowsPopup = document.querySelectorAll(
  //   ".temp-popup-container .heating-profile-material"
  // );

  const updateRow = (row, profile, index) => {
    row.querySelector(".profile-number").textContent = `${index + 1}.`;
    row.querySelector(".material").textContent = profile.Material;
    row.querySelector(".top-temp").textContent = profile.Top;
    row.querySelector(".middle-temp").textContent = profile.Middle;
    row.querySelector(".bottom-temp").textContent = profile.Bottom;
    row.querySelector(".nozzle-temp").textContent = profile.Nozzle;
    row.querySelector(".bed-temp").textContent = profile.Bed;
    row.querySelector(".cnc").textContent = profile.Cnc;
    row.style.display = "flex";
  };

  heatingProfiles.forEach((profile, index) => {
    if (index < tableRows.length) {
      updateRow(tableRows[index], profile, index);
    }
    // if (index < tableRowsPopup.length) {
    //   updateRow(tableRowsPopup[index], profile, index);
    // }
  });
}

// Load temps on edit profile popup
function loadTempsOnEdit() {
  const editButtons = document.querySelectorAll(
    ".heating-profiles-container .edit-profile"
  );
  const userInputFields = document.querySelectorAll(".user-input");

  heatProfiles.forEach((profile, index) => {
    editButtons[index].addEventListener("click", () => {
      const profile = heatProfiles[index];
      // Now you have the profile corresponding to the clicked edit button.
      // You can do whatever you need with it here.

      // Assuming profile is an object with keys that correspond to the user input fields
      Object.values(profile).forEach((value, i) => {
        userInputFields[i].value = value;
      });
    });
  });
}
// =====================================================================================================================

// ============================================== Reset Local Storage ==================================================
function resetlocalStorageSettings() {
  defaultSettings = initializeDefaultSettings();
  localStorage.setItem("temperatureSettings", JSON.stringify(defaultSettings));

  defaultHeatingProfiles = initializeDefaultHeatingProfiles();

  window.location.reload();
}
// =====================================================================================================================
