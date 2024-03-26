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

// Funzione per aggiornare le metriche
async function refreshMetrics() {
  try {
    const response = await nhClient.getMiningRigs();
    const data = response.data;

    // Aggiorna le metriche
    totalRigs.set(data.totalRigs);
    totalProfitability.set(data.totalProfitability);
    totalProfitabilityLocal.set(data.totalProfitabilityLocal);
    totalDevices.set(data.totalDevices);
    unpaidAmount.set(data.unpaidAmount);
    externalBalance.set(data.externalBalance);
    previousDayEarnings.set(data.previousDayEarnings);
    payoutAmount.set(data.payoutAmount);
    miningFee.set(data.miningFee);
    totalSpeedAccepted.set(data.totalSpeedAccepted);

    // Aggiungi altre metriche...

  } catch (error) {
    console.error('Errore durante l\'aggiornamento delle metriche:', error);
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

// Definizione delle metriche
const totalRigs = new Gauge({
  name: `${prefix}total_rigs`,
  help: 'Numero di rig',
});

const totalProfitability = new Gauge({
  name: `${prefix}total_profitability`,
  help: 'Profitto totale',
});

const totalProfitabilityLocal = new Gauge({
  name: `${prefix}total_profitability_local`,
  help: 'Profitto totale locale',
});

const totalDevices = new Gauge({
  name: `${prefix}total_devices`,
  help: 'Numero di dispositivi',
});

const unpaidAmount = new Gauge({
  name: `${prefix}unpaid_amount`,
  help: 'Ammontare non pagato',
});

const externalBalance = new Gauge({
  name: `${prefix}external_balance`,
  help: 'Saldo esterno',
});

const previousDayEarnings = new Gauge({
  name: `${prefix}previous_day_earnings`,
  help: 'Guadagni del giorno precedente',
});

const payoutAmount = new Gauge({
  name: `${prefix}payout_amount`,
  help: 'Ammontare del pagamento',
});

const miningFee = new Gauge({
  name: `${prefix}mining_fee`,
  help: 'Tassa di mining',
});

const totalSpeedAccepted = new Gauge({
  name: `${prefix}total_speed_accepted`,
  help: 'Velocità totale accettata',
});

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

// Avvio del server
app.get('/', (req, res) => {
  res.send('Questa è una pagina vuota. Per ottenere i dati, vai all\'endpoint <a href="/metrics">metrics</a>!');
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

app.listen(port, () => {
  console.log(`Server in ascolto su http://localhost:${port}`);
});

// Aggiorna le metriche ad intervalli regolari
refreshMetrics();

setInterval(() => {
  refreshMetrics();
}, refreshRateSeconds * 1000);

