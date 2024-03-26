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
    totalDevices.set(data.totalDevices);
    totalProfitability.set(data.totalProfitability);
    unpaidAmount.set(data.unpaidAmount);

    // Aggiorna altre metriche...

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

// Aggiorna le metriche ad intervalli regolari
setInterval(refreshMetrics, refreshRateSeconds * 1000);
