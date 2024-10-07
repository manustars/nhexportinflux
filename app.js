const NicehashJS = require('./nicehash');
const client = require('prom-client');
const Gauge = client.Gauge;
const express = require('express');
require('dotenv').config();

// settings
const port = process.env.PORT || 3000;
const refreshRateSeconds = process.env.REFRESH_RATE_SECONDS || 30;
const nodeMetricsPrefix = process.env.NODE_METRICS_PREFIX || '';
const prefix = process.env.NH_METRICS_PREFIX || 'nh_';
const apiKey = process.env.NH_API_KEY;
const apiSecret = process.env.NH_API_SECRET;
const organizationId = process.env.NH_API_ORG_ID;
const rates = process.env.NH_RATES ? process.env.NH_RATES.split(',') : ['BTCUSDC', 'BTCEURS'];

if (!apiKey || !apiSecret || !organizationId) {
  console.log("You need an API key, API secret, and organization ID!");
  console.log("https://www.nicehash.com/my/settings/keys");
  return 1;
}

// init libs
const app = express();
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: nodeMetricsPrefix });

const register = client.register;

const nhClient = new NicehashJS({
  apiKey,
  apiSecret,
  organizationId
});

// metrics
const totalRigs = new Gauge({
  name: prefix + 'total_rigs',
  help: 'Number of rigs you own'
});
const totalDevices = new Gauge({
  name: prefix + 'total_devices',
  help: 'Number of devices in the rigs'
});
const totalProfitability = new Gauge({
  name: prefix + 'total_profitability',
  help: 'Total profitability'
});
const unpaidAmount = new Gauge({
  name: prefix + 'unpaid_amount',
  help: 'Unpaid amount'
});
const totalBtc = new Gauge({
  name: prefix + 'total_btc',
  help: 'Total BTC',
});
const rateGauges = rates.map(r => {
  return {
    rate: r,
    gauge: new Gauge({
      name: prefix + r.toLowerCase() + '_rate',
      help: r + ' rate',
    })
  }
});
const minerStatuses = new Gauge({
  name: prefix + 'miner_statuses',
  help: 'Miner statuses',
  labelNames: ['status'],
});
const devicesStatuses = new Gauge({
  name: prefix + 'devices_statuses',
  help: 'Devices statuses',
  labelNames: ['status'],
});
const deviceTemp = new Gauge({
  name: prefix + 'device_temp',
  help: 'Device temperature',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const deviceLoad = new Gauge({
  name: prefix + 'device_load',
  help: 'Device load',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const devicePower = new Gauge({
  name: prefix + 'device_power',
  help: 'Device power usage',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const deviceSpeed = new Gauge({
  name: prefix + 'device_speed',
  help: 'Device speed',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type', 'algo', 'suffix'],
});
const rigStatusTime = new Gauge({
  name: prefix + 'rig_status_time',
  help: 'Rig status time',
  labelNames: ['rig_name', 'rig_id', 'rig_status'],
});
const rigJoinTime = new Gauge({
  name: prefix + 'rig_join_time',
  help: 'Rig join time',
  labelNames: ['rig_name', 'rig_id'],
});
const deviceStatusInfo = new Gauge({
  name: prefix + 'device_status_info',
  help: 'Device status info',
  labelNames: ['rig_name', 'rig_softwareversions', 'device_name', 'device_id', 'device_type', 'status'],
});

// Function to fetch all mining rigs, handling pagination
async function fetchAllMiningRigs() {
  let allMiningRigs = [];
  let currentPage = 0;
  let totalPages = 1;

  try {
    do {
      console.log(`Fetching rigs from page ${currentPage} with size 25`);
      const rawResponse = await nhClient.getMiningRigs(currentPage, 25); // Updated call with page and size
      const data = rawResponse.data;

      console.log(JSON.stringify(data, null, 2)); // Log the API response

      // Check if the response has rigs
      if (data.miningRigs) {
        allMiningRigs = allMiningRigs.concat(data.miningRigs);
        console.log(`Retrieved ${data.miningRigs.length} rigs from page ${currentPage + 1}`);
      } else {
        console.warn(`No mining rigs found on page ${currentPage + 1}`);
      }

      // Dynamically update the total number of pages
      totalPages = data.pagination.totalPageCount;
      console.log(`Total pages: ${totalPages}`);
      currentPage++; // Increment to request the next page
    } while (currentPage < totalPages);

    return allMiningRigs; // Return all collected rigs
  } catch (error) {
    console.error("Error while fetching mining rigs: ", error);
    throw error;
  }
}

async function refreshMetrics() {
  minerStatuses.reset();
  devicesStatuses.reset();
  rigStatusTime.reset();
  rigJoinTime.reset();
  deviceTemp.reset();
  deviceLoad.reset();
  devicePower.reset();
  deviceStatusInfo.reset();
  deviceSpeed.reset();

  try {
    const rawResponse = await nhClient.getMiningRigs();
    const data = rawResponse.data;
    
    totalRigs.set(data.totalRigs || 0);
    totalDevices.set(data.totalDevices || 0);
    totalProfitability.set(data.totalProfitability || 0);
    unpaidAmount.set(+data.unpaidAmount || 0);

    Object.keys(data.minerStatuses).forEach(k => minerStatuses.labels(k).set(data.minerStatuses[k]));
    Object.keys(data.devicesStatuses).forEach(k => devicesStatuses.labels(k).set(data.devicesStatuses[k]));

data.miningRigs.forEach(rig => {
    // Verifica se 'v4' e 'mmv' sono definiti
    if (rig.v4 && rig.v4.mmv) {
        // Assicurati che rig.v4.mmv.workerName e rig.rigId esistano
        if (rig.v4.mmv.workerName && rig.rigId) {
            rigStatusTime.labels(rig.v4.mmv.workerName, rig.rigId, rig.minerStatus).set(rig.statusTime || 0);
        }

        // Controlla che 'devices' sia definito e sia un array prima di usarlo
        if (Array.isArray(rig.v4.devices)) {
            rig.v4.devices.forEach((device, index) => {
                try {
                    const temperatureEntry = device.odv?.find(entry => entry.key === "Temperature");
                    deviceTemp.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass)
                        .set(temperatureEntry ? parseFloat(temperatureEntry.value) : 0);

                    const loadEntry = device.odv?.find(entry => entry.key === "Load");
                    deviceLoad.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass)
                        .set(loadEntry ? parseFloat(loadEntry.value) : 0);

                    const powerEntry = device.odv?.find(entry => entry.key === "Power usage");
                    devicePower.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass)
                        .set(powerEntry ? parseFloat(powerEntry.value) : -1);

                    deviceStatusInfo.labels(rig.v4.mmv.workerName, rig.v4.versions[0], device.dsv.name, device.dsv.id, device.dsv.deviceClass, device.mdv.state).set(1);

                    // Controlla se 'speeds' è definito e sia un array prima di usarlo
                    if (Array.isArray(device.speeds)) {
                        device.speeds.forEach(speed => {
                            deviceSpeed.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass, speed.algorithm, speed.displaySuffix).set(+speed.speed);
                        });
                    }
                } catch (e) {
                    console.error("Error while parsing device: ", e);
                }
            });
        } else {
            console.warn("Devices is not an array or is undefined for rig: ", rig);
        }
    } else {
        // Gestisci la situazione in cui 'v4' o 'mmv' non sono definiti
        console.warn("Rig v4 or mmv is not defined for rig: ", rig);
    }
});
    } else {
        rigStatusTime.labels(rig.name, rig.rigId, rig.status).set(rig.statusTime || 0);
        try {
          rigJoinTime.labels(rig.name, rig.rigId).set(rig.joinTime || 0);
        } catch (e) {
          console.error("Error while setting rigJoinTime: ", e);
        }

        (rig.devices || []).forEach(device => {
          try {
            deviceTemp.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.temperature || 0);
            deviceLoad.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.load || 0);
            devicePower.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.powerUsage || 0);
            deviceStatusInfo.labels(rig.name, rig.softwareVersions, device.name, device.id, device.deviceType.enumName, device.status.enumName).set(1);

            device.speeds.forEach(speed => {
              deviceSpeed.labels(rig.name, device.name, device.id, device.deviceType.enumName, speed.algorithm, speed.displaySuffix).set(+speed.speed);
            });
          } catch (e) {
            console.log("There was an error parsing " + JSON.stringify(device) + " with ", e);
          }
        });
      }
    });
  } catch (e) {
    console.log("There was an error on request1 ", e);
  }

  // Recupera il saldo del portafoglio
  try {
    const rawResponse2 = await nhClient.getWallets();
    const data2 = rawResponse2.data;
    totalBtc.set(+data2.total.totalBalance || 0); // Imposta a 0 se il bilancio non è disponibile
  } catch (e) {
    console.log("There was an error on request2 ", e);
  }

  // Recupera i tassi di cambio
  try {
    const rawResponse3 = await nhClient.getExchangeRates();
    const data3 = rawResponse3.data;

    rateGauges.forEach(r => {
      try {
        r.gauge.set(+data3[r.rate] || 0); // Imposta a 0 se il tasso non è disponibile
      } catch (e) {
        console.log(`Given rate ${r.rate} not found in ${JSON.stringify(data3)}`);
      }
    });
  } catch (e) {
    console.log("There was an error on request3 ", e);
  }
}

// APIS

app.get('/', (req, res) => {
  res.send('This is an empty index, you want to go to the <a href="/metrics">metrics</a> endpoint for data!');
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// Start the server

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

// Inizializza il recupero delle metriche
refreshMetrics();

// Imposta un intervallo per il recupero periodico delle metriche
setInterval(() => {
  refreshMetrics();
}, refreshRateSeconds * 1000);
