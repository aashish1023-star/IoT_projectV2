const mongoose = require("mongoose");

const sensorDataSchema = new mongoose.Schema(
  {
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    timestamp: { type: String, required: true },
    date: { type: Number, required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SensorData", sensorDataSchema);
