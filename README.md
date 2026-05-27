# IoT Project V2 - ESP32 DHT22 Monitoring Platform

Professional cross-platform IoT monitoring stack with:
- ESP32 + DHT22 firmware (MQTT publish every 1 minute)
- Node.js backend (Express + MQTT.js + Socket.IO + MongoDB + Nodemailer)
- React Native Expo frontend (Android, iOS, tablet, web)

## Architecture
- ESP32 publishes JSON to MQTT topic `iot/esp32/dht22`
- Backend subscribes, stores `SensorData`, compares thresholds, emits live socket updates
- Dashboard listens via Socket.IO and renders animated cards + line charts
- Alert Settings updates min/max values + alert email
- Alerts are persisted in MongoDB `Alerts` collection and sent via Gmail SMTP
- Export endpoint provides CSV, Excel, and PDF reports with daily/weekly/monthly filters

## Folder Structure
- `backend` - API, MQTT subscriber, storage, alerting, export
- `mobile` - Expo app with `Dashboard` and `Alert Settings`
- `firmware` - Arduino IDE sketch for ESP32

## Backend Setup
1. Copy `backend/.env.example` to `backend/.env`
2. Update MongoDB URI, Gmail, and MQTT settings
3. Install deps and run:
   - `cd backend`
   - `npm install`
   - `npm run dev`

## Mobile Setup
1. Start backend first on port `5000`
2. Install deps and run:
   - `cd mobile`
   - `npm install`
   - `npm run start`

> For physical device testing, replace `API_BASE` in `mobile/App.js` with your backend LAN IP (for example `http://192.168.1.9:5000`).

## Firmware Setup
1. Open `firmware/esp32_dht22_mqtt.ino` in Arduino IDE
2. Install required libraries:
   - `WiFi.h`
   - `PubSubClient.h`
   - `DHT.h`
   - `NTPClient.h`
   - `WiFiUdp.h`
3. Configure:
   - WiFi SSID/password
   - MQTT broker/topic
4. Flash ESP32 and monitor serial output at 115200 baud

## MongoDB Collections
- `SensorData`: `temperature`, `humidity`, `timestamp`, `date`, `month`, `year`
- `Alerts`: settings records (`type=settings`) and threshold events (`type=event`)
