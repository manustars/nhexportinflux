# Usa un'immagine Node.js come base
FROM node:latest

# Imposta il work directory all'interno del container
WORKDIR /app

# Copia il package.json e il package-lock.json nella directory di lavoro
COPY package*.json ./

# Installa le dipendenze del progetto
RUN npm install

# Copia il codice sorgente nell'immagine Docker
COPY . .

# Esponi la porta su cui il server Node.js è in ascolto
EXPOSE 3000

# Comando di avvio dell'applicazione
CMD ["node", "app.js"]
