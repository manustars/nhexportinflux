require('dotenv').config();
const NiceHashClient = require('./nicehash-client'); // Importa il client NiceHash
const createInfluxClient = require('./client-influx');

// Configura il client InfluxDB
const influx = createInfluxClient(
  process.env.INFLUXDB_HOST, // Indirizzo IP o hostname dell'istanza InfluxDB
  process.env.INFLUXDB_PORT, // Porta su cui è in ascolto InfluxDB (solitamente 8086)
  process.env.INFLUXDB_DB, // Nome del database InfluxDB
  process.env.INFLUXDB_TOKEN // Token di accesso per l'autenticazione
);

// Crea un'istanza del client NiceHash utilizzando le variabili d'ambiente
const niceHashClient = new NiceHashClient({
  apiKey: process.env.NH_API_KEY,
  apiSecret: process.env.NH_API_SECRET,
  organizationId: process.env.NH_ORG_ID,
});

// Funzione per recuperare e memorizzare i dati da NiceHash
async function fetchAndStoreData() {
  try {
    // Esempio di utilizzo del client NiceHash per ottenere i dati
    const data = await niceHashClient.getWallets();

    // Esempio di scrittura dei dati in InfluxDB
    await influx.writePoints([
      {
        measurement: 'example_measurement',
        fields: { value: data.value },
      },
    ]);

    console.log('Dati memorizzati con successo in InfluxDB');
  } catch (error) {
    console.error('Si è verificato un errore:', error);
  }
}

// Esegui la funzione per recuperare e memorizzare i dati
fetchAndStoreData();
