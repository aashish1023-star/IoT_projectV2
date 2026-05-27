require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  mongodbUri: process.env.MONGODB_URI,
  mqttBrokerUrl: process.env.MQTT_BROKER_URL || "mqtt://broker.hivemq.com:1883",
  mqttTopic: process.env.MQTT_TOPIC || "iot/esp32/dht22",
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  defaultAlertEmail: process.env.ALERT_EMAIL_DEFAULT || "alerts@example.com"
};
