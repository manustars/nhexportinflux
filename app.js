const express = require('express');
const axios = require('axios');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const app = express();

const NH_API_KEY = process.env.NH_API_KEY;
const NH_API_SECRET = process.env.NH_API_SECRET;
const NH_API_ORG_ID = process.env.NH_API_ORG_ID;
const INFLUXDB_HOST = process.env.INFLUXDB_HOST;
const INFLUXDB_PORT = process.env.INFLUXDB_PORT;
const INFLUXDB_DATABASE = process.env.INFLUXDB_DATABASE;
const INFLUXDB_USER = process.env.INFLUXDB_USER;
const INFLUXDB_PASSWORD = process.env.INFLUXDB_PASSWORD;

const influxDBURL = `http://${INFLUXDB_HOST}:${INFLUXDB_PORT}`;
const influxDBToken = `${INFLUXDB_USER}:${INFLUXDB_PASSWORD}`;
const client = new InfluxDB({ url: influxDBURL, token: influxDBToken });

const niceHashClient = axios.create({
  baseURL: 'https://api2.nicehash.com',
  timeout: 10000,
});

const fetchAndStoreData = async () => {
  try {
    const response = await niceHashClient.get('/main/api/v2/mining/rigs2', {
      params: { organizationId: NH_API_ORG_ID },
      headers: {
        'X-Time': Date.now().toString(),
        'X-Nonce': Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        'X-Organization-ID': NH_API_ORG_ID,
        'X-Request-Id': Date.now().toString(),
        'X-Auth': `${NH_API_KEY}:${NH_API_SECRET}`,
      },
    });

    const rig_statuses = response.data.miningRigs;

    const writeAPI = client.getWriteApi(INFLUXDB_ORG, INFLUXDB_DATABASE, 's');

    for (const rig of rig_statuses) {
      const point = new Point('rig_status')
        .tag('rig_id', rig.rigId)
        .floatField('unpaid_amount', rig.unpaidAmount)
        .floatField('profitability', rig.profitability)
        .stringField('miner_status', rig.minerStatus)
        .stringField('type', rig.type)
        .timestamp(new Date());

      writeAPI.writePoint(point);
    }

    writeAPI.close();
  } catch (error) {
    console.error('Error fetching or storing data:', error.message);
  }
};

// Schedule data fetching and storing every 30 seconds
setInterval(fetchAndStoreData, 30000);

app.listen(3000, () => {
  console.log('NiceHash exporter listening on port 3000');
});
