const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');

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

// Store conversation context
const conversationState = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', openai: !!openai });
});

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

    // Greeting - using Polly male voice
    twiml.say({ voice: 'man' }, 'Hi! This is Jarvis. How are you?');
    
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
      twiml.say({ voice: 'man' }, 'Thanks! Goodbye!');
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

    // Say response - male voice
    twiml.say({ voice: 'man' }, aiResponse);

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
    twiml.say({ voice: 'man' }, 'Sorry, error occurred.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Jarvis bot listening on port ${PORT}`);
});
