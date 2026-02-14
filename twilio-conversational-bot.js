const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store conversation context per call
const conversationState = {};

// Start the call
app.post('/voice/start', (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;
    
    console.log('Call started:', callSid);
    
    // Initialize conversation history for this call
    conversationState[callSid] = [
      {
        role: 'system',
        content: 'You are Jarvis, a friendly AI assistant. You are having a natural conversation with someone. Start by introducing yourself briefly and ask how their day is going. Keep responses concise (1-2 sentences). Be warm and conversational.'
      }
    ];

    // Greeting - using simpler say format
    twiml.say("Hi there! This is Jarvis, your AI assistant. How's your day going so far?");

    // Gather user input
    twiml.gather({
      input: 'speech',
      timeout: 10,
      speechTimeout: 'auto',
      action: '/voice/respond',
      method: 'POST'
    });

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    console.error('Error in /voice/start:', err);
    res.status(500).send('Error');
  }
});

// Process user input and generate response
app.post('/voice/respond', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  const userInput = req.body.SpeechResult;

  console.log(`[${callSid}] User said: ${userInput}`);

  if (!userInput) {
    twiml.say(
      { voice: 'Polly', pollyVoiceId: 'Joanna' },
      "I didn't catch that. Could you repeat?"
    );
    
    const gather = twiml.gather({
      input: 'speech',
      timeout: 30,
      speechTimeout: 'auto',
      action: '/voice/respond',
      method: 'POST'
    });

    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }

  try {
    // Add user message to conversation
    conversationState[callSid].push({
      role: 'user',
      content: userInput
    });

    // Get AI response from OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversationState[callSid],
      max_tokens: 100
    });

    const aiResponse = completion.choices[0].message.content;
    console.log(`[${callSid}] Jarvis says: ${aiResponse}`);

    // Add AI response to conversation history
    conversationState[callSid].push({
      role: 'assistant',
      content: aiResponse
    });

    // Say the response
    twiml.say(
      { voice: 'Polly', pollyVoiceId: 'Joanna' },
      aiResponse
    );

    // Ask for next input
    const gather = twiml.gather({
      input: 'speech',
      timeout: 30,
      speechTimeout: 'auto',
      action: '/voice/respond',
      method: 'POST'
    });

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error:', error.message);
    twiml.say('Sorry, I encountered an error. Thank you for calling!');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Conversational bot running on port ${PORT}`);
});
