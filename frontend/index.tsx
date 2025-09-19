import React, { useState, useEffect, useMemo, Dispatch, SetStateAction, ChangeEvent, FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

const API_URL = process.env.REACT_APP_API_URL || 'https://klinik-ama-denemeli-olan.onrender.com/api';

// --- AI SETUP ---
// Frontend'de artık API key kullanmıyoruz.
// Backend'e istek atacağız:
// --- AI via backend proxy ---
async function generateWithGemini(prompt: string) {
  const response = await fetch(`${API_URL}/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
  });

  if (!response.ok) {
    console.error("Gemini API error:", await response.text());
    return null;
  }

  const data = await response.json();
  return data;
}

// Cevap metnini pratikçe alan yardımcı (opsiyonel ama kullanışlı)
function extractTextFromGemini(resp: any) {
  try {
    const parts = resp?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p: any) => p?.text).filter(Boolean).join("\n");
    }
  } catch {}
  return "";
}



// --- DATA & TYPES ---

type Answer = { question: string; answer: string; score: number };

type TestResult = {
  testId: string;
  testName: string;
  score: number;
  level: string;
  answers: Answer[];
};

type AssessmentResult = {
  id:string;
  date: string;
  patientName: string;
  clinicianUsername: string;
  results: TestResult[];
  clinicianEvaluation?: string;
  aiAnalysis?: string;
  isReleasedToPatient?: boolean; // NEW: Controls patient visibility
};

type AssignedTest = {
    id: string;
    assignedDate: string;
    testIds: string[];
    isCompleted: boolean;
    assessmentId?: string; // Link to the completed assessment
    clinicianUsername: string; // NEW: Tracks who assigned the test
};


type Patient = {
  name: string;
  assessments: AssessmentResult[];
  sessionNotes: string;
  assignedTests?: AssignedTest[];
  age?: number;
  weight?: number;
  height?: number;
  sleepHours?: number;
  workIntensity?: 'Düşük' | 'Orta' | 'Yüksek' | 'Çok Yüksek';
  addictions?: string;
  medications?: string;
  chronicIllness?: string;
  caffeineConsumption?: 'Yok' | 'Düşük' | 'Orta' | 'Yüksek';
  dietHabits?: string;
  phone?: string;
  email?: string;
};
type PatientsData = Record<string, Patient>;
type UserRole = 'admin' | 'clinician' | 'patient';

type User = {
    username: string;
    role: UserRole;
    patientName?: string; // Links patient user to patient data
    fullName?: string;
    title?: string;
    nationalId?: string;
    diplomaNo?: string;
    workStatus?: string;
    specialization?: string;
    clinicalInterests?: string;
    therapyMethods?: string;
    authorizations?: string;
    workSchedule?: string;
    appointmentCapacity?: string;
    serviceTypes?: string;
    consultationAreas?: string;
    internalPhone?: string;
    email?: string;
    assistantInfo?: string;
    emergencyContact?: string;
};

type UsersData = Record<string, {
    password: string;
    profile: Omit<User, 'username'>;
}>;

// --- DYNAMIC TEST TYPES ---
type TestOption = { id: string; text: string; score: number; };
type TestQuestion = { id: string; text: string; options: TestOption[]; };
type TestDefinition = {
  id: string;
  name: string;
  questions: TestQuestion[];
  scoringLevels: { level: string; minScore: number; maxScore: number; }[];
  purposeAndInterpretationNotes?: string;
  analysisTargetsAI?: string;
};
type TestsData = Record<string, TestDefinition>;

type Notification = {
    id: string;
    recipientUsername: string;
    message: string;
    isRead: boolean;
    date: string;
};

// --- INITIAL DATA ---
const initialTestsData: TestsData = {
    "BDI": {
        id: "BDI",
        name: "Beck Depresyon Ölçeği (BDÖ)",
        scoringLevels: [
            { level: 'Minimal', minScore: 0, maxScore: 13 },
            { level: 'Hafif', minScore: 14, maxScore: 19 },
            { level: 'Orta', minScore: 20, maxScore: 28 },
            { level: 'Şiddetli', minScore: 29, maxScore: 63 }
        ],
        purposeAndInterpretationNotes: "Depresyon belirtilerinin düzeyini ve şiddetini ölçmek için kullanılır. Yüksek puanlar daha şiddetli depresif semptomları gösterir.",
        analysisTargetsAI: "Analiz sırasında özellikle 'intihar düşünceleri', 'değersizlik' ve 'zevk alamama' ile ilgili soruların (örn. 9, 3, 4. sorular) yanıtlarına odaklan. Bu bilişsel üçlü, depresyonun temelini oluşturur. Ayrıca, uyku, iştah ve yorgunluk gibi somatik (fiziksel) belirtileri (örn. 16, 17, 18. sorular) ayrı bir grup olarak değerlendir ve bunların hastanın genel işlevselliği üzerindeki etkisini yorumla.",
        questions: [
            { id: "bdi_q1", text: "1. Üzüntü", options: [{ id: 'o1', text: "Kendimi üzüntülü ve sıkıntılı hissetmiyorum.", score: 0 }, { id: 'o2', text: "Kendimi üzüntülü ve sıkıntılı hissediyorum.", score: 1 }, { id: 'o3', text: "Hep üzüntülü ve sıkıntılıyım. Bundan kurtulamıyorum.", score: 2 }, { id: 'o4', text: "O kadar üzüntülü ve sıkıntılıyım ki artık dayanamıyorum.", score: 3 }] },
            { id: "bdi_q2", text: "2. Geleceğe yönelik kötümserlik", options: [{ id: 'o1', text: "Gelecek hakkında mutsuz ve karamsar değilim.", score: 0 }, { id: 'o2', text: "Gelecek hakkında karamsarım.", score: 1 }, { id: 'o3', text: "Gelecekten beklediğim hiçbir şey yok.", score: 2 }, { id: 'o4', text: "Geleceğim hakkında umutsuzum ve sanki hiçbir şey düzelmeyecekmiş gibi geliyor.", score: 3 }] },
            { id: "bdi_q3", text: "3. Geçmişteki başarısızlıklar", options: [{ id: 'o1', text: "Kendimi başarısız bir insan olarak görmüyorum.", score: 0 }, { id: 'o2', text: "Çevremdeki birçok kişiden daha çok başarısızlıklarım olmuş gibi hissediyorum.", score: 1 }, { id: 'o3', text: "Geçmişe baktığımda başarısızlıklarla dolu olduğunu görüyorum.", score: 2 }, { id: 'o4', text: "Kendimi tümüyle başarısız biri olarak görüyorum.", score: 3 }] },
            { id: "bdi_q4", text: "4. Zevk alamama", options: [{ id: 'o1', text: "Birçok şeyden eskisi kadar zevk alıyorum.", score: 0 }, { id: 'o2', text: "Eskiden olduğu gibi her şeyden hoşlanmıyorum.", score: 1 }, { id: 'o3', text: "Artık hiçbir şey bana tam anlamıyla zevk vermiyor.", score: 2 }, { id: 'o4', text: "Her şeyden sıkılıyorum.", score: 3 }] },
            { id: "bdi_q5", text: "5. Suçluluk duyguları", options: [{ id: 'o1', text: "Kendimi herhangi bir şekilde suçlu hissetmiyorum.", score: 0 }, { id: 'o2', text: "Kendimi zaman zaman suçlu hissediyorum.", score: 1 }, { id: 'o3', text: "Çoğu zaman kendimi suçlu hissediyorum.", score: 2 }, { id: 'o4', text: "Kendimi her zaman suçlu hissediyorum.", score: 3 }] },
            { id: "bdi_q6", text: "6. Cezalandırılma duyguları", options: [{ id: 'o1', text: "Bana cezalandırılmışım gibi gelmiyor.", score: 0 }, { id: 'o2', text: "Cezalandırılabileceğimi hissediyorum.", score: 1 }, { id: 'o3', text: "Cezalandırılmayı bekliyorum.", score: 2 }, { id: 'o4', text: "Cezalandırıldığımı hissediyorum.", score: 3 }] },
            { id: "bdi_q7", text: "7. Kendinden hoşnut olmama", options: [{ id: 'o1', text: "Kendimden memnunum.", score: 0 }, { id: 'o2', text: "Kendi kendimden pek memnun değilim.", score: 1 }, { id: 'o3', text: "Kendime çok kızıyorum.", score: 2 }, { id: 'o4', text: "Kendimden nefret ediyorum.", score: 3 }] },
            { id: "bdi_q8", text: "8. Kendini eleştirme", options: [{ id: 'o1', text: "Başkalarından daha kötü olduğumu sanmıyorum.", score: 0 }, { id: 'o2', text: "Zayıf yanlarım veya hatalarım için kendi kendimi eleştiririm.", score: 1 }, { id: 'o3', text: "Hatalarımdan dolayı ve her zaman kendimi kabahatli bulurum.", score: 2 }, { id: 'o4', text: "Her aksilik karşısında kendimi hatalı bulurum.", score: 3 }] },
            { id: "bdi_q9", text: "9. İntihar düşünceleri veya istekleri", options: [{ id: 'o1', text: "Kendimi öldürmek gibi düşüncelerim yok.", score: 0 }, { id: 'o2', text: "Zaman zaman kendimi öldürmeyi düşündüğüm olur. Fakat yapmıyorum.", score: 1 }, { id: 'o3', text: "Kendimi öldürmek isterdim.", score: 2 }, { id: 'o4', text: "Fırsatını bulsam kendimi öldürürdüm.", score: 3 }] },
            { id: "bdi_q10", text: "10. Ağlama", options: [{ id: 'o1', text: "Her zamankinden fazla içimden ağlamak gelmiyor.", score: 0 }, { id: 'o2', text: "Zaman zaman içimden ağlamak geliyor.", score: 1 }, { id: 'o3', text: "Çoğu zaman ağlıyorum.", score: 2 }, { id: 'o4', text: "Eskiden ağlayabilirdim şimdi istesem de ağlayamıyorum.", score: 3 }] },
            { id: "bdi_q11", text: "11. Huzursuzluk", options: [{ id: 'o1', text: "Bir zamanlar beni sinirlendiren şeyler şimdi hiç sinirlendirmiyor.", score: 0 }, { id: 'o2', text: "Eskisine kıyasla daha kolay kızıyor ya da sinirleniyorum.", score: 1 }, { id: 'o3', text: "Çoğu zaman, oldukça sinirliyim.", score: 2 }, { id: 'o4', text: "Şimdi hep sinirliyim.", score: 3 }] },
            { id: "bdi_q12", text: "12. Sosyal geri çekilme", options: [{ id: 'o1', text: "Başkaları ile görüşmek, konuşmak isteğimi kaybetmedim.", score: 0 }, { id: 'o2', text: "Başkaları ile eskiden daha az konuşmak, görüşmek istiyorum.", score: 1 }, { id: 'o3', text: "Başkaları ile konuşma ve görüşme isteğimin çoğunu kaybettim.", score: 2 }, { id: 'o4', text: "Hiç kimseyle konuşmak görüşmek istemiyorum.", score: 3 }] },
            { id: "bdi_q13", text: "13. Kararsızlık", options: [{ id: 'o1', text: "Eskiden olduğu gibi kolay karar verebiliyorum.", score: 0 }, { id: 'o2', text: "Eskiden olduğu kadar kolay karar veremiyorum.", score: 1 }, { id: 'o3', text: "Karar verirken eskisine kıyasla çok güçlük çekiyorum.", score: 2 }, { id: 'o4', text: "Artık hiç karar veremiyorum.", score: 3 }] },
            { id: "bdi_q14", text: "14. Beden imajında değişiklik", options: [{ id: 'o1', text: "Aynada kendime baktığımda değişiklik görmüyorum.", score: 0 }, { id: 'o2', text: "Daha yaşlanmış ve çirkinleşmişim gibi geliyor.", score: 1 }, { id: 'o3', text: "Görünüşümün çok değiştiğini ve çirkinleştiğimi hissediyorum.", score: 2 }, { id: 'o4', text: "Kendimi çok çirkin buluyorum.", score: 3 }] },
            { id: "bdi_q15", text: "15. Çalışma güçlüğü", options: [{ id: 'o1', text: "Eskisi kadar iyi çalışabiliyorum.", score: 0 }, { id: 'o2', text: "Bir şeyler yapabilmek için gayret göstermem gerekiyor.", score: 1 }, { id: 'o3', text: "Herhangi bir şeyi yapabilmek için kendimi çok zorlamam gerekiyor.", score: 2 }, { id: 'o4', text: "Hiçbir şey yapamıyorum.", score: 3 }] },
            { id: "bdi_q16", text: "16. Uyku bozukluğu", options: [{ id: 'o1', text: "Her zamanki gibi iyi uyuyabiliyorum.", score: 0 }, { id: 'o2', text: "Eskiden olduğu gibi iyi uyuyamıyorum.", score: 1 }, { id: 'o3', text: "Her zamankinden 1-2 saat daha erken uyanıyorum ve tekrar uyuyamıyorum.", score: 2 }, { id: 'o4', text: "Her zamankinden çok daha erken uyanıyor ve tekrar uyuyamıyorum.", score: 3 }] },
            { id: "bdi_q17", text: "17. Yorgunluk", options: [{ id: 'o1', text: "Her zamankinden daha çabuk yorulmuyorum.", score: 0 }, { id: 'o2', text: "Her zamankinden daha çabuk yoruluyorum.", score: 1 }, { id: 'o3', text: "Yaptığım her şey beni yoruyor.", score: 2 }, { id: 'o4', text: "Kendimi hemen hiçbir şey yapamayacak kadar yorgun hissediyorum.", score: 3 }] },
            { id: "bdi_q18", text: "18. İştah değişikliği", options: [{ id: 'o1', text: "İştahım her zamanki gibi.", score: 0 }, { id: 'o2', text: "İştahım her zamanki kadar iyi değil.", score: 1 }, { id: 'o3', text: "İştahım çok azaldı.", score: 2 }, { id: 'o4', text: "Artık hiç iştahım yok.", score: 3 }] },
            { id: "bdi_q19", text: "19. Kilo kaybı", options: [{ id: 'o1', text: "Son zamanlarda kilo vermedim.", score: 0 }, { id: 'o2', text: "İki kilodan fazla kilo verdim.", score: 1 }, { id: 'o3', text: "Dört kilodan fazla kilo verdim.", score: 2 }, { id: 'o4', text: "Altı kilodan fazla kilo vermeye çalışıyorum.", score: 3 }] },
            { id: "bdi_q20", text: "20. Sağlık endişesi", options: [{ id: 'o1', text: "Sağlığım beni fazla endişelendirmiyor.", score: 0 }, { id: 'o2', text: "Ağrı, sancı, mide bozukluğu veya kabızlık gibi rahatsızlıklar beni endişelendiriyor.", score: 1 }, { id: 'o3', text: "Sağlığım beni endişelendirdiği için başka şeyleri düşünmek zorlaşıyor.", score: 2 }, { id: 'o4', text: "Sağlığım hakkında o kadar endişeliyim ki başka hiçbir şey düşünemiyorum.", score: 3 }] },
            { id: "bdi_q21", text: "21. Cinsel ilgi kaybı", options: [{ id: 'o1', text: "Son zamanlarda cinsel konulara olan ilgimde bir değişme fark etmedim.", score: 0 }, { id: 'o2', text: "Cinsel konularla eskisinden daha az ilgiliyim.", score: 1 }, { id: 'o3', text: "Cinsel konularla şimdi çok daha az ilgiliyim.", score: 2 }, { id: 'o4', text: "Cinsel konular olan ilgimi tamamen kaybettim.", score: 3 }] }
        ]
    },
    "BAI": {
        id: "BAI",
        name: "Beck Anksiyete Ölçeği (BAÖ)",
        scoringLevels: [
            { level: 'Minimal', minScore: 0, maxScore: 9 },
            { level: 'Hafif', minScore: 10, maxScore: 18 },
            { level: 'Orta', minScore: 19, maxScore: 29 },
            { level: 'Şiddetli', minScore: 30, maxScore: 63 }
        ],
        purposeAndInterpretationNotes: "Anksiyete belirtilerinin düzeyini ve şiddetini ölçmek için kullanılır. Yüksek puanlar daha şiddetli anksiyete semptomlarını gösterir.",
        analysisTargetsAI: "Analiz sırasında otonomik uyarılma belirtilerini (örn. kalp çarpıntısı, terleme, titreme) ve bilişsel anksiyete belirtilerini (örn. kötü şeyler olacak korkusu, kontrolü kaybetme korkusu) ayrı ayrı değerlendir. Bu iki grup arasındaki ilişkiyi ve hastanın günlük yaşamındaki potansiyel tetikleyicilerle (hasta profilinden elde edilen bilgilerle) olan bağlantısını vurgula.",
        questions: [
            { id: "bai_q1", text: "Bedeninizin herhangi bir yerinde uyuşma veya karıncalanma", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q2", text: "Sıcak/ ateş basmaları", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q3", text: "Bacaklarda halsizlik, titreme", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q4", text: "Gevşeyememe", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q5", text: "Çok kötü şeyler olacak korkusu", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q6", text: "Baş dönmesi veya sersemlik", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q7", text: "Kalp çarpıntısı", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q8", text: "Dengeyi kaybetme duygusu", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q9", text: "Dehşete kapılma", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q10", text: "Sinirlilik", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q11", text: "Boğuluyormuş gibi olma duygusu", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q12", text: "Ellerde titreme", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q13", text: "Titreklik", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q14", text: "Kontrolü kaybetme korkusu", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q15", text: "Nefes almada güçlük", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q16", text: "Ölüm korkusu", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q17", text: "Korkuya kapılma", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q18", text: "Midede hazımsızlık ya da rahatsızlık hissi", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q19", text: "Baygınlık", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q20", text: "Yüzün kızarması", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] },
            { id: "bai_q21", text: "Terleme (sıcaklığa bağlı olmayan)", options: [{ id: 'o1', text: "Hiç", score: 0 }, { id: 'o2', text: "Hafif Düzeyde", score: 1 }, { id: 'o3', text: "Orta Düzeyde", score: 2 }, { id: 'o4', text: "Ciddi Düzeyde", score: 3 }] }
        ]
    }
};


// --- HELPERS ---
const getTestLevel = (test: TestDefinition | undefined, score: number): string => {
    if (!test || !test.scoringLevels || test.scoringLevels.length === 0) return "N/A";
    const level = test.scoringLevels.find(l => score >= l.minScore && score <= l.maxScore);
    return level ? level.level : "Belirlenmemiş";
};

const getLevelClass = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes("minimal")) return 'level-minimal';
    if (l.includes("hafif")) return 'level-mild';
    if (l.includes("orta")) return 'level-moderate';
    if (l.includes("şiddetli")) return 'level-severe';
    return '';
}

const handleSmartPrint = (printType: 'report' | 'analysis' | 'admin-report') => {
    document.body.setAttribute('data-print-type', printType);
    // Timeout allows the DOM to update with the attribute before printing
    setTimeout(() => {
        window.print();
        document.body.removeAttribute('data-print-type');
    }, 100);
};

// --- STORAGE ---

function usePersistentState<T>(key: string, initialState: T): [T, Dispatch<SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = localStorage.getItem(key);
            if (!storedValue) return initialState;
            
            let parsed = JSON.parse(storedValue);

            // MIGRATION LOGIC for adding roles to existing users.
            if (key === 'clinical-tool-users-v2') {
                let needsUpdate = false;
                Object.keys(parsed).forEach(username => {
                    if (parsed[username].profile && parsed[username].profile.role === undefined) {
                        parsed[username].profile.role = 'clinician';
                        needsUpdate = true;
                    }
                });
                if(needsUpdate) console.log("Migrated users to include roles.");
            }
             if (key === 'clinical-tool-currentUser-v2' && parsed && parsed.role === undefined) {
                parsed.role = 'clinician';
                console.log("Migrated current user to include role.");
            }

            return parsed;
        } catch (e: any) {
            console.error("Error reading from local storage", e);
            return initialState;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e: any) {
            console.error("Error writing to local storage", e);
        }
    }, [key, state]);

    return [state, setState];
}

// --- COMPONENTS ---

const LandingPage = ({ setView }: { setView: (v: string) => void }) => {
    return (
        <div className="landing-page">
            <header className="landing-header">
                <div className="brand-logo">Klinisyen</div>
                <div className="button-group">
                    <button className="button button-secondary" onClick={() => setView('login')}>Giriş Yap</button>
                </div>
            </header>
            <section className="hero-section">
                <div className="hero-content">
                    <h1>Modern Klinik Değerlendirme Çözümleri</h1>
                    <p>Hasta değerlendirmelerinizi kolaylaştırın, verimliliği artırın ve daha iyi sonuçlar elde edin.</p>
                    <button className="button" onClick={() => setView('login')}>Hemen Başlayın</button>
                </div>
            </section>
            <section className="content-section">
                <h2>Neden Klinisyen?</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <img src="https://images.unsplash.com/photo-1558346489-19413928158b?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=150&q=80" alt="Data" />
                        <h3>Veri Odaklı Kararlar</h3>
                        <p>Beck Depresyon ve Anksiyete envanterleri ile standartlaştırılmış veriler toplayın.</p>
                    </div>
                    <div className="feature-card">
                        <img src="https://images.unsplash.com/photo-1521791136064-7986c2920216?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=150&q=80" alt="Efficiency" />
                        <h3>Verimli Zaman Yönetimi</h3>
                        <p>Dijital formlar ve otomatik puanlama ile seans hazırlık süresini kısaltın.</p>
                    </div>
                    <div className="feature-card">
                        <img src="https://images.unsplash.com/photo-1604881988758-f76ad2f7aac1?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=150&q=80" alt="Timeline" />
                        <h3>Hasta İlerlemesini İzleyin</h3>
                        <p>Zaman içindeki değerlendirme sonuçlarını görselleştirerek tedavi etkinliğini takip edin.</p>
                    </div>
                </div>
            </section>
        </div>
    );
};

type AuthPageProps = {
    users: UsersData;
    setCurrentUser: (u: User) => void;
    setView: (v: string) => void;
};
const AuthPage = ({ users, setCurrentUser, setView }: AuthPageProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = (e: FormEvent) => {
        e.preventDefault();
        const userAccount = users[username];
        if (userAccount && userAccount.password === password) {
            setCurrentUser({ username, ...userAccount.profile });
        } else {
            alert('Geçersiz kullanıcı adı veya şifre.');
        }
    };

    return (
        <div className="auth-container">
            <button className="button button-back" onClick={() => setView('landing')}>&larr; Ana Sayfaya Dön</button>
            <div className="card auth-card">
                <form onSubmit={handleLogin}>
                    <h2>Giriş Yap</h2>
                    <div className="form-group">
                        <label htmlFor="username">Kullanıcı Adı</label>
                        <input
                            type="text"
                            id="username"
                            className="form-control"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Şifre</label>
                        <input
                            type="password"
                            id="password"
                            className="form-control"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="button" style={{ width: '100%' }}>Giriş Yap</button>
                </form>
            </div>
        </div>
    );
};

type NotificationsPanelProps = {
    currentUser: User;
    notifications: Notification[];
    setNotifications: Dispatch<SetStateAction<Notification[]>>;
};
const NotificationsPanel = ({ currentUser, notifications, setNotifications }: NotificationsPanelProps) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const userNotifications = useMemo(() => {
        return notifications
            .filter(n => n.recipientUsername === currentUser.username)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [notifications, currentUser]);

    const unreadCount = userNotifications.filter(n => !n.isRead).length;

    const handleToggle = () => {
        setIsOpen(prev => !prev);
    };

    const handleMarkAsRead = (notificationId: string) => {
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    };

    return (
        <div className="notification-bell">
            <button onClick={handleToggle} className="notification-button">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>
            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Bildirimler</h3>
                    </div>
                    <div className="notification-list">
                        {userNotifications.length > 0 ? userNotifications.map(n => (
                            <div key={n.id} className={`notification-item ${n.isRead ? 'read' : ''}`} onClick={() => handleMarkAsRead(n.id)}>
                                <p>{n.message}</p>
                                <small>{new Date(n.date).toLocaleString('tr-TR')}</small>
                            </div>
                        )) : (
                            <div className="notification-item">
                                <p>Yeni bildiriminiz yok.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

type AppHeaderProps = {
    setView: (view: string) => void;
    currentUser: User;
    onLogout: () => void;
    notifications: Notification[];
    setNotifications: Dispatch<SetStateAction<Notification[]>>;
};
const AppHeader = ({ setView, currentUser, onLogout, notifications, setNotifications }: AppHeaderProps) => (
    <header className="app-header">
        <div className="header-left">
            <div className="brand-logo">Klinisyen</div>
            <nav className="main-nav">
                <button className="nav-button" onClick={() => setView('main')}>Ana Sayfa</button>
                <button className="nav-button" onClick={() => setView('newAssessment')}>Testler</button>
                <button className="nav-button" onClick={() => setView('history')}>Hasta Geçmişi</button>
                <div className="nav-item-dropdown">
                    <button className="nav-button">Profil</button>
                    <div className="dropdown-menu">
                        <button onClick={() => setView('profile')}>Profili Düzenle</button>
                    </div>
                </div>
            </nav>
        </div>
        <div className="header-right">
             <NotificationsPanel currentUser={currentUser} notifications={notifications} setNotifications={setNotifications} />
            <div className="user-info">
                <span>Hoş geldiniz, <strong>{currentUser.username}</strong> ({currentUser.role})</span>
            </div>
            <button className="button button-logout" onClick={onLogout}>Çıkış Yap</button>
        </div>
    </header>
);

const PatientHeader = ({ currentUser, onLogout, notifications, setNotifications }: { currentUser: User, onLogout: () => void, notifications: Notification[], setNotifications: Dispatch<SetStateAction<Notification[]>> }) => (
    <header className="app-header">
        <div className="header-left">
            <div className="brand-logo">Hasta Paneli</div>
        </div>
        <div className="header-right">
             <NotificationsPanel currentUser={currentUser} notifications={notifications} setNotifications={setNotifications} />
            <div className="user-info">
                <span>Hoş geldiniz, <strong>{currentUser.patientName}</strong></span>
            </div>
            <button className="button button-logout" onClick={onLogout}>Çıkış Yap</button>
        </div>
    </header>
);


type ProfilePageProps = {
    user: User;
    users: UsersData;
    setUsers: Dispatch<SetStateAction<UsersData>>;
    setCurrentUser: Dispatch<SetStateAction<User | null>>;
};
const ProfilePage = ({ user, users, setUsers, setCurrentUser }: ProfilePageProps) => {
    const [profileData, setProfileData] = useState<Omit<User, 'username'>>(user);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const updatedUserAccount = { ...users[user.username], profile: profileData };
        const updatedUsers = { ...users, [user.username]: updatedUserAccount };
        setUsers(updatedUsers);
        setCurrentUser({ ...user, ...profileData });
        alert('Profil bilgileri güncellendi.');
    };

    const renderInput = (name: keyof Omit<User, 'username' | 'role' | 'patientName'>, label: string, placeholder = '') => (
        <>
            <label htmlFor={name}>{label}</label>
            <input
                type="text"
                id={name}
                name={name}
                className="form-control"
                value={profileData[name] || ''}
                onChange={handleChange}
                placeholder={placeholder}
            />
        </>
    );

    return (
        <div className="container">
            <form className="card" onSubmit={handleSubmit}>
                <h2>Klinisyen Profili</h2>
                <p>Mesleki bilgilerinizi güncelleyebilirsiniz. Bu bilgiler, sistem içi raporlama ve gelecekteki özellikler için kullanılabilir.</p>

                <div className="profile-form-grid">
                    <fieldset>
                        <legend>1. Kimlik & İdari Bilgiler</legend>
                        {renderInput('fullName', 'Ad – Soyad, Unvan')}
                        {renderInput('nationalId', 'TC Kimlik / Personel ID (gizli)')}
                        {renderInput('diplomaNo', 'Diploma, uzmanlık ve sertifika numaraları')}
                        {renderInput('workStatus', 'Çalışma statüsü', 'örn: kadrolu, konsültan')}
                    </fieldset>

                    <fieldset>
                        <legend>2. Mesleki Bilgiler</legend>
                        {renderInput('specialization', 'Uzmanlık alanı', 'örn: Çocuk-Ergen Psikiyatrisi')}
                        {renderInput('clinicalInterests', 'Klinik ilgi alanları', 'örn: travma, şizofreni, depresyon')}
                        {renderInput('therapyMethods', 'Kullandığı terapi yöntemleri', 'örn: CBT, EMDR, ilaç tedavisi')}
                        {renderInput('authorizations', 'Yetki tanımları', 'örn: ilaç reçeteleme, rapor düzenleme')}
                    </fieldset>

                    <fieldset>
                        <legend>3. Klinik Operasyon Detayları</legend>
                        {renderInput('workSchedule', 'Çalışma günleri & saatleri')}
                        {renderInput('appointmentCapacity', 'Randevu kapasitesi (günde/haftada)')}
                        {renderInput('serviceTypes', 'Poliklinik / servis / online görüşme yetkisi')}
                        {renderInput('consultationAreas', 'Konsültasyon alanları')}
                    </fieldset>

                    <fieldset>
                        <legend>5. İletişim & İç Kullanım</legend>
                        {renderInput('internalPhone', 'Dahili telefon')}
                        {renderInput('email', 'Kurumsal e-posta')}
                        {renderInput('assistantInfo', 'Asistan / sekreter bilgisi')}
                        {renderInput('emergencyContact', 'Acil durumlarda ulaşılırlık')}
                    </fieldset>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                    <p style={{ color: 'var(--muted-text-color)' }}>
                        <strong>Performans & Takip bilgileri</strong> (görüşme sayıları, bekleme süresi vb.) gelecekteki bir güncellemede eklenecektir ve sadece klinik yönetimi tarafından görüntülenebilecektir.
                    </p>
                </div>


                <div className="button-group" style={{ gridColumn: '1 / -1' }}>
                    <button type="submit" className="button">Profili Kaydet</button>
                </div>
            </form>
        </div>
    );
};

type MainDashboardProps = {
    setView: (v: string) => void;
    patientCount: number;
};
const MainDashboard = ({ setView, patientCount }: MainDashboardProps) => {
    return (
        <div className="dashboard-hero">
            <div className="dashboard-hero-content">
                <h2>Kontrol Paneli</h2>
                <p>Klinik değerlendirme aracınıza hoş geldiniz. Buradan başlayabilirsiniz.</p>
                <div className="dashboard-grid">
                    <div className="card action-card" onClick={() => setView('newAssessment')}>
                        <h3>Yeni Değerlendirme Başlat</h3>
                        <p>Yeni bir hasta için testleri başlatın veya mevcut bir hastanın takibini yapın.</p>
                    </div>
                    <div className="card action-card" onClick={() => setView('history')}>
                        <h3>Hasta Geçmişini Görüntüle</h3>
                        <p>Mevcut hastaların kayıtlarını, notlarını ve geçmiş değerlendirmelerini inceleyin.</p>
                    </div>
                    <div className="card info-card">
                        <h3>Genel Bakış</h3>
                        <div className="info-stat">
                            <span className="stat-value">{patientCount}</span>
                            <span className="stat-label">Yönetilen Hasta</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

type NewAssessmentPageProps = {
    patients: PatientsData;
    setView: (v: string) => void;
    setPatientName: (n: string) => void;
};
const NewAssessmentPage = ({ patients, setView, setPatientName }: NewAssessmentPageProps) => {
    const [selectedName, setSelectedName] = useState('');

    const startForExisting = () => {
        if (selectedName) {
            setPatientName(selectedName);
            setView('updatePatientProfile');
        } else {
            alert("Lütfen bir hasta seçin.");
        }
    };

    return (
        <div className="container">
            <div className="card">
                <h2>Değerlendirme Başlat</h2>
                <p>Yeni bir hasta kaydı oluşturun veya mevcut bir hasta ile devam edin.</p>
                <div className="button-group">
                    <button className="button" onClick={() => setView('createPatient')}>Yeni Hasta Ekle</button>
                </div>
                {Object.keys(patients).length > 0 && (
                    <>
                        <hr style={{ margin: '2rem 0' }} />
                        <h3>Veya Mevcut Hastayla Devam Et</h3>
                        <div className="form-group" style={{ marginTop: '1.5rem' }}>
                            <label htmlFor="patientSelect">Hasta Seçin</label>
                            <select
                                id="patientSelect"
                                className="form-control"
                                value={selectedName}
                                onChange={e => setSelectedName(e.target.value)}
                            >
                                <option value="">Bir hasta seçiniz...</option>
                                {Object.keys(patients).map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </div>
                        <div className="button-group">
                            <button className="button" onClick={startForExisting} disabled={!selectedName}>
                                Devam Et
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};


type PatientProfileFormProps = {
    patient: Omit<Patient, 'assessments' | 'sessionNotes' | 'assignedTests'>;
    onSave: (patient: Patient) => void;
    existingNames: string[];
    isNew: boolean;
};
const PatientProfileForm = ({ patient, onSave, existingNames, isNew }: PatientProfileFormProps) => {
    const [formData, setFormData] = useState(patient);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const isNumber = type === 'number';
        setFormData(prev => ({
            ...prev,
            [name]: isNumber && value !== '' ? parseFloat(value) : value
        }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmedName = formData.name.trim();
        if (!trimmedName) {
            alert("Hasta adı boş bırakılamaz.");
            return;
        }
        if (isNew && existingNames.includes(trimmedName)) {
            alert("Bu isimde bir hasta zaten mevcut. Lütfen farklı bir isim girin.");
            return;
        }

        const patientData: Patient = {
            ...formData,
            name: trimmedName,
            assessments: isNew ? [] : (patient as Patient).assessments,
            sessionNotes: isNew ? '' : (patient as Patient).sessionNotes,
            assignedTests: isNew ? [] : (patient as Patient).assignedTests,
        };
        onSave(patientData);
    };

    return (
        <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
            <div className="profile-grid create-patient-grid">
                <label htmlFor="name">Ad Soyad *</label>
                <input type="text" id="name" name="name" value={formData.name || ''} onChange={handleChange} className="form-control" required disabled={!isNew} />
                <label htmlFor="age">Yaş</label>
                <input type="number" id="age" name="age" value={formData.age || ''} onChange={handleChange} className="form-control" />
                <label htmlFor="phone">Telefon Numarası</label>
                <input type="tel" id="phone" name="phone" value={formData.phone || ''} onChange={handleChange} className="form-control" placeholder="örn: 5551234567" />
                <label htmlFor="email">E-posta Adresi</label>
                <input type="email" id="email" name="email" value={formData.email || ''} onChange={handleChange} className="form-control" placeholder="örn: hasta@mail.com" />
                <label htmlFor="weight">Kilo (kg)</label>
                <input type="number" id="weight" name="weight" value={formData.weight || ''} onChange={handleChange} className="form-control" />
                <label htmlFor="height">Boy (cm)</label>
                <input type="number" id="height" name="height" value={formData.height || ''} onChange={handleChange} className="form-control" />
                <label htmlFor="sleepHours">Ort. Uyku (saat/gece)</label>
                <input type="number" id="sleepHours" name="sleepHours" value={formData.sleepHours || ''} onChange={handleChange} className="form-control" />
                <label htmlFor="workIntensity">Gündelik İş Yoğunluğu</label>
                <select id="workIntensity" name="workIntensity" value={formData.workIntensity || ''} onChange={handleChange} className="form-control">
                    <option value="">Seçiniz...</option>
                    <option value="Düşük">Düşük</option>
                    <option value="Orta">Orta</option>
                    <option value="Yüksek">Yüksek</option>
                    <option value="Çok Yüksek">Çok Yüksek</option>
                </select>
                <label htmlFor="caffeineConsumption">Kahve/Çay Tüketimi</label>
                <select id="caffeineConsumption" name="caffeineConsumption" value={formData.caffeineConsumption || ''} onChange={handleChange} className="form-control">
                    <option value="">Seçiniz...</option>
                    <option value="Yok">Yok</option>
                    <option value="Düşük">Düşük (Günde 1-2)</option>
                    <option value="Orta">Orta (Günde 3-4)</option>
                    <option value="Yüksek">Yüksek (Günde 5+)</option>
                </select>
                <label htmlFor="dietHabits">Beslenme Alışkanlıkları</label>
                <input type="text" id="dietHabits" name="dietHabits" value={formData.dietHabits || ''} onChange={handleChange} className="form-control" placeholder="Örn: Düzensiz, genellikle fast-food" />
                <label htmlFor="addictions">Bağımlılıklar</label>
                <input type="text" id="addictions" name="addictions" value={formData.addictions || ''} onChange={handleChange} className="form-control" placeholder="Örn: Sigara, alkol (varsa belirtin)" />
                <label htmlFor="medications">Sürekli Kullandığı İlaçlar</label>
                <input type="text" id="medications" name="medications" value={formData.medications || ''} onChange={handleChange} className="form-control" placeholder="Varsa ilaç isimlerini belirtin" />
                <label htmlFor="chronicIllness">Kronik Rahatsızlıklar</label>
                <input type="text" id="chronicIllness" name="chronicIllness" value={formData.chronicIllness || ''} onChange={handleChange} className="form-control" placeholder="Varsa belirtin" />
            </div>
            <div className="button-group">
                <button type="submit" className="button">{isNew ? 'Hastayı Kaydet ve Test Seçimine Geç' : 'Bilgileri Güncelle ve Test Seçimine Geç'}</button>
            </div>
        </form>
    );
};

const CreatePatientPage = ({ onPatientCreate, existingNames }: { onPatientCreate: (p: Patient) => void, existingNames: string[] }) => (
    <div className="container">
        <div className="card">
            <h2>Yeni Hasta Kaydı</h2>
            <p>Lütfen hastanın bilgilerini eksiksiz girin. Bu bilgiler, yapay zeka analizinin doğruluğunu artıracaktır.</p>
            <PatientProfileForm patient={{ name: '' }} onSave={onPatientCreate} existingNames={existingNames} isNew={true} />
        </div>
    </div>
);

const UpdatePatientProfilePage = ({ patient, onUpdate }: { patient: Patient, onUpdate: (p: Patient) => void }) => (
    <div className="container">
        <div className="card">
            <h2>Hasta Profilini Güncelle: {patient.name}</h2>
            <p>Teste başlamadan önce hasta bilgilerini gözden geçirin ve gerekiyorsa güncelleyin.</p>
            <PatientProfileForm patient={patient} onSave={onUpdate} existingNames={[]} isNew={false} />
        </div>
    </div>
);


type TestSelectionPageProps = {
    patientName: string;
    onConfirm: (selectedTests: string[], mode: 'start' | 'assign') => void;
    tests: TestsData;
};
const TestSelectionPage = ({ patientName, onConfirm, tests }: TestSelectionPageProps) => {
    const [selectedTests, setSelectedTests] = useState<string[]>([]);

    const toggleTest = (testId: string) => {
        setSelectedTests(prev => {
            if (prev.includes(testId)) {
                return prev.filter(t => t !== testId);
            } else {
                return [...prev, testId];
            }
        });
    };

    const handleAction = (mode: 'start' | 'assign') => {
        if (selectedTests.length === 0) {
            alert("Lütfen en az bir test seçin.");
            return;
        }
        onConfirm(selectedTests, mode);
    };

    return (
        <div className="container">
            <div className="card">
                <h2>Test Seçimi</h2>
                <p>Hasta: <strong>{patientName}</strong></p>
                <p>Lütfen bu oturumda uygulamak istediğiniz testleri seçin. Testler seçtiğiniz sırayla uygulanacaktır.</p>
                <div className="test-selection-grid">
                    {Object.values(tests).map(test => (
                        <div
                            key={test.id}
                            className={`card test-selection-card ${selectedTests.includes(test.id) ? 'selected' : ''}`}
                            onClick={() => toggleTest(test.id)}
                        >
                            {selectedTests.includes(test.id) && <div className="selection-order">{selectedTests.indexOf(test.id) + 1}</div>}
                            <h3>{test.name}</h3>
                            <p>{test.purposeAndInterpretationNotes?.substring(0, 100) ?? 'Test açıklaması yok.'}...</p>
                        </div>
                    ))}
                </div>
                <div className="button-group">
                    <button className="button" onClick={() => handleAction('start')} disabled={selectedTests.length === 0}>
                        Yüz Yüze Başlat
                    </button>
                    <button className="button button-secondary" onClick={() => handleAction('assign')} disabled={selectedTests.length === 0}>
                        Hastaya Ata
                    </button>
                </div>
            </div>
        </div>
    );
};


type AssessmentFormProps = {
    patientName: string;
    testQueue: string[];
    tests: TestsData;
    currentUser: User;
    onComplete: (result: AssessmentResult) => void;
};
const AssessmentForm = ({ patientName, testQueue, tests, currentUser, onComplete }: AssessmentFormProps) => {
    const [currentTestIndex, setCurrentTestIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, { optionId: string; score: number }>>({});
    const [completedTestResults, setCompletedTestResults] = useState<TestResult[]>([]);

    const currentTestId = testQueue[currentTestIndex];
    const currentTestDef = tests[currentTestId];

    const handleAnswerChange = (qId: string, optionId: string, score: number) => {
        setAnswers(prev => ({ ...prev, [qId]: { optionId, score } }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (Object.keys(answers).length !== currentTestDef.questions.length) {
            alert("Lütfen tüm soruları yanıtlayın.");
            return;
        }

        const answeredQuestions = currentTestDef.questions.map((q) => {
            const answerData = answers[q.id];
            const selectedOption = q.options.find(opt => opt.id === answerData.optionId);
            return {
                question: q.text,
                answer: selectedOption?.text ?? 'N/A',
                score: answerData.score
            };
        });

        const totalScore = answeredQuestions.reduce((sum, a) => sum + a.score, 0);
        const level = getTestLevel(currentTestDef, totalScore);

        const newTestResult: TestResult = {
            testId: currentTestId,
            testName: currentTestDef.name,
            score: totalScore,
            level: level,
            answers: answeredQuestions
        };

        const updatedCompletedResults = [...completedTestResults, newTestResult];
        setCompletedTestResults(updatedCompletedResults);

        if (currentTestIndex < testQueue.length - 1) {
            setCurrentTestIndex(prev => prev + 1);
            setAnswers({});
        } else {
            const finalResult: AssessmentResult = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                patientName: patientName,
                clinicianUsername: currentUser.role === 'clinician' ? currentUser.username : 'Hasta Tarafından Dolduruldu',
                results: updatedCompletedResults,
            };
            onComplete(finalResult);
        }
    };

    if (!currentTestDef) {
        return <div className="container card"><p>Test tanımı bulunamadı. Lütfen yönetici ile iletişime geçin.</p></div>;
    }

    return (
        <div className="assessment-layout">
            <aside className="assessment-sidebar">
                <h3>Test Akışı</h3>
                <p>Hasta: <strong>{patientName}</strong></p>
                <ul className="test-progress-list">
                    {testQueue.map((testId, index) => (
                        <li key={testId} className={
                            index < currentTestIndex ? 'completed' :
                                index === currentTestIndex ? 'current' : ''
                        }>
                            {tests[testId]?.name ?? 'Bilinmeyen Test'}
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="assessment-main">
                <form onSubmit={handleSubmit} className="assessment-form">
                    <div className="card">
                        <h2>{currentTestDef.name}</h2>
                        <p style={{ marginBottom: '2rem' }}>Lütfen BUGÜN DAHİL GEÇEN HAFTA içinde kendinizi nasıl hissettiğinizi en iyi anlatan cümleyi seçiniz.</p>

                        {currentTestDef.questions.map((q) => (
                            <div key={q.id} className="question-card">
                                <p>{q.text}</p>
                                <div className="options-group">
                                    {q.options.map((opt) => (
                                        <label key={opt.id} className="option-label">
                                            <input
                                                type="radio"
                                                name={`question-${q.id}`}
                                                required
                                                checked={answers[q.id]?.optionId === opt.id}
                                                onChange={() => handleAnswerChange(q.id, opt.id, opt.score)}
                                            />
                                            <span>{opt.text} {currentUser.role !== 'patient' && `(Puan: ${opt.score})`}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="button-group">
                            <button type="submit" className="button">
                                {currentTestIndex < testQueue.length - 1 ? 'Sonraki Teste Geç' : 'Değerlendirmeyi Tamamla'}
                            </button>
                        </div>
                    </div>
                </form>
            </main>
        </div>
    );
};


type ResultsReportProps = {
    result: AssessmentResult;
};
const ResultsReport = ({ result }: ResultsReportProps) => {
    return (
        <div className="report-view">
            <header className="report-header">
                <h1>Klinik Değerlendirme Raporu</h1>
                <p>Hasta: <strong>{result.patientName}</strong></p>
                <p>Tarih: {new Date(result.date).toLocaleDateString('tr-TR')} | Klinisyen: {result.clinicianUsername}</p>
            </header>

            {result.results.map(testResult => (
                <section key={testResult.testId} className="report-section">
                    <h3>{testResult.testName} Sonuçları</h3>
                    <div className="score-grid">
                        <div className="score-card">
                            <h4>Toplam Puan</h4>
                            <div className="score-value">{testResult.score}</div>
                            <div className={`score-level ${getLevelClass(testResult.level)}`}>{testResult.level} Seviye</div>
                        </div>
                    </div>
                    <h4>Yanıtlar</h4>
                    <table className="answers-table">
                        <thead><tr><th>Soru</th><th>Yanıt (Puan)</th></tr></thead>
                        <tbody>
                            {testResult.answers.map((a, i) => (
                                <tr key={i}>
                                    <td>{a.question}</td>
                                    <td>{a.answer} ({a.score})</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            ))}
        </div>
    );
};

type ResultsPageProps = {
    result: AssessmentResult;
    setView: (v: string) => void;
    saveResult: () => void;
};
const ResultsPage = ({ result, setView, saveResult }: ResultsPageProps) => {
    const handleSave = () => {
        saveResult();
        alert("Sonuçlar hasta geçmişine kaydedildi.");
        setView('history');
    };

    return (
        <div className="container">
            <div className="card">
                <ResultsReport result={result} />
                <div className="button-group">
                    <button className="button" onClick={handleSave}>Sonuçları Kaydet ve Geçmişe Git</button>
                    <button className="button button-secondary" onClick={() => handleSmartPrint('report')}>PDF Olarak İndir</button>
                    <button className="button button-secondary" onClick={() => alert("Paylaşım özelliği hasta geçmişi sayfasında mevcuttur.")}>Paylaş</button>
                </div>
            </div>
        </div>
    );
};

type ShareModalProps = {
    isOpen: boolean;
    onClose: () => void;
    patient: Patient | null;
    result: AssessmentResult | null;
}
const ShareModal = ({ isOpen, onClose, patient, result }: ShareModalProps) => {
    if (!isOpen || !patient || !result) return null;

    const generateShareText = (res: AssessmentResult, pat: Patient) => {
        let text = `Klinik Değerlendirme Raporu\n`;
        text += `Hasta: ${pat.name}\n`;
        text += `Tarih: ${new Date(res.date).toLocaleDateString('tr-TR')}\n\n`;
        
        res.results.forEach(testResult => {
            text += `${testResult.testName} Sonucu:\n`;
            text += `Puan: ${testResult.score} - Seviye: ${testResult.level}\n\n`;
        });
        
        if (res.aiAnalysis) {
            text += `Yapay Zeka Analizi Özeti:\n${res.aiAnalysis.substring(0, 400)}...\n`;
        }
        return text;
    };

    const text = generateShareText(result, patient);
    const encodedText = encodeURIComponent(text);

    const handleWhatsAppShare = () => {
        if (patient.phone) {
            const whatsappUrl = `https://wa.me/${patient.phone.replace(/\D/g, '')}?text=${encodedText}`;
            window.open(whatsappUrl, '_blank');
        } else {
            alert("Hastanın telefon numarası kayıtlı değil.");
        }
        onClose();
    };

    const handleEmailShare = () => {
        if (patient.email) {
            const subject = encodeURIComponent(`Klinik Değerlendirme Raporu: ${patient.name}`);
            const mailtoUrl = `mailto:${patient.email}?subject=${subject}&body=${encodedText}`;
            window.location.href = mailtoUrl;
        } else {
            alert("Hastanın e-posta adresi kayıtlı değil.");
        }
        onClose();
    };


    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                <h2>Raporu Paylaş</h2>
                <p>Hasta: <strong>{patient.name}</strong></p>
                <p>Lütfen paylaşım yöntemini seçin:</p>
                <div className="button-group" style={{ flexDirection: 'column', gap: '0.75rem' }}>
                    <button onClick={handleWhatsAppShare} disabled={!patient.phone} className="button" style={{ width: '100%' }}>
                        <svg style={{ verticalAlign: 'middle', marginRight: '8px' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338- .943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                        WhatsApp ile Gönder
                    </button>
                    <button onClick={handleEmailShare} disabled={!patient.email} className="button" style={{ width: '100%' }}>
                        <svg style={{ verticalAlign: 'middle', marginRight: '8px' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z"/></svg>
                        E-posta ile Gönder
                    </button>
                </div>
                <div className="button-group" style={{ marginTop: '1rem' }}>
                    <button onClick={onClose} className="button button-secondary" style={{ width: '100%' }}>Kapat</button>
                </div>
            </div>
        </div>
    );
};

const AiAnalysisDisplay = ({ analysisText }: { analysisText: string }) => {
    const renderContent = () => {
        if (!analysisText) return null;

        return analysisText.split('\n').map((line, index) => {
            // Headers (e.g., ### Title)
            if (line.startsWith('### ')) {
                const content = line.substring(4);
                const parts = content.split(/(\*\*.*?\*\*)/g).filter(Boolean);
                return (
                    <h3 key={index}>
                        {parts.map((part, i) =>
                            part.startsWith('**') && part.endsWith('**') ?
                            <strong key={i}>{part.slice(2, -2)}</strong> :
                            part
                        )}
                    </h3>
                );
            }

            // List items (e.g., - Item)
            if (line.startsWith('- ')) {
                const content = line.substring(2);
                const parts = content.split(/(\*\*.*?\*\*)/g).filter(Boolean);
                return (
                    <div key={index} className="ai-list-item">
                       {parts.map((part, i) =>
                            part.startsWith('**') && part.endsWith('**') ?
                            <strong key={i}>{part.slice(2, -2)}</strong> :
                            part
                        )}
                    </div>
                );
            }

            if (line.trim() === '') {
                return null;
            }

            // Paragraphs with bolding
            const parts = line.split(/(\*\*.*?\*\*)/g).filter(Boolean);
            return (
                <p key={index}>
                   {parts.map((part, i) =>
                        part.startsWith('**') && part.endsWith('**') ?
                        <strong key={i}>{part.slice(2, -2)}</strong> :
                        part
                    )}
                </p>
            );
        });
    };

    return <div className="ai-analysis-result">{renderContent()}</div>;
};


type PatientHistoryProps = {
    patients: PatientsData;
    setPatients: Dispatch<SetStateAction<PatientsData>>;
    users: UsersData;
    setUsers: Dispatch<SetStateAction<UsersData>>;
    tests: TestsData;
    currentUser: User;
    setNotifications: Dispatch<SetStateAction<Notification[]>>;
};
const PatientHistory = ({ patients, setPatients, users, setUsers, tests, currentUser, setNotifications }: PatientHistoryProps) => {
    const [selectedPatient, setSelectedPatient] = useState<string | null>(Object.keys(patients)[0] || null);
    const [selectedAssessment, setSelectedAssessment] = useState<AssessmentResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [actionPanelPatient, setActionPanelPatient] = useState<string | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareData, setShareData] = useState<{ patient: Patient, result: AssessmentResult } | null>(null);


    const patient = useMemo(() => (selectedPatient ? patients[selectedPatient] : null), [selectedPatient, patients]);
    const patientUser = useMemo(() => {
        if (!patient) return null;
        const username = Object.keys(users).find(u => users[u].profile.role === 'patient' && users[u].profile.patientName === patient.name);
        return username ? { username, ...users[username] } : null;
    }, [patient, users]);

    useEffect(() => {
        if (patient && patient.assessments.length > 0) {
            const latestAssessment = [...patient.assessments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            setSelectedAssessment(latestAssessment);
        } else {
            setSelectedAssessment(null);
        }
    }, [patient]);

    const createAdminNotification = (message: string) => {
        const admins = Object.keys(users).filter(u => users[u].profile.role === 'admin');
        const newNotifications: Notification[] = admins.map(adminUsername => ({
            id: `notif_${Date.now()}_${adminUsername}`,
            recipientUsername: adminUsername,
            message: message,
            isRead: false,
            date: new Date().toISOString(),
        }));
        setNotifications(prev => [...prev, ...newNotifications]);
    };

    const handleReleaseResults = (assessment: AssessmentResult) => {
        if (!patient || !patientUser?.username) return;

        const updatedAssessments = patient.assessments.map(a =>
            a.id === assessment.id ? { ...a, isReleasedToPatient: true } : a
        );
        const updatedPatient = { ...patient, assessments: updatedAssessments };
        setPatients(prev => ({ ...prev, [patient.name]: updatedPatient }));
        setSelectedAssessment(prev => prev ? { ...prev, isReleasedToPatient: true } : null);

        const newNotification: Notification = {
            id: `notif_${Date.now()}`,
            recipientUsername: patientUser.username,
            message: `Klinisyeniniz, ${new Date(assessment.date).toLocaleDateString('tr-TR')} tarihli test sonuçlarınızı paylaştı.`,
            isRead: false,
            date: new Date().toISOString(),
        };
        setNotifications(prev => [...prev, newNotification]);
        alert("Sonuçlar hastayla paylaşıldı ve hastaya bildirim gönderildi.");
    };

    const openShareModal = (result: AssessmentResult, patient: Patient) => {
        setShareData({ result, patient });
        setIsShareModalOpen(true);
    };

    const handleCreatePatientAccount = () => {
        if (!patient) return;
        const username = prompt(`'${patient.name}' için bir kullanıcı adı girin:`, patient.name.toLowerCase().replace(/\s/g, ''));
        if (!username || users[username]) {
            alert("Geçersiz veya zaten alınmış bir kullanıcı adı.");
            return;
        }
        const password = prompt(`'${username}' için bir şifre girin:`);
        if (!password) {
            alert("Şifre boş bırakılamaz.");
            return;
        }
        const newUserAccount = {
            password: password,
            profile: {
                role: 'patient' as UserRole,
                patientName: patient.name
            }
        };
        setUsers(prev => ({ ...prev, [username]: newUserAccount }));
        alert(`Hesap oluşturuldu!\nKullanıcı Adı: ${username}\nŞifre: ${password}\n\nLütfen bu bilgileri güvenli bir şekilde hastaya iletin.`);
    };

    const handleNotesChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        if (!selectedPatient) return;
        const updatedPatient = { ...patients[selectedPatient], sessionNotes: e.target.value };
        const updatedPatients = { ...patients, [selectedPatient]: updatedPatient };
        setPatients(updatedPatients);
    };

    const handleEvaluationChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        if (!patient || !selectedAssessment) return;
        const updatedValue = e.target.value;
        const updatedAssessments = patient.assessments.map(asm =>
            asm.id === selectedAssessment.id ? { ...asm, clinicianEvaluation: updatedValue } : asm
        );
        const updatedPatient = { ...patient, assessments: updatedAssessments };
        setPatients(prev => ({ ...prev, [patient.name]: updatedPatient }));
        setSelectedAssessment(prev => prev ? { ...prev, clinicianEvaluation: updatedValue } : null);

        if (updatedValue.trim().length > 10) { // Send notification on meaningful input
             createAdminNotification(`${currentUser.username}, ${patient.name} için bir değerlendirme notu ekledi/güncelledi.`);
        }
    };

    const handleProfileChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        if (!patient) return;
        const { name, value, type } = e.target;
        const updatedPatient: Patient = { ...patient, [name]: type === 'number' && value !== '' ? parseFloat(value) : value };
        setPatients(prev => ({ ...prev, [patient.name]: updatedPatient }));
    };

    const handleAiAnalysis = async () => {
        if (!selectedAssessment || !patient) return;
        setIsAnalyzing(true);

        const sortedAssessments = [...patient.assessments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latestAssessment = sortedAssessments.find(a => a.id === selectedAssessment.id);
        const previousAssessment = sortedAssessments.find(a => new Date(a.date) < new Date(latestAssessment!.date));

        const getTopAnswers = (answers: Answer[] | undefined, count = 3) => {
            if (!answers) return 'Yok.';
            return answers.filter(a => a.score > 1).sort((a, b) => b.score - a.score).slice(0, count)
                .map(a => `- Soru: "${a.question}" | Yanıt: "${a.answer}" (Puan: ${a.score})`).join('\n');
        };

        const generateTestResultText = (testResult: TestResult) => {
            const testDef = tests[testResult.testId];
            let text = `---
**Test Sonucu: ${testResult.testName}**

**Testin Amacı ve Yorumlama Notları:**
${testDef?.purposeAndInterpretationNotes || 'Belirtilmemiş.'}

**Analiz & Hesaplama Hedefleri (AI için):**
${testDef?.analysisTargetsAI || 'Standart analiz yap.'}

**Sonuçlar:**
- Puan: ${testResult.score} (Seviye: ${testResult.level})
- En Yüksek Puanlı Yanıtlar:
${getTopAnswers(testResult.answers)}
`;
            return text;
        };

        try {
            let prompt = `Sen, bir psikoterapiste yardımcı olan bir klinik yapay zeka asistanısın. Görevin, sağlanan DETAYLI HASTA PROFİLİ, test sonuçları ve klinisyen notlarını BİRLİKTE analiz ederek yapılandırılmış, bütüncül ve içgörü sahibi bir klinik özet oluşturmaktır. Özellikle, hastanın yaşam tarzı (uyku, beslenme, kafein), tıbbi geçmişi (ilaçlar, kronik hastalıklar) ve belirttiği semptomlar arasındaki olası bağlantıları vurgula. Cevabını SADECE Türkçe olarak ve aşağıdaki formatta ver:
---
### HASTA VERİLERİ:

**Detaylı Hasta Profili:**
- İsim: ${latestAssessment.patientName}
- Yaş: ${patient.age || 'Belirtilmemiş'}
- Telefon: ${patient.phone || 'Belirtilmemiş'}
- E-posta: ${patient.email || 'Belirtilmemiş'}
- Kilo: ${patient.weight ? patient.weight + ' kg' : 'Belirtilmemiş'}
- Boy: ${patient.height ? patient.height + ' cm' : 'Belirtilmemiş'}
- Ortalama Uyku Süresi: ${patient.sleepHours ? patient.sleepHours + ' saat/gece' : 'Belirtilmemiş'}
- Gündelik İş Yoğunluğu: ${patient.workIntensity || 'Belirtilmemiş'}
- Bağımlılıklar: ${patient.addictions || 'Belirtilmemiş'}
- Sürekli Kullandığı İlaçlar: ${patient.medications || 'Belirtilmemiş'}
- Kronik Rahatsızlıklar: ${patient.chronicIllness || 'Belirtilmemiş'}
- Kahve/Çay Tüketimi: ${patient.caffeineConsumption || 'Belirtilmemiş'}
- Beslenme Alışkanlıkları: ${patient.dietHabits || 'Belirtilmemiş'}

**Güncel Değerlendirme Sonuçları (${new Date(latestAssessment.date).toLocaleDateString('tr-TR')}):**
${latestAssessment.results.map(generateTestResultText).join('\n')}
`;

            if (previousAssessment) {
                 const prevResultsText = previousAssessment.results.map(r => `- ${r.testName}: ${r.score} Puan (${r.level})`).join('\n');
                prompt += `
---
### KARŞILAŞTIRMA ANALİZİ GÖREVİ:
Bu hastanın önceki değerlendirme verileri de aşağıdadır. Analizini oluştururken, "1. Özet Puan Değerlendirmesi" bölümünden sonra "2. Karşılaştırmalı Analiz (Önceki Değerlendirmeye Göre)" adında YENİ bir bölüm ekle. Bu bölümde, hastanın son iki değerlendirme arasındaki ilerlemesini (veya gerilemesini) analiz et. Puanlardaki belirgin değişiklikleri vurgula. Hangi semptomların iyileştiğini, hangilerinin kötüleştiğini veya yeni ortaya çıktığını belirt. Bu değişimin olası nedenlerini (örn. tedaviye yanıt, yaşam tarzı değişiklikleri, yeni stresörler) hasta profili ve klinisyen notları bağlamında yorumla. Analizin geri kalanını (Belirgin Semptomlar, Bağlamsal Faktörler, Odak Noktaları) güncel değerlendirmeye göre yap.

**Önceki Değerlendirme Sonuçları (${new Date(previousAssessment.date).toLocaleDateString('tr-TR')}):**
${prevResultsText}
---
`;
            }

            if (patient.sessionNotes) { prompt += `\n**Genel Seans Notları:**\n${patient.sessionNotes}`; }
            if (latestAssessment.clinicianEvaluation) { prompt += `\n**Bu Oturuma Özel Klinisyen Değerlendirmesi:**\n${latestAssessment.clinicianEvaluation}`; }
            
             prompt += `\n### ANALİZ GÖREVİ:
Yukarıda verilen HASTA PROFİLİ, KLİNİSYEN NOTLARI ve her bir test için sağlanan özel "Testin Amacı" ve "Analiz Hedefleri" direktiflerini kullanarak, bütüncül bir klinik özet oluştur. Analizinde, her bir test için belirtilen "Analiz Hedefleri" bölümündeki talimatlara ÖNCELİK VER. Örneğin, soruları belirli gruplara ayırman veya bazılarını ters yorumlaman isteniyorsa, analizini bu yapıya göre şekillendir. Farklı test sonuçları arasındaki korelasyonları ve hasta profiliyle olan bağlantıları bu özel direktifler ışığında yorumla.`;


            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            const analysisText = response.text;

            const updatedAssessments = patient.assessments.map(asm =>
                asm.id === selectedAssessment.id ? { ...asm, aiAnalysis: analysisText } : asm
            );
            const updatedPatient = { ...patient, assessments: updatedAssessments };
            setPatients(prev => ({ ...prev, [patient.name]: updatedPatient }));
            setSelectedAssessment(prev => prev ? { ...prev, aiAnalysis: analysisText } : null);
            createAdminNotification(`${currentUser.username}, ${patient.name} için yapay zeka analizi oluşturdu.`);

        } catch (error) {
            console.error("AI analysis failed:", error);
            const errorText = "Analiz sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.";
            const updatedAssessments = patient.assessments.map(asm =>
                asm.id === selectedAssessment.id ? { ...asm, aiAnalysis: errorText } : asm
            );
            const updatedPatient = { ...patient, assessments: updatedAssessments };
            setPatients(prev => ({ ...prev, [patient.name]: updatedPatient }));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const TimelineChart = () => {
        if (!patient || patient.assessments.length < 1) return <p>Zaman çizelgesi grafiği için en az 1 değerlendirme gereklidir.</p>;
        
        const assessments = patient.assessments;
        const testIdsInHistory = Array.from(new Set(assessments.flatMap(a => a.results.map(r => r.testId))));
        const chartColors = ['var(--primary-color)', 'var(--warning-color)', 'var(--success-color)', 'var(--danger-color)'];

        const maxScore = 63; // Standard max for BDI/BAI, good enough for a generic visual scale
        const chartHeight = 220, barWidth = 20, barMargin = 35;
        const groupWidth = testIdsInHistory.length * barWidth;
        const chartWidth = assessments.length * (groupWidth + barMargin);

        return (
            <div className="timeline-chart-container">
                <h4>Değerlendirme Puanları Zaman Çizelgesi</h4>
                <div style={{ overflowX: 'auto', padding: '10px 0' }}>
                    <svg width={chartWidth} height={chartHeight + 40}>
                        <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="var(--border-color)" strokeWidth="2" />
                        {assessments.map((a, i) => {
                            const groupX = i * (groupWidth + barMargin) + barMargin / 2;
                            return (
                                <g key={a.id}>
                                    {testIdsInHistory.map((testId, testIndex) => {
                                        const result = a.results.find(r => r.testId === testId);
                                        if (!result) return null;

                                        const x = groupX + testIndex * barWidth;
                                        const barHeight = (result.score / maxScore) * chartHeight;
                                        return (
                                            <g key={testId}>
                                                <rect 
                                                    x={x} 
                                                    y={chartHeight - barHeight} 
                                                    width={barWidth - 2} 
                                                    height={barHeight} 
                                                    fill={chartColors[testIndex % chartColors.length]} 
                                                    rx="3" 
                                                />
                                                <text 
                                                    x={x + (barWidth - 2) / 2} 
                                                    y={chartHeight - barHeight - 5} 
                                                    textAnchor="middle" 
                                                    fontSize="12" 
                                                    fill="var(--text-color)" 
                                                    fontWeight="bold">
                                                    {result.score}
                                                </text>
                                            </g>
                                        );
                                    })}
                                     <text x={groupX + groupWidth/2} y={chartHeight + 20} textAnchor="middle" fontSize="12" fill="var(--muted-text-color)">{new Date(a.date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' })}</text>
                                </g>
                            )
                        })}
                    </svg>
                </div>
                <div className="chart-legend">
                   {testIdsInHistory.map((testId, index) => (
                        <div key={testId}>
                            <span className="legend-color" style={{ backgroundColor: chartColors[index % chartColors.length] }}></span> 
                            
                        </div>
                   ))}
                </div>
            </div>
        );
    };

    return (
        <div className="container">
            <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} patient={shareData?.patient ?? null} result={shareData?.result ?? null} />
            <div className="history-layout">
                <aside className="patient-list">
                    <h3>Hastalar</h3>
                    {Object.keys(patients).length > 0 ? Object.keys(patients).map(name => {
                        const p = patients[name];
                        const latestAssessment = p.assessments.length > 0 ? [...p.assessments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;

                        return (
                            <div key={name}>
                                <div className={`patient-list-item ${selectedPatient === name ? 'active' : ''}`} onClick={() => { setSelectedPatient(name); setActionPanelPatient(p => p === name ? null : name) }}>
                                    {name}
                                </div>
                                {actionPanelPatient === name && (
                                    <div className="action-panel">
                                        <button className="button button-secondary" onClick={() => handleSmartPrint('report')}>Raporu PDF İndir</button>
                                        <button className="button button-secondary" onClick={() => latestAssessment && openShareModal(latestAssessment, p)} disabled={!latestAssessment}>Paylaş</button>
                                    </div>
                                )}
                            </div>
                        )
                    }) : <p>Henüz hasta kaydı yok.</p>}
                </aside>
                <main className="patient-detail">
                    {patient ? (
                        <>
                            <h2>{patient.name} - Hasta Detayları</h2>

                             <div className="card patient-account-card">
                                <h3>Hasta Hesabı</h3>
                                {patientUser ? (
                                    <p>Bu hastanın bir hesabı var. Kullanıcı Adı: <strong>{patientUser.username}</strong></p>
                                ) : (
                                    <>
                                        <p>Bu hastanın uzaktan test doldurabilmesi için bir hesap oluşturun.</p>
                                        <button onClick={handleCreatePatientAccount} className="button button-secondary">Hasta Hesabı Oluştur</button>
                                    </>
                                )}
                            </div>


                            <div className="card patient-profile-card">
                                <h3>Hasta Profili</h3>
                                <div className="profile-grid">
                                    <label htmlFor="age">Yaş</label><input type="number" id="age" name="age" value={patient.age || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="phone">Telefon</label><input type="tel" id="phone" name="phone" value={patient.phone || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="email">E-posta</label><input type="email" id="email" name="email" value={patient.email || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="weight">Kilo (kg)</label><input type="number" id="weight" name="weight" value={patient.weight || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="height">Boy (cm)</label><input type="number" id="height" name="height" value={patient.height || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="sleepHours">Ort. Uyku (saat/gece)</label><input type="number" id="sleepHours" name="sleepHours" value={patient.sleepHours || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="workIntensity">Gündelik İş Yoğunluğu</label><select id="workIntensity" name="workIntensity" value={patient.workIntensity || ''} onChange={handleProfileChange} className="form-control"><option value="">Seçiniz...</option><option value="Düşük">Düşük</option><option value="Orta">Orta</option><option value="Yüksek">Yüksek</option><option value="Çok Yüksek">Çok Yüksek</option></select>
                                    <label htmlFor="caffeineConsumption">Kahve/Çay Tüketimi</label><select id="caffeineConsumption" name="caffeineConsumption" value={patient.caffeineConsumption || ''} onChange={handleProfileChange} className="form-control"><option value="">Seçiniz...</option><option value="Yok">Yok</option><option value="Düşük">Düşük (Günde 1-2)</option><option value="Orta">Orta (Günde 3-4)</option><option value="Yüksek">Yüksek (Günde 5+)</option></select>
                                    <label htmlFor="dietHabits">Beslenme Alışkanlıkları</label><input type="text" id="dietHabits" name="dietHabits" value={patient.dietHabits || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="addictions">Bağımlılıklar</label><input type="text" id="addictions" name="addictions" value={patient.addictions || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="medications">Sürekli Kullandığı İlaçlar</label><input type="text" id="medications" name="medications" value={patient.medications || ''} onChange={handleProfileChange} className="form-control" />
                                    <label htmlFor="chronicIllness">Kronik Rahatsızlıklar</label><input type="text" id="chronicIllness" name="chronicIllness" value={patient.chronicIllness || ''} onChange={handleProfileChange} className="form-control" />
                                </div>
                            </div>
                            <div className="card"><TimelineChart /></div>
                            <div className="card">
                                <h3>Değerlendirme Geçmişi</h3>
                                {patient.assessments.length > 0 ? [...patient.assessments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(ass => (
                                    <button key={ass.id} onClick={() => setSelectedAssessment(ass)} className={`button button-secondary ${selectedAssessment?.id === ass.id ? 'active' : ''}`} style={{ marginRight: '10px', marginBottom: '10px' }}>
                                        {new Date(ass.date).toLocaleDateString('tr-TR')}
                                    </button>
                                )) : <p>Bu hasta için kayıtlı değerlendirme bulunmuyor.</p>}
                                {selectedAssessment && (
                                    <>
                                        <ResultsReport result={selectedAssessment} />
                                        <div className="button-group" style={{ justifyContent: 'flex-start', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                                            {!selectedAssessment.isReleasedToPatient ? (
                                                <button className="button" onClick={() => handleReleaseResults(selectedAssessment)}>Sonuçları Hastaya Göster</button>
                                            ) : (
                                                <p className="results-shared-info">Bu sonuçlar hastayla paylaşıldı.</p>
                                            )}
                                            <button className="button button-secondary" onClick={() => handleSmartPrint('report')}>Raporu PDF Olarak İndir</button>
                                            <button className="button button-secondary" onClick={() => openShareModal(selectedAssessment, patient)}>Raporu Paylaş</button>
                                        </div>
                                        <div className="card session-notes" style={{ marginTop: '2rem' }}>
                                            <h3>Klinisyen Değerlendirmesi (Bu Oturuma Özel)</h3>
                                            <div className="form-group"><textarea className="form-control" value={selectedAssessment.clinicianEvaluation || ''} onChange={handleEvaluationChange} placeholder="Bu değerlendirme için özel notlarınız..." rows={5} /></div>
                                        </div>
                                        <div className="card ai-analysis-card">
                                            <div>
                                                <button className="button" onClick={handleAiAnalysis} disabled={isAnalyzing}>{isAnalyzing ? "Analiz Ediliyor..." : "Yapay Zeka Analizi Al/Yenile"}</button>
                                                <h3 style={{ display: 'inline-block', marginLeft: '1rem' }}>Yapay Zeka Destekli Analiz</h3>
                                            </div>
                                            {isAnalyzing && <div className="loader"></div>}
                                            {selectedAssessment.aiAnalysis && (
                                                <>
                                                    <AiAnalysisDisplay analysisText={selectedAssessment.aiAnalysis} />
                                                    <div className="button-group" style={{ justifyContent: 'flex-start', marginTop: '1.5rem' }}>
                                                        <button className="button button-secondary" onClick={() => handleSmartPrint('analysis')}>Analizi PDF Olarak İndir</button>
                                                        <button className="button button-secondary" onClick={() => openShareModal(selectedAssessment, patient)}>Analizi Paylaş</button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="card session-notes">
                                <h3>Genel Seans Notları (Hasta Geneli)</h3>
                                <div className="form-group"><textarea className="form-control" value={patient.sessionNotes} onChange={handleNotesChange} placeholder="Klinisyen için genel seans notları..." /></div>
                            </div>
                        </>
                    ) : <div className="card"><h2>Hasta Geçmişi</h2><p>Görüntülemek için lütfen bir hasta seçin veya yeni bir değerlendirme başlatın.</p></div>}
                </main>
            </div>
        </div>
    );
};

const AdminDashboard = ({ currentUser, onLogout, users, setUsers, patients, tests, setTests, notifications, setNotifications }: { currentUser: User, onLogout: () => void, users: UsersData, setUsers: Dispatch<SetStateAction<UsersData>>, patients: PatientsData, tests: TestsData, setTests: Dispatch<SetStateAction<TestsData>>, notifications: Notification[], setNotifications: Dispatch<SetStateAction<Notification[]>> }) => {
    const [adminView, setAdminView] = useState('overview');

    const AdminOverview = () => {
        const clinicianCount = Object.values(users).filter(u => u.profile.role === 'clinician').length;
        const patientCount = Object.keys(patients).length;
        const patientsPerClinician = clinicianCount > 0 ? (patientCount / clinicianCount).toFixed(1) : 0;

        return (
            <div className="card">
                <h2>Genel Bakış</h2>
                <div className="admin-stats-grid">
                    <div className="stat-card"><h3>Toplam Klinisyen</h3><p className="stat-value">{clinicianCount}</p></div>
                    <div className="stat-card"><h3>Toplam Hasta</h3><p className="stat-value">{patientCount}</p></div>
                    <div className="stat-card"><h3>Klinisyen Başına Hasta</h3><p className="stat-value">{patientsPerClinician}</p></div>
                    <div className="stat-card"><h3>Tanımlı Test Sayısı</h3><p className="stat-value">{Object.keys(tests).length}</p></div>
                </div>
            </div>
        );
    };

    const UserManagement = () => {
        const [newUsername, setNewUsername] = useState('');
        const [newPassword, setNewPassword] = useState('');
        const [newRole, setNewRole] = useState<UserRole>('clinician');

        const handleAddUser = (e: FormEvent) => {
            e.preventDefault();
            if(!newUsername || !newPassword) { alert("Kullanıcı adı ve şifre boş bırakılamaz."); return; }
            if(users[newUsername]) { alert("Bu kullanıcı adı zaten mevcut."); return; }
            setUsers(prev => ({ ...prev, [newUsername]: { password: newPassword, profile: { role: newRole } } }));
            setNewUsername(''); setNewPassword('');
            alert(`${newUsername} kullanıcısı başarıyla eklendi.`);
        };
        
        const handleDeleteUser = (username: string) => {
            if(username === currentUser.username) { alert("Kendi hesabınızı silemezsiniz."); return; }
            if(confirm(`'${username}' kullanıcısını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
                setUsers(prev => { const newUsers = { ...prev }; delete newUsers[username]; return newUsers; });
            }
        };

        const handlePasswordChange = (username: string) => {
            const newPassword = prompt(`'${username}' için yeni şifreyi girin:`);
            if (newPassword && newPassword.trim() !== '') {
                setUsers(prev => ({
                    ...prev,
                    [username]: { ...prev[username], password: newPassword }
                }));
                alert(`'${username}' kullanıcısının şifresi başarıyla güncellendi.`);
            } else if (newPassword !== null) { // User clicked OK but input was empty
                alert("Şifre boş bırakılamaz.");
            }
        };

        const handleRoleChange = (username: string, newRole: UserRole) => {
             if(username === currentUser.username && newRole !== 'admin') { alert("Kendi rolünüzü admin'den düşüremezsiniz."); return; }
            setUsers(prev => ({ ...prev, [username]: { ...prev[username], profile: { ...prev[username].profile, role: newRole } } }));
        };

        return (
            <div className="card">
                <h2>Kullanıcı Yönetimi</h2>
                <form onSubmit={handleAddUser} className="add-user-form card">
                    <h3>Yeni Kullanıcı Ekle</h3>
                    <input type="text" placeholder="Kullanıcı Adı" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="form-control"/>
                    <input type="password" placeholder="Şifre" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="form-control"/>
                     <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="form-control">
                        <option value="clinician">Klinisyen</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" className="button">Kullanıcı Ekle</button>
                </form>
                <table className="user-management-table">
                    <thead><tr><th>Kullanıcı Adı</th><th>Rol</th><th>Eylemler</th></tr></thead>
                    <tbody>
                        {Object.entries(users).map(([username, userAccount]) => (
                            <tr key={username}>
                                <td>{username}{userAccount.profile.role === 'patient' && ` (${userAccount.profile.patientName})`}</td>
                                <td>
                                    <select value={userAccount.profile.role} onChange={(e) => handleRoleChange(username, e.target.value as UserRole)} className="form-control" style={{width: 'auto'}} disabled={userAccount.profile.role === 'patient'}>
                                        <option value="clinician">Klinisyen</option>
                                        <option value="admin">Admin</option>
                                        <option value="patient" disabled>Hasta</option>
                                    </select>
                                </td>
                                <td>
                                    <div className="button-group table-actions">
                                        <button onClick={() => handlePasswordChange(username)} className="button button-secondary">Şifre Değiştir</button>
                                        <button onClick={() => handleDeleteUser(username)} className="button button-danger" disabled={username === currentUser.username}>Sil</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const TestEditor = ({ test, onSave, onCancel }: { test: TestDefinition, onSave: (t: TestDefinition) => void, onCancel: () => void }) => {
        const [editedTest, setEditedTest] = useState(test);
        const isNew = test.id === '';

        const handleTestChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setEditedTest(prev => ({ ...prev, [e.target.name]: e.target.value }));
        };

        const handleQuestionChange = (qIndex: number, text: string) => {
            const newQuestions = [...editedTest.questions];
            newQuestions[qIndex].text = text;
            setEditedTest(prev => ({ ...prev, questions: newQuestions }));
        };

        const handleOptionChange = (qIndex: number, oIndex: number, field: 'text' | 'score', value: string) => {
            const newQuestions = [...editedTest.questions];
            const newOptions = [...newQuestions[qIndex].options];
            const val = field === 'score' ? parseInt(value) || 0 : value;
            (newOptions[oIndex] as any)[field] = val;
            newQuestions[qIndex].options = newOptions;
            setEditedTest(prev => ({ ...prev, questions: newQuestions }));
        };
        
        const handleScoringLevelChange = (levelIndex: number, field: 'level' | 'minScore' | 'maxScore', value: string) => {
            const newLevels = [...editedTest.scoringLevels];
            const val = (field === 'minScore' || field === 'maxScore') ? parseInt(value) || 0 : value;
            (newLevels[levelIndex] as any)[field] = val;
            setEditedTest(prev => ({ ...prev, scoringLevels: newLevels }));
        };

        const addScoringLevel = () => {
            setEditedTest(p => ({ ...p, scoringLevels: [...p.scoringLevels, { level: '', minScore: 0, maxScore: 0 }] }));
        };

        const removeScoringLevel = (levelIndex: number) => {
            setEditedTest(p => ({ ...p, scoringLevels: p.scoringLevels.filter((_, i) => i !== levelIndex) }));
        };

        const generateUniqueId = (prefix: 'q' | 'o') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const addQuestion = () => setEditedTest(p => ({ ...p, questions: [...p.questions, { id: generateUniqueId('q'), text: '', options: [{ id: generateUniqueId('o'), text: '', score: 0 }] }] }));
        const removeQuestion = (qIndex: number) => setEditedTest(p => ({ ...p, questions: p.questions.filter((_, i) => i !== qIndex) }));
        const addOption = (qIndex: number) => {
            const newQuestions = [...editedTest.questions];
            newQuestions[qIndex].options.push({ id: generateUniqueId('o'), text: '', score: 0 });
            setEditedTest(p => ({ ...p, questions: newQuestions }));
        };
        const removeOption = (qIndex: number, oIndex: number) => {
            const newQuestions = [...editedTest.questions];
            newQuestions[qIndex].options = newQuestions[qIndex].options.filter((_, i) => i !== oIndex);
            setEditedTest(p => ({ ...p, questions: newQuestions }));
        };

        return (
            <div className="card">
                <h3>{isNew ? 'Yeni Test Oluştur' : 'Testi Düzenle'}</h3>
                <div className="form-group">
                    <label>Test ID</label>
                    <input type="text" name="id" value={editedTest.id} onChange={handleTestChange} className="form-control" disabled={!isNew} placeholder="Boşluksuz, benzersiz bir kimlik girin (örn: YASAM_DOYUMU)"/>
                </div>
                <div className="form-group"><label>Test Adı</label><input type="text" name="name" value={editedTest.name} onChange={handleTestChange} className="form-control" /></div>
                <div className="form-group"><label>Testin Amacı ve Yorumlama Notları</label><textarea name="purposeAndInterpretationNotes" value={editedTest.purposeAndInterpretationNotes || ''} onChange={handleTestChange} className="form-control" rows={4} /></div>
                <div className="form-group"><label>Analiz & Hesaplama Hedefleri (AI için)</label><textarea name="analysisTargetsAI" value={editedTest.analysisTargetsAI || ''} onChange={handleTestChange} className="form-control" rows={4} placeholder="örn: 1,5,9 soruları bilişsel belirti grubudur..." /></div>
                <hr/>
                <h4>Puanlama & Yorumlama Seviyeleri</h4>
                {editedTest.scoringLevels.map((level, levelIndex) => (
                    <div key={levelIndex} className="scoring-level-editor">
                        <input type="text" placeholder="Seviye Adı (örn: Hafif Anksiyete)" value={level.level} onChange={e => handleScoringLevelChange(levelIndex, 'level', e.target.value)} className="form-control"/>
                        <input type="number" placeholder="Min Puan" value={level.minScore} onChange={e => handleScoringLevelChange(levelIndex, 'minScore', e.target.value)} className="form-control" />
                        <input type="number" placeholder="Max Puan" value={level.maxScore} onChange={e => handleScoringLevelChange(levelIndex, 'maxScore', e.target.value)} className="form-control" />
                        <button onClick={() => removeScoringLevel(levelIndex)} className="button-danger" style={{padding: '5px 10px', border: 'none', borderRadius: '4px'}}>X</button>
                    </div>
                ))}
                <button onClick={addScoringLevel} className="button button-secondary">Seviye Ekle</button>
                <hr/>
                <h4>Sorular</h4>
                {editedTest.questions.map((q, qIndex) => (
                    <div key={q.id} className="card question-editor-card">
                        <div className="form-group">
                            <label>Soru Metni #{qIndex + 1}</label>
                            <div style={{display: 'flex', gap: '10px'}}><input type="text" value={q.text} onChange={e => handleQuestionChange(qIndex, e.target.value)} className="form-control" /><button onClick={() => removeQuestion(qIndex)} className="button button-danger">Sil</button></div>
                        </div>
                        {q.options.map((o, oIndex) => (
                            <div key={o.id} style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px'}}>
                                <input type="text" placeholder="Seçenek metni" value={o.text} onChange={e => handleOptionChange(qIndex, oIndex, 'text', e.target.value)} className="form-control" />
                                <input type="number" placeholder="Puan" value={o.score} onChange={e => handleOptionChange(qIndex, oIndex, 'score', e.target.value)} className="form-control" style={{ flex: '0 0 80px' }} />
                                <button onClick={() => removeOption(qIndex, oIndex)} className="button-danger" style={{padding: '5px 10px', border: 'none', borderRadius: '4px'}}>X</button>
                            </div>
                        ))}
                        <button onClick={() => addOption(qIndex)} className="button button-secondary">Seçenek Ekle</button>
                    </div>
                ))}
                <div className="button-group">
                    <button onClick={addQuestion} className="button">Soru Ekle</button>
                    <button onClick={() => onSave(editedTest)} className="button">Testi Kaydet</button>
                    <button onClick={onCancel} className="button button-secondary">İptal</button>
                </div>
            </div>
        );
    };

    const TestManagement = () => {
        const [editingTest, setEditingTest] = useState<TestDefinition | null>(null);

        const handleSaveTest = (testToSave: TestDefinition) => {
            const trimmedId = testToSave.id.trim();
            if (!testToSave.name.trim() || !trimmedId) {
                alert("Test adı ve ID'si boş bırakılamaz.");
                return;
            }

            const isCreatingNew = editingTest?.id === '';
            if (isCreatingNew && tests[trimmedId]) {
                 alert("Bu ID zaten kullanılıyor. Lütfen farklı bir ID girin.");
                return;
            }

            setTests(prev => ({ ...prev, [trimmedId]: { ...testToSave, id: trimmedId } }));
            setEditingTest(null);
        };

        const handleNewTest = () => {
            setEditingTest({
                id: '',
                name: '',
                questions: [],
                scoringLevels: [],
                purposeAndInterpretationNotes: '',
                analysisTargetsAI: '',
            });
        };
        
        const handleDeleteTest = (testId: string) => {
            if (testId === 'BDI' || testId === 'BAI') {
                alert("Varsayılan testler silinemez.");
                return;
            }
            if (confirm(`'${tests[testId].name}' testini silmek istediğinizden emin misiniz?`)) {
                setTests(prev => {
                    const newTests = { ...prev };
                    delete newTests[testId];
                    return newTests;
                });
            }
        };

        if (editingTest) {
            return <TestEditor test={editingTest} onSave={handleSaveTest} onCancel={() => setEditingTest(null)} />;
        }

        return (
            <div className="card">
                <h2>Test Yönetimi</h2>
                <button onClick={handleNewTest} className="button">Yeni Test Oluştur</button>
                <table className="user-management-table" style={{marginTop: '1.5rem'}}>
                    <thead><tr><th>Test Adı</th><th>Soru Sayısı</th><th>Eylemler</th></tr></thead>
                    <tbody>
                        {Object.values(tests).map(test => (
                            <tr key={test.id}>
                                <td>{test.name}</td>
                                <td>{test.questions.length}</td>
                                <td>
                                    <div className="button-group" style={{marginTop: 0}}>
                                        <button onClick={() => setEditingTest(test)} className="button">Düzenle</button>
                                        <button onClick={() => handleDeleteTest(test.id)} className="button button-danger" disabled={test.id === 'BDI' || test.id === 'BAI'}>Sil</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const AdminReports = () => {
        const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
        const [assessmentToPrint, setAssessmentToPrint] = useState<AssessmentResult | null>(null);

        const allAssessments = useMemo(() => {
            return Object.values(patients)
                .flatMap(p => p.assessments)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }, [patients]);
        
        useEffect(() => {
            if(assessmentToPrint) {
                handleSmartPrint('admin-report');
                setAssessmentToPrint(null);
            }
        }, [assessmentToPrint]);


        return (
            <div className="card">
                <h2>Klinik Raporlar</h2>
                <p>Sistemde gerçekleştirilen tüm değerlendirmelerin kaydı. Detayları görmek için bir satıra tıklayın.</p>
                <table className="user-management-table">
                    <thead><tr><th>Tarih</th><th>Hasta</th><th>Klinisyen</th></tr></thead>
                    <tbody>
                        {allAssessments.map(ass => (
                            <React.Fragment key={ass.id}>
                                <tr className="expandable-row" onClick={() => setExpandedRowId(expandedRowId === ass.id ? null : ass.id)}>
                                    <td>{new Date(ass.date).toLocaleString('tr-TR')}</td>
                                    <td>{ass.patientName}</td>
                                    <td>{ass.clinicianUsername}</td>
                                </tr>
                                {expandedRowId === ass.id && (
                                    <tr className="details-row">
                                        <td colSpan={3}>
                                            <div className="details-content">
                                                <h4>Test Sonuçları</h4>
                                                <ul>
                                                    {ass.results.map(r => (
                                                        <li key={r.testId}>
                                                            <strong>{r.testName}:</strong> {r.score} Puan ({r.level})
                                                        </li>
                                                    ))}
                                                </ul>
                                                {ass.clinicianEvaluation && (
                                                    <>
                                                        <h4 style={{marginTop: '1rem'}}>Klinisyen Değerlendirmesi</h4>
                                                        <p>{ass.clinicianEvaluation}</p>
                                                    </>
                                                )}
                                                {ass.aiAnalysis && (
                                                    <>
                                                        <h4 style={{marginTop: '1rem'}}>Yapay Zeka Analizi</h4>
                                                         <AiAnalysisDisplay analysisText={ass.aiAnalysis} />
                                                    </>
                                                )}
                                                <div className="button-group" style={{marginTop: '1rem'}}>
                                                    <button className="button button-secondary" onClick={() => setAssessmentToPrint(ass)}>Tüm Raporu İndir</button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                {assessmentToPrint && (
                    <div className="printable-report">
                        <ResultsReport result={assessmentToPrint} />
                        {assessmentToPrint.clinicianEvaluation && (
                            <div className="card session-notes" style={{marginTop: '2rem'}}>
                                <h3>Klinisyen Değerlendirmesi</h3>
                                <p>{assessmentToPrint.clinicianEvaluation}</p>
                            </div>
                        )}
                        {assessmentToPrint.aiAnalysis && (
                            <div className="card ai-analysis-card" style={{marginTop: '2rem'}}>
                                <h3>Yapay Zeka Destekli Analiz</h3>
                                <AiAnalysisDisplay analysisText={assessmentToPrint.aiAnalysis} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderAdminView = () => {
        switch (adminView) {
            case 'userManagement': return <UserManagement />;
            case 'reports': return <AdminReports />;
            case 'testManagement': return <TestManagement />;
            case 'overview': default: return <AdminOverview />;
        }
    };

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <div className="brand-logo">Admin Paneli</div>
                <nav>
                    <button onClick={() => setAdminView('overview')} className={adminView === 'overview' ? 'active' : ''}>Genel Bakış</button>
                    <button onClick={() => setAdminView('userManagement')} className={adminView === 'userManagement' ? 'active' : ''}>Kullanıcı Yönetimi</button>
                    <button onClick={() => setAdminView('testManagement')} className={adminView === 'testManagement' ? 'active' : ''}>Test Yönetimi</button>
                    <button onClick={() => setAdminView('reports')} className={adminView === 'reports' ? 'active' : ''}>Klinik Raporlar</button>
                </nav>
            </aside>
            <main className="admin-main">
                <header className="admin-header">
                    <h2>{
                        adminView === 'overview' ? 'Genel Bakış' :
                        adminView === 'userManagement' ? 'Kullanıcı Yönetimi' :
                        adminView === 'testManagement' ? 'Test Yönetimi' : 'Klinik Raporlar'
                    }</h2>
                     <div className="header-right">
                        <NotificationsPanel currentUser={currentUser} notifications={notifications} setNotifications={setNotifications} />
                        <div className="user-info"><span>Hoş geldiniz, <strong>{currentUser.username}</strong> ({currentUser.role})</span></div>
                        <button className="button button-logout" onClick={onLogout}>Çıkış Yap</button>
                    </div>
                </header>
                {renderAdminView()}
            </main>
        </div>
    );
};

type PatientDashboardProps = {
    user: User;
    patients: PatientsData;
    tests: TestsData;
    setView: (v: string) => void;
    setPatientName: (n: string) => void;
    setTestQueue: (q: string[]) => void;
    setCurrentAssignmentId: (id: string) => void;
};
const PatientDashboard = ({ user, patients, tests, setView, setPatientName, setTestQueue, setCurrentAssignmentId }: PatientDashboardProps) => {
    if (!user.patientName || !patients[user.patientName]) {
        return <div className="container card"><h1>Hata</h1><p>Hasta profiliniz bulunamadı. Lütfen klinisyeninizle iletişime geçin.</p></div>;
    }

    const patient = patients[user.patientName];
    const pendingAssignments = patient.assignedTests?.filter(a => !a.isCompleted).sort((a,b) => new Date(b.assignedDate).getTime() - new Date(a.assignedDate).getTime()) || [];
    const completedAssessments = patient.assessments.filter(a => a.isReleasedToPatient).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleStartTest = (assignment: AssignedTest) => {
        setPatientName(patient.name);
        setTestQueue(assignment.testIds);
        setCurrentAssignmentId(assignment.id);
        setView('assessment');
    };

    return (
        <div className="container patient-dashboard">
            <h1>Test Panelim</h1>
            <p>Klinisyeniniz tarafından size atanan testleri burada bulabilirsiniz.</p>

            <div className="card">
                <h2>Bekleyen Testler</h2>
                {pendingAssignments.length > 0 ? (
                    <ul className="assignment-list">
                        {pendingAssignments.map(ass => (
                            <li key={ass.id} className="assignment-item">
                                <div>
                                    <span className="assignment-date">Atanma Tarihi: {new Date(ass.assignedDate).toLocaleDateString('tr-TR')}</span>
                                    <span className="assignment-tests">İçerdiği Testler: {ass.testIds.map(id => tests[id]?.name || id).join(', ')}</span>
                                </div>
                                <button className="button" onClick={() => handleStartTest(ass)}>Teste Başla</button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>Şu anda tamamlamanız gereken bir test bulunmuyor.</p>
                )}
            </div>
             <div className="card">
                <h2>Tamamlanmış ve Paylaşılmış Testler</h2>
                 {completedAssessments.length > 0 ? (
                    <ul className="completed-list">
                         {completedAssessments.map(ass => (
                             <li key={ass.id} className="completed-assessment-item">
                                 <div className="completed-assessment-header">
                                    <span><strong>Tarih:</strong> {new Date(ass.date).toLocaleDateString('tr-TR')}</span>
                                    <span><strong>Sonuçlar:</strong> {ass.results.map(r => `${r.testName}: ${r.level}`).join(' | ')}</span>
                                 </div>
                                 {ass.clinicianEvaluation && (
                                     <div className="clinician-note-display">
                                        <h4>Klinisyen Değerlendirmesi</h4>
                                        <p>{ass.clinicianEvaluation}</p>
                                     </div>
                                 )}
                             </li>
                         ))}
                    </ul>
                 ) : (
                    <p>Klinisyeniniz henüz sizinle bir test sonucu paylaşmadı.</p>
                 )}
            </div>
        </div>
    );
};


const App = () => {
    const [view, setView] = useState('landing');
    const [patientName, setPatientName] = useState('');
    const [testQueue, setTestQueue] = useState<string[]>([]);
    const [currentResult, setCurrentResult] = useState<AssessmentResult | null>(null);
    const [patients, setPatients] = useState<PatientsData>({});
    const [users, setUsers] = useState<UsersData>({
        admin: { password: 'admin', profile: { role: 'admin' } },
        klinisyen1: { password: '123', profile: { role: 'clinician' } }
    });
    const [tests, setTests] = useState<TestsData>(initialTestsData);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentAssignmentId, setCurrentAssignmentId] = useState<string | null>(null);
    const [notifications, setNotifications] = useState<Notification[]>([]);


    // --- SERVER API HELPERS (MERN backend) ---
    const api = {
        async getPatients() {
            try {
                const res = await fetch('/api/patients');
                if (!res.ok) throw new Error('no patients');
                return await res.json();
            } catch (e) {
                console.warn('getPatients failed', e);
                return null;
            }
        },
        async getUsers() {
            try {
                const res = await fetch('/api/users');
                if (!res.ok) throw new Error('no users');
                return await res.json();
            } catch (e) {
                console.warn('getUsers failed', e);
                return null;
            }
        },
        async getTests() {
            try {
                const res = await fetch('/api/tests');
                if (!res.ok) throw new Error('no tests');
                return await res.json();
            } catch (e) {
                console.warn('getTests failed', e);
                return null;
            }
        },
        async upsertPatient(patient) {
            try {
                const res = await fetch('/api/patients/' + encodeURIComponent(patient.name), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patient)
                });
                return await res.json();
            } catch (e) {
                console.warn('upsertPatient failed', e);
                return null;
            }
        },
        async createAssessment(assessment) {
            try {
                const res = await fetch('/api/assessments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(assessment)
                });
                return await res.json();
            } catch (e) {
                console.warn('createAssessment failed', e);
                return null;
            }
        },
        async createNotification(notification) {
            try {
                const res = await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(notification)
                });
                return await res.json();
            } catch (e) {
                console.warn('createNotification failed', e);
                return null;
            }
        }
    };

    // Load initial data from the server (if available), otherwise fall back to local state
    useEffect(() => {
        (async () => {
            try {
                const [p, u, t] = await Promise.all([api.getPatients(), api.getUsers(), api.getTests()]);
                if (p) setPatients(p);
                if (u) setUsers(u);
                if (t) setTests(t);
                // try to get current user from session
                try {
                    const me = await fetch('/api/auth/me');
                    if (me.ok) setCurrentUser(await me.json());
                } catch(e) { /* ignore */ }
            } catch(e) {
                console.warn('Initial API load failed, using local data');
            }
        })();
    }, []);


    const activePatient = useMemo(() => patients[patientName], [patients, patientName]);

    useEffect(() => {
        document.body.classList.toggle('auth-active', view === 'login' || !currentUser);
        document.body.classList.toggle('admin-active', currentUser?.role === 'admin');
    }, [view, currentUser]);

    const handlePatientCreate = (patient: Patient) => {
        setPatients(prev => ({ ...prev, [patient.name]: patient }));
        // try to persist to server
        (async () => { await api.upsertPatient(patient); })();
        setPatientName(patient.name);
        setView('testSelection');
    };

    const handlePatientUpdate = (patient: Patient) => {
        setPatients(prev => ({ ...prev, [patient.name]: patient }));
        (async () => { await api.upsertPatient(patient); })();
        setView('testSelection');
    };

    // 1️⃣ Eğer finalResult'u component state olarak kullanıyorsan:
const [finalResult, setFinalResult] = useState<string | null>(null);

// 2️⃣ Fonksiyon güncellemesi
const handleAssessmentFlowConfirm = (
    selectedTests: string[],
    mode: 'start' | 'assign',
    finalResultParam?: string // opsiyonel parametre
) => {
    if (!currentUser || currentUser.role !== 'clinician') return;

    if (mode === 'start') {
        setTestQueue(selectedTests);
        setView('assessment');
    } else { // assign
        const patient = patients[patientName];
        if (!patient) return;

        const newAssignment: AssignedTest = {
            id: `assign_${Date.now()}`,
            assignedDate: new Date().toISOString(),
            testIds: selectedTests,
            isCompleted: false,
            clinicianUsername: currentUser.username,
        };

        const updatedPatient = {
            ...patient,
            assignedTests: [...(patient.assignedTests || []), newAssignment]
        };

        setPatients(prev => ({ ...prev, [patientName]: updatedPatient }));

        // ✅ finalResult ya state'den ya da parametre ile al
        const assessmentResult = finalResultParam ?? finalResult;
        if (!assessmentResult) {
            alert("Değerlendirme sonucu boş, işlem iptal edildi.");
            return;
        }

        (async () => {
            await api.createAssessment(assessmentResult);
            await api.upsertPatient(updatedPatient);
        })();

        alert("Testler hastaya başarıyla atandı.");
        setView('history');
    }
};

    
    const saveCompletedResult = (result: AssessmentResult, assignmentId: string | null) => {
        const name = result.patientName;
        const finalResult = { ...result, isReleasedToPatient: false };

        setPatients(prev => {
            const patient = prev[name];
            const newAssessments = [...patient.assessments, finalResult].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            let updatedPatient = { ...patient, assessments: newAssessments };

            if (assignmentId && currentUser?.role === 'patient') {
                const assignment = patient.assignedTests?.find(a => a.id === assignmentId);
                 if (assignment) {
                    const notificationMessage = `${patient.name} adlı hasta, atanan testi tamamladı.`;
                    const newNotification: Notification = {
                        id: `notif_${Date.now()}`,
                        recipientUsername: assignment.clinicianUsername,
                        message: notificationMessage,
                        isRead: false,
                        date: new Date().toISOString(),
                    };
                    setNotifications(prevNotifs => [...prevNotifs, newNotification]);
                    (async () => { await api.createNotification(newNotification); })();
                }
                
                const updatedAssignments = patient.assignedTests?.map(a =>
                    a.id === assignmentId ? { ...a, isCompleted: true, assessmentId: result.id } : a
                ) || [];
                updatedPatient = { ...updatedPatient, assignedTests: updatedAssignments };
            }
            return { ...prev, [name]: updatedPatient };
        });
        if(assignmentId) setCurrentAssignmentId(null);
    };

    const handleAssessmentComplete = (result: AssessmentResult) => {
        if (currentUser?.role === 'patient') {
            saveCompletedResult(result, currentAssignmentId);
            alert("Testiniz başarıyla tamamlandı ve klinisyeninize iletildi.");
            setView('main'); // This will redirect to patient dashboard
        } else {
            setCurrentResult(result);
            setView('results');
        }
    };
    
    // This function is now only for clinicians after viewing the report.
    const saveResultForClinician = () => {
        if (!currentResult) return;
        saveCompletedResult(currentResult, null);
    };


    const handleLogout = () => {
        setCurrentUser(null);
        setView('landing');
    };

    if (!currentUser) {
        switch (view) {
            case 'login': return <AuthPage users={users} setCurrentUser={setCurrentUser} setView={setView} />;
            default: return <LandingPage setView={setView} />;
        }
    }

    if (currentUser.role === 'admin') {
        return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} users={users} setUsers={setUsers} patients={patients} tests={tests} setTests={setTests} notifications={notifications} setNotifications={setNotifications} />;
    }
    
    if (currentUser.role === 'patient') {
         const renderPatientView = () => {
            switch (view) {
                case 'assessment': return <AssessmentForm patientName={currentUser.patientName!} testQueue={testQueue} tests={tests} currentUser={currentUser} onComplete={handleAssessmentComplete} />;
                default: return <PatientDashboard user={currentUser} patients={patients} tests={tests} setView={setView} setPatientName={setPatientName} setTestQueue={setTestQueue} setCurrentAssignmentId={setCurrentAssignmentId} />;
            }
         }
         return (
            <>
                <PatientHeader currentUser={currentUser} onLogout={handleLogout} notifications={notifications} setNotifications={setNotifications} />
                <main className="main-content">{renderPatientView()}</main>
            </>
        );
    }


    // Clinician View
    const renderClinicianView = () => {
        switch (view) {
            case 'newAssessment': return <NewAssessmentPage patients={patients} setView={setView} setPatientName={setPatientName} />;
            case 'createPatient': return <CreatePatientPage onPatientCreate={handlePatientCreate} existingNames={Object.keys(patients)} />;
            case 'updatePatientProfile': return activePatient && <UpdatePatientProfilePage patient={activePatient} onUpdate={handlePatientUpdate} />;
            case 'testSelection': return <TestSelectionPage patientName={patientName} onConfirm={handleAssessmentFlowConfirm} tests={tests} />;
            case 'assessment': return <AssessmentForm patientName={patientName} testQueue={testQueue} tests={tests} currentUser={currentUser} onComplete={handleAssessmentComplete} />;
            case 'results': return currentResult && <ResultsPage result={currentResult} setView={setView} saveResult={saveResultForClinician} />;
            case 'history': return <PatientHistory patients={patients} setPatients={setPatients} users={users} setUsers={setUsers} tests={tests} currentUser={currentUser} setNotifications={setNotifications} />;
            case 'profile': return <ProfilePage user={currentUser} users={users} setUsers={setUsers} setCurrentUser={setCurrentUser} />;
            default: return <MainDashboard setView={setView} patientCount={Object.keys(patients).length} />;
        }
    };

    return (
        <>
            <AppHeader setView={setView} currentUser={currentUser} onLogout={handleLogout} notifications={notifications} setNotifications={setNotifications} />
            <main className="main-content">
                {renderClinicianView()}
            </main>
        </>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);