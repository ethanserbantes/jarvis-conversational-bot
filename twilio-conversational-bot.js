const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const https = require('https');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Logging
const log = (msg) => {
  console.log(`[${new Date().toISOString()}] ${msg}`);
};

// Initialize OpenAI client
let openai;
try {
  const OpenAI = require('openai');
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  log('✅ OpenAI client initialized');
} catch (err) {
  log(`❌ OpenAI init error: ${err.message}`);
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Store conversation context
const conversationState = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', openai: !!openai, elevenlabs: !!ELEVENLABS_API_KEY });
});

// Helper: Generate speech with ElevenLabs
async function generateSpeech(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: '/v1/text-to-speech/pNInz6obpgDQGcFmaJgB', // Adam voice
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let audioData = '';
      res.setEncoding('binary');
      res.on('data', (chunk) => { audioData += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.from(audioData, 'binary'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Start call - greeting
app.post('/voice/start', async (req, res) => {
  const callSid = req.body?.CallSid || 'unknown';
  log(`START_CALL: ${callSid}`);

  try {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Initialize conversation
    conversationState[callSid] = [
      {
        role: 'system',
        content: 'You are Jarvis, a friendly AI. Keep responses very short (1 sentence). Be conversational and warm.'
      }
    ];

    // Use simple Polly for greeting (ElevenLabs is slower)
    twiml.say({ voice: 'alice' }, 'Hi! This is Jarvis. How are you?');
    
    // Gather speech
    twiml.gather({
      input: 'speech',
      timeout: 8,
      speechTimeout: 'auto',
      action: '/voice/respond',
      method: 'POST'
    });

    log(`START_CALL: Sending TwiML`);
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    log(`START_CALL ERROR: ${err.message}`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Error occurred.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Process speech and respond
app.post('/voice/respond', async (req, res) => {
  const callSid = req.body?.CallSid || 'unknown';
  const userInput = req.body?.SpeechResult || '';
  
  log(`RESPOND: ${callSid} | User: "${userInput}"`);

  try {
    const twiml = new twilio.twiml.VoiceResponse();

    // Check for goodbye
    if (!userInput || userInput.toLowerCase().includes('bye')) {
      log(`RESPOND: Ending call`);
      twiml.say('Thanks! Goodbye!');
      twiml.hangup();
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    // Add user message
    conversationState[callSid].push({
      role: 'user',
      content: userInput
    });

    log(`RESPOND: Calling OpenAI`);
    
    if (!openai) {
      throw new Error('OpenAI client not initialized');
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversationState[callSid],
      max_tokens: 50
    });

    const aiResponse = completion.choices[0].message.content.trim();
    log(`RESPOND: AI response: "${aiResponse}"`);

    // Add to history
    conversationState[callSid].push({
      role: 'assistant',
      content: aiResponse
    });

    // Use Polly for responses (faster)
    twiml.say({ voice: 'alice' }, aiResponse);

    // Listen again
    twiml.gather({
      input: 'speech',
      timeout: 8,
      speechTimeout: 'auto',
      action: '/voice/respond',
      method: 'POST'
    });

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    log(`RESPOND ERROR: ${err.message}`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, error occurred.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Jarvis bot listening on port ${PORT}`);
});
