const Influx = require('influx');

// Configura il client InfluxDB
const influx = new Influx.InfluxDB({
  host: process.env.INFLUXDB_HOST,
  port: process.env.INFLUXDB_PORT,
  database: process.env.INFLUXDB_DB,
  token: process.env.INFLUXDB_TOKEN,
});

module.exports = influx;
