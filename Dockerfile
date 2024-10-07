FROM node:20-alpine

# Crea una directory per l'app e imposta i permessi
RUN mkdir -p /home/node/app/node_modules

# Imposta la directory di lavoro
WORKDIR /home/node/app

# Copia i file di configurazione delle dipendenze
COPY package*.json ./

# Esegui npm install come root
RUN npm install

# Cambia l'utente per eseguire l'app
USER node

# Copia il resto dei file dell'app, mantenendo i permessi
COPY --chown=node:node . .

# Comando per avviare l'app
CMD [ "node", "app.js" ]
