FROM node:20-alpine

# Crea una directory per l'app e imposta i permessi
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

# Imposta la directory di lavoro
WORKDIR /home/node/app

# Copia i file di configurazione delle dipendenze
COPY package*.json ./

# Cambia l'utente per eseguire l'installazione delle dipendenze
USER node

# Installa le dipendenze
RUN npm install

# Copia il resto dei file dell'app, mantenendo i permessi
COPY --chown=node:node . .

# Comando per avviare l'app
CMD [ "node", "app.js" ]
