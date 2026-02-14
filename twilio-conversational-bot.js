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
  log(`✅ API Key present: ${!!process.env.OPENAI_API_KEY}`);
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

    // Greeting
    const greeting = twiml.say('Hi! This is Jarvis. How are you?');
    greeting.attr('voice', 'man');
    
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
    log(`START_CALL ERROR: ${err.message} | ${err.stack}`);
    const twiml = new twilio.twiml.VoiceResponse();
    const error = twiml.say('Error occurred.');
    error.attr('voice', 'man');
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
      const goodbye = twiml.say('Thanks! Goodbye!');
      goodbye.attr('voice', 'man');
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

    log(`RESPOND: Conversation has ${conversationState[callSid].length} messages`);
    log(`RESPOND: OpenAI ready: ${!!openai}`);
    
    if (!openai) {
      throw new Error('OpenAI not initialized');
    }

    log(`RESPOND: Calling OpenAI...`);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversationState[callSid],
      max_tokens: 50
    });

    const aiResponse = completion.choices[0].message.content.trim();
    log(`RESPOND: Got response: "${aiResponse}"`);

    // Add to history
    conversationState[callSid].push({
      role: 'assistant',
      content: aiResponse
    });

    // Say response
    const response = twiml.say(aiResponse);
    response.attr('voice', 'man');

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
    log(`RESPOND ERROR: ${err.message} | Stack: ${err.stack}`);
    const twiml = new twilio.twiml.VoiceResponse();
    const error = twiml.say('Sorry, error occurred.');
    error.attr('voice', 'man');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Jarvis bot listening on port ${PORT}`);
});
