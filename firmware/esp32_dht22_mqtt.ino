#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <configTime.h>
#include <time.h>

#define DHTPIN 14
#define DHTTYPE DHT22

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "iot/esp32/dht22";

// Timezone configuration: Nepal Standard Time (UTC+5:45)
// POSIX format: NPT-5:45:00 (note: POSIX uses negative offset from UTC)
const char* TZ_INFO = "NPT-5:45:00";

WiFiClient espClient;
PubSubClient mqttClient(espClient);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 3600000);  // Update every hour
DHT dht(DHTPIN, DHTTYPE);

bool ntpSynced = false;

const unsigned long PUBLISH_INTERVAL_MS = 60000;  // 1 minute
unsigned long nextPublishMs = 0;

void connectWiFi() {
  Serial.print("Connecting WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    String clientId = "ESP32-DHT22-" + String(random(0xffff), HEX);
    Serial.print("Connecting MQTT...");
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retry in 3s");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  connectWiFi();
  
  // Configure timezone and sync time from NTP
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  setenv("TZ", TZ_INFO, 1);
  tzset();
  
  // Wait for NTP sync with retry logic
  Serial.print("Syncing time with NTP...");
  int ntpRetries = 0;
  time_t now = time(nullptr);
  while (now < 24 * 3600 && ntpRetries < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    ntpRetries++;
  }
  
  if (now > 24 * 3600) {
    ntpSynced = true;
    Serial.println("\nNTP sync successful!");
    Serial.print("Current time: ");
    Serial.println(ctime(&now));
  } else {
    Serial.println("\nNTP sync failed, using fallback");
    ntpSynced = false;
  }
  
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  timeClient.begin();
  nextPublishMs = millis() + PUBLISH_INTERVAL_MS;
  Serial.println("Publish interval configured: 60000 ms (1 minute)");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  unsigned long now = millis();
  if ((long)(now - nextPublishMs) >= 0) {
    nextPublishMs += PUBLISH_INTERVAL_MS;

    // Read temperature and humidity ONCE per cycle
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("DHT read failed");
      return;
    }

    // Get current time
    time_t epochTime = time(nullptr);
    struct tm* timeinfo = localtime(&epochTime);
    
    // Format timestamp as HH:MM:SS
    char timeStr[20];
    strftime(timeStr, sizeof(timeStr), "%H:%M:%S", timeinfo);
    
    // Extract date components
    int day = timeinfo->tm_mday;
    int month = timeinfo->tm_mon + 1;
    int year = timeinfo->tm_year + 1900;

    // Build JSON payload
    String payload = "{";
    payload += "\"temperature\":" + String(temperature, 2) + ",";
    payload += "\"humidity\":" + String(humidity, 2) + ",";
    payload += "\"timestamp\":\"" + String(timeStr) + "\",";
    payload += "\"date\":" + String(day) + ",";
    payload += "\"month\":" + String(month) + ",";
    payload += "\"year\":" + String(year);
    payload += "}";

    bool ok = mqttClient.publish(MQTT_TOPIC, payload.c_str(), true);
    Serial.print("Publish payload: ");
    Serial.println(payload);
    Serial.println(ok ? "Publish success" : "Publish failed");
    Serial.println("Next publish in ~60 seconds");
  }
}
