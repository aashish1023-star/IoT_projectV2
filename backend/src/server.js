const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const SensorData = require("./models/SensorData");
const Alert = require("./models/Alert");
const config = require("./config");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());

let latestSettings = {
  minTemp: 15,
  maxTemp: 35,
  minHumidity: 30,
  maxHumidity: 70,
  email: config.defaultAlertEmail
};

let lastSensorPayload = null;
let deviceOnline = false;
let lastHeartbeatMs = 0;

let mailer = null;
if (config.gmailUser && config.gmailAppPassword) {
  try {
    mailer = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.gmailUser,
        pass: config.gmailAppPassword
      }
    });
  } catch (e) {
    console.error("Failed to create mail transporter:", e.message);
    mailer = null;
  }
}

const withinRangeFilter = (period) => {
  const now = new Date();
  const start = new Date(now);

  if (period === "daily") start.setDate(now.getDate() - 1);
  if (period === "weekly") start.setDate(now.getDate() - 7);
  if (period === "monthly") start.setMonth(now.getMonth() - 1);

  return start;
};

const asCsv = (rows) => {
  const parser = new Parser({
    fields: ["timestamp", "date", "month", "year", "temperature", "humidity"]
  });
  return parser.parse(rows);
};

const asExcel = async (rows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("SensorData");
  sheet.columns = [
    { header: "Timestamp", key: "timestamp", width: 18 },
    { header: "Date", key: "date", width: 10 },
    { header: "Month", key: "month", width: 10 },
    { header: "Year", key: "year", width: 10 },
    { header: "Temperature (C)", key: "temperature", width: 16 },
    { header: "Humidity (%)", key: "humidity", width: 14 }
  ];
  rows.forEach((row) => sheet.addRow(row));
  return workbook.xlsx.writeBuffer();
};

const asPdf = (rows, res) => {
  const doc = new PDFDocument({ margin: 30 });
  doc.pipe(res);
  doc.fontSize(16).text("IoT Sensor Report", { underline: true });
  doc.moveDown();
  rows.forEach((r) => {
    doc
      .fontSize(11)
      .text(
        `${r.year}-${r.month}-${r.date} ${r.timestamp} | Temp: ${r.temperature}C | Humidity: ${r.humidity}%`
      );
  });
  doc.end();
};

const sendAlertEmail = async (message, payload, to) => {
  if (!mailer || !to) return;
  try {
    await mailer.sendMail({
      from: config.gmailUser,
      to,
      subject: "IoT Threshold Alert - ESP32 DHT22",
      html: `
      <h3>Threshold Breach Detected</h3>
      <p>${message}</p>
      <ul>
        <li>Temperature: <b>${payload.temperature} C</b></li>
        <li>Humidity: <b>${payload.humidity} %</b></li>
        <li>Date: <b>${payload.year}-${payload.month}-${payload.date}</b></li>
        <li>Timestamp: <b>${payload.timestamp}</b></li>
      </ul>
    `
    });
  } catch (err) {
    console.error("Failed to send alert email:", err && err.message ? err.message : err);
  }
};

const createAlertEvent = async (message, payload) => {
  const event = await Alert.create({
    type: "event",
    email: latestSettings.email,
    minTemp: latestSettings.minTemp,
    maxTemp: latestSettings.maxTemp,
    minHumidity: latestSettings.minHumidity,
    maxHumidity: latestSettings.maxHumidity,
    message,
    temperature: payload.temperature,
    humidity: payload.humidity,
    timestamp: payload.timestamp,
    date: payload.date,
    month: payload.month,
    year: payload.year
  });

  io.emit("alert:event", event);
  await sendAlertEmail(message, payload, latestSettings.email);
};

const checkThresholds = async (payload) => {
  const events = [];
  if (payload.temperature < latestSettings.minTemp) {
    events.push(`Temperature dropped below minimum (${latestSettings.minTemp} C)`);
  }
  if (payload.temperature > latestSettings.maxTemp) {
    events.push(`Temperature exceeded maximum (${latestSettings.maxTemp} C)`);
  }
  if (payload.humidity < latestSettings.minHumidity) {
    events.push(`Humidity dropped below minimum (${latestSettings.minHumidity} %)`);
  }
  if (payload.humidity > latestSettings.maxHumidity) {
    events.push(`Humidity exceeded maximum (${latestSettings.maxHumidity} %)`);
  }

  for (const msg of events) {
    await createAlertEvent(msg, payload);
  }
};

const parseMqttPayload = (raw) => {
  try {
    const payload = JSON.parse(raw.toString());
    return {
      temperature: Number(payload.temperature),
      humidity: Number(payload.humidity),
      timestamp: String(payload.timestamp),
      date: Number(payload.date),
      month: Number(payload.month),
      year: Number(payload.year)
    };
  } catch {
    return null;
  }
};

const mqttClient = mqtt.connect(config.mqttBrokerUrl);
mqttClient.on("connect", () => {
  mqttClient.subscribe(config.mqttTopic, (err) => {
    if (!err) {
      console.log(`Subscribed to ${config.mqttTopic}`);
    }
  });
});

mqttClient.on("message", async (_topic, message) => {
  const payload = parseMqttPayload(message);
  if (!payload || Number.isNaN(payload.temperature) || Number.isNaN(payload.humidity)) return;

  lastSensorPayload = payload;
  lastHeartbeatMs = Date.now();
  deviceOnline = true;

  const saved = await SensorData.create(payload);
  io.emit("sensor:update", saved);
  await checkThresholds(payload);
});

setInterval(() => {
  const stale = Date.now() - lastHeartbeatMs > 120000;
  if (stale && deviceOnline) {
    deviceOnline = false;
    io.emit("device:status", {
      online: false,
      lastUpdated: lastSensorPayload ? lastSensorPayload.timestamp : null
    });
  }
}, 10000);

io.on("connection", (socket) => {
  socket.emit("device:status", {
    online: deviceOnline,
    lastUpdated: lastSensorPayload ? lastSensorPayload.timestamp : null
  });

  if (lastSensorPayload) {
    socket.emit("sensor:update", lastSensorPayload);
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/settings", (_req, res) => {
  res.json(latestSettings);
});

app.post("/api/settings", async (req, res) => {
  const { minTemp, maxTemp, minHumidity, maxHumidity, email } = req.body;
  latestSettings = {
    minTemp: Number(minTemp),
    maxTemp: Number(maxTemp),
    minHumidity: Number(minHumidity),
    maxHumidity: Number(maxHumidity),
    email: String(email)
  };

  const saved = await Alert.create({
    type: "settings",
    ...latestSettings
  });

  io.emit("alert:settings", latestSettings);
  res.status(201).json(saved);
});

app.get("/api/sensor/latest", async (_req, res) => {
  const latest = await SensorData.findOne().sort({ createdAt: -1 });
  res.json(latest);
});

app.get("/api/sensor/history", async (req, res) => {
  const period = req.query.period || "daily";
  const startDate = withinRangeFilter(period);
  const data = await SensorData.find({ createdAt: { $gte: startDate } }).sort({ createdAt: 1 });
  res.json(data);
});

app.get("/api/alerts/events", async (_req, res) => {
  const events = await Alert.find({ type: "event" }).sort({ createdAt: -1 }).limit(100);
  res.json(events);
});

app.get("/api/export/:format", async (req, res) => {
  const { format } = req.params;
  const period = req.query.period || "daily";
  const startDate = withinRangeFilter(period);
  const data = await SensorData.find({ createdAt: { $gte: startDate } }).sort({ createdAt: 1 });

  if (format === "csv") {
    const csv = asCsv(data);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="sensor-${period}.csv"`);
    return res.send(csv);
  }

  if (format === "xlsx") {
    const excelBuffer = await asExcel(data);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="sensor-${period}.xlsx"`);
    return res.send(Buffer.from(excelBuffer));
  }

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sensor-${period}.pdf"`);
    return asPdf(data, res);
  }

  return res.status(400).json({ error: "Unsupported format. Use csv, xlsx, or pdf." });
});

const bootstrap = async () => {
  await mongoose.connect(config.mongodbUri);

  const lastSettings = await Alert.findOne({ type: "settings" }).sort({ createdAt: -1 });
  if (lastSettings) {
    latestSettings = {
      minTemp: lastSettings.minTemp,
      maxTemp: lastSettings.maxTemp,
      minHumidity: lastSettings.minHumidity,
      maxHumidity: lastSettings.maxHumidity,
      email: lastSettings.email
    };
  }

  server.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
};

bootstrap().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});
