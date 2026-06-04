module.exports = {
  server: {
    httpPort: 3000,
    wsPort: 8080
  },
  sensors: {
    reportInterval: 300000,
    offlineThreshold: 900000
  },
  alarm: {
    pressureDropThreshold: 0.2,
    nightFlowMultiplier: 1.5,
    nightStartHour: 2,
    nightEndHour: 4
  },
  hydraulic: {
    normalPressureMin: 0.25,
    normalPressureMax: 0.45,
    warningPressureMin: 0.15,
    warningPressureMax: 0.55
  }
};
