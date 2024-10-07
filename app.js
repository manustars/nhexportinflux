const NicehashJS = require('./nicehash')
const client = require('prom-client')
const Gauge = client.Gauge
const express = require('express')
require('dotenv').config()

// settings

const port = process.env.PORT || 3000
const refreshRateSeconds = process.env.REFRESH_RATE_SECONDS || 30
const nodeMetricsPrefix = process.env.NODDE_METRICS_PREFIX || ''
const prefix = process.env.NH_METRICS_PREFIX || 'nh_'
const apiKey = process.env.NH_API_KEY
const apiSecret = process.env.NH_API_SECRET
const organizationId = process.env.NH_API_ORG_ID
const rates = process.env.NH_RATES ? process.env.NH_RATES.split(',') : ['BTCUSDC', 'BTCEURS']

if (!apiKey || !apiSecret || !organizationId) {
  console.log("You need an api key and an api secret and orgId!")
  console.log("https://www.nicehash.com/my/settings/keys")
  return 1
}

// init libs
const app = express()

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: nodeMetricsPrefix })

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
  help: 'totalProfitability'
});
const unpaidAmount = new Gauge({
  name: prefix + 'unpaid_amount',
  help: 'unpaidAmount'
});
const totalBtc = new Gauge({
  name: prefix + 'total_btc',
  help: 'totalBtc',
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
  help: 'minerStatuses',
  labelNames: ['status'],
});
const devicesStatuses = new Gauge({
  name: prefix + 'devices_statuses',
  help: 'devicesStatuses',
  labelNames: ['status'],
});

const deviceTemp = new Gauge({
  name: prefix + 'device_temp',
  help: 'deviceTemp',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const deviceLoad = new Gauge({
  name: prefix + 'device_load',
  help: 'deviceLoad',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const devicePower = new Gauge({
  name: prefix + 'device_power',
  help: 'devicePower',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const deviceSpeed = new Gauge({
  name: prefix + 'device_speed',
  help: 'deviceSpeed',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type', 'algo', 'suffix'],
});

const rigStatusTime = new Gauge({
  name: prefix + 'rig_status_time',
  help: 'rigStatusTime',
  labelNames: ['rig_name', 'rig_id', 'rig_status'],
});
const rigJoinTime = new Gauge({
  name: prefix + 'rig_join_time',
  help: 'rigJoinTime',
  labelNames: ['rig_name', 'rig_id'],
});

const deviceStatusInfo = new Gauge({
  name: prefix + 'device_status_info',
  help: 'deviceStatusInfo',
  labelNames: ['rig_name', 'rig_softwareversions', 'device_name', 'device_id', 'device_type', 'status'],
});

async function refreshMetrics() {
  // Reset delle metriche all'inizio
  minerStatuses.reset();
  devicesStatuses.reset();
  rigStatusTime.reset();
  rigJoinTime.reset();
  deviceTemp.reset();
  deviceLoad.reset();
  devicePower.reset();
  deviceStatusInfo.reset();
  deviceSpeed.reset();

  let totalRigsCount = 0;
  let totalDevicesCount = 0;
  let totalProfitabilityCount = 0;

  let currentPage = 0;
  let hasNextPage = true;

  try {
    // Loop su tutte le pagine
    while (hasNextPage) {
      const rawResponse = await nhClient.getMiningRigs({ page: currentPage });
      const data = rawResponse.data;

      // Accumulo dei valori globali
      totalRigsCount += data.totalRigs;
      totalDevicesCount += data.totalDevices;
      totalProfitabilityCount += parseFloat(data.totalProfitability || 0);

      // Aggiornamento degli stati dei miner e dei dispositivi per la pagina corrente
      Object.keys(data.minerStatuses).forEach(k => minerStatuses.labels(k).set(data.minerStatuses[k]));
      Object.keys(data.devicesStatuses).forEach(k => devicesStatuses.labels(k).set(data.devicesStatuses[k]));

      // Elaborazione delle rig
      data.miningRigs.forEach(rig => {
        if (rig.v4 && rig.v4.mmv) {
          rigStatusTime.labels(rig.v4.mmv.workerName, rig.rigId, rig.minerStatus).set(rig.statusTime);

          (rig.v4.devices || []).forEach((device, index) => {
            try {
              const temperatureEntry = device.odv.find(entry => entry.key === "Temperature");
              deviceTemp.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass)
                .set(temperatureEntry ? parseFloat(temperatureEntry.value) : 0);

              const loadEntry = device.odv.find(entry => entry.key === "Load");
              deviceLoad.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass)
                .set(loadEntry ? parseFloat(loadEntry.value) : 0);

              const powerEntry = device.odv.find(entry => entry.key === "Power usage");
              devicePower.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass)
                .set(powerEntry ? parseFloat(powerEntry.value) : -1);

              deviceStatusInfo.labels(rig.v4.mmv.workerName, rig.v4.versions[0], device.dsv.name, device.dsv.id, device.dsv.deviceClass, device.mdv.state)
                .set(1);

                if (Array.isArray(device.speeds)) {
                      device.speeds.forEach(speed => {
                        deviceSpeed.labels(rig.v4.mmv.workerName, device.dsv.name, device.dsv.id, device.dsv.deviceClass, speed.algorithm, speed.displaySuffix)
                          .set(+speed.speed);
                      });
    } else {
      console.warn("Speeds is undefined or not an array for device:", device.dsv.name);
    }
  } catch (e) {
    console.error("Errore durante il parsing del dispositivo: ", e);
  }
});
            } catch (e) {
              console.error("Errore durante il parsing del dispositivo: ", e);
            }
          });
        } else {
          rigStatusTime.labels(rig.name, rig.rigId, rig.status).set(rig.statusTime);
          try {
            rigJoinTime.labels(rig.name, rig.rigId).set(rig.joinTime);
          } catch (e) {
            console.error("Errore durante il settaggio di rigJoinTime: ", e);
          }

          (rig.devices || []).forEach(device => {
            try {
              deviceTemp.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.temperature);
              deviceLoad.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.load);
              devicePower.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.powerUsage);
              deviceStatusInfo.labels(rig.name, rig.softwareVersions, device.name, device.id, device.deviceType.enumName, device.status.enumName)
                .set(1);

              device.speeds.forEach(speed => {
                deviceSpeed.labels(rig.name, device.name, device.id, device.deviceType.enumName, speed.algorithm, speed.displaySuffix)
                  .set(+speed.speed);
              });
            } catch (e) {
              console.error("Errore durante il parsing del dispositivo: ", e);
            }
          });
        }
      });

      // Controlla se c'è una pagina successiva
      hasNextPage = data.pagination && data.pagination.nextPage !== null;
      currentPage++;
    }

    // Dopo tutte le pagine, imposta i valori aggregati per le metriche globali
    totalRigs.set(totalRigsCount);
    totalDevices.set(totalDevicesCount);
    totalProfitability.set(totalProfitabilityCount);

  } catch (e) {
    console.error("Errore durante la richiesta dei mining rigs: ", e);
  }

  // Richiesta per i wallet (separata dalle rig)
  try {
    const rawResponse2 = await nhClient.getWallets();
    const data2 = rawResponse2.data;
    totalBtc.set(+data2.total.totalBalance);
    unpaidAmount.set(+data2.total.unpaidAmount);
  } catch (e) {
    console.error("Errore durante la richiesta dei wallet: ", e);
  }

  // Richiesta per i tassi di cambio (separata)
  try {
    const rawResponse3 = await nhClient.getExchangeRates();
    const data3 = rawResponse3.data;
    rateGauges.forEach(r => {
      try {
        r.gauge.set(+data3[r.rate]);
      } catch (e) {
        console.error(`Il tasso ${r.rate} non è stato trovato nei dati: `, e);
      }
    });
  } catch (e) {
    console.error("Errore durante la richiesta dei tassi di cambio: ", e);
  }
}


// APIS

app.get('/', (req, res) => {
  res.send('This is an empty index, you want to go to the <a href="/metrics">metrics</a> endpoint for data!')
})

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
})

// Start the things

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})

refreshMetrics()

setInterval(() => {
  refreshMetrics();
}, refreshRateSeconds * 1000);
