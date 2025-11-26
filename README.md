# Epicurus UI v3.3

A comprehensive offline user interface for the Epicurus Controller, supporting multiple system families with advanced temperature control, CNC milling capabilities, and automated cache management.

## 🚀 Core Features

### **System Family Support**
- **PE320**: Pellet extruder system with temperature control
- **Apollo**: Advanced extruder system with enhanced features  
- **Zeus**: Professional system with both extruder and CNC milling capabilities

### **Temperature Control**
- **Multi-zone heating**: Top, middle, bottom, and nozzle temperature control
- **Bed heating**: Support for up to 10 bed heaters across dual controllers
- **Preheat modes**: Standby and active temperature presets
- **Safety features**: Emergency stop, heater fault detection, and automatic shutdown
- **Real-time monitoring**: Live temperature display with visual indicators

### **CNC Milling (Zeus Systems)**
- **Spindle control**: Variable speed control with safety interlocks
- **Tool detection**: Automatic tool presence detection
- **Speed profiles**: Pre-configured RPM settings for different materials
- **Safety systems**: Emergency stop and spindle lock mechanisms

### **Material Profiles**
- **Pre-configured settings**: PLA, ABS, PETG, and custom material profiles
- **Temperature presets**: Optimized heating profiles for each material
- **CNC profiles**: Spindle speed settings for milling operations
- **Custom profiles**: User-defined material settings with save/load functionality

### **Advanced Features**
- **Dual controller support**: Main controller (192.168.1.100) and expansion controller (192.168.1.101)
- **Bed expansion toggle**: Enable/disable expansion controller via Developer Settings
- **IP fallback system**: Automatic fallback from 192.168.1.100 to 10.10.10.100
- **Manual IP selection**: Dropdown in Developer Settings to manually select controller IP
- **Part cooling control**: Variable fan speed control
- **Bed fixture plate**: Optional heated fixture plate support
- **Tool detection**: Automatic extruder and CNC tool detection
- **Developer settings**: Advanced configuration options (7 clicks on software version)
- **Enhanced settings loading**: Improved default value initialization for numpad
- **Staggered HTTP requests**: Prevents controller overload in standalone mode

### **Offline Operation**
- **Complete offline functionality**: No internet connection required
- **Local fonts**: Roboto fonts hosted locally
- **Local assets**: All images, CSS, and JavaScript served locally
- **Automated cache busting**: Automatic version management for updates

## 🛠️ Setup & Installation

### **Quick Start (Node.js)**

1. **Install Node.js** on your system
2. **Start the server**:
   ```bash
   npm start
   ```
3. **Open browser** to `http://localhost:8080`

### **Alternative Setup (Apache)**

1. **Enable Apache modules**: `mod_rewrite`, `mod_headers`
2. **Place files** in Apache document root
3. **Navigate** to `http://localhost/path-to-epicurus-ui/`

## 📁 Project Structure

```
Epicurus_UI/
├── index.html              # Main UI interface
├── main.js                 # Core application logic
├── styles.css             # Custom styling
├── build.js               # Automated build script
├── package.json           # Project configuration
├── css/                   # Webflow CSS files
├── fonts/                 # Local Roboto fonts
├── images/                # UI assets and icons
├── jquery/                # jQuery library
├── keyboard/              # On-screen keyboard
└── webserver/             # Local server files
```

## 🔧 Development

### **Automated Cache Management**
- **Pre-commit hook**: Automatically updates cache-busting parameters
- **Build script**: `npm run build` for manual cache updates
- **Version control**: Dynamic timestamp-based versioning

### **Making Changes**
1. **Edit files**: Modify HTML, CSS, or JavaScript as needed
2. **Commit changes**: Cache busting updates automatically
3. **Test locally**: Use `npm start` for development server

## ⚙️ Configuration

### **Duet Controller IPs**
- **Main Controller**: `192.168.1.100` (default, with automatic fallback to `10.10.10.100`)
- **Expansion Controller**: `192.168.1.101` (configurable, requires bed expansion toggle enabled)
- **IP Fallback**: Automatically tries `10.10.10.100` if `192.168.1.100` is unreachable
- **Change IPs**: Access Developer Settings (7 clicks on software version)
  - Use Controller IP dropdown to manually select IP address
  - IP selection persists across sessions

### **System Family Selection**
- **PE320**: Default extruder system
- **Apollo**: Advanced extruder with tool detection
- **Zeus**: Full system with CNC milling capabilities

### **Developer Settings**
- **Access**: Click software version 7 times within 5 seconds
- **Features**: 
  - System family selection (PE320, Apollo, Zeus)
  - Tool detection toggle (On/Off)
  - Bed expansion toggle (On/Off) - Enable/disable expansion controller
  - Controller IP selection (192.168.1.100 or 10.10.10.100)
  - Cache management
- **Cache clearing**: Manual cache clear and reload option

## 🚨 Safety Features

### **Emergency Systems**
- **Emergency Stop**: Immediate system shutdown (M112)
- **Heater Fault Detection**: Automatic fault detection and reporting
- **Temperature Monitoring**: Real-time temperature overshoot protection
- **Spindle Safety**: CNC spindle lock and speed control

### **Temperature Safety**
- **Multi-zone monitoring**: Individual heater zone monitoring
- **Fault reset**: Manual heater fault reset capability
- **Automatic shutdown**: Safety shutdown on critical faults

## 📊 Material Profiles

### **Pre-configured Materials**
- **PLA**: Standard 3D printing settings
- **ABS**: High-temperature printing settings
- **PETG**: Engineering-grade material settings
- **Custom**: User-defined material profiles

### **Profile Management**
- **Set profiles**: One-click material profile application
- **Custom profiles**: Save and load custom settings
- **Reset to default**: Restore factory default profiles

## 🔄 Cache Management

### **Automatic System**
- **Dynamic versioning**: Timestamp-based version generation
- **Cache busting**: Automatic query parameter updates
- **Clean commits**: No constant git file modifications
- **User experience**: Automatic cache clearing on updates

### **Manual Control**
- **Developer settings**: Manual cache clear option
- **Build script**: `npm run build` for manual updates
- **Version display**: Dynamic version information

## 🐛 Troubleshooting

### **Common Issues**
1. **Server not starting**: Check if port 8080 is available
2. **Cache issues**: Use Developer Settings → Clear Cache & Reload
3. **Controller connection**: Verify Duet IP addresses
4. **Temperature faults**: Use heater fault reset in settings

### **Debug Information**
- **Console logging**: Check browser developer tools
- **Version info**: Displayed in System Info tab
- **Controller status**: Real-time connection status
- **Error reporting**: Detailed error messages in console

## 📝 License

Proprietary - Rapid Fusion

## 👥 Support

For technical support and documentation, contact Rapid Fusion development team.

---

**Version**: v3.3  
**Last Updated**: 2024  
**Compatibility**: Duet 3D Printer Controllers