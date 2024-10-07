FROM node:20-alpine

# Crea la directory per l'app e imposta i permessi
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

# Imposta la directory di lavoro
WORKDIR /home/node/app

# Copia i file di configurazione delle dipendenze come utente root
COPY package*.json ./

# Cambia l'utente in node
USER node

# Installa le dipendenze
RUN npm install --unsafe-perm

# Copia il resto dei file dell'app mantenendo i permessi
COPY --chown=node:node . .

# Comando di avvio dell'app
CMD [ "node", "app.js" ]
