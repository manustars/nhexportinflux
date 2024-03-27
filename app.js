const NicehashJS = require('./nicehash');
const client = require('prom-client');
const Gauge = client.Gauge;
const express = require('express');
require('dotenv').config();

// Impostazioni
const port = process.env.PORT || 3000;
const refreshRateSeconds = process.env.REFRESH_RATE_SECONDS || 30;
const nodeMetricsPrefix = process.env.NODDE_METRICS_PREFIX || '';
const prefix = process.env.NH_METRICS_PREFIX || 'nh_';
const apiKey = process.env.NH_API_KEY;
const apiSecret = process.env.NH_API_SECRET;
const organizationId = process.env.NH_API_ORG_ID;
const rates = process.env.NH_RATES ? process.env.NH_RATES.split(',') : ['BTCUSDC', 'BTCEURS'];

if (!apiKey || !apiSecret || !organizationId) {
  console.log("You need an api key and an api secret and orgId!");
  console.log("https://www.nicehash.com/my/settings/keys");
  return 1;
}

// Inizializzazione librerie
const app = express();

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: nodeMetricsPrefix });

const register = client.register;

const nhClient = new NicehashJS({
  apiKey,
  apiSecret,
  organizationId
});

// Metriche
const totalRigs = new Gauge({
  name: prefix + 'total_rigs',
  help: 'Numero di rig in tuo possesso'
});
const totalDevices = new Gauge({
  name: prefix + 'total_devices',
  help: 'Numero di dispositivi nei rig'
});
const totalProfitability = new Gauge({
  name: prefix + 'total_profitability',
  help: 'Profitto totale'
});
const unpaidAmount = new Gauge({
  name: prefix + 'unpaid_amount',
  help: 'Ammontare non pagato'
});
const totalBtc = new Gauge({
  name: prefix + 'total_btc',
  help: 'Totale in BTC',
});
const rateGauges = rates.map(r => {
  return {
    rate: r,
    gauge: new Gauge({
      name: prefix + r.toLowerCase() + '_rate',
      help: 'Tasso di ' + r,
    })
  }
});
const minerStatuses = new Gauge({
  name: prefix + 'miner_statuses',
  help: 'Stato del miner',
  labelNames: ['status'],
});
const devicesStatuses = new Gauge({
  name: prefix + 'devices_statuses',
  help: 'Stato dei dispositivi',
  labelNames: ['status'],
});
const deviceTemp = new Gauge({
  name: prefix + 'device_temp',
  help: 'Temperatura del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const deviceLoad = new Gauge({
  name: prefix + 'device_load',
  help: 'Carico del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const devicePower = new Gauge({
  name: prefix + 'device_power',
  help: 'Consumo energetico del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type'],
});
const deviceSpeed = new Gauge({
  name: prefix + 'device_speed',
  help: 'Velocità del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type', 'algo', 'suffix'],
});
const rigStatusTime = new Gauge({
  name: prefix + 'rig_status_time',
  help: 'Tempo dello stato del rig',
  labelNames: ['rig_name', 'rig_id'],
});
const rigJoinTime = new Gauge({
  name: prefix + 'rig_join_time',
  help: 'Tempo di unione del rig',
  labelNames: ['rig_name', 'rig_id'],
});
const nhDeviceStatusInfo = new Gauge({
  name: prefix + 'nh_device_status_info',
  help: 'Informazioni sullo stato del dispositivo NH',
  labelNames: ['rig_name', 'software_versions', 'device_name', 'device_id', 'device_type', 'device_status'],
});

async function refreshMetrics() {
  minerStatuses.reset();
  devicesStatuses.reset();
  rigStatusTime.reset();
  rigJoinTime.reset();
  deviceTemp.reset();
  deviceLoad.reset();
  devicePower.reset();
  nhDeviceStatusInfo.reset();
  deviceSpeed.reset();
  try {
    const rawResponse = await nhClient.getMiningRigs();
    const data = rawResponse.data;

    totalRigs.set(data.totalRigs);
    totalDevices.set(data.totalDevices);
    totalProfitability.set(data.totalProfitability);
   unpaidAmount.set(+data.unpaidAmount);

  Object.keys(data.minerStatuses).forEach(k => {
    minerStatuses.labels(k).set(data.minerStatuses[k]);
  });

  Object.keys(data.devicesStatuses).forEach(k => {
    devicesStatuses.labels(k).set(data.devicesStatuses[k]);
  });

  data.miningRigs.forEach(rig => {
    rigStatusTime.labels(rig.name, rig.rigId).set(rig.statusTime);
    try {
      rigJoinTime.labels(rig.name, rig.rigId).set(rig.joinTime);
    } catch (e) {}

    (rig.devices || []).forEach(device => {
      try {
        deviceTemp.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.temperature);
        deviceLoad.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.load);
        devicePower.labels(rig.name, device.name, device.id, device.deviceType.enumName).set(device.powerUsage);
        nhDeviceStatusInfo.labels(rig.name, rig.softwareVersions, device.name, device.id, device.deviceType.enumName, device.status.enumName).set(1);
        
        device.speeds.forEach(speed => {
          deviceSpeed.labels(rig.name, device.name, device.id, device.deviceType.enumName, speed.algorithm, speed.displaySuffix).set(+speed.speed);
        });
      } catch (e) {
        console.log("Si è verificato un errore durante il parsing di " + JSON.stringify(device) + " con ", e);
      }
    });
  });
} catch (e) {
  console.log("Si è verificato un errore nella richiesta1 ", e);
}

try {
  const rawResponse2 = await nhClient.getWallets();
  const data2 = rawResponse2.data;
  totalBtc.set(+data2.total.totalBalance);
} catch (e) {
  console.log("Si è verificato un errore nella richiesta2 ", e);
}

try {
  const rawResponse3 = await nhClient.getExchangeRates();
  const data3 = rawResponse3.data;
  rateGauges.forEach(r => {
    try {
      r.gauge.set(+data3[r.rate]);
    } catch (e) {
      console.log(`Il tasso fornito ${r.rate} non è stato trovato in ${data3}`);
    }
  });
} catch (e) {
  console.log("Si è verificato un errore nella richiesta3 ", e);
}
}

// API

app.get('/', (req, res) => {
  res.send('Questa è una pagina vuota, vuoi andare al <a href="/metrics">endpoint metrics</a> per ottenere i dati!')
})

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
})

// Avvio del server

app.listen(port, () => {
  console.log(`App di esempio in ascolto su http://localhost:${port}`)
})

refreshMetrics()

setInterval(() => {
  refreshMetrics();
}, refreshRateSeconds*1000);

