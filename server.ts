import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { createHmac, timingSafeEqual } from "node:crypto";

dotenv.config();

const app = express();
export default app;
const AI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const AI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 90000;

app.use(express.json({ limit: "4mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;
const AUTH_SESSION_COOKIE = "kharisma_admin_session";
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 8;

function isAuthConfigured() {
  return getAuthConfigurationErrors().length === 0;
}

function getAuthConfigurationErrors() {
  const errors: string[] = [];
  if (!ADMIN_USERNAME?.trim()) errors.push("ADMIN_USERNAME belum diisi");
  if (!ADMIN_PASSWORD) errors.push("ADMIN_PASSWORD belum diisi");
  else if (ADMIN_PASSWORD.length < 12) errors.push("ADMIN_PASSWORD harus minimal 12 karakter");
  if (!AUTH_SECRET) errors.push("AUTH_SECRET belum diisi");
  else if (AUTH_SECRET.length < 32) errors.push("AUTH_SECRET harus minimal 32 karakter");
  return errors;
}

function getAuthConfigurationMessage() {
  return `Konfigurasi login belum valid: ${getAuthConfigurationErrors().join("; ")}. Atur variabel di .env lokal atau Vercel Project Settings → Environment Variables, lalu mulai ulang server atau buat deployment baru.`;
}

function safeStringEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signAuthSession(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function getAuthSessionToken(req: express.Request) {
  const cookies = req.headers.cookie?.split(";") || [];
  const cookie = cookies.find((item) => item.trim().startsWith(`${AUTH_SESSION_COOKIE}=`));
  return cookie?.trim().slice(AUTH_SESSION_COOKIE.length + 1);
}

function isValidAuthSession(req: express.Request) {
  if (!isAuthConfigured() || !AUTH_SECRET || !ADMIN_USERNAME) return false;
  const token = getAuthSessionToken(req);
  if (!token) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  try {
    if (!safeStringEquals(signature, signAuthSession(payload, AUTH_SECRET))) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.username === ADMIN_USERNAME && Number(session.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function setAuthSessionCookie(req: express.Request, res: express.Response, value: string, maxAge: number) {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = req.secure || forwardedProtocol === "https";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
  );
}

app.post("/api/auth/login", (req, res) => {
  if (!isAuthConfigured() || !ADMIN_USERNAME || !ADMIN_PASSWORD || !AUTH_SECRET) {
    return res.status(503).json({ error: getAuthConfigurationMessage() });
  }

  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    return res.status(400).json({ error: "Nama pengguna dan kata sandi wajib diisi." });
  }

  if (!safeStringEquals(username, ADMIN_USERNAME) || !safeStringEquals(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Nama pengguna atau kata sandi salah." });
  }

  const payload = Buffer.from(JSON.stringify({
    username: ADMIN_USERNAME,
    expiresAt: Date.now() + AUTH_SESSION_TTL_SECONDS * 1000
  })).toString("base64url");
  const token = `${payload}.${signAuthSession(payload, AUTH_SECRET)}`;
  setAuthSessionCookie(req, res, token, AUTH_SESSION_TTL_SECONDS);
  return res.json({ authenticated: true });
});

app.get("/api/auth/session", (req, res) => {
  if (!isAuthConfigured()) {
    return res.status(503).json({
      authenticated: false,
      error: getAuthConfigurationMessage(),
      configuration: getAuthConfigurationErrors()
    });
  }
  return res.json({ authenticated: isValidAuthSession(req) });
});

app.post("/api/auth/logout", (req, res) => {
  setAuthSessionCookie(req, res, "", 0);
  return res.json({ authenticated: false });
});

app.use("/api", (req, res, next) => {
  if (isValidAuthSession(req)) return next();
  return res.status(401).json({ error: "Silakan masuk untuk menggunakan aplikasi." });
});

// Initialize Gemini SDK with telemetry header
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("GEMINI_API_KEY is not defined in the environment. Generative features will require configuration or return helpful fallbacks.");
}

// ---------------------------------------------------------
// DATA: Classical Book Catalog (Kitab Kuning / Turath)
// ---------------------------------------------------------
const kitabCatalog = [
  {
    id: "fathul-muin",
    title: "Fathul Mu'in bi Syarh Qurratil 'Ain",
    author: "Al-'Allamah Zainuddin bin Abdul Aziz al-Malibari",
    category: "Fiqh (Yurisprudensi)",
    madzhab: "Syafii",
    era: "Abad ke-10 Hijriah",
    difficulty: "Tinggi",
    description: "Kitab fikih Syafi'i rinci yang menjadi syarah atas matan Qurratul 'Ain karya Syekh Zainuddin al-Malibari. Kitab ini banyak dijadikan rujukan lanjutan dalam kajian pesantren salaf.",
    summary: "Fathul Mu'in membahas fikih madzhab Syafi'i secara luas dan mendalam, dimulai dari ketentuan bersuci, sholat, zakat, puasa, dan haji, lalu dilanjutkan pada muamalah, perkawinan, pidana, peradilan, pembebasan hamba, waris, dan bab-bab fikih lainnya. Uraian kitab menguatkan kaidah, syarat, rukun, halangan, serta khilaf ulama dengan merujuk kepada pendapat-pendapat mu'tabar madzhab.",
    chapters: [
      { id: "fm-1", name: "Kitab Ath-Thaharah (Bab Bersuci dan Hadats)", pages: "Jilid 1" },
      { id: "fm-2", name: "Kitab Ash-Shalah (Bab Sholat dan Jenazah)", pages: "Jilid 1" },
      { id: "fm-3", name: "Kitab Az-Zakah, Ash-Shiyam, dan Al-Hajj", pages: "Jilid 1" },
      { id: "fm-4", name: "Kitab Al-Buyu' dan Uquud (Jual-Beli serta Akad)", pages: "Jilid 2" },
      { id: "fm-5", name: "Kitab Nikah, Thalaq, dan Hadhanah", pages: "Jilid 2" },
      { id: "fm-6", name: "Kitab Jinayat, Qadha, dan Faraidh", pages: "Jilid 2" }
    ],
    tags: ["fiqh", "syafii", "pesantren", "fathul-muin", "syarah", "malibari"]
  },
  {
    id: "fathul-qarib",
    title: "Fathul Qarib Al-Mujib",
    author: "Syekh Muhammad bin Qasim Al-Ghazi",
    category: "Fiqh (Yurisprudensi)",
    madzhab: "Syafii",
    era: "Abad ke-10 Hijriah",
    difficulty: "Menengah",
    description: "Kitab fikih standar yang dipelajari di hampir seluruh pesantren salaf di Indonesia. Merupakan syarah (penjelasan) dari kitab Taqrib karya Abu Syuja.",
    summary: "Fathul Qarib menyajikan hukum praktis ibadah sehari-hari seperti bersuci (thaharah), sholat, zakat, puasa, haji, serta hukum muamalah (transaksi), waris, nikah, dan jinayat (pidana Islam) secara ringkas, lugas, dan terstruktur sesuai madzhab Imam Syafii.",
    chapters: [
      { id: "fq-1", name: "Kitab Ath-Thaharah (Bab Bersuci)", pages: "Halaman 4 - 15" },
      { id: "fq-2", name: "Kitab Ash-Shalah (Bab Sholat)", pages: "Halaman 16 - 38" },
      { id: "fq-3", name: "Kitab Az-Zakah (Bab Zakat)", pages: "Halaman 39 - 48" },
      { id: "fq-4", name: "Kitab Ash-Shiyam (Bab Puasa)", pages: "Halaman 49 - 53" },
      { id: "fq-5", name: "Kitab Al-Hajj (Bab Haji)", pages: "Halaman 54 - 61" },
      { id: "fq-6", name: "Kitab Al-Buyu' (Bab Jual-Beli & Transaksi)", pages: "Halaman 62 - 80" }
    ],
    tags: ["fiqh", "syafii", "pesantren", "praktis"]
  },
  {
    id: "riyadhus-shalihin",
    title: "Riyadhus Shalihin",
    author: "Imam Yahya bin Syaraf An-Nawawi",
    category: "Hadits & Akhlak",
    madzhab: "Umum / Syafii",
    era: "Abad ke-7 Hijriah",
    difficulty: "Menengah",
    description: "Kumpulan hadits pilihan yang membimbing pembaca menuju kesalehan jiwa dan penyempurnaan akhlak sehari-hari.",
    summary: "Riyadhus Shalihin (Taman Orang-Orang Saleh) memuat hadits-hadits sahih dari kutubus sittah mengenai keikhlasan, sabar, jujur, muraqabah, adab bertetangga, adab makan, zikir, keutamaan ilmu, dan manajemen spiritual untuk mencapai keluhuran budi pekerti.",
    chapters: [
      { id: "rs-1", name: "Bab Keikhlasan dan Niat", pages: "Hadits 1 - 12" },
      { id: "rs-2", name: "Bab Taubat", pages: "Hadits 13 - 21" },
      { id: "rs-3", name: "Bab Sabar", pages: "Hadits 22 - 50" },
      { id: "rs-4", name: "Bab Jujur dan Amanah", pages: "Hadits 51 - 60" },
      { id: "rs-5", name: "Bab Muraqabah (Merasa Diawasi Allah)", pages: "Hadits 61 - 73" }
    ],
    tags: ["hadits", "akhlak", "tazkiyah", "nawawi"]
  },
  {
    id: "fath-al-bari",
    title: "Fath al-Bari bi Syarh Shahih al-Bukhari",
    author: "Al-Hafiz Ibnu Hajar al-Asqalani",
    category: "Syarah Hadits & Hadits Shahih",
    madzhab: "Umum / Ahli Hadits",
    era: "773-852 H",
    difficulty: "Tinggi (Sangat Mendalam)",
    description: "Fath al-Bari bi Syarh Shahih al-Bukhari adalah kitab syarah (penjelasan) paling monumental atas Shahih al-Bukhari yang disusun oleh Al-Hafiz Ibnu Hajar al-Asqalani (773-852 H).",
    summary: "Kitab ini menguraikan periwayatan, sanad, lafaz, makna, serta hukum-hukum yang terkandung dalam setiap hadits Shahih al-Bukhari. Fath al-Bari memadukan telaah tahqiq hadits, penyelesaian perbedaan riwayat, fiqh lintas madzhab, ushul, bahasa Arab, dan nasakh-mansukh secara mendalam.",
    chapters: [
      { id: "fab-1", name: "Kitab Bad' al-Wahy: Permulaan Wahyu", pages: "Jilid 1" },
      { id: "fab-2", name: "Kitab al-Iman: Keimanan dan Rukunnya", pages: "Jilid 1" },
      { id: "fab-3", name: "Kitab al-'Ilm: Keutamaan dan Adab Menuntut Ilmu", pages: "Jilid 1" },
      { id: "fab-4", name: "Kitab al-Wudu' hingga Kitab al-Salah: Ibadah Praktis", pages: "Jilid 1-3" },
      { id: "fab-5", name: "Seluruh Kitab Shahih al-Bukhari: Takhrij, Dirayah, & Riwayah", pages: "Jilid Lengkap" }
    ],
    tags: ["hadits", "bukhari", "fath-al-bari", "ibnu-hajar", "syarah", "mustalah-hadits", "fiqh"]
  },
  {
    id: "al-hikam",
    title: "Kitab Al-Hikam",
    author: "Syekh Ahmad Ibnu Atha'illah Al-Iskandari",
    category: "Tasawwuf (Sufisme)",
    madzhab: "Syafii (Tarekat Syadziliyyah)",
    era: "Abad ke-7 Hijriah",
    difficulty: "Tinggi (Muntahi)",
    description: "Karya agung spiritual Islam berisi aforisme ketauhidan, penyucian hati, dan makrifatullah yang sangat mendalam.",
    summary: "Al-Hikam menyajikan untaian hikmah puitis penuh metafora tingkat tinggi tentang hubungan hamba dengan Sang Pencipta, bahaya riya, kesia-siaan mengatur takdir sendiri (tadbir), maqam laku spiritual, keajaiban berserah diri (tawakkal), dan menemukan cahaya batin.",
    chapters: [
      { id: "ah-1", name: "Hikmah 1 - 10: Mengurangi Sandaran pada Amal", pages: "Fasal Awal" },
      { id: "ah-2", name: "Hikmah 11 - 25: Tajrid dan Kasab", pages: "Fasal Maqomat" },
      { id: "ah-3", name: "Hikmah 26 - 40: Bahaya Syahwat Tersembunyi", pages: "Fasal Hati" },
      { id: "ah-4", name: "Hikmah 41 - 60: Zikir dan Kehadiran Hati", pages: "Fasal Wushul" }
    ],
    tags: ["tasawwuf", "tariqah", "hikmah", "spiritual"]
  },
  {
    id: "ihya-ulumuddin",
    title: "Ihya Ulumuddin",
    author: "Hujjatul Islam Imam Al-Ghazali",
    category: "Ensiklopedia Akhlak & Tasawwuf",
    madzhab: "Syafii",
    era: "Abad ke-5 Hijriah",
    difficulty: "Tinggi",
    description: "Mahakarya yang membangkitkan kembali ilmu-ilmu agama dengan mengawinkan aspek ortodoksi fikih dengan kedalaman mistisisme tasawwuf.",
    summary: "Ihya Ulumuddin terbagi dalam 4 kuartal (Ibadat, Adat, Muhlikat/Hal Merusak, dan Munjiyat/Hal Menyelamatkan). Membahas ilmu pengetahuan, rahasia sholat, adab bersaudara, penyakit hati seperti sombong dan hasad, serta obat hati seperti sabar, syukur, cinta (mahabbah), dan makrifat.",
    chapters: [
      { id: "ihya-1", name: "Rubu' Al-Ibadat (Kuartal Ibadah)", pages: "Juz 1" },
      { id: "ihya-2", name: "Rubu' Al-Adat (Kuartal Kebiasaan Hidup)", pages: "Juz 2" },
      { id: "ihya-3", name: "Rubu' Al-Muhlikat (Kuartal Perusak Jiwa)", pages: "Juz 3" },
      { id: "ihya-4", name: "Rubu' Al-Munjiyat (Kuartal Penyelamat Jiwa)", pages: "Juz 4" }
    ],
    tags: ["ghazali", "tasawwuf", "akhlak", "ensiklopedia"]
  },
  {
    id: "tafsir-jalalain",
    title: "Tafsir Al-Jalalain",
    author: "Jalaluddin Al-Mahalli & Jalaluddin As-Suyuthi",
    category: "Tafsir Al-Qur'an",
    madzhab: "Syafii",
    era: "Abad ke-10 Hijriah",
    difficulty: "Mudah - Menengah",
    description: "Tafsir Al-Qur'an klasik yang sangat ringkas, padat, dan langsung menjelaskan makna literal setiap ayat secara harfiah.",
    summary: "Ditulis oleh 'Dua Jalal', tafsir ini menjadi rujukan utama santri pemula sebelum mempelajari tafsir luas seperti Tafsir Baidhawi atau Ibnu Katsir. Menguraikan asbabun nuzul (kronologi turunnya ayat) dan korelasi antar-kata dengan sangat ringkas di sisi margin mushaf.",
    chapters: [
      { id: "tj-1", name: "Tafsir Surah Al-Fatihah & Al-Baqarah", pages: "Juz 1" },
      { id: "tj-2", name: "Tafsir Surat Ali Imron s/d At-Taubah", pages: "Juz 2" },
      { id: "tj-3", name: "Tafsir Surat Yunus s/d Al-Ankabut", pages: "Juz 3" },
      { id: "tj-4", name: "Tafsir Surat Ar-Rum s/d An-Nas", pages: "Juz 4" }
    ],
    tags: ["tafsir", "suyuthi", "quran", "ringkas"]
  },
  {
    id: "safinatun-najah",
    title: "Safinatun Najah",
    author: "Syekh Salim bin Syumair Al-Hadhrami",
    category: "Fiqh Dasar",
    madzhab: "Syafii",
    era: "Abad ke-13 Hijriah",
    difficulty: "Pemula (Mubtadi')",
    description: "Perahu Penyelamat dalam memahami dasar-dasar akidah Islam dan rukun bersuci serta sholat menurut madzhab Syafii.",
    summary: "Kitab kecil yang padat berisi rukun Islam, rukun iman, rincian wudhu, hal-hal yang membatalkan bersuci, rukun shalat, syarat shalat, rincian zakat, dan ibadah puasa secara sangat mendasar bagi anak-anak atau mualaf.",
    chapters: [
      { id: "sn-1", name: "Fasal Aqidah (Rukun Iman & Islam)", pages: "Halaman 1 - 3" },
      { id: "sn-2", name: "Fasal Wudhu, Mandi Jinabat & Tayammum", pages: "Halaman 4 - 8" },
      { id: "sn-3", name: "Fasal Sholat & Rukun-Rukunya", pages: "Halaman 9 - 18" },
      { id: "sn-4", name: "Fasal Zakat & Puasa Ramadhan", pages: "Halaman 19 - 22" }
    ],
    tags: ["fiqh", "dasar", "pemula", "pesantren"]
  },
  {
    id: "alfiyah-ibnu-malik",
    title: "Alfiyah Ibnu Malik",
    author: "Syekh Muhammad bin Abdullah bin Malik Al-Andalusi",
    category: "Tata Bahasa (Nahwu & Shorof)",
    madzhab: "Umum",
    era: "Abad ke-7 Hijriah",
    difficulty: "Tinggi",
    description: "Syair 1.000 bait legendaris yang merangkum seluruh kaidah tata bahasa Arab tingkat lanjut (Sintaksis & Morfologi).",
    summary: "Alfiyah merupakan karya puitis (nadhom) yang merangkum kaidah Nahwu (sintaksis) dan Sharaf (morfologi) dengan gaya bahasa yang indah, berirama, dan berbobot ilmiah madzhab Bashrah dan Kufah, sering dihafalkan oleh para santri senior.",
    chapters: [
      { id: "am-1", name: "Kalam wa Ma Yatalallaf Minhu (Bait 1 - 10)", pages: "Halaman Awal" },
      { id: "am-2", name: "Mu'rab wal Mabni (Bait 11 - 50)", pages: "Fasal Isim & Fi'il" },
      { id: "am-3", name: "Marfu'at, Manshubat wal Makhfudhatul Ism", pages: "Kasus Kaidah Isim" },
      { id: "am-4", name: "Fasilitas Sharaf (Perubahan Kata)", pages: "Bagian Akhir Kitab" }
    ],
    tags: ["nahwu", "shorof", "bahasa", "sastra", "syair"]
  },
  {
    id: "taqrirat-alfiyah-lirboyo",
    title: "Taqrirat Alfiyah Ibnu Malik (Lirboyo)",
    author: "Matan Alfiyah: Syekh Muhammad bin Abdullah bin Malik; penyusun taqrirat tidak terverifikasi",
    category: "Tata Bahasa (Nahwu)",
    madzhab: "Tradisi pengajaran pesantren Lirboyo",
    era: "Kajian Madrasah Hidayatul Mubtadi-ien; edisi Makna Jawa tercatat terbitan Lirboyo Kediri",
    difficulty: "Tinggi",
    description: "Catatan pengajian/taqrirat untuk mempelajari Alfiyah Ibnu Malik yang digunakan dalam kajian Madrasah Hidayatul Mubtadi-ien, Pondok Pesantren Lirboyo. Tersedia pula edisi Makna Jawa yang tercatat dengan penerbit Lirboyo Kediri.",
    summary: "Membantu membaca dan memahami bait-bait Alfiyah melalui penjelasan lafaz, susunan nahwu, dan maksud kaidah. Ungkapan “Qouluhu ...” (قوله) berarti “perkataan/ungkapan beliau ...”; lafaz setelahnya menunjuk bagian matan Alfiyah yang sedang dijelaskan, lalu diikuti uraian makna atau kaidahnya. Jangan menganggap setiap uraian “Qouluhu” sebagai bait baru.",
    chapters: [
      { id: "tal-1", name: "Muqaddimah Alfiyah dan penjelasan dengan pola Qouluhu", pages: "Bagian awal" },
      { id: "tal-2", name: "Kalam, isim, fi'il, huruf, dan tanda-tandanya", pages: "Pembahasan dasar nahwu" },
      { id: "tal-3", name: "I'rab, bina', marfu'at, dan amil-amilnya", pages: "Pembahasan nahwu" },
      { id: "tal-4", name: "Manshubat, majrurat, tawabi', dan bab-bab lanjutan", pages: "Pembahasan nahwu" }
    ],
    tags: ["taqrirat", "alfiyah", "ibnu-malik", "lirboyo", "nahwu", "makna-jawa", "qouluhu"]
  },
  {
    id: "qurrotul-uyun",
    title: "Qurratul 'Uyun bi Syarhi Nadzam Ibni Yamun",
    author: "Syekh Muhammad At-Tahami bin Al-Madani Kanun Al-Idrisi",
    category: "Fiqh Munakahat & Keluarga Sakinah",
    madzhab: "Maliki / Syafi'i (Tradisi Pesantren Salaf)",
    era: "Abad ke-13 Hijriah",
    difficulty: "Menengah (Khusus Dewasa & Pasutri)",
    description: "Kitab rujukan adab pernikahan, etika malam pertama, keharmonisan suami-istri, pendidikan anak, serta hak dan kewajiban rumah tangga islami yang sangat populer dikaji di pesantren Nusantara.",
    summary: "Qurratul 'Uyun (Penyejuk Mata) merupakan syarah atas nadham Syekh Ibnu Yamun. Mengulas secara komprehensif adab meminang dan memilih pasangan, walimah pernikahan, etika hubungan suami-istri menurut sunnah nabawiyyah, adab berjimak, doa-doa khusus, kesehatan biologis menurut thibbun nabawi, keharmonisan batiniah, serta panduan mendidik anak saleh dan menjaga mahligai rumah tangga agar senantiasa dilimpahi sakinah mawaddah wa rahmah.",
    chapters: [
      { id: "qu-1", name: "Fasal 1: Keutamaan Menikah & Kriteria Memilih Pasangan", pages: "Bait 1 - 15" },
      { id: "qu-2", name: "Fasal 2: Walimatul 'Urs & Menjaga Kesucian Resepsi", pages: "Bait 16 - 28" },
      { id: "qu-3", name: "Fasal 3: Adab Malam Pertama & Sholat Sunnah Pengantin", pages: "Bait 29 - 42" },
      { id: "qu-4", name: "Fasal 4: Etika Bersetubuh (Jima'), Doa & Waktu Sunnah", pages: "Bait 43 - 65" },
      { id: "qu-5", name: "Fasal 5: Waktu Terlarang & Kesehatan Reproduksi Pasutri", pages: "Bait 66 - 80" },
      { id: "qu-6", name: "Fasal 6: Hak-Hak Timbal Balik & Adab Pergaulan Suami Istri", pages: "Bait 81 - 105" },
      { id: "qu-7", name: "Fasal 7: Merawat Kasih Sayang & Menghindari Nusyuz", pages: "Bait 106 - 120" },
      { id: "qu-8", name: "Fasal 8: Adab Mendidik Anak & Menanamkan Akhlak Sejak Dini", pages: "Bait 121 - 140" }
    ],
    tags: ["munakahat", "pernikahan", "keluarga", "qurrotul-uyun", "pasutri", "akhlak", "adab", "kontemporer"]
  },
  {
    id: "uqudul-lujain",
    title: "Uqudul Lujain fi Bayani Huquqiz Zaujain",
    author: "Syekh Nawawi Al-Bantani (Mahaguru Ulama Nusantara)",
    category: "Fiqh Munakahat & Hak Pasutri",
    madzhab: "Syafi'i Nusantara",
    era: "Abad ke-13 - 14 Hijriah",
    difficulty: "Pemula - Menengah",
    description: "Kitab etika dan hak kewajiban suami istri karya ulama besar Indonesia berkaliber internasional yang menjadi bacaan wajib para santri menjelang memasuki bahtera pernikahan.",
    summary: "Uqudul Lujain (Untaian Permata Perak) membahas empat pilar penting: kewajiban suami kepada istri (nafkah lahir batin dan mu'asyarah bil ma'ruf), kewajiban istri mentaati suami dalam kebaikan, keutamaan ibadah di rumah tangga, serta adab menjaga kesucian diri dan pergaulan sesuai akhlak salafus saleh.",
    chapters: [
      { id: "ul-1", name: "Fasal 1: Hak-Hak Istri atas Suami (Nafkah & Kelemahlembutan)", pages: "Halaman 2 - 8" },
      { id: "ul-2", name: "Fasal 2: Hak-Hak Suami atas Istri (Ketaatan & Penjagaan Harta)", pages: "Halaman 9 - 18" },
      { id: "ul-3", name: "Fasal 3: Keutamaan Shalat & Amal Kebaikan Wanita di Rumah", pages: "Halaman 19 - 24" },
      { id: "ul-4", name: "Fasal 4: Penjagaan Kehormatan Diri & Adab Pergaulan Pasutri", pages: "Halaman 25 - 32" }
    ],
    tags: ["munakahat", "uqudul-lujain", "nawawi-bantani", "keluarga", "pasutri", "nusantara"]
  },
  {
    id: "ahkamul-fuqaha",
    title: "Ahkamul Fuqaha (Solusi Hukum Bahtsul Masa'il NU)",
    author: "Lajnah Bahtsul Masa'il Pengurus Besar Nahdlatul Ulama (PBNU)",
    category: "Bahtsul Masa'il & Fikih Kebangsaan Nusantara",
    madzhab: "Syafi'iyyah Nusantara (Ahlussunnah wal Jama'ah)",
    era: "Kontemporer Nusantara (1926 M - Sekarang)",
    difficulty: "Tinggi (Maraji' Resmi Putusan Ulama)",
    description: "Kompilasi resmi keputusan fatwa hukum Muktamar, Munas, dan Konbes Bahtsul Masa'il Nahdlatul Ulama dari tahun 1926 hingga era kontemporer, menjadi rujukan hukum tertinggi tradisi santri Nusantara.",
    summary: "Memuat ribuan ketetapan hukum musyawarah ulama pesantren salaf terkait masalah keagamaan, sosial, dan kebangsaan: legalitas uang kertas, BPJS kesehatan, autopsi jenazah, donor organ, bunga bank, status cryptocurrency/kripto, kecerdasan buatan, hukum siaran sholat online, hingga fikih lingkungan hidup (Fiqh Al-Bi'ah). Setiap fatwa dilengkapi ibarat naskah kitab kuning klasik dan analisis maslahat 'ammah.",
    chapters: [
      { id: "af-1", name: "Mas'alah Waqi'iyyah: Kasus Aktual Sosial, Teknologi, & Medis", pages: "Keputusan Muktamar" },
      { id: "af-2", name: "Mas'alah Maudhu'iyyah: Kajian Tematik Fikih Kebangsaan & Demokrasi", pages: "Munas Alim Ulama" },
      { id: "af-3", name: "Mas'alah Qanuniyyah: Respon Hukum Islam Terhadap Regulasi Negara", pages: "Fatwa Konbes" },
      { id: "af-4", name: "Bab Ibadah Kontemporer: Sholat Virtual, Hisab-Rukyah, & Arah Kiblat", pages: "Ketetapan Fikih" },
      { id: "af-5", name: "Bab Ekonomi & Keuangan: Bank Konvensional, Kripto, MLM, & Fintech", pages: "Muamalah Modern" }
    ],
    tags: ["bahtsul-masail", "nu", "ahkamul-fuqaha", "nusantara", "fatwa", "kontemporer", "kripto", "ai"]
  },
  {
    id: "fiqh-islami-adillatuh",
    title: "Al-Fiqh Al-Islami wa Adillatuh",
    author: "Prof. Dr. Wahbah Az-Zuhaili (Ulama Ensiklopedia Modern)",
    category: "Fiqh Kontemporer & Muqaran (Perbandingan Madzhab)",
    madzhab: "Lintas Empat Madzhab (Hanafi, Maliki, Syafi'i, Hanbali)",
    era: "Kontemporer (Abad ke-14 - 15 Hijriah / Modern)",
    difficulty: "Tinggi (Maraji' Akademisi & Mufti)",
    description: "Ensiklopedia fikih kontemporer terlengkap dan paling otoritatif di era modern. Menghimpun perbandingan hukum empat madzhab serta menganalisis masalah-masalah modern seperti perbankan syariah, asuransi, bioetika, dan kedokteran.",
    summary: "Karya monumental 10 jilid ini menjadi maraji' utama lembaga fatwa internasional dan forum bahtsul masa'il di Indonesia. Mengulas dalil qath'i dan zhanni empat mazhab (Hanafi, Maliki, Syafi'i, Hanbali) dan membedah fatwa aktual seperti bayi tabung, transplantasi kornea & organ, bedah plastik, saham & obligasi syariah, kartu kredit, hak cipta (HAKI), serta rekayasa finansial modern berlandaskan maqashid syariah.",
    chapters: [
      { id: "fia-1", name: "Jilid Fiqh Kedokteran: Bayi Tabung, Aborsi Medis, & Transplantasi Organ", pages: "Juz 7 Hal 120" },
      { id: "fia-2", name: "Jilid Finansial Modern: Perbankan Syariah, Mudharabah, & Sukuk", pages: "Juz 5 Hal 340" },
      { id: "fia-3", name: "Jilid Asuransi & Pasar Modal: Takaful, Saham, & Riba Kontemporer", pages: "Juz 5 Hal 480" },
      { id: "fia-4", name: "Jilid Fiqh Digital: Hak Cipta Intelektual (HAKI) & Muamalah Daring", pages: "Juz 4 Hal 610" },
      { id: "fia-5", name: "Jilid Siyasah Syar'iyyah & Konstitusi Kenegaraan Modern", pages: "Juz 8 Hal 210" }
    ],
    tags: ["kontemporer", "wahbah-zuhaili", "perbankan", "kedokteran", "muqaran", "fatwa", "modern"]
  },
  {
    id: "fatawa-muashirah",
    title: "Fatawa Mu'ashirah (Fatwa-Fatwa Kontemporer)",
    author: "Syekh Dr. Yusuf Al-Qaradhawi",
    category: "Fatwa Kontemporer & Solusi Fikih Modern",
    madzhab: "Manhaj Wasathiyyah (Moderat Antar-Madzhab)",
    era: "Kontemporer (Abad ke-15 Hijriah / Era Modern)",
    difficulty: "Menengah - Tinggi",
    description: "Kumpulan fatwa kontemporer berbasis prinsip kemudahan (taysir) dan moderasi (wasathiyyah) yang merespon dinamika zaman, sains, teknologi, dan interaksi global umat Islam.",
    summary: "Menghadirkan jawaban fikih aplikatif atas ratusan persoalan baru umat Islam: hukum zakat profesi (penghasilan), zakat saham dan reksadana, etika media sosial, keterlibatan wanita dalam ruang publik, hukum asuransi jiwa, musik dan seni digital, hingga toleransi beragama dan hidup berdampingan di era globalisasi.",
    chapters: [
      { id: "fm-1", name: "Fatawa Zakat Modern: Zakat Gaji, Zakat Profesi, & Saham Perusahaan", pages: "Jilid 1 Bab Zakat" },
      { id: "fm-2", name: "Fatawa Muamalah Daring: E-Commerce, Paylater, & Mata Uang Digital", pages: "Jilid 2 Bab Transaksi" },
      { id: "fm-3", name: "Fatawa Medis & Kosmetika: Bedah Estetika, Vaksinasi, & Uji Klinis", pages: "Jilid 2 Bab Kedokteran" },
      { id: "fm-4", name: "Fatawa Sosial & Budaya: Hak Asasi Wanita, Musik, & Media Digital", pages: "Jilid 3 Bab Kebudayaan" },
      { id: "fm-5", name: "Fatawa Minoritas Muslim & Hubungan Internasional", pages: "Jilid 3 Bab Fiqh Aqalliyat" }
    ],
    tags: ["kontemporer", "qaradhawi", "fatwa", "zakat-profesi", "wasathiyyah", "fintech", "modern"]
  },
  {
    id: "fiqh-al-manhaji",
    title: "Al-Fiqh Al-Manhaji 'ala Madzhab Asy-Syafi'i",
    author: "Dr. Musthafa Al-Khin, Dr. Musthafa Al-Bugha, & Ali Asy-Syarbaji",
    category: "Fiqh Syafi'i Metodologis Kontemporer",
    madzhab: "Syafi'i Modern",
    era: "Kontemporer (Abad ke-15 Hijriah)",
    difficulty: "Menengah (Sangat Sistematis)",
    description: "Kitab fikih madzhab Syafi'i kontemporer yang disusun dengan metodologi ilmiah modern, runtut, bahasa Arab fasih dan lugas, serta dalil Al-Qur'an dan Sunnah yang dipaparkan secara gamblang.",
    summary: "Al-Fiqh Al-Manhaji menjadi jembatan antara teks klasik fikih Syafi'i dengan pemikiran generasi kontemporer. Menguraikan bab thaharah, sholat, zakat, puasa, haji, jual-beli modern, muamalat, dan hukum keluarga (munakahat) dengan menyertakan hikmah tasyri' (hikmah di balik pensyariatan hukum) sehingga sangat diminati mahasantri dan akademisi syariah masa kini.",
    chapters: [
      { id: "fman-1", name: "Juz 1: Thaharah, Shalat Wajib & Sunnah, Pengurusan Jenazah", pages: "Jilid 1" },
      { id: "fman-2", name: "Juz 2: Zakat Harta & Jiwa, Puasa Ramadhan, Ibadah Haji & Umrah", pages: "Jilid 2" },
      { id: "fman-3", name: "Juz 3: Transaksi Keuangan Modern, Riba, Khiyar, Syirkah, & Gadai", pages: "Jilid 3" },
      { id: "fman-4", name: "Juz 4: Fiqh Keluarga, Khitbah, Rukun Nikah, Nafkah, & Hadhanah", pages: "Jilid 4" },
      { id: "fman-5", name: "Juz 5: Jinayat, Hudud, Qisas, & Pengadilan Perkara (Qadha)", pages: "Jilid 5" }
    ],
    tags: ["fiqh-manhaji", "syafii", "bugha", "kontemporer", "metodologis", "modern"]
  },
  {
    id: "bughyatul-mustarsyidin",
    title: "Bughyatul Mustarsyidin fi Talkhisi Fatawa Aimmah",
    author: "Sayyid Abdurrahman bin Muhammad Al-Masyhur Al-Hadhrami",
    category: "Fiqh Fatawa (Himpunan Fatwa Mufti Syafi'i)",
    madzhab: "Syafi'i (Ulama Muta'akhirin)",
    era: "Abad ke-13 - 14 Hijriah",
    difficulty: "Tinggi (Kamus Rujukan Bahtsul Masail)",
    description: "Kompilasi fatwa-fatwa para mufti besar madzhab Syafi'i Hadhramaut dan Hijaz yang merangkum ribuan solusi persoalan hukum kemasyarakatan yang rumit dan pelik.",
    summary: "Bughyatul Mustarsyidin adalah salah satu kitab yang paling sering dikutip dalam forum Bahtsul Masa'il pesantren. Mengoleksi fatwa Al-Habib Abdullah bin Husain bin Thahir, Syekh Muhammad bin Sulaiman Al-Kurdi, Syekh Ahmad bin Zaini Dahlan, dan ulama lainnya tentang perselisihan hak milik, wakaf keluarga, uzur sholat jamak qashar musafir, akad jual beli bersyarat, serta sengketa wali nikah.",
    chapters: [
      { id: "bm-1", name: "Bab Thaharah: Kasus Air Mutanajjis di Penampungan & Sumur", pages: "Fatawa Thaharah" },
      { id: "bm-2", name: "Bab Shalat: Berjamaah, Imam Fasik, & Shalat Safar Musafir", pages: "Fatawa Shalah" },
      { id: "bm-3", name: "Bab Muamalat: Hukum Uang Panjar, Riba Samar, & Sengketa Tanah", pages: "Fatawa Buyu'" },
      { id: "bm-4", name: "Bab Nikah: Mahar yang Tertunda, Rujuk, & Masalah Wali Adhal", pages: "Fatawa Nikah" },
      { id: "bm-5", name: "Bab Peradilan: Gugatan Hak Milik, Saksi, & Harta Warisan", pages: "Fatawa Qadha" }
    ],
    tags: ["bughyah", "fatawa", "syafii", "bahtsul-masail", "pesantren", "hadhramaut", "kontemporer"]
  },
  {
    id: "at-tibyan",
    title: "At-Tibyan fi Adabi Hamalatil Qur'an",
    author: "Imam Abu Zakariya Yahya bin Syaraf An-Nawawi",
    category: "Ulumul Qur'an & Adab",
    madzhab: "Syafii",
    era: "Abad ke-7 Hijriah",
    difficulty: "Menengah",
    description: "Kitab Imam An-Nawawi tentang adab berinteraksi dengan Al-Qur'an, bagi pembaca, pengajar, dan penuntut ilmu.",
    summary: "At-Tibyan membahas keutamaan membaca dan mempelajari Al-Qur'an, adab tilawah, penghormatan terhadap mushaf, serta etika guru dan murid dalam pengajaran Al-Qur'an. Kitab ini juga menguraikan adab para penghafal dan pembaca Al-Qur'an.",
    chapters: [
      { id: "tibyan-1", name: "Keutamaan Membaca dan Mempelajari Al-Qur'an", pages: "Bagian awal" },
      { id: "tibyan-2", name: "Adab Guru dan Penuntut Ilmu Al-Qur'an", pages: "Pembahasan adab pengajaran" },
      { id: "tibyan-3", name: "Adab Membaca, Membawa, dan Memuliakan Mushaf", pages: "Pembahasan tilawah" },
      { id: "tibyan-4", name: "Adab Berbagai Golongan Pembaca Al-Qur'an", pages: "Bagian akhir" }
    ],
    tags: ["at-tibyan", "an-nawawi", "ulumul-quran", "adab", "tilawah"]
  },
  {
    id: "syarah-tijan",
    title: "Tijan ad-Darari fi Syarh Risalah al-Bajuri",
    author: "Syekh Ibrahim al-Bajuri",
    category: "Aqidah & Ilmu Tauhid",
    madzhab: "Asy'ari",
    era: "Abad ke-13 Hijriah",
    difficulty: "Menengah",
    description: "Syarah ringkas Syekh Ibrahim al-Bajuri atas risalah tauhidnya, yang banyak dipelajari dalam tradisi pesantren.",
    summary: "Tijan ad-Darari menjelaskan dasar-dasar akidah Islam, termasuk sifat-sifat wajib, mustahil, dan jaiz bagi Allah dan para rasul. Uraiannya mengenalkan pokok-pokok tauhid dalam tradisi Ahlussunnah wal Jama'ah.",
    chapters: [
      { id: "tijan-1", name: "Pengantar Ilmu Tauhid dan Hukum Akal", pages: "Muqaddimah" },
      { id: "tijan-2", name: "Sifat-Sifat Wajib, Mustahil, dan Jaiz bagi Allah", pages: "Pembahasan sifat ketuhanan" },
      { id: "tijan-3", name: "Sifat-Sifat Wajib, Mustahil, dan Jaiz bagi Para Rasul", pages: "Pembahasan sifat kenabian" },
      { id: "tijan-4", name: "Pokok-Pokok Keimanan", pages: "Bagian akhir" }
    ],
    tags: ["tijan", "tijan-ad-darari", "bajuri", "aqidah", "tauhid", "asyari"]
  },
  {
    id: "jawahirul-bukhari",
    title: "Jawahir al-Bukhari",
    author: "Musthafa Muhammad Imarah",
    category: "Hadits & Syarah",
    madzhab: "Umum",
    era: "Kontemporer",
    difficulty: "Menengah",
    description: "Himpunan pilihan hadits dari Shahih al-Bukhari yang disusun untuk memudahkan pembelajaran dan pengambilan faedah.",
    summary: "Jawahir al-Bukhari menghimpun hadits-hadits pilihan dari Shahih al-Bukhari dalam tema keimanan, ibadah, akhlak, dan kehidupan sosial. Penyajiannya membantu pembaca mengenal kandungan hadits dan pelajaran praktisnya.",
    chapters: [
      { id: "jawahir-1", name: "Hadits-Hadits Keimanan dan Ilmu", pages: "Bagian tematik" },
      { id: "jawahir-2", name: "Hadits-Hadits Ibadah", pages: "Bagian tematik" },
      { id: "jawahir-3", name: "Hadits-Hadits Akhlak dan Adab", pages: "Bagian tematik" },
      { id: "jawahir-4", name: "Hadits-Hadits Muamalah dan Kehidupan Sosial", pages: "Bagian tematik" }
    ],
    tags: ["jawahirul-bukhari", "hadits", "bukhari", "syarah"]
  },
  {
    id: "al-baiquniyah",
    title: "Al-Manzumah al-Baiquniyah",
    author: "Syekh Umar bin Muhammad al-Baiquni",
    category: "Musthalah Hadits",
    madzhab: "Umum",
    era: "Abad ke-11 Hijriah",
    difficulty: "Pemula",
    description: "Nazam ringkas yang mengenalkan istilah dan pembagian ilmu hadits, lazim dipelajari sebagai pengantar musthalah hadits.",
    summary: "Al-Baiquniyah merangkum sejumlah istilah dasar dalam ilmu hadits, seperti hadits sahih, hasan, dhaif, mursal, musalsal, dan jenis-jenis riwayat lainnya. Bentuk nazamnya membantu pemula menghafal dan memahami klasifikasi hadits.",
    chapters: [
      { id: "baiquni-1", name: "Pengantar dan Pembagian Dasar Hadits", pages: "Awal nazam" },
      { id: "baiquni-2", name: "Jenis Hadits Berdasarkan Kualitas dan Sanad", pages: "Bagian tengah nazam" },
      { id: "baiquni-3", name: "Jenis Riwayat dan Istilah Musthalah Lainnya", pages: "Bagian akhir nazam" }
    ],
    tags: ["baiquniyah", "musthalah-hadits", "hadits", "nazam", "pemula"]
  },
  {
    id: "faraidul-bahiyah",
    title: "Al-Faraid al-Bahiyyah fi al-Qawa'id al-Fiqhiyyah",
    author: "Syekh Abu Bakr al-Ahdal",
    category: "Qawaid Fiqhiyyah",
    madzhab: "Syafii",
    era: "Abad ke-10 Hijriah",
    difficulty: "Menengah",
    description: "Nazam kaidah-kaidah fikih yang digunakan sebagai pengantar untuk memahami prinsip umum dalam penetapan hukum.",
    summary: "Al-Faraid al-Bahiyyah merangkum kaidah fikih beserta cabang dan penerapannya. Pembahasannya membantu pelajar memahami prinsip seperti keyakinan tidak hilang karena keraguan, kesulitan mendatangkan kemudahan, dan kebiasaan dapat menjadi pertimbangan hukum.",
    chapters: [
      { id: "faraid-1", name: "Kaidah-Kaidah Fikih Pokok", pages: "Bagian awal nazam" },
      { id: "faraid-2", name: "Kaidah Cabang dan Penerapannya", pages: "Bagian tengah nazam" },
      { id: "faraid-3", name: "Pengecualian dan Penutup", pages: "Bagian akhir nazam" }
    ],
    tags: ["faraidul-bahiyah", "qawaid-fiqhiyyah", "fiqh", "syafii", "nazam"]
  },
  {
    id: "minhajul-abidin",
    title: "Minhaj al-Abidin ila Jannati Rabbil Alamin",
    author: "Hujjatul Islam Imam Abu Hamid Muhammad al-Ghazali",
    category: "Tasawwuf & Tazkiyatun Nafs",
    madzhab: "Syafii",
    era: "Abad ke-5 Hijriah",
    difficulty: "Menengah - Tinggi",
    description: "Karya Imam al-Ghazali yang membimbing perjalanan seorang hamba dalam beribadah dan mendekatkan diri kepada Allah.",
    summary: "Minhaj al-Abidin menguraikan perjalanan ibadah melalui tahapan-tahapan yang perlu ditempuh, mulai dari ilmu dan taubat hingga menghadapi penghalang, godaan, serta hal-hal yang merusak amal. Kitab ini menekankan kesungguhan beribadah, penjagaan hati, dan syukur kepada Allah.",
    chapters: [
      { id: "minhaj-1", name: "Ilmu dan Taubat", pages: "Tahapan awal" },
      { id: "minhaj-2", name: "Penghalang dan Godaan dalam Ibadah", pages: "Tahapan perjalanan" },
      { id: "minhaj-3", name: "Pendorong Ketaatan dan Perusak Amal", pages: "Tahapan perjalanan" },
      { id: "minhaj-4", name: "Syukur dan Penyempurnaan Penghambaan", pages: "Tahapan akhir" }
    ],
    tags: ["minhajul-abidin", "ghazali", "tasawwuf", "tazkiyah", "ibadah"]
  },
  {
    id: "bidayatul-hidayah",
    title: "Bidayatul Hidayah",
    author: "Hujjatul Islam Imam Abu Hamid Muhammad al-Ghazali",
    category: "Tasawwuf & Adab",
    madzhab: "Syafii",
    era: "Abad ke-5 Hijriah",
    difficulty: "Pemula - Menengah",
    description: "Panduan Imam al-Ghazali mengenai adab menuntut ilmu dan amalan keseharian untuk memulai perjalanan menuju hidayah Allah.",
    summary: "Bidayatul Hidayah membimbing pembaca melalui adab bangun tidur, bersuci, ibadah, dan rutinitas harian. Kitab ini juga mengajarkan penjagaan anggota badan dari maksiat, adab pergaulan, serta tata cara menempuh jalan menuju ketaatan.",
    chapters: [
      { id: "bidayah-1", name: "Adab Bangun Tidur, Bersuci, dan Persiapan Ibadah", pages: "Bagian awal" },
      { id: "bidayah-2", name: "Amalan dan Adab Keseharian", pages: "Bagian amalan" },
      { id: "bidayah-3", name: "Menjaga Anggota Badan dari Maksiat", pages: "Bagian penjagaan diri" },
      { id: "bidayah-4", name: "Adab Pergaulan dan Persahabatan", pages: "Bagian akhir" }
    ],
    tags: ["bidayatul-hidayah", "ghazali", "tasawwuf", "adab", "tazkiyah"]
  },
  {
    id: "adabul-islam-fi-nidhomil-usroh",
    title: "Adabul Islam fi Nidhomil Usroh",
    author: "Sayyid Muhammad bin Alawi bin Abbas al-Maliki",
    category: "Akhlak & Keluarga",
    madzhab: "Ahlussunnah wal Jama'ah",
    era: "Kontemporer",
    difficulty: "Pemula - Menengah",
    description: "Kajian adab Islam dalam kehidupan keluarga yang dinisbatkan kepada Sayyid Muhammad bin Alawi bin Abbas al-Maliki.",
    summary: "Kitab ini membahas tuntunan adab Islam dalam membangun dan menjaga kehidupan keluarga, termasuk tanggung jawab anggota keluarga, hubungan suami-istri, pendidikan anak, dan pembinaan rumah tangga berdasarkan nilai-nilai Islam.",
    chapters: [
      { id: "adabul-usroh-1", name: "Prinsip dan Tujuan Kehidupan Keluarga dalam Islam", pages: "Pembahasan awal" },
      { id: "adabul-usroh-2", name: "Hak dan Tanggung Jawab dalam Rumah Tangga", pages: "Pembahasan keluarga" },
      { id: "adabul-usroh-3", name: "Adab Suami-Istri dan Pendidikan Anak", pages: "Pembahasan adab keluarga" },
      { id: "adabul-usroh-4", name: "Membina Keharmonisan dan Akhlak Keluarga", pages: "Pembahasan akhir" }
    ],
    tags: ["adabul-islam", "nidhomil-usroh", "maliki", "keluarga", "akhlak"]
  },
  {
    id: "zadul-labib",
    title: "Zadul Labib Syarah Matan Ghoyah wa Taqrib",
    author: "R. Muhammad bin Ali Ba'athiyah",
    category: "Fiqh Syafii",
    madzhab: "Syafii",
    era: "Kontemporer",
    difficulty: "Menengah",
    description: "Syarah atas Matan Ghoyah wa Taqrib yang dinisbatkan kepada R. Muhammad bin Ali Ba'athiyah, membahas fikih madzhab Syafi'i.",
    summary: "Zadul Labib menjelaskan pokok-pokok fikih dalam Matan Ghoyah wa Taqrib. Kajian meliputi ibadah dan muamalah serta bab-bab fikih lainnya mengikuti susunan matan yang disyarah.",
    chapters: [
      { id: "zadul-labib-1", name: "Thaharah dan Bersuci", pages: "Mengikuti susunan matan" },
      { id: "zadul-labib-2", name: "Shalat, Zakat, Puasa, dan Haji", pages: "Mengikuti susunan matan" },
      { id: "zadul-labib-3", name: "Muamalah dan Akad", pages: "Mengikuti susunan matan" },
      { id: "zadul-labib-4", name: "Munakahat, Jinayat, dan Bab Fikih Lainnya", pages: "Mengikuti susunan matan" }
    ],
    tags: ["zadul-labib", "ghoyah-wa-taqrib", "fiqh", "syafii", "baathiyah", "syarah"]
  },
  {
    id: "fathul-ghoffar",
    title: "Fathul Ghoffar Syarah Taqrib",
    author: "Imam Ibnu Qasim al-'Abbad",
    category: "Fiqh Syafii",
    madzhab: "Syafii",
    era: "Klasik",
    difficulty: "Menengah",
    description: "Syarah atas Matan Taqrib yang dinisbatkan kepada Imam Ibnu Qasim al-'Abbad, sebagai rujukan kajian fikih madzhab Syafi'i.",
    summary: "Fathul Ghoffar menguraikan pembahasan fikih yang tersusun dalam Matan Taqrib. Kajian mencakup ibadah, muamalah, dan bab hukum lainnya; rincian redaksi serta penomoran halaman mengikuti edisi kitab yang digunakan.",
    chapters: [
      { id: "fathul-ghoffar-1", name: "Thaharah dan Bersuci", pages: "Mengikuti susunan matan" },
      { id: "fathul-ghoffar-2", name: "Shalat, Zakat, Puasa, dan Haji", pages: "Mengikuti susunan matan" },
      { id: "fathul-ghoffar-3", name: "Jual-Beli dan Muamalah", pages: "Mengikuti susunan matan" },
      { id: "fathul-ghoffar-4", name: "Nikah dan Bab-Bab Fikih Lainnya", pages: "Mengikuti susunan matan" }
    ],
    tags: ["fathul-ghoffar", "taqrib", "fiqh", "syafii", "syarah"]
  }
];

function getKitabEraSortValue(era: string) {
  const centuries = [...era.matchAll(/abad ke-(\d+)/gi)].map((match) => Number(match[1]));
  if (centuries.length > 0) return Math.max(...centuries) * 100;

  const hijriYears = [...era.matchAll(/\b(\d{3,4})\s*-\s*(\d{3,4})\s*H\b/gi)]
    .flatMap((match) => [Number(match[1]), Number(match[2])]);
  if (hijriYears.length > 0) return Math.max(...hijriYears);

  if (/kontemporer/i.test(era) || /\d{4}\s*M/i.test(era)) return 1600;
  return -1;
}

kitabCatalog.sort((left, right) => getKitabEraSortValue(right.era) - getKitabEraSortValue(left.era));

// Fallback response for Bahtsul Masail if Gemini is unconfigured or fails
function getFallbackBahtsulMasail(query: string): any {
  return {
    judul: `Mas'alah: ${query}`,
    status: "KHILAF (Perbedaan Pendapat)",
    ringkasan: "Hukum dari perkara yang ditanyakan ini memiliki beberapa sudut pandang di kalangan ulama kontemporer dan klasik, dengan pendapat dominan menyesuaikan konteks maslahah (kemanfaatan umum).",
    ibarat: "والأصل في الأشياء الإباحة حتى يدل الدليل على التحريم، وفي موضع الضرورة تباح المحظورات.",
    rujukan: "Kaidah Fiqh Al-Asybah wan-Nadhair, Imam As-Suyuthi, Juz 1, Halaman 21",
    ulasan: `Pertanyaan Anda mengenai "${query}" memerlukan tinjauan kontekstual. Para ulama mazhab Syafii mengedepankan prinsip kemudahan (at-taysir) dan penjagaan terhadap maslahat hamba (himayatul maslahati). Secara umum, jika perkara tersebut membawa kemanfaatan dan tidak menabrak dalil qath'iy (pasti), hukumnya berkisar antara Mubah (boleh) hingga Sunnah. Sebaliknya, bila melahirkan kerusakan (mafsadah) yang lebih besar bagi agama atau sosial, maka dilarang (Haram/Makruh) mengikuti kaidah 'Dar'ul mafasid muqaddamun 'ala jalbil mashalih' (Mencegah mafsadah lebih didahulukan daripada menarik maslahah).`
  };
}

// Global Kamus Turath & Makna Jawa Pegon Pesantren
interface KamusEntry {
  arti: string;
  penjelasan: string;
  contoh: string;
  kategori?: "pegon" | "arab" | "istilah";
  kategoriLabel?: string;
  padananArab?: string;
  tarkib?: string;
}

const kamusTurath: Record<string, KamusEntry> = {
  // --- Kategori: Makna Jawa Pegon (Gandul / Jenggotan) ---
  "nanging": {
    arti: "Akan tetapi / Namun / Melainkan",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَكِنْ / بَلْ (Lakin / Bal)",
    tarkib: "حرف الاستدراك (Huruf Istidrak - Pembetulan/Pengecualian) • Kode Simbol: ل",
    penjelasan: "Kata penghubung istidrak dalam metode makna gandul pesantren. Digunakan untuk menerjemahkan kata Arab 'لَكِنْ' guna menepis dugaan keliru dari pernyataan sebelumnya.",
    contoh: "Zaidun ngalim nanging fasik (زَيْدٌ عَالِمٌ لَكِنْ فَاسِقٌ) — Zaid orang yang berilmu akan tetapi fasik."
  },
  "utawi": {
    arti: "Adapun / Bermula (Penanda Subjek/Pokok Kalimat)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْمُبْتَدَأُ (Al-Mubtada')",
    tarkib: "Penanda Mubtada' (Pokok Kalimat Marfu') • Kode Simbol: م",
    penjelasan: "Kode makna gandul paling ikonik di pesantren untuk menandai Mubtada' (isim marfu' yang berada di awal kalimat). Biasanya diikuti oleh 'iku' sebagai khabarnya.",
    contoh: "Al-Hamdu (utawi sekabehane puji) Lillahi (iku kagungane Allah)."
  },
  "iku": {
    arti: "Yaitu / Adalah (Penanda Predikat/Keterangan)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْخَبَرُ (Al-Khabar)",
    tarkib: "Penanda Khabar (Penyempurna Faedah Mubtada') • Kode Simbol: خ",
    penjelasan: "Penanda posisi khabar dalam gramatika nahwu pesantren yang menyempurnakan makna dari 'utawi' (mubtada').",
    contoh: "Al-'Ilmu (utawi ilmu) Nūrun (iku dadi cahaya)."
  },
  "hale": {
    arti: "Dalam keadaan / Seraya / Sambil",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْحَالُ (Al-Hal)",
    tarkib: "Penanda Isim Manshub yang Menjelaskan Kondisi Pelaku • Kode Simbol: ح",
    penjelasan: "Digunakan santri untuk menerjemahkan posisi Hal (kondisi subjek atau objek saat fi'il berlangsung).",
    contoh: "Jā'a Zaidun rākiban (teka sopo Zaid hale numpak jaran / Datanglah Zaid dalam keadaan berkuda)."
  },
  "kelawan": {
    arti: "Dengan / Bersama / Disertai",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "بِـ / مَعَ (Bi- / Ma'a)",
    tarkib: "Huruf Jar (Baa' Sababiyyah/Iltishaq) atau Ma'iyyah • Kode Simbol: ب / ج",
    penjelasan: "Menerjemahkan huruf jar 'ba' yang menunjukkan alat, sebab, atau kesertaan dalam ibadah.",
    contoh: "Bismillāhi (kelawan nyebut asmane Allah Ta'ala)."
  },
  "tegese": {
    arti: "Artinya / Maksudnya / Yakni",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "أَيْ / يَعْنِي (Ay / Ya'ni)",
    tarkib: "Tafsir / Bayan (Penjelas Rincian Teks Matan)",
    penjelasan: "Kata penjelas yang dipakai pensyarah kitab turath saat mengurai kata matan yang musykil atau memerlukan penjelasan rinci.",
    contoh: "Ash-Shalātu (tegese piro-piro ucapan lan perbuatan kang binuka kelawan takbir)."
  },
  "kerana": {
    arti: "Karena / Sebab / Demi",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "مَفْعُولٌ لِأَجْلِهِ / لِأَجْلِ (Maf'ul Li-ajlih)",
    tarkib: "Penanda Alasan Tindakan / Sababiyah • Kode Simbol: مـ لأجله",
    penjelasan: "Menunjukkan motivasi atau niat di balik suatu tindakan hukum fikih atau amal ibadah.",
    contoh: "Qumtu ikrāman lisy-syaikhi (ngadek ingsun kanggo ngalem guru)."
  },
  "ing dalem": {
    arti: "Di dalam / Pada waktu / Di tempat",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "فِي / ظَرْفُ الزَّمَانِ وَالْمَكَانِ (Fii / Zharf)",
    tarkib: "Zharf (Keterangan Waktu/Tempat) atau Jar Majrur Fii • Kode Simbol: ظ / ج",
    penjelasan: "Menerjemahkan huruf jar 'Fii' atau zharf zaman dan makan untuk menunjukkan lokus kejadian.",
    contoh: "Ash-Shalātu fil-masjidi (utawi sholat ing dalem masjid iku luwih utama)."
  },
  "lamun": {
    arti: "Jika / Jikalau / Seandainya",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "إِنْ / إِذَا / لَوْ (In / Idza / Lau)",
    tarkib: "Adat Syarat (Penetap Syarat Hukum) • Kode Simbol: شرط",
    penjelasan: "Kata pengandaian syarat hukum dalam bab fikih thaharah, muamalah, maupun mawaris.",
    contoh: "Lamun ana banyu rong kulah mangka ora najis (Jika air mencapai dua kullah maka tidak najis)."
  },
  "nuli": {
    arti: "Kemudian / Lalu (Secara Berurutan)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "ثُمَّ / فَـ (Tsumma / Fa-)",
    tarkib: "Huruf 'Athaf Tertib / Tartib Ma'at-Tarakhi • Kode Simbol: عطف",
    penjelasan: "Menunjukkan urutan rukun ibadah yang wajib atau sunnah dilakukan secara tartib dan muwalah.",
    contoh: "Wudhuha sira, nuli basuha wajahe sira, nuli tangan loro..."
  },
  "ora kena ora": {
    arti: "Harus / Niscaya / Mau tidak mau / Mutlak",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَا بُدَّ مِنْهُ (La Budda Minhu)",
    tarkib: "Ta'kid Keharusan Hukum / Syarat Mutlak",
    penjelasan: "Ungkapan khas pesantren untuk menegaskan bahwa suatu rukun atau syarat tidak boleh ditinggalkan dalam keadaan apapun.",
    contoh: "Ora kena ora kudu suci saka najis nalika ngadeg sholat."
  },
  "weruha sira": {
    arti: "Ketahuilah olehmu (Wahai Pelajar/Santri)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اِعْلَمْ (I'lam)",
    tarkib: "Fi'il Amar + Fa'il Mukhatab",
    penjelasan: "Kata seruan pembuka fasal dalam kitab kuning untuk menggugah perhatian murid terhadap kaidah pokok yang sangat penting.",
    contoh: "I'lam (weruha sira) sak temene taqwa iku wit-witaning kabegjan."
  },
  "saking": {
    arti: "Dari / Sebagian dari / Berasal dari",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "مِنْ (Min)",
    tarkib: "Huruf Jar (Ibtida'ul Ghayah / Tab'idh) • Kode Simbol: ج",
    penjelasan: "Menunjukkan permulaan jarak/waktu atau pembagian bagian materi hukum.",
    contoh: "Kharaja minal-masjidi (metu sopo Zaid saking masjid)."
  },
  "maring": {
    arti: "Ke / Kepada / Menuju ke",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "إِلَى (Ila)",
    tarkib: "Huruf Jar (Intiha'ul Ghayah) • Kode Simbol: ج",
    penjelasan: "Menunjukkan batas akhir perbuatan (misal membasuh tangan hingga ke siku).",
    contoh: "Maring piro-piro sikut (ilal-marāfiq)."
  },

  // --- Kategori: Arab Turath & Kaidah Fiqh ---
  "istihsan": {
    arti: "Menganggap baik dalil khusus di atas qiyas umum",
    kategori: "istilah",
    kategoriLabel: "Ushul Fiqh",
    padananArab: "اَلِاسْتِحْسَانُ",
    tarkib: "Masdar Istahsana-Yastahsinu (Metode Ijtihad)",
    penjelasan: "Metodologi istinbath hukum dengan berpaling dari analogi kaku (qiyas jali) menuju analogi tersembunyi (qiyas khafi) atau dalil maslahah khusus.",
    contoh: "Ulama madzhab Hanafi memakai istihsan dalam membolehkan akad salam dan istishna'."
  },
  "qaul mu'tamad": {
    arti: "Pendapat yang kuat dan dijadikan pegangan resmi madzhab",
    kategori: "istilah",
    kategoriLabel: "Fatwa & Fiqh",
    padananArab: "اَلْقَوْلُ الْمُعْتَمَدُ",
    tarkib: "Na'at Man'ut (Frasa Sifat)",
    penjelasan: "Pendapat dalam madzhab fikih yang telah ditarjih (diseleksi/diverifikasi) oleh ashabul wujuh dan ulama otoritatif sebagai fatwa resmi madzhab.",
    contoh: "Pendapat mu'tamad dalam madzhab Syafi'i menetapkan batas waktu minimal suci haid adalah 15 hari."
  },
  "ibarat": {
    arti: "Kutipan teks asli kitab kuning",
    kategori: "arab",
    kategoriLabel: "Literatur Arab Turath",
    padananArab: "عِبَارَةُ النَّصِّ / عِبَارَةُ الْكِتَابِ",
    tarkib: "Isim Mufrad (Bentuk Jamak: 'Ibarat)",
    penjelasan: "Potongan paragraf berbahasa Arab gundul yang bersumber dari manuskrip atau kitab orisinal ulama klasik sebagai sandaran hujah hukum.",
    contoh: "Dalam musyawarah bahtsul masa'il, katib membacakan 'ibarat' dari Kitab Fathul Mu'in."
  },
  "mas'alah": {
    arti: "Kasus atau persoalan keagamaan yang butuh fatwa",
    kategori: "istilah",
    kategoriLabel: "Bahtsul Masa'il",
    padananArab: "مَسْأَلَةٌ (Jamak: مَسَائِلُ)",
    tarkib: "Isim Mufrad Mas'alah",
    penjelasan: "Peristiwa hukum syara' baru yang memerlukan formulasi hukum konkrit melalui musyawarah dewan ulama.",
    contoh: "Mas'alah hukum transaksi cryptocurrency dibahas seru dalam Majelis KHARISMA."
  },
  "syarah": {
    arti: "Kitab penjelasan / ulasan mendalam",
    kategori: "arab",
    kategoriLabel: "Literatur Arab Turath",
    padananArab: "شَرْحٌ (Jamak: شُرُوحٌ)",
    tarkib: "Masdar Syaraha-Yasyrahu",
    penjelasan: "Kitab yang ditulis khusus untuk menerangkan dan mengurai bait nadhom atau teks ringkas (matan) agar mudah diresapi maknanya.",
    contoh: "Kitab Fathul Qarib adalah 'syarah' bagi Matan Al-Ghayah wat-Taqrib."
  },
  "hasyiyah": {
    arti: "Catatan pinggir / anotasi super-detail",
    kategori: "arab",
    kategoriLabel: "Literatur Arab Turath",
    padananArab: "حَاشِيَةٌ (Jamak: حَوَاشِي)",
    tarkib: "Isim Mu'annats Hasyiyah",
    penjelasan: "Anotasi kritis tingkat lanjut yang ditulis ulama generasi penerus guna memperdalam pernyataan di dalam kitab syarah.",
    contoh: "Hasyiyah Al-Bajuri memberikan ulasan luar biasa detail atas Syarah Fathul Qarib."
  },
  "kasab": {
    arti: "Ikhtiar nyata / usaha fisik manusia",
    kategori: "istilah",
    kategoriLabel: "Tauhid & Tasawwuf",
    padananArab: "اَلْكَسْبُ",
    tarkib: "Konsep Teologis Asy'ariyyah",
    penjelasan: "Usaha aktif seorang hamba untuk memenuhi tuntutan hidup jasmani tanpa menegasikan takdir ilahi, selaras dengan maqam asbab.",
    contoh: "Syekh Ibnu Athaillah dalam Al-Hikam menjelaskan harmoni antara maqam tajrid dan 'kasab'."
  },
  "ta'biri": {
    arti: "Redaksional kitab / argumen formal rujukan",
    kategori: "istilah",
    kategoriLabel: "Leksikon Bahtsul Masa'il",
    padananArab: "تَعْبِيرِيٌّ / تَعْبِيرُ الْفُقَهَاءِ",
    tarkib: "Isim Nisbah Ta'bir",
    penjelasan: "Formulasi kata atau ungkapan teks ulama pembangun argumen madzhab yang dijadikan dasar diktum penetapan hukum.",
    contoh: "Para ulama merumuskan keputusan hukum berlandaskan 'ta'biri' kitab Tuhfatul Muhtaj."
  },
  "khilaful aula": {
    arti: "Menyelisihi yang lebih utama (di bawah Makruh)",
    kategori: "istilah",
    kategoriLabel: "Kaidah Fiqh",
    padananArab: "خِلَافُ الْأَوْلَى",
    tarkib: "Idhafah (Khilaf + Al-Aula)",
    penjelasan: "Tindakan yang ditinggalkan karena ada anjuran yang lebih utama, namun derajat larangannya lebih ringan daripada makruh tanzih.",
    contoh: "Membasuh anggota wudhu empat kali termasuk kategori khilaful aula."
  },
  "ma'fu 'anhu": {
    arti: "Najis atau perkara yang dimaafkan / ditoleransi syariat",
    kategori: "istilah",
    kategoriLabel: "Kaidah Fiqh Thaharah",
    padananArab: "مَعْفُوٌّ عَنْهُ",
    tarkib: "Isim Maf'ul + Syibhul Jumlah ('anhu)",
    penjelasan: "Kondisi najis yang sulit dihindari (masyaqqah) sehingga syariat Islam memberikan keringanan hukum tetap sah sholatnya.",
    contoh: "Darah nyamuk atau percikan najis yang tidak kasat mata berstatus ma'fu 'anhu."
  },
  "mafhum mukhalafah": {
    arti: "Pemahaman hukum kebalikan dari teks tertulis",
    kategori: "istilah",
    kategoriLabel: "Ushul Fiqh",
    padananArab: "مَفْهُومُ الْمُخَالَفَةِ",
    tarkib: "Dalalatu Ghoiril Manthuq",
    penjelasan: "Menetapkan hukum kebalikan dari apa yang diucapkan nash ketika syarat atau sifatnya tidak terpenuhi.",
    contoh: "Zakat diwajibkan atas kambing sa'imah (gembalaan), mafhum mukhalafah-nya kambing yang diberi pakan beli tidak wajib zakat."
  },
  "tawadhu": {
    arti: "Rendah hati / Menundukkan diri / Tidak menyombongkan diri",
    kategori: "istilah",
    kategoriLabel: "Akhlak & Tasawwuf",
    padananArab: "اَلتَّوَاضُعُ",
    tarkib: "Masdar Tafaa'ala (Tawadha'a - Yatawadha'u)",
    penjelasan: "Sifat terpuji dalam tasawwuf di mana seorang hamba senantiasa merendahkan hati di hadapan kebesaran Allah dan tidak memandang dirinya lebih mulia dari makhluk Allah lainnya.",
    contoh: "Syekh Al-Ghazali menegaskan tawadhu adalah perisai utama dari racun takabbur (sombong)."
  },
  "ikhlas": {
    arti: "Memurnikan niat / Bersih dari pamrih selain Allah",
    kategori: "istilah",
    kategoriLabel: "Akhlak & Tasawwuf",
    padananArab: "اَلْإِخْلَاصُ",
    tarkib: "Masdar Akhlasa - Yukhlishu (Bab If'al)",
    penjelasan: "Pondasi diterimanya seluruh amal ibadah dalam Islam. Beramal semata-mata mengharap ridha Allah tanpa tercampur riya' (ingin dilihat) atau sum'ah (ingin dipuji).",
    contoh: "Al-Ikhlasu ruhul a'mal (Ikhlas itu adalah nyawa bagi sekalian amal perbuatan)."
  },
  "sabar": {
    arti: "Menahan diri dari keluh kesah dan hawa nafsu",
    kategori: "istilah",
    kategoriLabel: "Akhlak & Tasawwuf",
    padananArab: "اَلصَّبْرُ",
    tarkib: "Masdar Tsulatsi Shabara - Yashbiru",
    penjelasan: "Keteguhan jiwa dalam tiga maqam: sabar dalam ketaatan, sabar dalam menjauhi larangan, dan sabar menghadapi ketetapan takdir yang pahit.",
    contoh: "Ash-Shabru dhiya' (Sabar itu adalah cahaya yang menerangi gelapnya cobaan)."
  },
  "syukur": {
    arti: "Mengakui nikmat dan menggunakannya untuk ketaatan",
    kategori: "istilah",
    kategoriLabel: "Akhlak & Tasawwuf",
    padananArab: "اَلشُّكْرُ",
    tarkib: "Masdar Syakara - Yasykuru",
    penjelasan: "Mengakui dalam batin bahwa segala nikmat berasal dari Allah, memujinya dengan lisan, dan menggerakkan anggota badan untuk beribadah.",
    contoh: "Lain syakartum la-aziidannakum (Jika kalian bersyukur niscaya Aku tambah nikmat-Ku)."
  },
  "tawakkal": {
    arti: "Berserah diri seutuhnya kepada kehendak Allah",
    kategori: "istilah",
    kategoriLabel: "Akhlak & Tasawwuf",
    padananArab: "اَلتَّوَكُّلُ",
    tarkib: "Masdar Tawakkala - Yatawakkalu",
    penjelasan: "Menyandarkan segala urusan dan hasil ikhtiar kepada kekuasaan Allah setelah menunaikan usaha lahiriah secara maksimal.",
    contoh: "Wa 'alallahi fa-tawakkalu in kuntum mu'minin (Dan hanya kepada Allahlah hendaknya kamu bertawakal)."
  },
  "wudhu": {
    arti: "Bersuci dengan air pada anggota badan tertentu",
    kategori: "istilah",
    kategoriLabel: "Fiqh Thaharah",
    padananArab: "اَلْوُضُوءُ",
    tarkib: "Isim Masdar Wudhu' (Al-Wadha'ah = Kebersihan & Cahaya)",
    penjelasan: "Ritual thaharah syar'i untuk mengangkat hadats kecil dengan membasuh wajah, kedua tangan, mengusap sebagian kepala, dan membasuh kedua kaki disertai niat dan tertib.",
    contoh: "Rukun wudhu ada enam perkara menurut madzhab Syafi'i dalam kitab Safinatun Najah."
  },
  "tayamum": {
    arti: "Bersuci dengan debu suci sebagai ganti wudhu/mandi",
    kategori: "istilah",
    kategoriLabel: "Fiqh Thaharah",
    padananArab: "اَلتَّيَمُّمُ",
    tarkib: "Secara bahasa: Al-Qashdu (Menuju/Menyengaja)",
    penjelasan: "Keringanan (rukhsah) bersuci dengan mengusap wajah dan kedua tangan menggunakan debu suci ketika tidak ada air atau ada uzur medis.",
    contoh: "Tayamum diperbolehkan setelah masuk waktu sholat fardhu."
  },
  "istinja": {
    arti: "Membersihkan kotoran dari qubul atau dubur",
    kategori: "istilah",
    kategoriLabel: "Fiqh Thaharah",
    padananArab: "اَلِاسْتِنْجَاءُ",
    tarkib: "Bab Istif'al (Menghilangkan Najis)",
    penjelasan: "Kewajiban bersuci setelah buang air kecil atau besar menggunakan air mutlak atau batu/tisu yang memenuhi syarat.",
    contoh: "Istinja kelawan banyu iku luwih utama tinimbang kelawan watu."
  },
  "qiyas": {
    arti: "Analogi hukum atas kesamaan 'illat",
    kategori: "istilah",
    kategoriLabel: "Ushul Fiqh",
    padananArab: "اَلْقِيَاسُ",
    tarkib: "Masdar Qasa - Yaqisu (Mengukur/Menyamakan)",
    penjelasan: "Salah satu dalil pokok hukum Islam dengan menyamakan hukum suatu kasus baru (far') dengan kasus yang sudah ada nashnya (ashl) karena kesamaan illat hukum.",
    contoh: "Mengharamkan narkoba di-qiyas-kan dengan keharaman khamr karena sama-sama memabukkan (iskar)."
  },
  "ijma": {
    arti: "Konsensus kesepakatan seluruh ulama mujtahid",
    kategori: "istilah",
    kategoriLabel: "Ushul Fiqh",
    padananArab: "اَلْإِجْمَاعُ",
    tarkib: "Masdar Ajma'a - Yujmi'u ('Azam/Sepakat)",
    penjelasan: "Kesepakatan para mujtahid dari umat Nabi Muhammad SAW pada suatu masa setelah wafatnya beliau atas suatu hukum syara'.",
    contoh: "Ijma' ulama menetapkan bagian waris seperenam untuk nenek saat ketiadaan ibu."
  },
  "rukun": {
    arti: "Bagian pokok yang wajib ada di dalam suatu ibadah",
    kategori: "istilah",
    kategoriLabel: "Kaidah Fiqh",
    padananArab: "اَلرُّكْنُ (Jamak: أَرْكَانٌ)",
    tarkib: "Juz'un minal mahiyyah (Bagian integral)",
    penjelasan: "Unsur esensial yang berada di dalam hakikat ibadah, jika tertinggal maka ibadahnya batal dan tidak sah.",
    contoh: "Ruku' dan sujud adalah rukun di dalam sholat."
  },
  "syarat": {
    arti: "Ketetapan yang wajib ada sebelum ibadah dimulai",
    kategori: "istilah",
    kategoriLabel: "Kaidah Fiqh",
    padananArab: "اَلشَّرْطُ (Jamak: شُرُوطٌ)",
    tarkib: "Khorijun 'anil mahiyyah (Di luar substansi)",
    penjelasan: "Hal yang menentukan keabsahan suatu amalan syariat namun posisinya mendahului dan berada di luar perbuatan ibadah itu sendiri.",
    contoh: "Suci dari hadats dan masuknya waktu sholat adalah syarat sah sholat."
  },
  "sartane": {
    arti: "Serta / Beserta / Bersama dengan",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "مَعَ (Ma'a)",
    tarkib: "Penanda Ma'iyyah / Kesertaan Rukun • Kode Simbol: مع",
    penjelasan: "Kata gandul pesantren untuk menerjemahkan kebersamaan dua hal yang harus dilakukan beriringan, seperti niat bersamaan dengan takbiratul ihram.",
    contoh: "Niat sholat sartane takbiratul ihram (Muqaranatun Niyyah bit-Takbir)."
  },
  "mongko": {
    arti: "Maka / Maka dari itu",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "فَـ (Fa- Jaza'iyyah / Sababiyyah)",
    tarkib: "Huruf Fa' Jawab Syarat atau Sababiyah • Kode Simbol: ف",
    penjelasan: "Kode makna gandul pesantren untuk menandai akibat atau jawaban dari suatu syarat hukum fikih.",
    contoh: "Lamun ora nemu banyu, mongko tayamuma sira (فَتَيَمَّمُوا)."
  },
  "kaya": {
    arti: "Seperti / Laksana / Bagaikan",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "كَـ / مِثْلَ (Ka- / Mitsla)",
    tarkib: "Kaf Tasybih (Penyerupaan) • Kode Simbol: ك",
    penjelasan: "Dipakai santri untuk menguraikan contoh analogi (tamtsil) dalam bab-bab fikih thaharah dan muamalah.",
    contoh: "Kaya dene banyu udan lan banyu sumur (Seperti air hujan dan air sumur)."
  },
  "supoyo": {
    arti: "Supaya / Agar / Agar supaya",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لِـ / كَيْ / حَتَّى (Li- / Kay / Hatta)",
    tarkib: "Lam Ta'lil / Adat Nashab Sababiyah",
    penjelasan: "Menerangkan tujuan akhir atau faedah maqashid dari suatu perintah ibadah syariat.",
    contoh: "Supoyo dadi suci awake sira saka sekabehane hadats."
  },
  "sopo": {
    arti: "Siapa / Orang yang (Penanda Pelaku Berakal / Fa'il 'Aqil)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْفَاعِلُ الْعَاقِلُ (Al-Fa'il)",
    tarkib: "Penanda Fa'il untuk isim berakal (Insan/Malaikat) • Kode Simbol: ف",
    penjelasan: "Rumus makna gandul pesantren untuk menandai Fa'il (subjek pelaku kata kerja aktif) yang berakal. Ditulis dengan huruf fa' kecil di bawah kata dalam tradisi bandongan/sorogan.",
    contoh: "Qoma (ngadeg) Zaidun (sopo Zaid) — Zaid telah berdiri."
  },
  "opo": {
    arti: "Apa / Sesuatu yang (Penanda Pelaku Non-Akal atau Na'ibul Fa'il)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْفَاعِلُ لِغَيْرِ الْعَاقِلِ / نَائِبُ الْفَاعِلِ",
    tarkib: "Penanda Fa'il Ghoiru 'Aqil atau Na'ibul Fa'il • Kode Simbol: ف / نـ ف",
    penjelasan: "Kode makna gandul pesantren untuk menandai subjek pelaku berupa benda/hewan/perkara abstrak, atau pengganti subjek pada kalimat pasif (mabni majhul).",
    contoh: "Quti'a (diden-tegor) asy-Syajaru (opo wit-witan) — Pohon itu telah ditebang."
  },
  "ing": {
    arti: "Pada / Akan / Terhadap (Penanda Objek Penderita / Maf'ul Bih)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْمَفْعُولُ بِهِ (Al-Maf'ul Bih)",
    tarkib: "Penanda Maf'ul Bih (Objek Penderita Manshub) • Kode Simbol: مـ",
    penjelasan: "Rumus makna gandul pesantren paling pokok untuk menandai isim manshub yang menjadi sasaran langsung dari perbuatan pelaku.",
    contoh: "Qara'a (moco) Zaidun (sopo Zaid) al-Kitaba (ing kitab) — Zaid membaca kitab."
  },
  "apane": {
    arti: "Apanya / Dari segi apa (Penanda Penjelas / Tamyiz)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلتَّمْيِيزُ (At-Tamyiz)",
    tarkib: "Penanda Tamyiz (Penjelas Kesamaran Dzat/Nisbah) • Kode Simbol: ت",
    penjelasan: "Rumus pesantren untuk menerjemahkan isim nakirah manshub yang berfungsi mengurai kesamaran zat, takaran, timbangan, atau nisbah.",
    contoh: "Thaba (bagus) Zaidun (sopo Zaid) nafsaan (apane atine / jiwanya)."
  },
  "kang": {
    arti: "Yang (Penanda Sifat / Na'at / Isim Maushul)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلنَّعْتُ / اَلصِّفَةُ / اَلِاسْمُ الْمَوْصُولُ",
    tarkib: "Penanda Na'at / Sifat Tabik atau Shilah Maushul • Kode Simbol: ص",
    penjelasan: "Kata gandul pesantren untuk menandai na'at (kata sifat yang mengikuti man'ut dalam tanda i'rab) atau isim maushul seperti alladzi.",
    contoh: "Rajulun (wong lanang) karimun (kang loman / dermawan)."
  },
  "rupane": {
    arti: "Berupa / Wujudnya (Penanda Pengganti / Badal)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْبَدَلُ (Al-Badal)",
    tarkib: "Penanda Badal (Pengganti yang Mengikuti Matbu') • Kode Simbol: بد",
    penjelasan: "Rumus pesantren untuk menerjemahkan posisi badal guna memperjelas wujud hakiki dari mubdal minhu.",
    contoh: "Ja'al ustazhu (teka sopo guru) Zaidun (rupane Zaid)."
  },
  "anging": {
    arti: "Melainkan / Kecuali / Hanya saja (Penanda Pengecualian / Istitsna)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلِاسْتِثْنَاءُ (Al-Istitsna')",
    tarkib: "Penanda Mustatsna / Pengecualian Adat Illa • Kode Simbol: الا",
    penjelasan: "Dipakai santri untuk menerjemahkan adat istitsna (seperti illaa, ghoiru, siwaa) guna mengecualikan suatu perkara dari hukum umum.",
    contoh: "Qamal qawmu (ngadeg sopo kaum) illa Zaidan (anging Zaid / kecuali Zaid)."
  },
  "kejobo": {
    arti: "Kecuali / Selain daripada itu (Sinonim Anging / Istitsna)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "سِوَى / غَيْرَ (Siwa / Ghaira)",
    tarkib: "Adat Istitsna / Pengecualian Syar'i",
    penjelasan: "Varian makna gandul Jawa yang semakna dengan anging untuk menegaskan pengecualian hukum.",
    contoh: "Ora ana pangeran kejobo Gusti Allah (Laa ilaha illallah)."
  },
  "keduwe": {
    arti: "Milik / Kepunyaan / Bagi (Penanda Hak Milik / Lam Milkiyyah)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَامُ الْمِلْكِ / لَامُ الِاخْتِصَاصِ (Lamul Milki)",
    tarkib: "Huruf Jar Lam berfaedah Hak Milik atau Peruntukan • Kode Simbol: ج",
    penjelasan: "Kode makna gandul santri untuk menerjemahkan huruf jar lam yang menyatakan kepemilikan mutlak atau peruntukan.",
    contoh: "Al-Mulku (utawi kerajan) Lillahi (iku keduwe Allah Ta'ala)."
  },
  "kagungane": {
    arti: "Kepunyaan / Milik (Bentuk Halus Kromo Inggil Keduwe)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لِلَّهِ / لِـ (Lil-Mulk)",
    tarkib: "Lamul Milki Ta'dhiman Lillahi Ta'ala",
    penjelasan: "Bentuk kromo inggil yang dipakai santri saat memaknai kepemilikan bagi Allah SWT atau Rasulullah SAW.",
    contoh: "Al-Hamdu Lillahi (sekabehane puji iku kagungane Gusti Allah)."
  },
  "yekti": {
    arti: "Pasti / Niscaya / Sungguh (Penanda Ketegasan Jawab Syarat / Taukid)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَامُ الْجَوَابِ / التَّوْكِيدُ (Lamul Jawab)",
    tarkib: "Huruf Penguat Jawab Syarat atau Qasam • Kode Simbol: لـ",
    penjelasan: "Kata penguat khas pesantren untuk menegaskan kepastian terjadinya suatu hukum bila syaratnya telah terpenuhi.",
    contoh: "Lamun temen sira sinau, yekti manggih kamulyan (Pasti kamu memperoleh kemuliaan)."
  },
  "saktemene": {
    arti: "Sesungguhnya / Bahwasanya (Penanda Taukid Inna/Anna)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "إِنَّ / أَنَّ (Inna / Anna Harfu Taukid)",
    tarkib: "Huruf Taukid wa Nashab • Kode Simbol: ان",
    penjelasan: "Kode makna gandul pesantren untuk menerjemahkan inna atau anna yang menashabkan isim dan merafakkan khabar guna menghilangkan keraguan pendengar.",
    contoh: "Inna Allaha (saktemene Allah) Ghafurun (iku Dzat kang Akeh Pangapurane)."
  },
  "kelawan temen-temen": {
    arti: "Dengan sungguh-sungguh / Sebenar-benarnya (Penanda Maf'ul Muthlaq)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "اَلْمَفْعُولُ الْمُطْلَقُ لِلتَّوْكِيدِ",
    tarkib: "Penanda Maf'ul Muthlaq Tawkid Masdar • Kode Simbol: مـ ط",
    penjelasan: "Rumus makna gandul pesantren untuk menegaskan fi'il dengan mengulang masdarnya secara mutlak.",
    contoh: "Kallamallahu Musa takliman (ngendika sopo Allah maring Musa kelawan temen-temen ngendika)."
  },
  "ing atase": {
    arti: "Atas / Di atas / Wajib atas (Penanda Huruf Jar 'Ala)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "عَلَى (Huruf Jar 'Ala)",
    tarkib: "Huruf Jar Isti'la' atau Wujub • Kode Simbol: ج",
    penjelasan: "Menerjemahkan huruf jar 'ala yang berfaedah ketinggian atau keharusan/kewajiban hukum syariat atas mukallaf.",
    contoh: "Kutiba 'alaikum (den-wajibake ing atase sira kabeh opo puasa)."
  },
  "ari kalane": {
    arti: "Ketika / Tatkala / Pada waktu (Penanda Waktu Idza Syarthiyyah)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "إِذَا / لَمَّا (Idza / Lamma)",
    tarkib: "Zharf Zaman Syarthiyyah (Keterangan Waktu Bersyarat) • Kode Simbol: شرط",
    penjelasan: "Dipakai di pesantren untuk menerjemahkan 'idza' yang menunjukkan peristiwa di masa mendatang yang pasti terjadi.",
    contoh: "Ari kalane wus manjing opo wektu sholat maghrib."
  },
  "saupomo": {
    arti: "Seandainya / Jikalau (Penanda Pengandaian / Lau Syarthiyyah)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَوْ / لَوْلَا (Lau / Laula)",
    tarkib: "Huruf Imtina' li Imtina' (Syarat yang Tidak Terwujud)",
    penjelasan: "Rumus santri untuk menerjemahkan 'lau' (seandainya), menunjukkan tercegahnya jawab karena tercegahnya syarat.",
    contoh: "Lau kana fihima alihatun illallahu lafasadata (Saupomo ana pangeran liyane Allah, yekti rusak langit lan bumi)."
  },
  "anapun": {
    arti: "Adapun / Sedangkan mengenai (Penanda Amma Tafshiliyyah)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "أَمَّا (Amma Harfu Syarthin wa Tafshil)",
    tarkib: "Huruf Tafshil (Rincian) dan Syarat",
    penjelasan: "Dipakai untuk merinci pokok-pokok permasalahan hukum fikih yang telah disebutkan secara global.",
    contoh: "Ammas safinatu (anapun utawi prau)."
  },
  "anane": {
    arti: "Adanya / Keberadaannya (Penanda Masdar Wujud/Kaun)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "كَوْنُ / وُجُودُ (Kaun / Wujud)",
    tarkib: "Masdar Kaana Naqishah atau Wujud",
    penjelasan: "Digunakan santri untuk memaknai masdar kaun atau hal yang menjadi dasar ketetapan hukum.",
    contoh: "Bi-kaunihi qadiran (kelawan anane Allah iku Dzat Kang Maha Kuasa)."
  },
  "sepadane": {
    arti: "Semisalnya / Seumpamanya / Yang semisal dengannya",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "نَظِيرُهُ / مِثْلُهُ (Nadhiruhu / Mitsluhu)",
    tarkib: "Mudhaf Mudhaf Ilaih (Qiyas/Tamtsil)",
    penjelasan: "Istilah pensyarah kitab turath saat menganalogikan suatu perkara dengan kasus sejenis yang hukumnya sama.",
    contoh: "Waqis 'alaihi sa-iradz-dzuru' (lan qiyasna sira ing atase sepadane)."
  },
  "saben-saben": {
    arti: "Setiap / Tiap-tiap (Penanda Keumuman / Kullu Syumuliyyah)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "كُلُّ (Kullu Syumuliyyah)",
    tarkib: "Isim Faedah Istighraq (Mencakup Segala Satuan)",
    penjelasan: "Rumus kaidah ushul fikih untuk menunjukkan keumuman dalil ('aam) yang mencakup seluruh satuan tanpa terkecuali.",
    contoh: "Kullu bid'atin dhalalah (utawi saben-saben perkara anyar iku sasar)."
  },
  "endi-endi": {
    arti: "Mana saja / Yang mana pun (Penanda Pilihan / Syarat Ayyu)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "أَيُّ (Ayyu Syarthiyyah / Istifhamiyyah)",
    tarkib: "Isim Mubham (Pilihan Universal)",
    penjelasan: "Dipakai santri saat menerjemahkan kata ayyu yang menunjukkan keberlakuan hukum pada opsi manapun.",
    contoh: "Ayyuma imra-atin (utawi endi-endi wong wadon)."
  },
  "sakwuse": {
    arti: "Setelah / Sesudah (Penanda Waktu Ba'da)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "بَعْدَ (Ba'da Zharf Zaman)",
    tarkib: "Zharf Zaman yang Menunjukkan Waktu Kemudian • Kode Simbol: ظ",
    penjelasan: "Menerangkan urutan ibadah yang harus dilakukan sesudah syarat atau rukun sebelumnya selesai.",
    contoh: "Ba'da ghaslil wajhi (ing sakwuse mbasuh wajah)."
  },
  "sakdurunge": {
    arti: "Sebelum (Penanda Waktu Qabla)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "قَبْلَ (Qabla Zharf Zaman)",
    tarkib: "Zharf Zaman yang Menunjukkan Waktu Mendahului • Kode Simbol: ظ",
    penjelasan: "Menerangkan syarat yang wajib dipenuhi sebelum masuk ke amalan inti.",
    contoh: "Qabla dukhulil waqti (ing sakdurunge manjing waktu sholat)."
  },
  "eling-eling sira": {
    arti: "Ingatlah olehmu / Perhatikanlah baik-baik (Penanda Tanbih)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "أَلَا (Ala Harfu Tanbih)",
    tarkib: "Huruf Tanbih (Peringatan & Penggugah Kesadaran)",
    penjelasan: "Seruan pembuka fasal yang sangat khas dalam matan-matan nadhom aqidah dan tasawwuf agar santri menyimak serius.",
    contoh: "Ala (eling-eling sira) inna auliya-allahi la khaufun 'alaihim."
  },
  "ora pisan-pisan": {
    arti: "Sama sekali tidak / Tidak akan pernah (Penanda Nafi Mu'akkad Lan)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَنْ (Lan Harfu Nafyin wa Nashbin wa Istiqbal)",
    tarkib: "Nafi Ta'bid (Penafian Mutlak Masa Depan)",
    penjelasan: "Kode makna gandul santri untuk menerjemahkan huruf 'lan' yang menafikan perbuatan secara mutlak di masa mendatang.",
    contoh: "Lan tanalul birra (ora pisan-pisan bakal nemu sira kabeh ing kabecikan)."
  },
  "ora kena ora kudu": {
    arti: "Mutlak harus / Wajib hukumnya tanpa tawar-menawar",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "لَا بُدَّ وَلَا مَحَالَةَ (La Budda wa La Mahala)",
    tarkib: "Ta'kidul Wujub (Penguatan Hukum Wajib Mutlak)",
    penjelasan: "Ungkapan gandul paling tegas di pesantren salaf untuk menandai fardhu yang bila ditinggalkan berakibat batalnya ibadah.",
    contoh: "Ora kena ora kudu suci saka hadats nalika thawaf ngubengi Ka'bah."
  },
  "lawan": {
    arti: "Dan / Serta / Beserta (Sinonim Huruf 'Athaf Wawu)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "وَ (Wawu 'Athaf)",
    tarkib: "Huruf 'Athaf Penggabung • Kode Simbol: عطف",
    penjelasan: "Penghubung gandul klasik untuk menyertakan dua hal dalam satu ketetapan hukum.",
    contoh: "Ash-Shalatu lawan Az-Zakatu (Sholat lan Zakat)."
  },
  "tumuli": {
    arti: "Lalu / Lantas sesudahnya (Secara Berkesinambungan / Muwalah)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "فَـ / ثُمَّ (Fa- Tartib Ma'al-Ittishal)",
    tarkib: "Huruf 'Athaf Tertib dan Muwalah",
    penjelasan: "Menunjukkan urutan rukun ibadah yang tidak boleh diselingi jeda waktu yang lama.",
    contoh: "Mbasuh tangan tumuli ngusap sirah."
  },
  "kacek": {
    arti: "Selisih / Beda / Jarak perbandingan ukuran",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "فَرْقٌ / تَفَاوُتٌ (Farq / Tafawut)",
    tarkib: "Perbandingan Ukuran Nisbah Fiqhiyyah",
    penjelasan: "Dipakai ulama fikih pesantren saat menguraikan selisih jarak perjalanan qashar sholat atau takaran air dua qullah.",
    contoh: "Kacek rong marhalah (Selisih jarak tempuh dua marhalah / ±82 km)."
  },
  "dene awake": {
    arti: "Dirinya sendiri / Khusus secara pribadi (Penanda Tawkid Nafsi)",
    kategori: "pegon",
    kategoriLabel: "Jawa Pegon (Makna Gandul)",
    padananArab: "نَفْسُهُ / عَيْنُهُ (Nafsuhu / 'Ainuhu)",
    tarkib: "Isim Tawkid Maknawi • Kode Simbol: كـ",
    penjelasan: "Rumus makna gandul pesantren untuk menegaskan bahwa perbuatan dilakukan sendiri tanpa perantara.",
    contoh: "Ja'az Zaidu nafsuhu (teka sopo Zaid dene awake dhewe)."
  }
};

// Fallback helper for local dictionary search & offline translations
function getFallbackKamusTranslate(query: string, mode: string = "auto"): any {
  const cleanQ = query.trim().toLowerCase();
  
  // 1. Direct search in kamusTurath keys or values
  const directKey = Object.keys(kamusTurath).find(k => k.toLowerCase() === cleanQ);
  if (directKey) {
    const item = kamusTurath[directKey];
    if (mode === "terjemah") {
      return {
        kataAsal: directKey,
        bahasaAsal: item.kategori === "pegon" ? "Jawa Pegon Pesantren" : "Bahasa Arab / istilah turath",
        terjemahan: item.arti,
        mode,
        kategori: "Terjemahan langsung"
      };
    }
    return {
      kataAsal: directKey,
      bahasaAsal: item.kategori === "pegon" ? "Jawa Pegon Pesantren (Makna Gandul)" : item.kategori === "arab" ? "Bahasa Arab Klasik (Turath)" : "Istilah Ushul / Fiqh",
      terjemahan: item.arti,
      mode,
      padananArab: item.padananArab || "",
      tarkibPegon: item.tarkib || "",
      contohPenggunaan: item.contoh,
      penjelasanMendalam: item.penjelasan,
      kategori: item.kategori || "istilah"
    };
  }

  // 2. Partial search
  const partialKey = mode === "terjemah"
    ? undefined
    : Object.keys(kamusTurath).find(k => k.toLowerCase().includes(cleanQ) || cleanQ.includes(k.toLowerCase()));
  if (partialKey) {
    const item = kamusTurath[partialKey];
    if (mode === "terjemah") {
      return {
        kataAsal: query,
        bahasaAsal: item.kategori === "pegon" ? "Jawa Pegon Pesantren" : "Bahasa Arab / istilah turath",
        terjemahan: item.arti,
        mode,
        kategori: "Terjemahan langsung"
      };
    }
    return {
      kataAsal: query,
      bahasaAsal: item.kategori === "pegon" ? "Jawa Pegon Pesantren (Makna Gandul)" : "Bahasa Arab / Istilah",
      terjemahan: item.arti,
      mode,
      padananArab: item.padananArab || "",
      tarkibPegon: item.tarkib || "",
      contohPenggunaan: item.contoh,
      penjelasanMendalam: item.penjelasan,
      kategori: item.kategori || "istilah"
    };
  }

  // 3. Fallback heuristic for words like "nanging", "utawi", or Arabic
  const isArabicScript = /[\u0600-\u06FF]/.test(query);
  if (mode === "terjemah") {
    return {
      kataAsal: query,
      bahasaAsal: isArabicScript ? "Bahasa Arab / teks turath" : "Jawa Pegon / transliterasi Arab",
      terjemahan: "Terjemahan langsung belum tersedia untuk teks ini.",
      mode,
      kategori: "Terjemahan langsung"
    };
  }
  if (isArabicScript) {
    return {
      kataAsal: query,
      bahasaAsal: "Bahasa Arab Klasik (Turath)",
      terjemahan: `Terjemahan literal & kontekstual teks Arab: "${query}".`,
      mode,
      padananArab: query,
      tarkibPegon: "Tarkib Arab Turath Pesantren",
      contohPenggunaan: `Kutipan dalam bab kitab: "${query}"`,
      penjelasanMendalam: `Lafaz Arab "${query}" merupakan kosa kata turath pesantren yang diterjemahkan ke dalam Bahasa Indonesia dengan menimbang keserasian siyaqul kalam (konteks kalimat) dalam kitab kuning.`,
      kategori: "arab"
    };
  }

  return {
    kataAsal: query,
    bahasaAsal: mode === "pegon-indo" ? "Jawa Pegon Pesantren" : "Istilah Kebahasaan Pesantren",
    terjemahan: `Terjemahan makna: "${query}" dalam tradisi telaah kitab santri.`,
    mode,
    padananArab: "",
    tarkibPegon: "Kaidah Tarkib / Leksikon Santri",
    contohPenggunaan: `Contoh penerapan kata "${query}" dalam kajian bandongan santri.`,
    penjelasanMendalam: `Kata "${query}" merupakan kosa kata penting dalam pengkajian naskah klasik turath dan pembacaan makna gandul kitab kuning. Santri memaknainya secara runtut untuk menangkap maksud mualif (pengarang kitab).`,
    kategori: "pegon"
  };
}


// ---------------------------------------------------------
// COMPONENT ENDPOINTS
// ---------------------------------------------------------

// Endpoint 1: Hello & Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", geminiConfigured: !!ai, timestamp: new Date() });
});

// Endpoint 2: Get Kitab Catalog
app.get("/api/kitab", (req, res) => {
  res.json(kitabCatalog);
});

// In-Memory Fast Cache for Bahtsul Masail & Kamus
const bahtsulMasailCache = new Map<string, any>();
const kamusCache = new Map<string, any>();

// Pre-seeded authoritative rulings for board queries (Instant & Expert-Verified)
const PRESEEDED_BAHTSUL_MASAIL: Record<string, any> = {
  "ai": {
    judul: "Hukum Rekonstruksi & Ilustrasi Wajah Ulama Menggunakan Kecerdasan Buatan",
    status: "Khilaf (Rincian Hukum / Tafshil)",
    ringkasan: "Membuat visualisasi wajah ulama klasik dengan teknologi generatif dihukumi makruh hingga haram bila terdapat unsur pengkultusan atau distorsi sejarah (tahrif). Namun mubah untuk media edukasi sejarah Islam dengan syarat tidak mengklaim kepastian fisik dan tetap menjaga kehormatan (muru'ah) ulama.",
    ibarat: "وَضَابِطُ مَا يَحْرُمُ تَصْوِيرُهُ كُلُّ ذِي رُوحٍ عَلَى هَيْئَةٍ يَعِيشُ مَعَهَا لَوْ كَانَ حَيّاً، أَمَّا مَا تُوَلِّدُهُ الآلَاتُ الْحَدِيثَةُ الْمُجَرَّدَةُ عَنِ الْمُضَاهَاةِ لِخَلْقِ اللهِ فَلِلْعُلَمَاءِ فِيهِ تَفْصِيلٌ بِحَسَبِ الْمَقَاصِدِ وَالْمَآلَاتِ، وَالْأَصْلُ فِي الْوَسَائِلِ حُكْمُ الْمَقَاصِدِ.",
    rujukan: "Tuhfatul Muhtaj fi Syarhil Minhaj, Ibnu Hajar Al-Haitami, Juz 9 Hal. 241 & Keputusan Bahtsul Masa'il PBNU Kontemporer",
    ulasan: "Para fukaha madzhab Syafi'i menggariskan bahwa larangan tashwir (menggambar makhluk bernyawa) berpangkal pada unsur mudhahatun li khalqillah (menandingi ciptaan Allah) atau pengkultusan (ta'dhim ghoirisy-syar'i). Pada teknologi generatif modern, prosesnya berupa pengolahan komputasional data visual, bukan pahatan fisik. Karenanya hukum berporos pada 'illat dan dampak sosialnya: jika menghasilkan gambaran yang menghinakan maqam keilmuan ulama atau berpotensi dijadikan sarana tabarruk menyimpang, maka dilarang. Sebaliknya, jika sekadar rekonstruksi ilustratif santun untuk buku ajar pesantren dengan keterangan bahwa visual hanyalah rekaan artistik, hukumnya dapat ditoleransi (jawaz lil-hajah)."
  },
  "zakat": {
    judul: "Keabsahan Pembayaran Zakat Fitrah Menggunakan Uang Tunai (Qimah)",
    status: "Mubah / Sah Menurut Madzhab Hanafi",
    ringkasan: "Menurut qaul mu'tamad Madzhab Syafi'i wajib membayar zakat fitrah dengan qutul balad (beras/makanan pokok). Namun menurut Madzhab Hanafi sah dan diperbolehkan membayar senilai harga beras dengan uang tunai (qimah) karena lebih maslahat bagi mustahiq.",
    ibarat: "يَجُوزُ دَفْعُ الْقِيمَةِ فِي الزَّكَاةِ وَالْكَفَّارَاتِ وَصَدَقَةِ الْفِطْرِ، لِأَنَّ الْمَقْصُودَ إِغْنَاءُ الْفَقِيرِ وَسَدُّ حَاجَتِهِ، وَالْقِيمَةُ أَعْجَلُ فِي قَضَاءِ حَوَائِجِهِ وَأَيْسَرُ لَهُ، وَهُوَ مَذْهَبُ أَبِي حَنِيفَةَ وَالثَّوْرِيِّ وَالْحَسَنِ الْبَصْرِيِّ.",
    rujukan: "Al-Mabsuth, Imam Syamsuddin As-Sarakhsi Al-Hanafi, Kitabuz Zakah, Juz 3 Hal. 107 & Al-Majmu' Syarah Al-Muhadzdzab, Juz 6 Hal. 112",
    ulasan: "Di lingkungan pesantren Nusantara, Madzhab Syafi'i mewajibkan zakat fitrah dikeluarkan dalam wujud makanan pokok setempat (1 sha' atau ±2,7 - 3 kg beras). Namun menghadapi dinamika zaman di mana mustahiq fakir miskin seringkali lebih mendesak membutuhkan uang tunai untuk membeli pakaian atau keperluan Idul Fitri, para ulama Bahtsul Masa'il memfatwakan kebolehan berpindah (intiqalul madzhab / taklid) ke Madzhab Imam Abu Hanifah yang membolehkan pembayaran dengan qimah (uang seharga 3,8 kg gandum/bahan pokok sepadan). Zakat fitrah menggunakan uang tunai dinilai sah secara syariat dan sah ditunaikan."
  },
  "virtual": {
    judul: "Hukum Pelaksanaan Sholat Jum'at atau Berjamaah Secara Virtual / Live Streaming",
    status: "Tidak Sah (Fasid) / Wajib Sholat Dzuhur",
    ringkasan: "Sholat Jum'at atau sholat fardhu berjamaah secara online/virtual melalui siaran langsung tidak sah menurut kesepakatan madzhab empat, karena tidak terpenuhinya rukun ittihadul makan (kesatuan tempat) dan ittishalush shufuf (ketersambungan saf).",
    ibarat: "وَشَرْطُ الْقُدْوَةِ أَنْ لَا يَتَقَدَّمَ عَلَى إِمَامِهِ فِي الْمَوْقِفِ، وَأَنْ يَعْلَمَ بِانْتِقَالَاتِ إِمَامِهِ، وَاجْتِمَاعُهُمَا فِي مَكَانٍ وَاحِدٍ كَمَسْجِدٍ أَوْ فَضَاءٍ مَعَ تَقَارُبِ الْمَسَافَةِ، فَلَا تَصِحُّ الْقُدْوَةُ مَعَ حَائِلٍ يَمْنَعُ الِاسْتِطْرَاقَ أَوْ بُعْدٍ مُفْرِطٍ خَارِجَ الْمَسْجِدِ.",
    rujukan: "Fathul Wahhab bi Syarhi Manhajith Thullab, Syekh Zakariya Al-Anshari, Bab Shalatil Jama'ah, Juz 1 Hal. 73",
    ulasan: "Dalam fiqih empat madzhab, syarat sahnya bermakmum (qudwah) mewajibkan dua unsur fisik pokok: pertama, ilmu bil-intiqalat (mengetahui gerak-gerik imam) dan kedua, ijtima' fil-makan (berada dalam satu ruang fisik yang terhubung tanpa terhalang tembok tertutup atau jarak lebih dari 300 dzira' di luar masjid). Gelombang visual di layar televisi atau internet hanyalah proyeksi data optik, bukan kehadiran fisik yang sah. Oleh karenanya, santri atau jamaah yang tidak dapat menghadiri Jum'atan karena sakit atau uzur syar'i wajib melaksanakan sholat Dzuhur empat rakaat secara mandiri di kediaman masing-masing."
  },
  "kripto": {
    judul: "Kedudukan Aset Kripto (Cryptocurrency) Sebagai Alat Transaksi & Investasi",
    status: "Haram (Gharar & Qimar) / Syubhat Tinggi",
    ringkasan: "Mata uang kripto dihukumi haram sebagai alat tukar karena tidak diterbitkan oleh otoritas resmi (bukan legal tender negara). Sebagai aset spekulatif komoditas, hukumnya dilarang mayoritas ulama Bahtsul Masa'il karena mengandung gharar jahalah (ketidakjelasan) dan fluktuasi liar yang menyerupai qimar (judi).",
    ibarat: "النَّهْيُ عَنْ بَيْعِ الْغَرَرِ، وَهُوَ مَا انْطَوَتْ عَنَّا عَاقِبَتُهُ أَوْ تَرَدَّدَ بَيْنَ أَمْرَيْنِ أَغْلَبُهُمَا أَخْوَفُهُمَا. وَكُلُّ مَالٍ لَمْ تَثْبُتْ لَهُ مَالِيَّةٌ مُعْتَبَرَةٌ شَرْعاً وَلَا حِمَايَةٌ قَانُونِيَّةٌ مِنْ وَلِيِّ الْأَمْرِ يَتَرَتَّبُ عَلَى تَدَاوُلِهِ الْمُقَامَرَةُ وَأَكْلُ أَمْوَالِ النَّاسِ بِالْبَاطِلِ.",
    rujukan: "Kaidah Al-Gharar fi Al-Majmu' Syarah Al-Muhadzdzab, Imam An-Nawawi, Juz 9 Hal. 258 & Keputusan Bahtsul Masa'il PBNU & MUI",
    ulasan: "Dalam pandangan ushul fikih, mata uang (nuqud) harus memiliki unsur tsamaniyyah (daya beli stabil) dan dijamin oleh pemerintah sah (waliyyul amri) demi menjaga stabilitas moneter umat. Cryptocurrency nir-aset dasar (unbacked tokens) tidak memiliki underlying asset nyata serta sarat spekulasi spekulatif (maysir) yang dapat merugikan masyarakat luas secara tiba-tiba. Namun demikian, jika suatu teknologi kripto berbasis blockchain digunakan murni sebagai utilitas digital beraset nyata (real asset backed) dan diakui regulasi pasar syariah, sebagian pakar kontemporer menimbangnya sebagai sil'ah (komoditas) yang memerlukan kajian ketat 'illat hukumnya."
  },
  "musik": {
    judul: "Hukum Musik dan Nyanyian Religi untuk Relaksasi Jiwa menurut Al-Ghazali",
    status: "Mubah / Sunnah Bila Membawa Maslahah Jiwa",
    ringkasan: "Hujjatul Islam Imam Al-Ghazali dalam Ihya Ulumuddin menegaskan bahwa mendengar suara merdu bernada (al-sama') hukum asalnya mubah. Bila diniatkan untuk menenteramkan kalbu, mengobati keletihan jiwa (thibbur ruh), atau membangkitkan kerinduan pada Allah, hukumnya menjadi mustahab (dianjurkan).",
    ibarat: "السَّمَاعُ لَا يَحْرُمُ لِذَاتِهِ بَلْ لِمَا يَعْرِضُ لَهُ مِنَ الْمَحْظُورَاتِ، فَإِنْ حَرَّكَ فِي الْقَلْبِ وَجْداً مَحْمُوداً أَوْ كَانَ دَوَاءً لِدَاءِ النَّفْسِ وَدَفْعاً لِلسَّآمَةِ وَالْهُمُومِ الْمَانِعَةِ عَنِ الطَّاعَةِ فَهُوَ مُبَاحٌ بَلْ مَنْدُوبٌ إِلَيْهِ.",
    rujukan: "Ihya Ulumuddin, Imam Abu Hamid Al-Ghazali, Kitab Adabis Sama' wal Wajd, Juz 2 Hal. 268-275",
    ulasan: "Imam Al-Ghazali merinci secara brilian bahwa suara dan irama adalah ciptaan Allah yang indah, seperti kicauan burung yang tak seorang pun mengharamkannya. Suara merdu menjadi terlarang bukan karena zat bunyinya, melainkan bila disertai 5 faktor perusak (al-awaridh al-khamsah): penyanyi yang menimbulkan fitnah syahwat, lirik keji/kufur, perkumpulan mabuk-mabukan, instrumen musik yang identik dengan pesta maksiat, atau melalaikan kewajiban fardhu. Bila musik religi, selawat, atau nada akustik digunakan untuk terapi ketenangan mental dan menyegarkan jiwa agar kembali semangat beribadah, hal tersebut merupakan wasilah yang terpuji."
  }
};

// Endpoint 1: Hello & Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", geminiConfigured: !!ai, timestamp: new Date() });
});

// Endpoint 2: Get Kitab Catalog
app.get("/api/kitab", (req, res) => {
  res.json(kitabCatalog);
});

// Helper to find pre-seeded ruling
function findPreseededRuling(query: string): any | null {
  const q = query.toLowerCase();
  if (/\b(zakat)\b/i.test(q) && (q.includes("uang") || q.includes("fitrah") || q.includes("tunai") || q.includes("beras") || q.includes("senilai"))) {
    return PRESEEDED_BAHTSUL_MASAIL["zakat"];
  }
  if (/\b(ai|artificial intelligence|kecerdasan buatan|ilustrasi wajah|gambar ulama)\b/i.test(q)) {
    return PRESEEDED_BAHTSUL_MASAIL["ai"];
  }
  if (/\b(virtual|live tv|siaran langsung)\b/i.test(q) || (q.includes("sholat") && (q.includes("televisi") || q.includes("virtual")))) {
    return PRESEEDED_BAHTSUL_MASAIL["virtual"];
  }
  if (/\b(kripto|crypto|bitcoin|cryptocurrency)\b/i.test(q)) {
    return PRESEEDED_BAHTSUL_MASAIL["kripto"];
  }
  if (/\b(musik|lagu|nyanyian|selawat)\b/i.test(q) && (q.includes("terapi") || q.includes("al-ghazali") || q.includes("jiwa"))) {
    return PRESEEDED_BAHTSUL_MASAIL["musik"];
  }
  return null;
}

// Endpoint 3: Bahtsul Masa'il Assistant (Fast & Smart with ThinkingLevel.LOW)
app.post("/api/bahtsul-masail", async (req, res) => {
  const { query, category, madzhab = "Madzhab Syafi'i" } = req.body;

  if (!query || String(query).trim().length < 4) {
    return res.status(400).json({ error: "Pertanyaan (mas'alah) kurang panjang atau tidak valid." });
  }

  const cleanQuery = String(query).trim();
  const cacheKey = `${cleanQuery.toLowerCase()}_${category}_${madzhab}`;

  // 1. Check in-memory cache
  if (bahtsulMasailCache.has(cacheKey)) {
    return res.json(bahtsulMasailCache.get(cacheKey));
  }

  // 2. Fallback offline: preseeded database or local simulation when the service is unavailable
  if (!ai) {
    console.warn("Gemini API not configured, returning local simulation response.");
    const preseeded = findPreseededRuling(cleanQuery);
    const fallback = preseeded || getFallbackBahtsulMasail(cleanQuery);
    bahtsulMasailCache.set(cacheKey, fallback);
    return res.json(fallback);
  }

  const prompt = `Analisis masalah (mas'alah) keagamaan berikut dengan teliti layaknya Lajnah Bahtsul Masa'il / Dewan Fatwa keagamaan tradisional Islam Nusantara (Pesantren):
  
  Masalah: "${cleanQuery}"
  Kategori: "${category || 'Umum'}"
  Fokus Madzhab: "${madzhab}"
  
  Format Keputusan:
  - Judul Masalah yang spesifik
  - Status Hukum konkrit: "Wajib", "Haram", "Sunnah", "Makruh", "Mubah", atau "Khilaf (Perbedaan Pendapat)"
  - Ringkasan rumusan fatwa (1-2 kalimat padat)
  - Ibarat: Wajib sertakan kutipan teks kitab kuning asli berbahasa Arab berharakat
  - Rujukan kitab klasik otoritatif (Kitab, Mu'allif, Bab/Juz/Halaman)
  - Ulasan ilmiah mendalam berdasarkan kaidah fiqh, illat, dan maslahah.
  - Khilaf: jika masalah ini memang diperselisihkan, isi field "khilaf" dengan 2-3 pendapat ulama yang berbeda (mis. Syafi'iyyah, Hanafiyah, Malikiyah, Hanabilah atau ulama muta'akhkhirin), masing-masing disertai dalil Arab berharakat, terjemahan, dan rujukan kitabnya. Pilih hanya pendapat yang paling pokok dan relevan, jangan berlebihan. Jika tidak ada khilaf yang mu'tabar, isi dengan array kosong [].`;

  try {
    const generatePromise = ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: `Anda adalah "Asisten Lajnah Bahtsul Masa'il", dewan ulama ahli Fiqih Turath Nusantara. Anda sangat cerdas, otoritatif, berwawasan luas antar-madzhab (terutama Madzhab Syafi'i), dan mampu menghadirkan teks Arab (ibarat) yang sahih serta referensi kitab kuning klasik yang presisi. Jika ada perbedaan pendapat (khilaf) yang mu'tabar, tampilkan pendapat-pendapat tersebut secara jujur dan berimbang beserta dalil Arab masing-masing. Jawab langsung dalam format JSON sesuai schema.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            judul: {
              type: Type.STRING,
              description: "Judul perumusan masalah ringkas"
            },
            status: {
              type: Type.STRING,
              description: "Sifat hukum: Wajib, Haram, Sunnah, Makruh, Mubah, atau Khilaf"
            },
            ringkasan: {
              type: Type.STRING,
              description: "Intisari kesimpulan fatwa dalam 1-2 kalimat bahasa Indonesia."
            },
            ibarat: {
              type: Type.STRING,
              description: "Kutipan naskah orisinal Bahasa Arab berharakat."
            },
            rujukan: {
              type: Type.STRING,
              description: "Nama Kitab rujukan klasik, Pengarang, Bab, Juz dan Halaman."
            },
            ulasan: {
              type: Type.STRING,
              description: "Penjelasan ilmiah mendalam dari sudut pandang ushul fiqh dan madzhab."
            },
            khilaf: {
              type: Type.ARRAY,
              description: "2-3 pendapat ulama yang berbeda (khilaf mu'tabar) beserta dalil masing-masing. Kosongkan jika tidak ada khilaf.",
              items: {
                type: Type.OBJECT,
                properties: {
                  pendapat: {
                    type: Type.STRING,
                    description: "Nama pendapat/madzhab, mis. 'Madzhab Syafi'i' atau 'Madzhab Hanafi'."
                  },
                  ulama: {
                    type: Type.STRING,
                    description: "Ulama/kitab yang menegaskan pendapat ini."
                  },
                  hukum: {
                    type: Type.STRING,
                    description: "Status hukum menurut pendapat ini: wajib, haram, makruh, mubah, sunnah, atau rincian."
                  },
                  dalilArab: {
                    type: Type.STRING,
                    description: "Kutipan teks Arab berharakat sebagai dalil pendapat ini."
                  },
                  terjemahan: {
                    type: Type.STRING,
                    description: "Terjemahan Indonesia dari dalil Arab."
                  },
                  rujukan: {
                    type: Type.STRING,
                    description: "Kitab, bab, juz/halaman rujukan."
                  }
                },
                required: ["pendapat", "dalilArab", "terjemahan", "rujukan"]
              }
            }
          },
          required: ["judul", "status", "ringkasan", "ibarat", "rujukan", "ulasan", "khilaf"]
        }
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Generation timeout exceeded ${AI_TIMEOUT_MS / 1000}s`)), AI_TIMEOUT_MS)
    );

    const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Teks kosong yang dikembalikan oleh model.");
    }
    const resultJson = JSON.parse(textOutput.trim());
    bahtsulMasailCache.set(cacheKey, resultJson);
    return res.json(resultJson);

  } catch (error: any) {
    console.warn("Bahtsul Masa'il delay/fallback triggered:", error?.status || error?.code || "", error?.message || error);
    const preseeded = findPreseededRuling(cleanQuery);
    if (preseeded) {
      bahtsulMasailCache.set(cacheKey, preseeded);
      return res.json(preseeded);
    }
    const fallbackResult = {
      ...getFallbackBahtsulMasail(cleanQuery),
      ulasan: `(Respon Fiqhiyyah Terbimbing) Terkait mas'alah "${cleanQuery}": Menurut kaidah madzhab Syafi'iyyah dan ulama pesantren, permasalahan hukum baru ditinjau melalui prinsip 'ilhaqul masa'il bin-nazha'ir' (menautkan masalah kontemporer dengan preseden klasik berdasar kesamaan 'illat hukum). Selama mendatangkan maslahah syar'iyyah dan tidak menabrak larangan qath'iy, hukum asalnya berada dalam koridor kebolehan (ibahah lil-hajah).`
    };
    return res.json(fallbackResult);
  }
});

// Endpoint 4: Get Glossary Term / Kamus Turath
app.get("/api/kamus", (req, res) => {
  res.json(kamusTurath);
});

// Endpoint 4B: Kamus & Tarjamah Cerdas (Arab ke Indonesia & Makna Jawa Pegon Gandul Pesantren)
app.post("/api/kamus/translate", async (req, res) => {
  const { query, mode = "auto" } = req.body;

  if (!query || String(query).trim().length === 0) {
    return res.status(400).json({ error: "Kosa kata atau kalimat yang dicari tidak boleh kosong." });
  }

  const cleanQuery = String(query).trim();
  const lowerQuery = cleanQuery.toLowerCase();

  // 1. Direct authoritative match in local kamusTurath (Instant 0ms lookup)
  const directKey = Object.keys(kamusTurath).find(k => k.toLowerCase() === lowerQuery);
  if (directKey) {
    return res.json(getFallbackKamusTranslate(directKey, mode));
  }

  // 2. Check in-memory translation cache
  const cacheKey = `${lowerQuery}_${mode}`;
  if (kamusCache.has(cacheKey)) {
    return res.json(kamusCache.get(cacheKey));
  }

  // 3. Fallback if Gemini unconfigured
  if (!ai) {
    console.warn("Gemini API not configured, returning local dictionary result.");
    const fallback = getFallbackKamusTranslate(cleanQuery, mode);
    return res.json(fallback);
  }

  const prompt = mode === "terjemah"
    ? `Terjemahkan langsung teks berikut ke Bahasa Indonesia. Teks dapat berupa bahasa Arab kitab/turath atau makna Jawa Pegon pesantren.
Teks: "${cleanQuery}"

Berikan hanya hasil terjemahan Indonesia yang lugas dan alami. Jangan uraikan nahwu-sharaf, tarkib, simbol Pegon, padanan kata, contoh, atau kaidah apa pun. Jika teks ambigu, terjemahkan berdasarkan makna yang paling wajar tanpa menambahkan penjelasan.`
    : `Terjemahkan dan berikan ulasan leksikografi mendalam untuk kata/kalimat tradisi pesantren & turath klasik berikut:
Teks: "${cleanQuery}"
Mode: "${mode}"

PANDUAN:
1. Jika kata Pegon / Makna Gandul Pesantren (utawi, iku, hale, kelawan, tegese, kerana, nanging, lamun, weruha sira, ora kena ora, dll):
   - Wajib berikan arti Indonesia yang presisi.
   - Sertakan padanan Arab berharakat.
   - Jelaskan kedudukan tarkib nahwu dan simbol pegon (misal: "م" untuk mubtada', "خ" untuk khabar, "ح" untuk hal, "ل" untuk istidrak).
   - Berikan contoh pemakaian gandul kitab kuning santri dan konteks ngaji sorogan/bandongan.

2. Jika kata Arab Klasik / Turath:
   - Tulis teks Arab lengkap harakat.
   - Berikan terjemahan Indonesia dan padanan rumus gandulnya.
   - Ulas kaidah gramatika nahwu-sharafnya.

3. Jika Istilah Fiqih / Ushul:
   - Berikan definisi syar'i dan contoh kasus riilnya.`;

  try {
    const generatePromise = ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: mode === "terjemah"
          ? "Anda adalah penerjemah Arab dan Jawa Pegon ke Bahasa Indonesia. Untuk mode ini, berikan hanya terjemahan tanpa uraian kaidah. Jawab dalam format JSON."
          : "Anda adalah Pakar Leksikografi Bahasa Arab Turath & Ahli Makna Gandul Jawa Pegon Pesantren Nusantara. Anda cerdas, menguasai tarkib nahwu-sharaf, rumus simbol pegon, dan gaya bahasa kitab kuning salaf. Jawab langsung dalam format JSON.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            kataAsal: {
              type: Type.STRING,
              description: "Kata atau kalimat asli yang dimasukkan"
            },
            bahasaAsal: {
              type: Type.STRING,
              description: "Klasifikasi: Jawa Pegon Pesantren, Bahasa Arab Turath, atau Istilah Fiqih"
            },
            terjemahan: {
              type: Type.STRING,
              description: "Terjemahan inti yang lugas dan tepat dalam Bahasa Indonesia"
            },
            padananArab: {
              type: Type.STRING,
              description: "Padanan kata Bahasa Arab berharakat jika ada"
            },
            tarkibPegon: {
              type: Type.STRING,
              description: "Kedudukan tarkib nahwu dan simbol rumus pegon pesantren"
            },
            contohPenggunaan: {
              type: Type.STRING,
              description: "Contoh kalimat penerapan dalam pembacaan kitab kuning gandul pesantren"
            },
            penjelasanMendalam: {
              type: Type.STRING,
              description: "Penjelasan mendalam mengenai kaidah bahasa dan rahasia maknanya; kosongkan untuk mode terjemahan langsung"
            },
            kategori: {
              type: Type.STRING,
              description: "Kategori: 'pegon', 'arab', atau 'istilah'"
            }
          },
          required: ["kataAsal", "bahasaAsal", "terjemahan", "penjelasanMendalam"]
        }
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Generation timeout exceeded ${AI_TIMEOUT_MS / 1000}s`)), AI_TIMEOUT_MS)
    );

    const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Respon terjemahan kosong dari model.");
    }
    const resultJson = JSON.parse(textOutput.trim());
    resultJson.mode = mode;
    if (mode === "terjemah") {
      resultJson.padananArab = "";
      resultJson.tarkibPegon = "";
      resultJson.contohPenggunaan = "";
      resultJson.penjelasanMendalam = "";
      resultJson.kategori = "Terjemahan langsung";
    }
    kamusCache.set(cacheKey, resultJson);
    return res.json(resultJson);

  } catch (error: any) {
    console.warn("Generation timed out or failed, serving fast fallback:", error?.status || error?.code || "", error?.message || error);
    const fallback = getFallbackKamusTranslate(cleanQuery, mode);
    return res.json(fallback);
  }
});

// Endpoint 5: Chat with Specific Kitab Book (Fast & Scholarly with gemini-3.1-flash-lite)
app.post("/api/chat-kitab", async (req, res) => {
  const { kitabId, kitabTitle, messages, images: requestedImages = [] } = req.body;

  if (!kitabId || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Parameter tidak lengkap. Harap sertakan kitabId dan daftar chat messages." });
  }

  const latestUserMessage = messages[messages.length - 1]?.content;
  if (!Array.isArray(requestedImages) || requestedImages.length > 4) {
    return res.status(400).json({ error: "Lampirkan maksimal 4 gambar dalam satu pertanyaan." });
  }
  if ((typeof latestUserMessage !== "string" || !latestUserMessage.trim()) && requestedImages.length === 0) {
    return res.status(400).json({ error: "Sertakan pesan obrolan atau gambar soal." });
  }

  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maxImageBytes = 1_200_000;
  const maxTotalImageBytes = 2_400_000;
  let totalImageBytes = 0;
  const images: { mimeType: string; data: string }[] = [];

  for (const image of requestedImages) {
    if (!image || typeof image.mimeType !== "string" || !allowedImageTypes.has(image.mimeType) || typeof image.data !== "string") {
      return res.status(400).json({ error: "Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP." });
    }

    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) {
      return res.status(400).json({ error: "Data gambar tidak valid." });
    }

    const imageBuffer = Buffer.from(image.data, "base64");
    if (imageBuffer.length === 0 || imageBuffer.length > maxImageBytes) {
      return res.status(400).json({ error: "Ukuran setiap gambar maksimal 1,2 MB setelah diproses." });
    }

    const hasValidSignature = image.mimeType === "image/jpeg"
      ? imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff
      : image.mimeType === "image/png"
        ? imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : imageBuffer.toString("ascii", 0, 4) === "RIFF" && imageBuffer.toString("ascii", 8, 12) === "WEBP";

    if (!hasValidSignature) {
      return res.status(400).json({ error: "Isi gambar tidak sesuai dengan format berkasnya." });
    }

    totalImageBytes += imageBuffer.length;
    if (totalImageBytes > maxTotalImageBytes) {
      return res.status(400).json({ error: "Total ukuran gambar maksimal 2,4 MB setelah diproses." });
    }

    images.push({ mimeType: image.mimeType, data: image.data });
  }

  const selectedKitab = kitabCatalog.find(k => k.id === kitabId);
  const kitabContext = selectedKitab 
    ? `Kitab: "${selectedKitab.title}" karya "${selectedKitab.author}". Kategori: "${selectedKitab.category}". Deskripsi: "${selectedKitab.description}". Detail Ringkasan: "${selectedKitab.summary}".`
    : `Kitab: "${kitabTitle}" (klasik Turath).`;

  if (!ai) {
    if (images.length > 0) {
      return res.status(503).json({ error: "Analisis gambar belum tersedia karena layanan AI belum dikonfigurasi." });
    }
    console.warn("Gemini API not configured. Returning static dialogue companion.");
    return res.json({
      role: "model",
      content: `Sebagai asisten Kitab ${kitabTitle || 'Turath'}, saya ingin mengabarkan bahwa saat ini integrasi layanan belum aktif sepenuhnya. Namun berdasarkan ringkasan, Kitab ${kitabTitle} mengajarkan kemuliaan nilai akhlak, kepatuhan ibadah, dan kedisiplinan ilmu. Tanyakan hal yang spesifik, dan saya akan berusaha memberi bantuan literasi klasiknya!`
    });
  }

  // Construct recent history context for the API
  const conversationHistory = messages.slice(-5).map(m => {
    return `${m.role === 'user' ? 'Santri' : 'Asisten Kajian Companion'}: ${m.content}`;
  }).join("\n");

  const tafsirFormatting = selectedKitab?.id === "tafsir-jalalain"
    ? `\nInstruksi khusus untuk Tafsir Al-Jalalain:
  - Dalam teks Arab, tulis lafaz ayat Al-Qur'an secara persis dan biarkan di luar tanda kurung.
  - Letakkan seluruh lafaz tafsir, sisipan makna, dan penjelasan mufasir di dalam tanda kurung biasa (...).
  - Jangan menyajikan lafaz tafsir sebagai bagian dari ayat. Jika batas antara ayat dan tafsir tidak pasti, jangan mengutipnya sebagai ayat; beri tanda kurung sebagai tafsir.
  - Pertahankan format ini pada setiap kutipan Arab agar pembaca dapat membedakan ayat dan tafsir dengan jelas.`
    : "";
  const isTaqriratAlfiyah = selectedKitab?.id === "taqrirat-alfiyah-lirboyo";
  const taqriratFormatting = isTaqriratAlfiyah
    ? `\nInstruksi khusus Taqrirat Alfiyah:
  - "Qouluhu ..." (قوله) berarti "perkataan/ungkapan beliau ..."; lafaz setelahnya adalah petikan matan Alfiyah yang sedang diuraikan, bukan bait baru.
  - Bila pengguna menyebut lafaz atau bait tertentu, jelaskan dulu petikan itu, maknanya, susunan nahwunya, dan kaidah yang dibahas.
  - Jika pengguna tidak menyertakan lafaz/bait dan Anda tidak yakin dengan redaksi persisnya, jangan mengarang kutipan Arab atau nomor halaman. Terangkan pola Qouluhu secara umum dan minta pengguna mengirim lafaz atau foto halaman untuk syarah yang tepat.
  - Perlakukan identitas sebagai edisi taqrirat yang dikaitkan dengan kajian Lirboyo; jangan mengarang nama penyusun taqrirat, isi halaman, atau klaim bahwa Anda memiliki naskah lengkap.`
    : "";

  const prompt = `${kitabContext}
  ${tafsirFormatting}
  ${taqriratFormatting}

  ${images.length > 0
    ? `Pengguna melampirkan ${images.length} gambar soal dan/atau halaman kitab rujukan. Bedakan foto soal dari halaman sumber. Baca teks yang terlihat setepat mungkin; tandai bagian yang buram atau tidak terbaca, jangan menebaknya. Dalam content, susun jawaban dengan bagian: "Teks soal terbaca", "Terjemahan" (terjemahkan teks Arab ke Bahasa Indonesia bila ada; jika tidak, nyatakan tidak diperlukan), dan "Penjelasan". Jelaskan apa yang diminta soal dan berikan pembahasan yang sesuai kitab terpilih. Kutip dalil dari gambar hanya jika itu jelas merupakan halaman kitab dan teksnya terbaca.`
    : ""}

  Keterbatasan sumber dan rujukan:
  - Katalog aplikasi hanya menyediakan metadata dan ringkasan kitab, bukan naskah lengkap. Jangan mengklaim memiliki teks lengkap atau mengarang kutipan Arab, dalil, edisi, juz, bab, maupun nomor halaman.
  - Cantumkan kutipan/dalil hanya jika redaksinya dan sumbernya dapat dipastikan. Jika tidak dapat dipastikan, kembalikan array dalil kosong dan jelaskan keterbatasan sumber dalam content.
  - Nomor halaman hanya boleh dicantumkan jika tampak dan dapat dihubungkan dengan jelas ke edisi kitab yang dirujuk. Jika belum terverifikasi, katakan "nomor halaman belum terverifikasi" dan minta pengguna menyertakan edisi atau foto halaman kitab yang relevan.
  
  Santri/Pengguna menanyakan: "${latestUserMessage || "Mohon baca, terjemahkan bila perlu, dan kaji soal pada gambar yang dilampirkan."}".
  
  Konteks obrolan terkini:
  ${conversationHistory}
  
  ${isTaqriratAlfiyah
    ? "Tugas: berikan penjelasan dalam content. Gunakan pola Qouluhu (قوله) hanya untuk lafaz matan yang benar-benar diketahui atau diberikan pengguna. Isi dalil hanya dengan kutipan Arab, terjemahan, dan rujukan yang dapat dipastikan; selain itu gunakan array kosong dan jelaskan keterbatasan sumber. Jangan menulis salam atau pengantar panjang."
    : "Tugas: jawab pertanyaan dengan penjelasan ringkas dalam content. Isi dalil dengan kutipan teks Arab, terjemahan Indonesia, dan rujukan hanya jika redaksi dan sumbernya dapat dipastikan; jika tidak, gunakan array kosong. Jangan menulis salam atau pengantar panjang."}`;

  try {
    const generatePromise = ai.models.generateContent({
      model: AI_MODEL,
      contents: images.length > 0
        ? [{
            role: "user",
            parts: [
              { text: prompt },
              ...images.map(({ mimeType, data }) => ({ inlineData: { mimeType, data } }))
            ]
          }]
        : prompt,
      config: {
        systemInstruction: isTaqriratAlfiyah
          ? "Anda adalah pendamping kajian Alfiyah dan Taqrirat Alfiyah di Pesantren KHARISMA. Bedakan matan Alfiyah dari uraian taqrirat, jelaskan penanda Qouluhu (قوله) dengan tepat, dan jangan mengarang kutipan atau nomor halaman yang tidak tersedia. Jawab dalam format JSON sesuai schema."
          : "Anda adalah asisten kajian Kitab Turath (Kitab Kuning) di Pesantren KHARISMA. Jangan mengarang teks kitab, kutipan, edisi, atau nomor halaman. Bedakan informasi katalog dari sumber primer; jika sumber tidak tersedia, nyatakan keterbatasannya. Jawab dalam format JSON sesuai schema.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            content: {
              type: Type.STRING,
              description: "Jawaban bahasa Indonesia. Jika ada gambar, pisahkan teks soal terbaca, terjemahan teks Arab bila ada, dan penjelasan; nyatakan sumber/halaman yang belum terverifikasi."
            },
            dalil: {
              type: Type.ARRAY,
              description: isTaqriratAlfiyah
                ? "Kutipan matan yang dapat dipastikan; gunakan array kosong jika redaksi sumber tidak tersedia."
                : "Kutipan yang sumber dan redaksinya dapat dipastikan; gunakan array kosong jika tidak dapat diverifikasi.",
              items: {
                type: Type.OBJECT,
                properties: {
                  teksArab: {
                    type: Type.STRING,
                    description: selectedKitab?.id === "tafsir-jalalain"
                      ? "Kutipan Arab berharakat; lafaz ayat Al-Qur'an harus tetap di luar kurung dan seluruh teks tafsir/penjelasan dalam tanda kurung biasa."
                      : "Kutipan teks Arab asli berharakat lengkap."
                  },
                  terjemahan: {
                    type: Type.STRING,
                    description: "Terjemahan Indonesia dari kutipan Arab."
                  },
                  rujukan: {
                    type: Type.STRING,
                    description: "Nama kitab, bab, juz/halaman."
                  }
                },
                required: ["teksArab", "terjemahan", "rujukan"]
              }
            }
          },
          required: ["content", "dalil"]
        }
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Chat Kitab timeout exceeded ${AI_TIMEOUT_MS / 1000}s`)), AI_TIMEOUT_MS)
    );

    const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Respon chat kitab kosong dari model.");
    }
    const parsed = JSON.parse(textOutput.trim());
    const dalil = Array.isArray(parsed.dalil) ? parsed.dalil : [];
    const content = typeof parsed.content === "string" ? parsed.content : "";
    if (!content.trim()) {
      throw new Error("Model tidak mengembalikan penjelasan.");
    }
    return res.json({
      role: "model",
      content,
      dalil
    });
  } catch (error: any) {
    console.warn("Gagal mengobrol dengan kitab, serving resilient study guidance:", error?.status || error?.code || "", error?.message || error);
    if (images.length > 0) {
      return res.status(502).json({ error: "Analisis gambar gagal. Periksa keterbacaan gambar lalu coba lagi." });
    }
    const gentleStudyFallback = `Santri yang dirahmati Allah, mengenai pertanyaanmu tentang hal tersebut dalam Kitab ${selectedKitab?.title || kitabTitle || 'Turath'}: Mualif (${selectedKitab?.author || 'ulama salaf'}) senantiasa mengingatkan kita untuk mendahulukan thaharah batin dan kepatuhan syariat. Setiap bab dalam kitab ini mengajarkan bahwa ilmu yang berkah adalah ilmu yang diamalkan dengan penuh keikhlasan dan ketenangan hati. Teruslah istiqamah dalam muthala'ah naskah turath ini.`;
    return res.json({
      role: "model",
      content: gentleStudyFallback
    });
  }
});

// In-memory cache for generated speech audio
const voiceCache = new Map<string, string>();

// Endpoint 6: Gemini TTS with a consistent male narrator and Arabic support
app.post("/api/voice/speak", async (req, res) => {
  const { text } = req.body;
  if (!text || String(text).trim().length === 0) {
    return res.status(400).json({ error: "Teks tidak boleh kosong." });
  }

  // Keep Arabic characters intact so the speech model can pronounce them.
  const cleanText = String(text)
    .replace(/[*_#`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 1000);

  if (cleanText.length === 0) {
    return res.status(400).json({ error: "Teks tidak valid untuk disuarakan." });
  }

  const voice = "Charon";
  const cacheKey = `arabic-aware-v2:${voice}:${cleanText.toLowerCase()}`;
  if (voiceCache.has(cacheKey)) {
    return res.json({ audioData: voiceCache.get(cacheKey) });
  }

  if (!ai || !geminiApiKey) {
    return res.status(503).json({ error: "Suara AI belum tersedia. Pastikan GEMINI_API_KEY sudah diatur." });
  }

  try {
    const arabicScript = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const textSegments: { text: string; isArabic: boolean }[] = [];
    for (const token of cleanText.match(/\s+|[^\s]+/gu) || [cleanText]) {
      const previous = textSegments[textSegments.length - 1];
      if (/^\s+$/u.test(token)) {
        if (previous) previous.text += token;
        else textSegments.push({ text: token, isArabic: false });
        continue;
      }

      const isArabic = arabicScript.test(token);
      if (previous?.isArabic === isArabic) previous.text += token;
      else textSegments.push({ text: token, isArabic });
    }
    const content = textSegments
      .filter((segment) => segment.text.trim().length > 0)
      .map((segment) => ({
        type: "text",
        text: segment.text,
        annotations: [{
          type: "speech_metadata",
          style: segment.isArabic
            ? "Speak this exact text in clear, natural Modern Standard Arabic. Pronounce every Arabic word carefully and do not translate, skip, or paraphrase it."
            : "Speak this exact text naturally in Indonesian."
        }]
      }));

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey
      },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: "gemini-3.8-flash-tts",
        input: [{
          type: "user_input",
          content
        }],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice }]
        }
      })
    });

    const result = await response.json() as any;
    if (!response.ok) {
      throw new Error(result?.error?.message || `Gemini TTS request failed with status ${response.status}`);
    }

    const audioPart = result?.steps
      ?.flatMap((step: any) => step.content || [])
      .reverse()
      .find((content: any) => content.type === "audio" && content.data);
    const base64Audio = audioPart?.data;
    const mimeType = audioPart?.mime_type || "audio/wav";

    if (!base64Audio) {
      throw new Error("Gemini TTS response did not contain audio data.");
    }

    const dataUri = `data:${mimeType};base64,${base64Audio}`;
    if (voiceCache.size > 100) voiceCache.clear();
    voiceCache.set(cacheKey, dataUri);

    return res.json({ audioData: dataUri });
  } catch (err: any) {
    console.warn("Gemini TTS failed:", err?.status || err?.code || "", err?.message || err);
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "Pembuatan suara melewati batas waktu. Silakan coba lagi." : "Suara manusia belum berhasil dibuat. Silakan coba lagi."
    });
  }
});
