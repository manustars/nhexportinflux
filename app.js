const NicehashJS = require('./nicehash');
const client = require('prom-client');
const Gauge = client.Gauge;
const express = require('express');
require('dotenv').config();

// Impostazioni
const port = process.env.PORT || 3000;
const refreshRateSeconds = process.env.REFRESH_RATE_SECONDS || 30;
const prefix = process.env.NH_METRICS_PREFIX || 'nh_';
const apiKey = process.env.NH_API_KEY;
const apiSecret = process.env.NH_API_SECRET;
const organizationId = process.env.NH_API_ORG_ID;

if (!apiKey || !apiSecret || !organizationId) {
  console.log("È necessario un API key, un API secret e un orgId!");
  console.log("https://www.nicehash.com/my/settings/keys");
  process.exit(1);
}

// Inizializzazione delle librerie
const app = express();
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const register = client.register;

const nhClient = new NicehashJS({
  apiKey,
  apiSecret,
  organizationId
});

// Definizione delle metriche
const totalRigs = new Gauge({
  name: `${prefix}total_rigs`,
  help: 'Numero di rig',
});

const totalDevices = new Gauge({
  name: `${prefix}total_devices`,
  help: 'Numero di dispositivi',
});

const totalProfitability = new Gauge({
  name: `${prefix}total_profitability`,
  help: 'Profitto totale',
});

const unpaidAmount = new Gauge({
  name: `${prefix}unpaid_amount`,
  help: 'Ammontare non pagato',
});

const minerStatuses = new Gauge({
  name: `${prefix}miner_statuses`,
  help: 'Stato dei miner',
  labelNames: ['status']
});

const devicesStatuses = new Gauge({
  name: `${prefix}device_statuses`,
  help: 'Stato dei dispositivi',
  labelNames: ['status']
});

const rigStatusTime = new Gauge({
  name: `${prefix}rig_status_time`,
  help: 'Timestamp dello stato del rig',
  labelNames: ['name', 'rig_id']
});

const rigJoinTime = new Gauge({
  name: `${prefix}rig_join_time`,
  help: 'Timestamp di ingresso del rig',
  labelNames: ['name', 'rig_id']
});

const deviceTemp = new Gauge({
  name: `${prefix}device_temperature`,
  help: 'Temperatura del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type']
});

const deviceLoad = new Gauge({
  name: `${prefix}device_load`,
  help: 'Carico del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type']
});

const devicePower = new Gauge({
  name: `${prefix}device_power_usage`,
  help: 'Utilizzo di energia del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type']
});

const deviceStatusInfo = new Gauge({
  name: `${prefix}device_status_info`,
  help: 'Informazioni sullo stato del dispositivo',
  labelNames: ['rig_name', 'software_versions', 'device_name', 'device_id', 'device_type', 'device_status']
});

const deviceSpeed = new Gauge({
  name: `${prefix}device_speed`,
  help: 'Velocità del dispositivo',
  labelNames: ['rig_name', 'device_name', 'device_id', 'device_type', 'algorithm', 'display_suffix']
});

const totalBtc = new Gauge({
  name: `${prefix}total_btc_balance`,
  help: 'Saldo totale in BTC',
});

const rateGauges = [
  { rate: 'BTC_EUR', gauge: new Gauge({ name: `${prefix}exchange_rate_btc_eur`, help: 'Tasso di cambio BTC/EUR' }) },
  { rate: 'BTC_USD', gauge: new Gauge({ name: `${prefix}exchange_rate_btc_usd`, help: 'Tasso di cambio BTC/USD' }) },
  // Aggiungi altre valute se necessario
];

// Funzione per aggiornare le metriche
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

    totalRigs.set(data.totalRigs);
    totalDevices.set(data.totalDevices);
    totalProfitability.set(data.totalProfitability);
    unpaidAmount.set(+data.unpaidAmount);
    Object.keys(data.minerStatuses).forEach(k => minerStatuses.labels(k).set(data.minerStatuses[k]));
    Object.keys(data.devicesStatuses).forEach(k => devicesStatuses.labels(k).set(data.devicesStatuses[k]));
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
          deviceStatusInfo.labels(rig.name, rig.softwareVersions, device.name, device.id, device.deviceType.enumName, device.status.enumName).set(1);
          device.speeds.forEach(speed => {
            deviceSpeed.labels(rig.name, device.name, device.id, device.deviceType.enumName, speed.algorithm, speed.displaySuffix).set(+speed.speed);
          });
        } catch (e) {
          console.log("Errore durante il parsing del dispositivo: ", e);
        }
      });
    });
  } catch (error) {
    console.log("Errore nella richiesta API getMiningRigs: ", error);
  }

  try {
    const rawResponse2 = await nhClient.getWallets();
    const data2 = rawResponse2.data;
    totalBtc.set(+data2.total.totalBalance);
  } catch (error) {
    console.log("Errore nella richiesta API getWallets: ", error);
  }

  try {
    const rawResponse3 = await nhClient.getExchangeRates();
    const data3 = rawResponse3.data;
    rateGauges.forEach(r => {
      try {
        r.gauge.set(+data3[r.rate]);
      } catch (e) {
        console.log(`La tariffa ${r.rate} non è stata trovata: `, e);
      }
    });
  } catch (error) {
    console.log("Errore nella richiesta API getExchangeRates: ", error);
  }
}

// Endpoint per le metriche
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

// Avvio del server
app.listen(port, () => {
  console.log(`Server in ascolto su http://localhost:${port}`);
});

// Aggiorna le metriche ad intervalli regolari
refreshMetrics(); // Prima chiamata per inizializzare le metriche
setInterval(refreshMetrics, refreshRateSeconds * 1000);

