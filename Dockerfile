FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY twilio-conversational-bot.js .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "twilio-conversational-bot.js"]
