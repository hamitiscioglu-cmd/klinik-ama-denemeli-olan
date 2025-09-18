// server.js
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables
//değişiklik yapıldı

// ---------------- Express Ayarları ----------------
const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// ---------------- MongoDB Bağlantısı ----------------
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI is not defined in .env');
  process.exit(1);
}

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// ---------------- Schemas ----------------
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  profile: Object
}, { timestamps: true });

const PatientSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  demographics: Object,
  assessments: Array,
  assignedTests: Array,
  sessionNotes: String
}, { timestamps: true });

// Test şeması front-end ile uyumlu hale getirildi
//değişiklik yapıldı
const TestSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  questions: Array,
  scoringLevels: Array,
  purposeAndInterpretationNotes: String,
  analysisTargetsAI: String
}, { timestamps: true });


const AssessmentSchema = new mongoose.Schema({
  patientName: String,
  clinicianUsername: String,
  date: String,
  results: Array,
  meta: Object
}, { timestamps: true });

const NotificationSchema = new mongoose.Schema({
  recipientUsername: String,
  message: String,
  isRead: Boolean,
  date: String
}, { timestamps: true });

// ---------------- Models ----------------
const User = mongoose.model('User', UserSchema);
const Patient = mongoose.model('Patient', PatientSchema);
const Test = mongoose.model('Test', TestSchema);
const Assessment = mongoose.model('Assessment', AssessmentSchema);
const Notification = mongoose.model('Notification', NotificationSchema);

// ---------------- Default Users ----------------
async function ensureDefaultUsers() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({ username: 'admin', password: 'admin', profile: { role: 'admin' }});
      await User.create({ username: 'klinisyen1', password: '123', profile: { role: 'clinician' }});
      console.log('Default users created');
    }
  } catch (err) {
    console.error('Error creating default users:', err);
  }
}
ensureDefaultUsers();

// ---------------- API Routes ----------------

// Users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password').lean();
    const mapped = {};
    users.forEach(u => mapped[u.username] = { profile: u.profile });
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({});
  }
});

// Tests
//değişiklik yapıldı
app.get('/api/tests', async (req, res) => {
  try {
    const tests = await Test.find().lean();
    const map = {};
    tests.forEach(t => { map[t.id] = t; });
    res.json(map);
  } catch (e) {
    console.error(e);
    res.status(500).json({});
  }
});

app.put('/api/tests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const up = await Test.findOneAndUpdate({ id }, body, { upsert: true, new: true });
    res.json(up);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});

app.delete('/api/tests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Test.deleteOne({ id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});


// Patients
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find().lean();
    const map = {};
    patients.forEach(p => map[p.name] = p);
    res.json(map);
  } catch (e) {
    console.error(e);
    res.status(500).json({});
  }
});

app.put('/api/patients/:name', async (req, res) => {
  try {
    const name = req.params.name;
    const body = req.body;
    const up = await Patient.findOneAndUpdate(
      { name },
      body,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(up);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});

// Assessments
app.post('/api/assessments', async (req, res) => {
  try {
    const data = req.body;
    const created = await Assessment.create(data);
    if (data.patientName) {
      const patient = await Patient.findOne({ name: data.patientName });
      if (patient) {
        patient.assessments = (patient.assessments || []).concat([created.toObject()]);
        await patient.save();
      } else {
        await Patient.create({ name: data.patientName, assessments: [created.toObject()] });
      }
    }
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});

// Notifications
app.post('/api/notifications', async (req, res) => {
  try {
    const data = req.body;
    const created = await Notification.create(data);
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});

// Auth
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.password !== password) return res.status(401).json({ error: 'invalid' });
    return res.json({ username: user.username, profile: user.profile });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/auth/me', (req, res) => res.status(200).json(null));

// Root
app.get('/', (req, res) => res.send('API Çalışıyor 🚀'));

// Yeni kod bloğu eklendi
// ---------------- Gemini Proxy ----------------

app.post('/api/gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      }
    );

    const data = await r.json();
    // r.ok değilse 4xx/5xx’yi öne çıkaralım:
    res.status(r.ok ? 200 : (r.status || 400)).json(data);
  } catch (err) {
    console.error('Gemini API error:', err);
    res.status(500).json({ error: 'Gemini API failed' });
  }
});



// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
