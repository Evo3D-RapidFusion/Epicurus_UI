// ============================================= Global Variables ==================================================

var defaultNumOfHeaters = 8; // 4 extruder heaters + 4 bed heaters
var defaultNumOfExtruderHeaters = 4;
var defaultNumOfBedHeaters = 4;
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

// ========================================== Fetch Machine Status with Fallback URLs ========================================
// // Global variables for URLs
// const LOCAL_STATUS_URL = "http://localhost/machine/status";
// const REMOTE_STATUS_URL = "https://192.168.1.64/machine/status";
// const LOCAL_CODE_URL = "http://localhost/machine/code";
// const REMOTE_CODE_URL = "https://192.168.1.64/machine/code";

// // Global variables for active URLs
// let activeStatusURL = "";
// let activeCodeURL = "";

// // FUNCTION: Check if localhost:8080 is accessible
// async function isLocalhostAccessible() {
//   try {
//     const response = await fetch('http://localhost:8080', { method: 'HEAD' });
//     return response.ok;
//   } catch {
//     return false;
//   }
// }

// // FUNCTION: Load resources based on localhost availability
// function loadResources() {
//   isLocalhostAccessible().then(isAccessible => {
//     if (isAccessible) {
//       loadLocalResources();
//     } else {
//       loadFallbackResources();
//     }
//   });
// }

// // Load resources from localhost
// function loadLocalResources() {
//   loadScript('http://localhost:8080/keyboard/jquery.keyboard.js');
//   loadCSS('http://localhost:8080/keyboard/keyboard-dark.css');
//   loadCSS('http://localhost:8080/styles.css');
//   loadScript('http://localhost:8080/main.js');
// }

// // Load fallback resources (external)
// function loadFallbackResources() {
//   loadScript('https://fk6x9w-5000.csb.app/keyboard/jquery.keyboard.js');
//   loadCSS('https://fk6x9w-5000.csb.app/keyboard/keyboard-dark.css');
//   loadCSS('https://fk6x9w-5000.csb.app/styles.css');
//   loadScript('https://fk6x9w-5000.csb.app/main.js');
// }

// // Helper function to load JavaScript
// function loadScript(src) {
//   const script = document.createElement('script');
//   script.src = src;
//   script.defer = true;
//   document.head.appendChild(script);
// }

// // Helper function to load CSS
// function loadCSS(href) {
//   const link = document.createElement('link');
//   link.rel = 'stylesheet';
//   link.href = href;
//   link.defer = true;
//   document.head.appendChild(link);
// }

// // FUNCTION: Fetch machine status and set active URLs
// function fetchMachineStatus() {
//   return fetchData(LOCAL_STATUS_URL)
//     .then(statusData => {
//       activeStatusURL = LOCAL_STATUS_URL;
//       activeCodeURL = LOCAL_CODE_URL;
//       return statusData;
//     })
//     .catch(() => fetchData(REMOTE_STATUS_URL).then(statusData => {
//       activeStatusURL = REMOTE_STATUS_URL;
//       activeCodeURL = REMOTE_CODE_URL;
//       return statusData;
//     }));
// }

// // FUNCTION: Fetch data from a given URL
// function fetchData(url) {
//   return fetch(url)
//     .then(response => response.ok ? response.json() : Promise.reject())
//     .catch(() => Promise.reject('Failed to fetch data'));
// }

// // Execute the functions when the DOM is ready
// document.addEventListener('DOMContentLoaded', () => {
//   // Load resources based on availability
//   loadResources();
  
//   // Fetch machine status and log the result or handle error
//   fetchMachineStatus()
//     .then(statusData => console.log("Machine status fetched:", statusData))
//     .catch(error => console.error("Error fetching machine status:", error));
// });


// ========================================== HTTP requests with Duet Mainboard ========================================

// FUNCTION: HTTPS async GET/POST requests to Duet Mainboard
// Enhanced fetchData function to handle various error cases
async function fetchData(url, options) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      console.error(`Error: Network response was not ok. Status: ${response.status}`);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    const data =
      contentType && contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    return data;
  } catch (error) {
    if (error.name === 'TypeError') {
      console.error("Network or SSL error, unable to fetch data. Please check your connection or SSL settings.");
    } else {
      console.error("There has been a problem with your fetch operation:", error);
    }
    throw error;
  }
}

// FUNCTION: Fetch & update Duet Object Model via HTTP GET requests
function updateObjectModel() {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await fetchData(activeStatusURL); // HTTPS (Self-Signed SSL Certificate)

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
                ? "PREHEAT"
                : outputData[index].toUpperCase() + endText;
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

      // Call FUNCTIONS
      const configuredHeatersAll = findHeaters(data.heat.heaters);
      const configuredBedHeaters = findHeaters(data.heat.bedHeaters);
      const configuredChamberHeaters = findHeaters(data.heat.chamberHeaters);
      const configuredExtruderHeaters = configuredHeatersAll.slice(
        0,
        defaultNumOfExtruderHeaters
      );
      const cncSpindle = data.spindles[0];

      configuredBedHeaters.forEach((element, index) => {
        document
          .querySelectorAll(`.bed${index}`)
          .forEach((element) => (element.style.visibility = "visible"));
      });

      configuredBedHeaters.forEach((element, index) => {
        document.querySelectorAll(`.temp-tab-link.heater`)[
          index + 4
        ].style.display = "flex";
      });

      // update Extruder Current Temp
      const extruderHeaterTemps = updateUIdata(
        "extruderHeaters",
        data.heat.heaters,
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
        data.heat.heaters,
        "active",
        ".user-input-temp.active",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // update Extruder Preheat (Standby) Temp
      const extruderHeaterPreheatTemps = updateUIdata(
        "activePreheatAllHeaters",
        data.heat.heaters,
        "standby",
        ".user-input-temp.preheat",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      const extruderHeaterStates = updateUIdata(
        "extruderHeaters",
        data.heat.heaters,
        "state",
        ".temp-state.extruder",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      const bedHeaterTemps = updateUIdata(
        "bedHeaters",
        data.heat.heaters,
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
        data.heat.heaters,
        "active",
        ".user-input-temp.active",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // update Bed Preheat (Standby) Temp
      const bedHeaterPreheatTemps = updateUIdata(
        "activePreheatAllHeaters",
        data.heat.heaters,
        "standby",
        ".user-input-temp.preheat",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      const bedHeaterStates = updateUIdata(
        "bedHeaters",
        data.heat.heaters,
        "state",
        ".temp-state.bed",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters
      );

      // const chamberHeaterTemps = updateUIdata('chamberHeaters', data.heat.heaters, 'current', '.temp-data.chamber', configuredExtruderHeaters, configuredBedHeaters, configuredChamberHeaters, '°C');
      // const chamberHeaterStates = updateUIdata('chamberHeaters', data.heat.heaters, 'state', '.temp-state.chamber', configuredExtruderHeaters, configuredBedHeaters, configuredChamberHeaters);

      const allHeaterTemps = updateUIdata(
        "allHeaters",
        data.heat.heaters,
        "current",
        ".temp-data",
        configuredExtruderHeaters,
        configuredBedHeaters,
        configuredChamberHeaters,
        "°C"
      );
      const allHeaterStates = updateUIdata(
        "allHeaters",
        data.heat.heaters,
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

      // Heater fault error Popup
      for (let i = 0; i < allHeaterStates.length; i++) {
        if (allHeaterStates[i].includes("fault") && heaterFaults[i] === false) {
          const resetFault = window.confirm(
            `Heater ${
              i + 1
            } has a temperature fault. Reset the fault? If fault persists, contact local distributor or Rapid Fusion for support.`
          );
          if (resetFault) {
            sendGcode(`M292 M562 P${i}`); // reset heater fault
            heaterFaults[i] = true;
            setTimeout(() => (heaterFaults[i] = false), 500); // allow time for HTTP request in sendGcode to be processed to prevent multiple fault popup instances
          } else {
            heaterFaults[i] = true;
          }
        }
      }

      // CNC Spindle Speed Live Control
      if (spindleRunning === true && data.global.EstopFault === false) {
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

      if (data.global.EstopFault === true) {
        popupSpace.style.display = "flex"; // Show Background blur
        popup.style.display = "flex"; // Ensure popup is visible
      } else {
        popupSpace.style.display = "none"; // Remove Background blur
        popup.style.display = "none"; // Disable popup
      }      

      // Major Fault Detection - Extruder Servo & Spindle Motor
      // JavaScript to control the visibility and flashing effect
      if (data.global.ExtruderFault === false && data.global.CNCFault === false) {
        document.getElementById("fault-warning-container").style.display = "none";
      } else {
        if (data.global.ExtruderFault === true) {
          document.getElementById("fault-condition-1").textContent = "Extruder Servo Fault";
          document.getElementById("fault-condition-1").style.display = "flex";
        } else {
          document.getElementById("fault-condition-1").style.display = "none";
        }
        if (data.global.CNCFault === true) {
          document.getElementById("fault-condition-2").textContent = "Spindle Motor Fault";
          document.getElementById("fault-condition-2").style.display = "flex";
        } else {
          document.getElementById("fault-condition-2").style.display = "none";
        }
        document.getElementById("fault-warning-container").style.display = "flex";
      }

      // Fault Detection - CNC Mill Fault Popup
      if (data.global.CNCFault === true) {
        sendGcode(`M5`);
        confirmationModal.style.display = 'none';
        slider.disabled = true; // Ensure slider is disabled on page load
        speedControlTitle.textContent = 'Speed Control Locked'; // Set initial state to locked
        sliderUnlocked = false; // Initial state is locked
        updateLockIcon(); // Ensure icon is correctly set on load
        speedValueDisplay.classList.add('grayed-out');
        spindleOff == true;
      }

      switch (data.global.toolState) {
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
          if (data.global.EstopFault === false && data.global.CNCFault === false) {
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
      const uptimeInSeconds = data.sbc.uptime;
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
      document.getElementById("firmware-version").textContent = data.sbc.dsf.version;
      document.getElementById("bed-count").textContent = configuredBedHeaters.length;

      // Update & Restart Firmware
      // check-for-updates -- see buttonId
      // restart-firmware -- see buttonId

      // Tool Status
      if (data.global.toolState === null) {
        document.getElementById("connected-tool").textContent = "null";
      } else {
        document.getElementById("connected-tool").textContent = data.global.toolState;
      }
    
      // PE320 Pellet Extruder
      // document.getElementById("extruder-state-container").textContent = "available by default";
      // Check if any heater is in "fault" state
      if (
        data.heat.heaters[0].state === "fault" ||
        data.heat.heaters[1].state === "fault" ||
        data.heat.heaters[2].state === "fault" ||
        data.heat.heaters[3].state === "fault"
      ) {
        document.getElementById("extruder-state").textContent = "FAULT";
      }
      // Check if any heater is in "active" state
      else if (
        data.heat.heaters[0].state === "active" ||
        data.heat.heaters[1].state === "active" ||
        data.heat.heaters[2].state === "active" ||
        data.heat.heaters[3].state === "active"
      ) {
        document.getElementById("extruder-state").textContent = "ACTIVE";
      }
      // Check if any heater is in "standby" state
      else if (
        data.heat.heaters[0].state === "standby" ||
        data.heat.heaters[1].state === "standby" ||
        data.heat.heaters[2].state === "standby" ||
        data.heat.heaters[3].state === "standby"
      ) {
        document.getElementById("extruder-state").textContent = "PREHEAT";
      }
      // Check if all heaters are in "off" state
      else if (
        data.heat.heaters[0].state === "off" &&
        data.heat.heaters[1].state === "off" &&
        data.heat.heaters[2].state === "off" &&
        data.heat.heaters[3].state === "off"
      ) {
        document.getElementById("extruder-state").textContent = "OFF";
      }
      // Default to the state of the nozzle heater (heater 3)
      else {
        document.getElementById("extruder-state").textContent = (data.heat.heaters[3].state).toUpperCase();
      }

      // document.getElementById("extruder-runtime").textContent = "n/a";
      document.getElementById("material-sensor-left").textContent = data.global.materialSensorLEFT;
      document.getElementById("material-sensor-right").textContent = data.global.materialSensorRIGHT;
      // document.getElementById("heatsink-fan").textContent = see Embedded;
      // document.getElementById("barrel-fan").textContent = see Embedded;

      // Switch case for heatsink fan selection
      switch (document.querySelector('.heatsink-fan-button div').textContent) {
        case "Heatsink Fan 1":
          document.getElementById("heatsink-fan-tach").textContent = data.fans[0].rpm;
          selectedHeatsinkFan = "0";
          break;
        case "Heatsink Fan 2":
          document.getElementById("heatsink-fan-tach").textContent = data.fans[1].rpm;
          selectedHeatsinkFan = "0";
          break;
        case "Heatsink Fan 3":
          document.getElementById("heatsink-fan-tach").textContent = data.fans[2].rpm;
          selectedHeatsinkFan = "0";
          break;
        case "Heatsink Fan 4":
          document.getElementById("heatsink-fan-tach").textContent = data.fans[3].rpm;
          selectedHeatsinkFan = "0";
          break;
        default:
          document.getElementById("heatsink-fan-tach").textContent = "Config Error";
      }

      // Switch case for barrel fan selection
      switch (document.querySelector('.barrel-fan-button div').textContent) {
        case "Barrel Fan 1":
          document.getElementById("barrel-fan-tach").textContent = data.fans[4].rpm;
          selectedBarrelFan = "4";
          break;
        case "Barrel Fan 2":
          document.getElementById("barrel-fan-tach").textContent = data.fans[5].rpm;
          selectedBarrelFan = "5";
          break;
        case "Barrel Fan 3":
          document.getElementById("barrel-fan-tach").textContent = data.fans[6].rpm;
          selectedBarrelFan = "6";
          break;
        default:
          document.getElementById("barrel-fan-tach").textContent = "Config Error";
      }

      // CNC Mill
      // document.getElementById("cnc-state-container").textContent = formattedUptime;
      document.getElementById("cnc-state").textContent = (data.spindles[0].state).toUpperCase();
      // document.getElementById("cnc-runtime").textContent = "n/a";
      document.getElementById("cnc-speed").textContent = data.spindles[0].current;
      
      // Resolve the promise with the result
      resolve(globalObjectModelResult);
    } catch (error) {
      console.error("Error updating Object Model:", error);
      // Reject the promise with the error
      reject(error);
    }
  });
}

// Polling interval (in milliseconds)
const POLL_INTERVAL = 2000;

// Function to continuously check the server status and send commands once on state change from error to available
async function pollServerAndSendOnceOnStateChange() {
  let serverWasUnavailable = true; // Track whether the server was previously in an error state

  while (true) {
    try {
      const response = await fetchData("http://localhost/machine/status");

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
      const response = await fetchData(activeCodeURL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: gcode,
      });

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

// Start the continuous polling process
pollServerAndSendOnceOnStateChange();

// FUNCTION: call updateObjectModel & retrieve results
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
  } catch (error) {
    console.error("Error:", error);
  }
}
// =====================================================================================================================

// ================================= Heaters: Top, Middle, Bottom, Nozzle, Bed, Chamber =================================

// FUNCTION: Toggle heater states
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
  ];
  let setTemp = "";
  switch (heaterState) {
    case "OFF":
      setTemp = document.getElementById(
        `user-input-preheat-${heaterType[heaterIndex]}`
      ).textContent;
      sendGcode(`M568 P${heaterIndex} R${setTemp} A1`); // switch to preheat (standby)
      break;
    case "PREHEAT":
      setTemp = document.getElementById(
        `user-input-active-${heaterType[heaterIndex]}`
      ).textContent;
      sendGcode(`M568 P${heaterIndex} S${setTemp} A2`); // switch to active
      break;
    case "ACTIVE":
      setTemp = document.getElementById(
        `user-input-active-${heaterType[heaterIndex]}`
      ).textContent;
      sendGcode(`M568 P${heaterIndex} A0`); // switch to off
      break;
    case "FAULT":
      // Prompt the user to reset the fault
      const resetFault = window.confirm(
        `Heater ${
          heaterIndex + 1
        } has a temperature fault. Reset the fault? If fault persists, contact local distributor or Rapid Fusion for support.`
      );
      if (resetFault) {
        sendGcode(`M292 M562 P${heaterIndex}`); // reset heater fault
      } else {
        heaterFaults[heaterIndex] = true;
      }
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

// FUNCTION: configureBedHeaters
function configureBedHeaters(mode, configuredBedHeaters) {
  let gcodeString = "";
  let heaterType = ["bed0", "bed1", "bed2", "bed3"];
  configuredBedHeaters.forEach((heater, index) => {
    preheatTemp = document.getElementById(
      `user-input-preheat-${heaterType[index]}`
    ).textContent;
    activeTemp = document.getElementById(
      `user-input-active-${heaterType[index]}`
    ).textContent;
    gcodeString += `M568 P${
      index + configuredExtruderHeaters.length
    } S${activeTemp} R${preheatTemp} A${mode} `;
  });
  sendGcode(gcodeString);
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

document.addEventListener("DOMContentLoaded", function () {
  // Fetch Machine Status - LOCAL or REMOTE
  fetchMachineStatus();

  // Fetch Software Version - GitHub Release Tags from tags.txt [LOCAL]
  fetchLatestTag();

  // Update Object Model every 0.5 seconds
  setInterval(update, 500);
});

// Triggers on Full Page load (including all external resources)
window.onload = function() {

  // Load temperature settings on page load
  settings = loadSettings();

  // Hide beds in temp popup on startup
  var elements = document.querySelectorAll(".temp-tab-link.heater");
  for (var i = 4; i < elements.length; i++) {
    elements[i].style.display = "none";
  }

  // Hide beds in bed temperatures on startup
  for (let i = 0; i < defaultNumOfBedHeaters; i++) {
    document
      .querySelectorAll(`.bed${i}`)
      .forEach((element) => (element.style.visibility = "hidden"));
  }

  // Select Default Tabs on page load
  document.getElementById("default-tab").click();
  document.getElementById("system-info").click();

  // Update Object Model immediately on page load
  updateObjectModel();

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
      animation: flash 1s infinite;
    }
  `;
  document.head.appendChild(style);

  document.getElementById("fault-warning-container").classList.add("flash");  // Add flashing effect

  // document
  //   .querySelectorAll(`.fan-dropdown-list .fan-dropdown-content-text`)
  //   .forEach((element, index) =>
  //     element.addEventListener("click", () => {
  //       document.getElementById('heatsink-fan-main-text').textContent = element.textContent;
  //     })
  //   );

  // Initialise heating profiles on startup
  heatProfiles = loadHeatingProfiles();
  updateHeatingProfiles();
  loadTempsOnEdit();

  sendGcode(`M5`);
};

// ================================================ Github Repo =================================================

async function fetchLatestTag() {
  const url = 'http://localhost:8080/tags.txt'; // Local server URL to tags.txt

  try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch tags file');

      const text = await response.text();
      const latestTag = text.split('\n')[0].trim(); // Get the first line (latest tag)

      document.getElementById('software-version').textContent = `${latestTag}`;
  } catch (error) {
      console.error('Error fetching latest tag from local server:', error);
      
      // Fallback to check machine status and fetch version from GitHub if necessary
      const result = await fetchData("https://192.168.1.64/machine/status");
      if (result) {
          // If `fetchData` is successful, try fetching from GitHub
          fetchLatestVersion();
      } else {
          document.getElementById('software-version').textContent = 'Failed to fetch version';
      }
  }
}

async function fetchLatestVersion() {
  const owner = "Evo3D-RapidFusion";
  const repo = "Epicurus_UI";

  try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=1`); // Fetch releases (including pre-releases)
      
      if (!response.ok) {
          throw new Error("Network response was not ok");
      }
      
      const data = await response.json();
      const versionName = data[0]?.tag_name || "No releases found"; // Extract the latest release (including pre-releases)
      document.getElementById("software-version").textContent = versionName; // Display the version
  } catch (error) {
      console.error("Error fetching GitHub version:", error);
      document.getElementById("software-version").textContent = 'Failed to fetch version from GitHub';
  }
}

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
        // Prompt the user to restart machine
        const restartFirmware = window.confirm(`Restart Firmware?`);
        if (restartFirmware) {
          sendGcode('M999');
          location.reload();
        }
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
  element.addEventListener("click", () =>
    toggleHeaterStates(element.querySelector(".temp-state").textContent, index)
  );
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

  // default value = 0
  if (inputValue === 0) {
    inputValue = inputValue.slice(0, -1);
  }

  if (buttonIndex <= 8) {
    if (inputValue === settings[heaters].popup) {
      //saved value in local storage
      inputValue = buttonIndex + 1;
    } else {
      inputValue += buttonIndex + 1;
    }
  } else if (buttonIndex === 9) {
    // Clear input
    inputValue = 0; // reset default value
  } else if (buttonIndex === 10) {
    if (inputValue === settings[heaters].popup) {
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
    }
  })();

  switch (buttonIndex) {
    case 0: // active
      activeTemp.textContent = displayTemp;
      sendGcode(`M568 ${heater} S${displayTemp} A2`);
      saveSettings();
      break;
    case 1: // preheat
      preheatTemp.textContent = displayTemp;
      sendGcode(`M568 ${heater} R${displayTemp}`);
      saveSettings();
      break;
    case 2: // both
      activeTemp.textContent = displayTemp;
      sendGcode(`M568 ${heater} S${displayTemp} A2`);
      preheatTemp.textContent = displayTemp;
      sendGcode(`M568 ${heater} R${displayTemp}`);
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

      // Set Bed Temps
      document.getElementById("user-input-active-bed0").textContent = bedTemp;
      document.getElementById("user-input-preheat-bed0").textContent = bedTemp;
      document.getElementById("user-input-active-bed1").textContent = bedTemp;
      document.getElementById("user-input-preheat-bed1").textContent = bedTemp;
      document.getElementById("user-input-active-bed2").textContent = bedTemp;
      document.getElementById("user-input-preheat-bed2").textContent = bedTemp;
      document.getElementById("user-input-active-bed3").textContent = bedTemp;
      document.getElementById("user-input-preheat-bed3").textContent = bedTemp;

      sendGcode(
        `M568 P0 S${topTemp} R${topTemp} A2 M568 P1 S${middleTemp} R${middleTemp} A2 M568 P2 S${bottomTemp} R${bottomTemp} A2 M568 P3 S${nozzleTemp} R${nozzleTemp} A2`
      );
      let gcodeString = "";
      configuredBedHeaters.forEach((heater, index) => {
        gcodeString += `M568 P${index + 4} S${bedTemp} R${bedTemp} A2 `;
      });
      sendGcode(gcodeString);

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
      Middle: 200,
      Bottom: 200,
      Nozzle: 210,
      Bed: 90,
      Cnc: 10000,
    },
    {
      Material: "Airtech ABS-CF",
      Top: 150,
      Middle: 190,
      Bottom: 200,
      Nozzle: 210,
      Bed: 100,
      Cnc: 10000,
    },
    {
      Material: "Airtech PETG-GF",
      Top: 105,
      Middle: 140,
      Bottom: 160,
      Nozzle: 205,
      Bed: 50,
      Cnc: 21000,
    },
    {
      Material: "Recycled PP-GF",
      Top: 105,
      Middle: 180,
      Bottom: 195,
      Nozzle: 205,
      Bed: 90,
      Cnc: 21000,
    },
    {
      Material: "Default PLA",
      Top: 80,
      Middle: 140,
      Bottom: 150,
      Nozzle: 160,
      Bed: 40,
      Cnc: 10000,
    },
    {
      Material: "Default PETG",
      Top: 105,
      Middle: 140,
      Bottom: 160,
      Nozzle: 205,
      Bed: 50,
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
      Middle: 200,
      Bottom: 200,
      Nozzle: 210,
      Bed: 90,
      Cnc: 10000,
    },
    {
      Material: "Default ABS",
      Top: 150,
      Middle: 190,
      Bottom: 200,
      Nozzle: 210,
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
