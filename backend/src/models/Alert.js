const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["settings", "event"],
      required: true
    },
    minTemp: Number,
    maxTemp: Number,
    minHumidity: Number,
    maxHumidity: Number,
    email: { type: String, required: true },
    message: String,
    temperature: Number,
    humidity: Number,
    timestamp: String,
    date: Number,
    month: Number,
    year: Number
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alert", alertSchema);
