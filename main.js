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
// let spindleRunning = false; // already declared in embedded code

// =====================================================================================================================

// ========================================== HTTP requests with Duet Mainboard ========================================

// FUNCTION: HTTPS async GET/POST requests to Duet Mainboard
async function fetchData(url, options) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `Network response was not ok. Status: ${response.status}`
      );
    }

    const contentType = response.headers.get("content-type");
    const data =
      contentType && contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    return data;
  } catch (error) {
    console.error("There has been a problem with your fetch operation:", error);
    throw error;
  }
}

// FUNCTION: Fetch & update Duet Object Model via HTTP GET requests
function updateObjectModel() {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await fetchData("http://localhost/machine/status"); // HTTPS (Self-Signed SSL Certificate)

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
            element.textContent =
              outputData[index] === "standby"
                ? "Preheat"
                : outputData[index].replace(/^\w/, (c) => c.toUpperCase()) +
                  endText;
          } else {
            if (Math.abs(outputData[index] + 273.1) < 0.0001) {
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
      if (
        extruderHeaterStates.includes("active") ||
        extruderHeaterStates.includes("standby")
      ) {
        document
          .querySelectorAll(".radial-gradient-background.extruder")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-orange.extruder")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-red.extruder")
          .forEach((element) => (element.style.display = "inline-block"));
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
        }
      }

      // Change bed glow
      if (
        bedHeaterStates.includes("active") ||
        bedHeaterStates.includes("standby")
      ) {
        document
          .querySelectorAll(".radial-gradient-background.bed")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-orange.bed")
          .forEach((element) => (element.style.display = "none"));
        document
          .querySelectorAll(".radial-gradient-background-red.bed")
          .forEach((element) => (element.style.display = "inline-block"));
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
      if (spindleRunning == true) {
        document.getElementById(
          "radial-gradient-background-cnc-white"
        ).style.display = "none";
        document.getElementById(
          "radial-gradient-background-cnc-red"
        ).style.display = "inline-block";

        // Update Spindle RPM from Duet Object Model
        // document.getElementById("speedSlider").value = cncSpindle.current;
        // updateSliderBackground();
        // spindleSpeed = cncSpindle.current;

        let updatedSpindleSpeed =
          document.getElementById("speedValue").textContent;
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
        if (spindleOff == false) {
          sendGcode(`M5`);
          spindleOff == true;
        }
      }

      // Resolve the promise with the result
      resolve(globalObjectModelResult);
    } catch (error) {
      console.error("Error updating Object Model:", error);
      // Reject the promise with the error
      reject(error);
    }
  });
}

// FUNCTION: send G-code to Duet via HTTP POST request
async function sendGcode(gcode) {
  try {
    const responseText = await fetchData("http://localhost/machine/code", {
      // HTTPS (Self-Signed SSL Certificate)
      method: "POST",
      headers: {
        "Content-Type": "text/plain", // Set the content type to text/plain
      },
      body: gcode, // G-code command in body attribute
    });

    console.log(`Response from sending gcode ${gcode}: ${responseText}`);
  } catch (error) {
    console.error(`Error sending gcode ${gcode}: ${error}`);
  }
}

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
    case "Off":
      setTemp = document.getElementById(
        `user-input-preheat-${heaterType[heaterIndex]}`
      ).textContent;
      sendGcode(`M568 P${heaterIndex} R${setTemp} A1`); // switch to preheat (standby)
      break;
    case "Preheat":
      setTemp = document.getElementById(
        `user-input-active-${heaterType[heaterIndex]}`
      ).textContent;
      sendGcode(`M568 P${heaterIndex} S${setTemp} A2`); // switch to active
      break;
    case "Active":
      setTemp = document.getElementById(
        `user-input-active-${heaterType[heaterIndex]}`
      ).textContent;
      sendGcode(`M568 P${heaterIndex} A0`); // switch to off
      break;
    case "Fault":
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

// Update Object Model every 0.5 seconds
setInterval(update, 500);

// Update Object Model immediately on page load
document.addEventListener("DOMContentLoaded", updateObjectModel);

// Initialise heating profiles on startup
heatProfiles = loadHeatingProfiles();
updateHeatingProfiles();
loadTempsOnEdit();

sendGcode(`M5`);
// =====================================================================================================================

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
        sendGcode('M98 P"Part cooling off.g"');
        break;
      case "part-cooling-off":
      case "part-cooling-off-icon":
        sendGcode('M98 P"Part cooling on.g"');
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
        slider.value = 18000;
        speedValueDisplay.textContent = 18000; // Update the display to show 18000 RPM
        updateSliderBackground(); // Ensure the slider's background is updated accordingly
        updatedSpindleSpeed = 18000;
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
      document.querySelector(".main-tab-link").click();
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
  function handleTouchEvents(keyboard, action) {
    const events = ["touchstart", "touchend", "touchcancel"];

    keyboard.$keyboard.find("button.ui-keyboard-button").each(function () {
      events.forEach((event) => {
        this.removeEventListener(event, touchHandler, { passive: true }); // Remove existing listeners to avoid duplicates
        this.addEventListener(event, touchHandler, { passive: true }); // Add the event listener
      });
    });
  }

  // NumPad logic
  var maxInteger = 3,
    maxFractional = 2,
    regex = new RegExp(
      `([+-]?\\d{${maxInteger}}(?:\\.\\d{0,${maxFractional}})?)`
    ),
    regex1 = /^0\d$/;

  $.keyboard.defaultOptions.usePreview = false;
  $.keyboard.defaultOptions.autoAccept = true;

  // Material Name Keyboard
  keyboards.push(
    $("#material-name-input")
      .keyboard({
        alwaysOpen: true,
        userClosed: false,

        visible: function (e, keyboard, el) {
          keyboard.$preview[0].select(); // highlight text on visible
        },

        // hidden: function (e, keyboard, el) {
        //     handleTouchEvents(keyboard, 'removeEventListener'); // remove event listeners to change button opacity on click
        // }
      })
      .getkeyboard()
  );
  handleTouchEvents(keyboards[0]); // Add touch event listeners only once
  keyboards[0].$keyboard.hide();

  // Temp Keyboards (Numpad)
  $(".material-data-temp-input.user-input").each(function (index) {
    keyboards.push(
      $(this)
        .keyboard({
          alwaysOpen: true,
          userClosed: false,

          visible: function (e, keyboard, el) {
            // highlight text on visible
            keyboard.$preview[0].select(); // highlight text on visible
          },

          // hidden: function (e, keyboard, el) {
          //     handleTouchEvents(keyboard, 'removeEventListener'); // remove event listeners to change button opacity on click
          // },

          layout: "custom",
          customLayout: {
            normal: ["7 8 9", "4 5 6", "1 2 3", "{clear} 0 {b}"],
          },
          restrictInput: true,
          change: function (e, keyboard, el) {
            var change,
              val = keyboard.$preview.val().replace(/[^\d-.]/g, ""),
              c = $.keyboard.caret(keyboard.$preview),
              start = c.start,
              end = c.end,
              restrict = val.match(regex);
            if (restrict) {
              restrict = restrict.slice(1).join("");
            } else {
              restrict = val;
            }
            // Next, use regex1 to check for unwanted patterns
            if (regex1.test(restrict)) {
              restrict = "0"; // Clear the input if it matches patterns like 00, 01, 02, etc.
            }

            // Check if value exceeds 400
            if (parseFloat(restrict) > 400) {
              restrict = "400";
            }
            keyboard.$preview.val(restrict);
            change = restrict.length - val.length;
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
    },
    {
      Material: "Airtech PP-GF",
      Top: 110,
      Middle: 200,
      Bottom: 200,
      Nozzle: 210,
      Bed: 90,
    },
    {
      Material: "Airtech ABS-CF",
      Top: 150,
      Middle: 190,
      Bottom: 200,
      Nozzle: 210,
      Bed: 100,
    },
    {
      Material: "Airtech PETG-GF",
      Top: 105,
      Middle: 140,
      Bottom: 160,
      Nozzle: 205,
      Bed: 50,
    },
    {
      Material: "HDPE",
      Top: 110,
      Middle: 190,
      Bottom: 220,
      Nozzle: 240,
      Bed: 80,
    },
    {
      Material: "Default PLA",
      Top: 80,
      Middle: 140,
      Bottom: 150,
      Nozzle: 160,
      Bed: 40,
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
  const tableRowsPopup = document.querySelectorAll(
    ".temp-popup-container .heating-profile-material"
  );

  const updateRow = (row, profile, index) => {
    row.querySelector(".profile-number").textContent = `${index + 1}.`;
    row.querySelector(".material").textContent = profile.Material;
    row.querySelector(".top-temp").textContent = profile.Top;
    row.querySelector(".middle-temp").textContent = profile.Middle;
    row.querySelector(".bottom-temp").textContent = profile.Bottom;
    row.querySelector(".nozzle-temp").textContent = profile.Nozzle;
    row.querySelector(".bed-temp").textContent = profile.Bed;
    row.style.display = "flex";
  };

  heatingProfiles.forEach((profile, index) => {
    if (index < tableRows.length) {
      updateRow(tableRows[index], profile, index);
    }
    if (index < tableRowsPopup.length) {
      updateRow(tableRowsPopup[index], profile, index);
    }
  });

  const headerColumnsAction = document.querySelectorAll(
    ".heating-profiles-header-columns-action"
  );
  headerColumnsAction.forEach(
    (element) =>
      (element.style.width = heatingProfiles.length > 6 ? "232px" : "217px")
  );
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
