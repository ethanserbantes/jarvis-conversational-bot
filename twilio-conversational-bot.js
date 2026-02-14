const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Store conversation context
const conversationState = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start call - greeting
app.post('/voice/start', (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;
    
    console.log(`[${callSid}] Call started`);
    
    // Initialize conversation
    conversationState[callSid] = [
      {
        role: 'system',
        content: 'You are Jarvis, a friendly AI assistant. You are having a natural conversation. Keep responses very concise (1 sentence max). Be warm and conversational. If user says "goodbye" or "bye", end the call.'
      }
    ];

    // Simple greeting
    twiml.say('Hi! This is Jarvis. How are you today?');
    
    // Gather speech input
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
    console.error('Error in /voice/start:', err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, an error occurred.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Process speech and respond
app.post('/voice/respond', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;
    const userInput = req.body.SpeechResult;

    console.log(`[${callSid}] User: ${userInput}`);

    // Check if user wants to end call
    if (!userInput || userInput.toLowerCase().includes('bye') || userInput.toLowerCase().includes('goodbye')) {
      twiml.say('Thanks for chatting! Goodbye!');
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

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversationState[callSid],
      max_tokens: 50,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0].message.content.trim();
    console.log(`[${callSid}] Jarvis: ${aiResponse}`);

    // Add to history
    conversationState[callSid].push({
      role: 'assistant',
      content: aiResponse
    });

    // Say response
    twiml.say(aiResponse);

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
    console.error(`Error in /voice/respond:`, err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, something went wrong. Thanks for calling!');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Jarvis bot running on port ${PORT}`);
});
