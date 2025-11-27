# UI Deployment Checklist

## UI Update

1. Close the UI application (Alt+F4)
2. Ensure internet connection is active (check WiFi indicator bottom right)
3. Open terminal (bottom left)
4. Navigate to UI directory:
   ```bash
   cd /var/www/html/Epicurus_UI
   ```
5. Save any local changes:
   ```bash
   git stash
   ```
6. Pull latest updates:
   ```bash
   git pull origin <branch_name>
   ```
   Example: `git pull origin v3.3-standalone`

**If update fails, perform reset:**
```bash
git fetch origin && git reset --hard origin/<branch_name>
```

7. Clear browser cache:
   - Open chromium browser: Ctrl+Shift+Delete
   - Delete all browsing data (clears cache)
8. Launch UI in kiosk mode:
   ```bash
   chromium-browser --kiosk --ignore-certificate-errors --ignore-ssl-errors http://localhost:8080
   ```

## UI Debugging
1. Close the UI application (Alt+F4)
2. Open chromium browser (bottom left browser icon) - enter localhost:8080 to open UI
3. Press F12 for developer settings
4. Monitor logs for errors (in red), take photos and send to Rapid Fusion support

## First Setup - System Selection

### Developer Settings Access
- [ ] Open Settings panel
- [ ] Click on UI version number 7 times within 5 seconds
- [ ] Developer settings tab appears
- [ ] Select correct system type: Zeus/Apollo/PE320
- [ ] System selection saves correctly

## Pre-Testing Setup
- [ ] Refresh the page (F5 or Ctrl+R)
- [ ] Verify correct branch/version is deployed
- [ ] Check browser console for errors on page load
- [ ] Verify connection status indicator shows green/connected (bottom of screen)
- [ ] Check that machine is powered on and connected
- [ ] Verify system type selection (Zeus/Apollo/PE320) is correct

## Tab Functionality Testing

### Extruder Control Tab
- [ ] Tab displays and loads correctly
- [ ] Extruder temperature readings display accurately and update in real-time
- [ ] Temperature numpad opens when clicking temperature fields
- [ ] Can enter temperature values using the numpad
- [ ] Temperature values save correctly after entry
- [ ] State changes display correctly (heater states visible)
- [ ] **Boost Pellets**: Click boost pellets button -> hear pellet boost sound for 3 seconds
- [ ] **Extruders Off**: Click extruders off button -> all heater states show "off"
- [ ] **Preheat Extruders**: Click preheat extruders button -> all heater states show "preheat" and begin heating to preheat temperatures

### Bed Control Tab
- [ ] Tab displays and loads correctly
- [ ] Correct number of beds are displayed for selected system type
- [ ] Bed temperature readings display accurately and update in real-time
- [ ] Temperature numpad opens when clicking temperature fields
- [ ] Can enter temperature values using the numpad
- [ ] Temperature values save correctly after entry
- [ ] Bed fixture plate toggle works correctly
- [ ] State changes display correctly (heater states visible)
- [ ] **Bed Off**: Click bed off button -> all bed heater states show "off"
- [ ] **Preheat Bed**: Click preheat bed button -> all bed heater states show "preheat" and begin heating to preheat temperatures

### Material Profiles Tab
- [ ] Tab displays and loads correctly
- [ ] Material profiles list displays correctly
- [ ] Can select material profiles
- [ ] Can edit existing profiles
- [ ] Can modify temperatures in profiles
- [ ] Profile modifications save correctly
- [ ] Saved profile changes persist after page reload
- [ ] **Set Button**: Clicking set button sets both extruder and bed temperatures to active (applies profile settings)

### Spindle Control Tab (Zeus Systems Only)
- [ ] Tab displays and loads correctly (Zeus systems only)
- [ ] Lock/unlock slider functions correctly
- [ ] Spindle RPM slider displays and functions correctly
- [ ] **Start Spindle Robot Program**: Click start spindle robot program button -> VFD enables -> slider changes spindle RPM (hear different pitch/sound)
- [ ] RPM changes are audible and correspond to slider position

### Settings Tab
- [ ] Tab displays and loads correctly
- [ ] Fan controls function properly (heatsink and barrel fans)
- [ ] Reload UI button works correctly
- [ ] Restart firmware button works correctly
- [ ] Part cooling toggle works correctly

### Tab Navigation
- [ ] Can switch between tabs smoothly
- [ ] Tab content loads correctly when selected
- [ ] Active tab is visually indicated
- [ ] No errors when switching tabs
- [ ] Machine status updates correctly across all tabs
- [ ] Connection status indicator reflects actual connection state

## Emergency & Safety Features

### Emergency Stop
- [ ] Emergency stop button responds immediately when pressed
- [ ] Emergency stop popup displays correctly
- [ ] UI remains responsive after pressing emergency stop
- [ ] Emergency stop works even when internet connection is lost
- [ ] Fault warnings display properly when issues occur
- [ ] Reset machine function works after emergency stop

## Network & Connectivity

### Online Operation
- [ ] UI functions correctly when connected to internet
- [ ] Connection status indicator shows green when online
- [ ] Commands send successfully to the machine

### Offline Operation
- [ ] UI remains responsive when internet connection is lost
- [ ] Connection status indicator shows red/disconnected when offline
- [ ] No UI freezing during network interruptions
- [ ] UI reconnects smoothly when internet is restored
- [ ] Commands queue properly when offline
- [ ] Emergency stop works when offline
- [ ] Timeout handling functions correctly
- [ ] Retry logic doesn't block UI

## User Interface

### Visual Elements
- [ ] All buttons are clickable and responsive
- [ ] Visual feedback appears on button clicks
- [ ] Popups/modals display and close correctly
- [ ] Settings panel opens and closes properly
- [ ] All icons display correctly
- [ ] Text is readable and properly formatted
- [ ] No overlapping elements or layout issues
- [ ] Color indicators show correct states (green/red/yellow)

## Data Persistence
- [ ] Settings persist across page reloads
- [ ] System type selection (Zeus/PE320/Apollo) retains after page refresh
- [ ] Material profile modifications persist after page reload
- [ ] User preferences are maintained

## Performance
- [ ] Page loads within 5 seconds
- [ ] No noticeable lag when interacting with controls
- [ ] Temperature updates smoothly without stuttering
- [ ] UI remains responsive during extended use

## Common Issues to Check
- [ ] Rapid button clicking doesn't cause errors or freezing
- [ ] Multiple controls can be used simultaneously without issues
- [ ] Invalid temperature inputs are handled gracefully
- [ ] UI doesn't freeze when machine is busy processing commands
- [ ] Server errors handled properly (503 errors don't freeze UI)

## Regression Testing
- [ ] Previously working features still function
- [ ] No new errors introduced

## Post-Testing
- [ ] Document any issues found
- [ ] Note browser/OS versions tested
- [ ] Record test date and tester name
- [ ] Update version number if applicable

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Branch/Version:** _______________  
**Test Date:** _______________  
**Tester Name:** _______________  
**System Model:** _______________  
**Browser:** _______________  
**Version Tested:** _______________

