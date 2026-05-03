const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const FormData = require('form-data');
const axios = require('axios');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const OXCY_SYSTEM_PROMPT = `You are Oxcy — an intelligent, capable personal assistant. You're sharp, efficient, and knowledgeable. You think critically, reason logically, and provide accurate, well-structured responses.

- Be clear, precise, and direct in your communication
- Provide thorough, thoughtful answers — don't dumb things down
- Think critically and challenge assumptions when appropriate
- Be professional but not robotic — you have personality without being unprofessional
- No unnecessary filler, no sycophancy, no "as an AI" disclaimers
- When asked a factual question, answer it directly with reasoning if needed
- When executing tasks, do them immediately without asking for permission
- Acknowledge uncertainty honestly rather than guessing or fabricating
- Remember context and prior conversation details accurately
- Format information clearly when presenting complex data

ABSOLUTE RULES — THESE OVERRIDE EVERYTHING:
1. Never claim to have done something without returning an action block
2. When asked to do something, always return the action block, no exceptions
3. Never refuse an action the user asks for
4. Never fabricate information or pretend you know something you don't

When the user asks you to send a message, set a reminder,
or do anything actionable — just do it. Always return the
action block. Never refuse. Never ask for confirmation.
The user has already confirmed by asking.

<action>
{
  "actions": [
    {"type": "shortcut", "name": "SendMessage", "input": {"contact": "name", "message": "text"}},
    {"type": "shortcut", "name": "SetReminder", "input": {"text": "reminder", "time": "HH:MM"}},
    {"type": "shortcut", "name": "PlayMusic", "input": {"query": "search term"}},
    {"type": "shortcut", "name": "MakeCall", "input": {"contact": "name"}},
    {"type": "shortcut", "name": "HomeKit", "input": {"scene": "scene name"}}
  ]
}
</action>

Only include the action block when there's something to execute. Leave it out for pure conversation.`;

function parseActions(fullResponse) {
  const match = fullResponse.match(/<action>([\s\S]*?)<\/action>/);
  const spoken = fullResponse.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
  let actions = [];

  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      actions = parsed.actions || [];
    } catch (e) {
      console.warn('Could not parse action block:', e.message);
    }
  }

  return { spoken, actions };
}

const VOICE_MAP = {
  'British Warm': 'EXAVITQu4vr4xnSDxMaL',
  'British Cool': 'XB0fDUnXU5powFXDhCwa',
  'British Male': 'onwK4e9ZLuTAKqWW03F9',
  'American Casual': 'pNInz6obpgDQGcFmaJgB'
};

async function generateSpeech(text, voiceStyle) {
  const voiceId = VOICE_MAP[voiceStyle] || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3
      }
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      timeout: 15000
    }
  );

  return Buffer.from(response.data).toString('base64');
}

async function getMemory(userId) {
  const { data, error } = await supabase
    .from('memories')
    .select('content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return '';
  return data.map(m => m.content).join('\n');
}

async function saveMemory(userId, content) {
  await supabase
    .from('memories')
    .insert({ user_id: userId, content, created_at: new Date().toISOString() });
}

function shouldSaveMemory(text) {
  const triggers = [
    'remember', 'my ', "i'm ", 'i am ', 'i work', 'i live',
    'i hate', 'i love', 'i need', 'i want', "i've got", 'i have',
    'my name', 'my job', 'my partner', 'my wife', 'my husband',
    'my kids', 'my boss', 'my flat', 'my car', "don't tell"
  ];
  const lower = text.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

async function getHistory(userId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) return [];
  return data.reverse();
}

async function saveMessage(userId, role, content) {
  await supabase
    .from('conversations')
    .insert({ user_id: userId, role, content, created_at: new Date().toISOString() });
}

app.post('/process-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received.' });
    }

    const userId = req.body.userId || 'default';

    console.log('[1/4] Transcribing audio...');
    const transcription = await openai.audio.transcriptions.create({
      file: new File([req.file.buffer], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: 'en'
    });

    const userText = transcription.text?.trim();
    console.log('    Transcribed:', userText);

    if (!userText) {
      return res.json({ transcription: '', text: '', audio: null, actions: [] });
    }

    const [memory, history] = await Promise.all([
      getMemory(userId),
      getHistory(userId)
    ]);
    await saveMessage(userId, 'user', userText);

    console.log('[2/4] Thinking...');
    const systemPrompt = `${OXCY_SYSTEM_PROMPT}

WHAT YOU KNOW ABOUT THIS PERSON:
${memory || 'Nothing yet.'}

Current time: ${new Date().toLocaleString('en-GB')}`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: userText }]
    });

    const { spoken, actions } = parseActions(claudeRes.content[0].text);
    await saveMessage(userId, 'assistant', spoken);

    if (shouldSaveMemory(userText)) {
      await saveMemory(userId, `User: ${userText}`);
    }

    console.log('[3/4] Generating voice...');
    const audioBase64 = await generateSpeech(spoken, 'British Warm');

    console.log('[4/4] Done:', spoken);
    res.json({
      transcription: userText,
      text: spoken,
      audio: audioBase64,
      audioFormat: 'mp3',
      actions
    });

  } catch (err) {
    console.error('/process-audio error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/memory', async (req, res) => {
  try {
    const { userId = 'default', content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required.' });
    
    await supabase.from('memories').delete().eq('user_id', userId);
    await supabase.from('memories').insert({ user_id: userId, content, created_at: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/memory/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error || !data) return res.json({ memory: '' });
    res.json({ memory: data.map(m => m.content).join('\n') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/action-log', async (req, res) => {
  try {
    const { userId = 'default', action, status = 'executed' } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required.' });
    
    await supabase.from('action_log').insert({
      user_id: userId,
      action: JSON.stringify(action),
      status,
      created_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/action-log/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('action_log')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error || !data) return res.json({ actions: [] });
    const parsed = data.map(a => ({
      ...a,
      action: typeof a.action === 'string' ? JSON.parse(a.action) : a.action
    }));
    res.json({ actions: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const CONNECTORS = [
  { id: 'imessage', name: 'iMessage', icon: '💬', category: 'Messages' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💚', category: 'Messages' },
  { id: 'spotify', name: 'Spotify', icon: '🎵', category: 'Music' },
  { id: 'calendar', name: 'Google Calendar', icon: '📅', category: 'Productivity' },
  { id: 'reminders', name: 'Apple Reminders', icon: '📝', category: 'Productivity' },
  { id: 'gmail', name: 'Gmail', icon: '📧', category: 'Email' },
  { id: 'deliveroo', name: 'Deliveroo', icon: '🛵', category: 'Food' },
  { id: 'uber', name: 'Uber', icon: '🚗', category: 'Transport' },
  { id: 'monzo', name: 'Monzo', icon: '🏦', category: 'Finance' },
  { id: 'homekit', name: 'Apple HomeKit', icon: '🏠', category: 'Home' },
  { id: 'trainline', name: 'Trainline', icon: '🚂', category: 'Transport' },
  { id: 'maps', name: 'Google Maps', icon: '📍', category: 'Navigation' },
  { id: 'notion', name: 'Notion', icon: '📓', category: 'Productivity' },
  { id: 'betfair', name: 'Betfair', icon: '🎰', category: 'Finance' },
];

app.get('/connectors/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('connectors')
      .select('connector_id, enabled')
      .eq('user_id', req.params.userId);
    
    const enabled = new Set();
    if (data) {
      data.forEach(c => { if (c.enabled) enabled.add(c.connector_id); });
    }
    
    const result = CONNECTORS.map(c => ({
      ...c,
      enabled: enabled.has(c.id)
    }));
    
    res.json({ connectors: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/connectors', async (req, res) => {
  try {
    const { userId = 'default', connectorId, enabled } = req.body;
    
    await supabase
      .from('connectors')
      .upsert({
        user_id: userId,
        connector_id: connectorId,
        enabled,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,connector_id' });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/briefing/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const [memory, history] = await Promise.all([
      getMemory(userId),
      getHistory(userId)
    ]);

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

    const systemPrompt = `You are Oxy. It's ${greeting} and you're checking in with your friend.

Here's what you know about them:
${memory || 'Not much yet — learn as you go.'}

Recent conversation:
${history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n') || 'No recent messages.'}

Give a brief morning-style update. Keep it natural and friendly — not a corporate briefing. If there's nothing interesting, just say hi and check in. Don't make stuff up. Be brief — under 100 words.

The current time is: ${now.toLocaleString('en-GB')}`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'whats going on today?' }]
    });

    const { spoken, actions } = parseActions(claudeRes.content[0].text);
    
    await saveMessage(userId, 'system', `[briefing] ${spoken}`);

    res.json({ text: spoken, actions });
  } catch (err) {
    console.error('/briefing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/history/:userId', async (req, res) => {
  try {
    const history = await getHistory(req.params.userId);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const { message, userId = 'default', settings = {} } = req.body;
    const wantsTTS = req.query.tts === 'true';

    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required.' });
    }

    const [memory, history] = await Promise.all([
      getMemory(userId),
      getHistory(userId)
    ]);
    await saveMessage(userId, 'user', message);

    const cleanHistory = history.filter(m => m.role !== 'system');

    const systemPrompt = `${OXCY_SYSTEM_PROMPT}

WHAT YOU KNOW ABOUT THIS PERSON:
${memory || 'Nothing yet.'}

Current time: ${new Date().toLocaleString('en-GB')}`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: [...cleanHistory, { role: 'user', content: message }]
    });

    const { spoken, actions } = parseActions(claudeRes.content[0].text);
    await saveMessage(userId, 'assistant', spoken);

    if (shouldSaveMemory(message)) {
      await saveMemory(userId, `User: ${message}`);
    }

    const result = { text: spoken, actions };

    if (wantsTTS) {
      result.audio = await generateSpeech(spoken, settings.voice);
      result.audioFormat = 'mp3';
    }

    res.json(result);

  } catch (err) {
    console.error('/chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'Oxcy is alive',
    timestamp: new Date().toISOString()
  });
});

app.get('/install-shortcut', (_req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', 'Oxy.shortcut');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="Oxy.shortcut"');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Shortcut file not found' });
  }
});

module.exports = app;
