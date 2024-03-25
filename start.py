import os
import requests
from influxdb import InfluxDBClient
import datetime

# Ottieni le variabili d'ambiente per la configurazione
API_URL = os.getenv('API_URL')
INFLUXDB_HOST = os.getenv('INFLUXDB_HOST', 'localhost')
INFLUXDB_PORT = int(os.getenv('INFLUXDB_PORT', 8086))
INFLUXDB_DATABASE = os.getenv('INFLUXDB_DATABASE')
INFLUXDB_USER = os.getenv('INFLUXDB_USER')
INFLUXDB_PASSWORD = os.getenv('INFLUXDB_PASSWORD')

# Crea il client InfluxDB
client = InfluxDBClient(host=INFLUXDB_HOST, port=INFLUXDB_PORT, username=INFLUXDB_USER, password=INFLUXDB_PASSWORD, database=INFLUXDB_DATABASE)

def fetch_and_store_data():
    # Effettua una richiesta alle API per ottenere i dati
    response = requests.get(API_URL)
    data = response.json()

    # Esempio di manipolazione dei dati
    miner_statuses = data['minerStatuses']
    rig_statuses = data['miningRigs']

    # Crea un elenco di punti dati per InfluxDB
    points = []
    for rig in rig_statuses:
        measurement = "stato_rig"
        tags = {"rig_id": rig['rigId']}
        fields = {
            "tipo_rig": rig['type'],
            "stato_rig": rig['minerStatus'],
            "importo_non_pagato": rig['unpaidAmount'],
            "profitto": rig['profitability'],
            # Aggiungi altri campi qui...
        }
        timestamp = datetime.datetime.utcnow().isoformat()

        point = {
            "measurement": measurement,
            "tags": tags,
            "fields": fields,
            "time": timestamp,
        }
        points.append(point)

    # Invia i punti dati a InfluxDB
    client.write_points(points)

# Esegui la funzione per recuperare e memorizzare i dati
fetch_and_store_data()
