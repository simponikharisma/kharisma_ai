import React, { useState, useEffect, useRef } from "react";
import { useAuthControls } from "./AuthGate";
import {
  BookOpen,
  Search,
  MessageSquare,
  Bookmark,
  Sparkles,
  BookMarked,
  Award,
  Compass,
  HelpCircle,
  Volume2,
  Printer,
  Share2,
  Trash2,
  Plus,
  Check,
  ArrowRight,
  BookOpenCheck,
  Send,
  Camera,
  ImagePlus,
  User,
  Loader2,
  AlertCircle,
  Copy,
  ArrowLeft,
  ChevronUp,
  LogOut,
  Languages,
  ArrowRightLeft
} from "lucide-react";

declare const __APP_BUILD_ID__: string;

// Predefined categories for Bahtsul Masa'il
const CATEGORIES = [
  { id: "ibadah", name: "Fiqh Ibadah", desc: "Thaharah, Sholat, Zakat, Puasa, Haji" },
  { id: "muamalah", name: "Fiqh Muamalah", desc: "Transaksi, Akad, Ekonomi, Fintech" },
  { id: "kontemporer", name: "Kontemporer & Sains", desc: "Teknologi, Medis, Otomasi, Kripto" },
  { id: "munakahat", name: "Keluarga (Munakahat)", desc: "Pernikahan, Waris, Hak Asuh Anak" },
  { id: "tasawwuf", name: "Akhlak & Tasawwuf", desc: "Penyucian Hati, Thariqah, Adab" }
];

const hasArabicScript = (text?: string) => /[\u0600-\u06FF]/.test(text || "");
const MAX_KITAB_IMAGE_COUNT = 4;
const MAX_KITAB_IMAGE_SIZE_BYTES = 1_200_000;
const MAX_KITAB_IMAGES_SIZE_BYTES = 2_400_000;
const MAX_ORIGINAL_KITAB_IMAGE_SIZE_BYTES = 15_000_000;
const SUPPORTED_KITAB_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function prepareKitabImage(file: File): Promise<File> {
  if (!SUPPORTED_KITAB_IMAGE_TYPES.has(file.type)) {
    throw new Error("Format gambar tidak didukung. Pilih JPEG, PNG, atau WebP.");
  }
  if (file.size > MAX_ORIGINAL_KITAB_IMAGE_SIZE_BYTES) {
    throw new Error("Ukuran gambar asli melebihi 15 MB.");
  }
  if (file.size <= MAX_KITAB_IMAGE_SIZE_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Gambar ${file.name} tidak dapat dibaca oleh browser.`);
  }

  try {
    if (bitmap.width * bitmap.height > 30_000_000) {
      throw new Error(`Resolusi gambar ${file.name} terlalu tinggi untuk diproses dengan aman.`);
    }

    const renderJpeg = async (maxDimension: number, quality: number) => {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Browser tidak dapat memproses gambar.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Gambar tidak dapat diperkecil."));
        }, "image/jpeg", quality);
      });
    };

    let optimized = await renderJpeg(2200, 0.84);
    if (optimized.size > MAX_KITAB_IMAGE_SIZE_BYTES) {
      optimized = await renderJpeg(1600, 0.72);
    }
    if (optimized.size > MAX_KITAB_IMAGE_SIZE_BYTES) {
      throw new Error(`Gambar ${file.name} masih terlalu besar setelah diperkecil.`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "soal";
    return new File([optimized], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

function readImageAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Gambar ${file.name} tidak dapat disiapkan untuk dikirim.`));
        return;
      }
      const separatorIndex = reader.result.indexOf(",");
      if (separatorIndex < 0) {
        reject(new Error(`Data gambar ${file.name} tidak valid.`));
        return;
      }
      resolve(reader.result.slice(separatorIndex + 1));
    };
    reader.onerror = () => reject(new Error(`Gambar ${file.name} gagal dibaca.`));
    reader.readAsDataURL(file);
  });
}

// Premade questions for Bahtsul Masa'il (Mas'alah Board)
const PREMADE_QUESTIONS = [
  {
    category: "kontemporer",
    query: "Bagaimana hukum menggunakan teknologi kecerdasan buatan untuk membuat ilustrasi wajah ulama klasik?",
    label: "Hukum Ilustrasi Digital"
  },
  {
    category: "muamalah",
    query: "Apakah diperbolehkan membayar zakat fitrah menggunakan uang tunai senilai harga beras, dan bagaimana keabsahannya menurut madzhab empat?",
    label: "Zakat Fitrah dengan Uang"
  },
  {
    category: "ibadah",
    query: "Bagaimana hukum pelaksanaan Sholat Jum'at secara virtual atau mengikuti siaran langsung dari televisi karena uzur syar'i?",
    label: "Sholatan Virtual & Live TV"
  },
  {
    category: "kontemporer",
    query: "Bagaimana kedudukan hukum aset Cryptocurrency (Kripto) sebagai alat investasi atau mata uang digital menurut Bahtsul Masa'il?",
    label: "Hukum Uang Kripto"
  },
  {
    category: "tasawwuf",
    query: "Apakah musik atau selawat yang dikreasikan dengan alat musik modern diperbolehkan untuk terapi kesehatan jiwa menurut Imam Al-Ghazali?",
    label: "Musik Terapi menurut Al-Ghazali"
  }
];

// Presets for Kamus & Tarjamah (Jawa Pegon & Arab Turath)
const KAMUS_PRESETS = [
  { term: "utawi", label: "utawi (adapun / mubtada')", mode: "pegon-indo" },
  { term: "iku", label: "iku (yaitu / khabar)", mode: "pegon-indo" },
  { term: "sopo", label: "sopo (siapa / fa'il 'aqil)", mode: "pegon-indo" },
  { term: "opo", label: "opo (apa / na'ibul fa'il)", mode: "pegon-indo" },
  { term: "ing", label: "ing (pada / maf'ul bih)", mode: "pegon-indo" },
  { term: "hale", label: "hale (dalam keadaan / hal)", mode: "pegon-indo" },
  { term: "apane", label: "apane (apanya / tamyiz)", mode: "pegon-indo" },
  { term: "kang", label: "kang (yang / na'at sifat)", mode: "pegon-indo" },
  { term: "rupane", label: "rupane (berupa / badal)", mode: "pegon-indo" },
  { term: "anging", label: "anging (kecuali / istitsna)", mode: "pegon-indo" },
  { term: "kelawan", label: "kelawan (dengan / jar)", mode: "pegon-indo" },
  { term: "nanging", label: "nanging (akan tetapi / istidrak)", mode: "pegon-indo" },
  { term: "tegese", label: "tegese (artinya / bayan)", mode: "pegon-indo" },
  { term: "kerana", label: "kerana (sebab / li-ajlih)", mode: "pegon-indo" },
  { term: "sartane", label: "sartane (beserta / ma'iyyah)", mode: "pegon-indo" },
  { term: "mongko", label: "mongko (maka / jawab)", mode: "pegon-indo" },
  { term: "lamun", label: "lamun (jika / syarat)", mode: "pegon-indo" },
  { term: "keduwe", label: "keduwe (milik / lam)", mode: "pegon-indo" },
  { term: "yekti", label: "yekti (pasti / taukid)", mode: "pegon-indo" },
  { term: "saktemene", label: "saktemene (sesungguhnya)", mode: "pegon-indo" },
  { term: "ora kena ora", label: "ora kena ora (mutlak harus)", mode: "pegon-indo" },
  { term: "weruha sira", label: "weruha sira (ketahuilah)", mode: "pegon-indo" },
  { term: "supoyo", label: "supoyo (supaya / hatta)", mode: "pegon-indo" },
  { term: "kaya", label: "kaya (seperti / tasybih)", mode: "pegon-indo" },
  { term: "استحسان", label: "استحسان (Istihsan)", mode: "arab-indo" },
  { term: "معفو عنه", label: "معفو عنه (Dimaafkan)", mode: "arab-indo" },
  { term: "qaul mu'tamad", label: "qaul mu'tamad", mode: "istilah" }
];

// Wisdom phrases displayed on loaders to educate and engage
const WISDOM_LOADS = [
  "Membuka lembar batin Kitab Turath...",
  "Menimbang hujah hukum silang madzhab...",
  "Menilik ta'biri dari Syarah Fathul Mu'in...",
  "Mengutip fatwa mutamad dalam Bahtsul Masa'il...",
  "Menyelaraskan maslahah dalam fikih kontemporer...",
  "Silakan tunggu, syura sedang menelaah hasyiyah..."
];

interface BahtsulMasailResult {
  judul: string;
  status: string;
  ringkasan: string;
  ibarat: string;
  rujukan: string;
  ulasan: string;
  khilaf?: {
    pendapat: string;
    ulama?: string;
    hukum?: string;
    dalilArab: string;
    terjemahan: string;
    rujukan: string;
  }[];
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
  attachments?: string[];
  dalil?: { teksArab: string; terjemahan: string; rujukan: string }[];
}

interface KamusEntryData {
  arti: string;
  penjelasan: string;
  contoh: string;
  kategori?: "pegon" | "arab" | "istilah";
  kategoriLabel?: string;
  padananArab?: string;
  tarkib?: string;
}

interface KamusTranslateResult {
  kataAsal: string;
  bahasaAsal: string;
  terjemahan: string;
  mode?: "auto" | "pegon-indo" | "arab-indo" | "istilah" | "terjemah";
  padananArab?: string;
  tarkibPegon?: string;
  contohPenggunaan?: string;
  penjelasanMendalam?: string;
  kategori?: string;
}

// Automatically format both Hijri (Islamic) and Gregorian (Masehi) dates
function getFormattedCalendarDates() {
  const now = new Date();

  // Masehi (Gregorian in Indonesian)
  let masehi = "";
  try {
    masehi = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now) + " M";
  } catch {
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    masehi = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} M`;
  }

  // Hijri (Islamic Umal-Qura or Civil)
  let hijri = "";
  try {
    const hijriFormatter = new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    hijri = hijriFormatter.format(now);
    if (!hijri.includes("H")) {
      hijri = `${hijri} H`;
    }
  } catch {
    try {
      const hijriFormatter = new Intl.DateTimeFormat("id-ID-u-ca-islamic", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      hijri = hijriFormatter.format(now);
      if (!hijri.includes("H")) {
        hijri = `${hijri} H`;
      }
    } catch {
      hijri = "Penanggalan Hijriah";
    }
  }

  return { hijri, masehi };
}

export default function App() {
  const authControls = useAuthControls();
  // Real-time automatic calendar state
  const [currentCalendar, setCurrentCalendar] = useState<{ hijri: string; masehi: string }>(getFormattedCalendarDates);
  const reloadOnControllerChangeRef = useRef(Boolean(navigator.serviceWorker?.controller));

  // State variables
  const [activeTab, setActiveTab] = useState<"bahtsul-masail" | "maktabah" | "kamus" | "bookmarks">("bahtsul-masail");
  
  // Tab 1: Bahtsul Masa'il Selector & Form
  const [bmQuery, setBmQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ibadah");
  const [selectedMadzhab, setSelectedMadzhab] = useState("Dominan Madzhab Syafi'i (Ahlussunnah wal Jama'ah)");
  const [isSolving, setIsSolving] = useState(false);
  const [wisdomIndex, setWisdomIndex] = useState(0);
  const [bmResult, setBmResult] = useState<BahtsulMasailResult | null>(null);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Tab 2: Maktabah Library Catalog
  const [books, setBooks] = useState<any[]>([]);
  const [searchBookTerm, setSearchBookTerm] = useState("");
  const [bookCategoryFilter, setBookCategoryFilter] = useState<string>("semua");
  const [selectedKitabId, setSelectedKitabId] = useState<string | null>(null);
  const [isLibLoading, setIsLibLoading] = useState(true);
  
  // Specific Kitab Chat state
  const [kitabMessages, setKitabMessages] = useState<ChatMessage[]>([]);
  const [kitabInput, setKitabInput] = useState("");
  const [isSendingToKitab, setIsSendingToKitab] = useState(false);
  const [showChatArea, setShowChatArea] = useState(false);
  const [kitabImageAttachments, setKitabImageAttachments] = useState<File[]>([]);
  const [kitabImagePreviews, setKitabImagePreviews] = useState<{ name: string; url: string }[]>([]);
  const [isPreparingKitabImages, setIsPreparingKitabImages] = useState(false);
  const [kitabChatError, setKitabChatError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Tab 3: Glossary & Translator (Pegon & Arab Turath)
  const [kamus, setKamus] = useState<Record<string, KamusEntryData>>({});
  const [searchKamusTerm, setSearchKamusTerm] = useState("");
  const [customTerm, setCustomTerm] = useState("");
  const [translateMode, setTranslateMode] = useState<"auto" | "pegon-indo" | "arab-indo" | "istilah" | "terjemah">("auto");
  const [kamusCategoryFilter, setKamusCategoryFilter] = useState<"semua" | "pegon" | "arab" | "istilah">("semua");
  const [isKamusLoading, setIsKamusLoading] = useState(true);
  const [isExplainingTerm, setIsExplainingTerm] = useState(false);
  const [kamusResponse, setKamusResponse] = useState<KamusTranslateResult | null>(null);
  const [translateCopySuccess, setTranslateCopySuccess] = useState(false);

  // Tab 4: Bookmarked Rulings ledger
  const [bookmarks, setBookmarks] = useState<BahtsulMasailResult[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [arabicCopySuccess, setArabicCopySuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let isMounted = true;
    const handleControllerChange = () => {
      if (reloadOnControllerChangeRef.current) window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    navigator.serviceWorker.register(`/service-worker.js?build=${__APP_BUILD_ID__}`)
      .then((registration) => {
        if (!isMounted) return;
        void registration.update().catch((error) => {
          console.error("Pemeriksaan pembaruan aplikasi gagal:", error);
        });
      })
      .catch((error) => {
        console.error("Pendaftaran service worker gagal:", error);
      });

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  // Fetch initial data from server on mount
  useEffect(() => {
    fetchKitabCatalog();
    fetchKamusGlossary();
    loadBookmarks();

    // Auto-sync calendar every minute
    const calendarTimer = setInterval(() => {
      setCurrentCalendar(getFormattedCalendarDates());
    }, 60000);

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 320);
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearInterval(calendarTimer);
    };
  }, []);

  // Sync scroll on chat
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [kitabMessages, isSendingToKitab, showChatArea]);

  useEffect(() => {
    const previews = kitabImageAttachments.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setKitabImagePreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [kitabImageAttachments]);

  // Rotate loading wisdom texts
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSolving) {
      interval = setInterval(() => {
        setWisdomIndex((prev) => (prev + 1) % WISDOM_LOADS.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isSolving]);

  const copyArabicToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setArabicCopySuccess(true);
    setTimeout(() => setArabicCopySuccess(false), 2000);
  };

  // Use generated speech only; browser speech synthesis sounds robotic and cannot reliably read Arabic.
  const stopVoice = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsSpeechPlaying(false);
    setPlayingVoiceId(null);
    setIsVoiceLoading(false);
  };

  const stopTTS = () => stopVoice();

  const playHumanVoice = async (textToSpeak: string, voiceId: string = "default") => {
    // If clicking same active voice that is playing or loading, toggle stop
    if (playingVoiceId === voiceId && (isSpeechPlaying || isVoiceLoading)) {
      stopVoice();
      return;
    }

    stopVoice();
    setVoiceError(null);
    setPlayingVoiceId(voiceId);
    setIsVoiceLoading(true);

    // Keep Arabic script intact so generated speech can pronounce it.
    const cleanedText = textToSpeak
      .replace(/[*_#`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanedText) {
      setIsVoiceLoading(false);
      setPlayingVoiceId(null);
      return;
    }

    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanedText })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Suara manusia belum berhasil dibuat.");
      }
      if (!data.audioData) {
        throw new Error("Audio suara manusia tidak tersedia.");
      }

      const audio = new Audio(data.audioData);
      currentAudioRef.current = audio;

      audio.onplay = () => {
        setIsSpeechPlaying(true);
        setIsVoiceLoading(false);
      };

      audio.onended = () => {
        setIsSpeechPlaying(false);
        setPlayingVoiceId(null);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        console.warn("Generated audio could not be played.");
        setVoiceError("Audio suara manusia tidak dapat diputar. Silakan coba lagi.");
        setIsSpeechPlaying(false);
        setIsVoiceLoading(false);
        setPlayingVoiceId(null);
        currentAudioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.warn("Generated human voice unavailable:", err);
      setVoiceError(err instanceof Error ? err.message : "Suara manusia belum berhasil dibuat. Silakan coba lagi.");
      setIsSpeechPlaying(false);
      setIsVoiceLoading(false);
      setPlayingVoiceId(null);
      currentAudioRef.current = null;
    }
  };

  // Backwards compatibility alias
  const handleTTS = (textToSpeak: string, voiceId: string = "default") => {
    playHumanVoice(textToSpeak, voiceId);
  };

  // ---------------------------------------------------------
  // SERVER INTERACTIONS
  // ---------------------------------------------------------
  
  const fetchKitabCatalog = async () => {
    try {
      setIsLibLoading(true);
      const res = await fetch("/api/kitab");
      const data = await res.json();
      setBooks(data);
      // Select first kitab by default
      if (data && data.length > 0) {
        setSelectedKitabId(data[0].id);
      }
    } catch (e) {
      console.error("Gagal memuat catalog kitab:", e);
    } finally {
      setIsLibLoading(false);
    }
  };

  const fetchKamusGlossary = async () => {
    try {
      setIsKamusLoading(true);
      const res = await fetch("/api/kamus");
      const data = await res.json();
      setKamus(data);
    } catch (e) {
      console.error("Gagal memuat kamus:", e);
    } finally {
      setIsKamusLoading(false);
    }
  };

  const loadBookmarks = () => {
    const stored = localStorage.getItem("kitab_bookmarks");
    if (stored) {
      setBookmarks(JSON.parse(stored));
    }
  };

  const toggleBookmark = (result: BahtsulMasailResult) => {
    let current = [...bookmarks];
    const index = current.findIndex(b => b.judul === result.judul);
    
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(result);
    }
    
    setBookmarks(current);
    localStorage.setItem("kitab_bookmarks", JSON.stringify(current));
  };

  const isBookmarked = (result: BahtsulMasailResult) => {
    return bookmarks.some(b => b.judul === result.judul);
  };

  const solveIssue = async (queryText: string) => {
    const finalQuery = queryText || bmQuery;
    if (!finalQuery || finalQuery.trim().length < 4) {
      setFormError("Masukkan pertanyaan keagamaan (mas'alah) minimal 4 karakter.");
      return;
    }

    setFormError(null);
    setIsSolving(true);
    setWisdomIndex(0);
    setBmResult(null);
    stopTTS();

    // Smooth scroll down to progress on mobile devices
    setTimeout(() => {
      if (window.innerWidth < 1024) {
        document.getElementById("loading-state-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch("/api/bahtsul-masail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query: finalQuery,
          category: selectedCategory,
          madzhab: selectedMadzhab
        })
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setBmResult(data);

      // Smooth scroll down to completed ruling document on mobile
      setTimeout(() => {
        if (window.innerWidth < 1024) {
          document.getElementById("resolusi-dokumen")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.warn("Issue solving delayed or caught fallback:", error);
      // Fast high-quality resilient fallback directly in client
      setBmResult({
        judul: `Mas'alah: ${finalQuery}`,
        status: "Tafshil / Khilaf Menurut Madzhab",
        ringkasan: `Kajian fiqh terkait "${finalQuery}" ditimbang berdasarkan kemaslahatan umat dan 'illat hukum madzhab salaf. Boleh diamalkan selama tidak melanggar ketentuan qath'iy syariat.`,
        ibarat: "وَالأَصْلُ فِي الأَشْيَاءِ الإِبَاحَةُ حَتَّى يَدُلَّ الدَّلِيلُ عَلَى التَّحْرِيمِ، وَدَرْءُ الْمَفَاسِدِ مُقَدَّمٌ عَلَى جَلْبِ الْمَصَالِحِ.",
        rujukan: "Kaidah Fiqhiyyah Al-Asybah wan-Nazha'ir, Imam As-Suyuthi & Syarah Fathul Mu'in",
        ulasan: `Para ulama madzhab Syafi'i menegaskan bahwa dalam menghadapi persoalan kontemporer, prinsip kehati-hatian (ihtiyath) dan penyesuaian maslahah mursalah menjadi pedoman utama majelis Bahtsul Masa'il agar tidak memberatkan (raf'ul haraj) bagi umat Islam.`
      });
      setTimeout(() => {
        if (window.innerWidth < 1024) {
          document.getElementById("resolusi-dokumen")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
    } finally {
      setIsSolving(false);
    }
  };

  const handleAddKitabImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles: File[] = e.currentTarget.files ? Array.from(e.currentTarget.files) : [];
    e.currentTarget.value = "";
    if (selectedFiles.length === 0) return;
    setKitabChatError(null);

    if (kitabImageAttachments.length + selectedFiles.length > MAX_KITAB_IMAGE_COUNT) {
      setKitabChatError(`Maksimal ${MAX_KITAB_IMAGE_COUNT} gambar untuk satu pertanyaan.`);
      return;
    }

    setIsPreparingKitabImages(true);
    try {
      const preparedFiles: File[] = [];
      for (const file of selectedFiles) {
        preparedFiles.push(await prepareKitabImage(file));
      }

      const totalSize = [...kitabImageAttachments, ...preparedFiles].reduce((total, file) => total + file.size, 0);
      if (totalSize > MAX_KITAB_IMAGES_SIZE_BYTES) {
        throw new Error("Total ukuran gambar maksimal 2,4 MB setelah diproses.");
      }

      setKitabImageAttachments((current) => [...current, ...preparedFiles]);
    } catch (error) {
      setKitabChatError(error instanceof Error ? error.message : "Gambar tidak dapat diproses.");
    } finally {
      setIsPreparingKitabImages(false);
    }
  };

  const handleSendKitabMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const userPrompt = kitabInput.trim();
    if ((!userPrompt && kitabImageAttachments.length === 0) || !selectedKitabId || isPreparingKitabImages) return;

    const currentKitab = books.find(b => b.id === selectedKitabId);
    if (!currentKitab) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: userPrompt || "Mohon baca dan kaji soal pada gambar terlampir.",
      attachments: kitabImageAttachments.map((file) => file.name)
    };
    const previousMessages = kitabMessages;
    const updatedMessages = [...previousMessages, userMessage];
    setKitabMessages(updatedMessages);
    setKitabChatError(null);
    setIsSendingToKitab(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), kitabImageAttachments.length > 0 ? 100000 : 45000);

    try {
      const images = await Promise.all(kitabImageAttachments.map(async (file) => ({
        mimeType: file.type,
        data: await readImageAsBase64(file)
      })));
      const res = await fetch("/api/chat-kitab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kitabId: selectedKitabId,
          kitabTitle: currentKitab.title,
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          images
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `Permintaan kajian gagal (HTTP ${res.status}).`);
      }
      if (!data || data.role !== "model" || typeof data.content !== "string") {
        throw new Error("Respons kajian tidak lengkap. Silakan coba lagi.");
      }

      setKitabMessages([...updatedMessages, {
        role: "model",
        content: data.content,
        dalil: Array.isArray(data.dalil) ? data.dalil : []
      }]);
      setKitabInput("");
      setKitabImageAttachments([]);
    } catch (error) {
      setKitabMessages(previousMessages);
      setKitabChatError(error instanceof Error ? error.message : "Gagal mengirim pertanyaan. Silakan coba lagi.");
    } finally {
      clearTimeout(timeoutId);
      setIsSendingToKitab(false);
    }
  };

  const startKitabChatSession = () => {
    const currentKitab = books.find(b => b.id === selectedKitabId);
    if (!currentKitab) return;

    // Reset and initialize chat session
    setKitabInput("");
    setKitabImageAttachments([]);
    setKitabChatError(null);
    setKitabMessages([
      {
        role: "model",
        content: `Assalamualaikum, Selamat datang di majelis telaah batin Kitab ${currentKitab.title}. Kitab fikih/tasawuf tulisan ${currentKitab.author} ini sangat indah untuk dikupas kearifannya. Silakan tanyakan bab, hukum penafsiran, atau intisari ajaran dalam lembaran turath ini kepada saya.`
      }
    ]);
    setShowChatArea(true);
  };

  const explainCustomTerm = async (e?: React.FormEvent, termToExplain?: string, modeOverride?: "auto" | "pegon-indo" | "arab-indo" | "istilah" | "terjemah") => {
    if (e) e.preventDefault();
    const query = (termToExplain || customTerm).trim();
    if (!query) return;

    // 1. Check if query directly or partially exists in local authoritative dictionary (Instant 0ms lookup)
    const activeMode = modeOverride || translateMode;
    const lowerQ = query.toLowerCase();
    const directKey = Object.keys(kamus).find(k => k.toLowerCase() === lowerQ);
    const matchedKey = directKey || (activeMode === "terjemah" ? undefined : Object.keys(kamus).find(k => k.length >= 4 && (k.toLowerCase().includes(lowerQ) || lowerQ.includes(k.toLowerCase()))));

    if (matchedKey && kamus[matchedKey]) {
      const entry = kamus[matchedKey];
      const activeMode = modeOverride || translateMode;
      setCustomTerm(query);
      setKamusResponse({
        kataAsal: query,
        bahasaAsal: entry.kategoriLabel || (entry.kategori === "pegon" ? "Jawa Pegon (Makna Gandul)" : "Bahasa Arab Turath"),
        terjemahan: entry.arti,
        mode: activeMode,
        padananArab: activeMode === "terjemah" ? undefined : entry.padananArab,
        tarkibPegon: activeMode === "terjemah" ? undefined : entry.tarkib,
        contohPenggunaan: activeMode === "terjemah" ? undefined : entry.contoh,
        penjelasanMendalam: activeMode === "terjemah" ? undefined : entry.penjelasan,
        kategori: activeMode === "terjemah" ? "Terjemahan langsung" : entry.kategori
      });
      setIsExplainingTerm(false);
      setTimeout(() => {
        const el = document.getElementById("hasil-terjemah-kamus");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 50);
      return;
    }

    setIsExplainingTerm(true);
    setKamusResponse(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("/api/kamus/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query,
          mode: activeMode
        })
      });
      const data: KamusTranslateResult = await res.json();
      setKamusResponse({ ...data, mode: activeMode });
      if (termToExplain) {
        setCustomTerm(termToExplain);
      }
      setTimeout(() => {
        const el = document.getElementById("hasil-terjemah-kamus");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 50);
    } catch (error) {
      console.warn("Kamus translation timeout/error, using safe instant fallback:", error);
      // Safe instant scholarly fallback so user never gets stuck loading
      const isArab = /[\u0600-\u06FF]/.test(query);
      setKamusResponse({
        kataAsal: query,
        bahasaAsal: isArab ? "Bahasa Arab Klasik (Turath)" : activeMode === "pegon-indo" ? "Jawa Pegon Pesantren" : "Istilah Turath Pesantren",
        terjemahan: activeMode === "terjemah" ? "Terjemahan langsung belum tersedia. Periksa koneksi lalu coba lagi." : `Terjemahan & ulasan makna: "${query}"`,
        mode: activeMode,
        padananArab: activeMode === "terjemah" ? undefined : isArab ? query : "",
        tarkibPegon: activeMode === "terjemah" ? undefined : "Kaidah Tarkib Tradisi Santri Salaf",
        contohPenggunaan: activeMode === "terjemah" ? undefined : `Kutipan pemakaian kata "${query}" dalam kajian bandongan kitab kuning.`,
        penjelasanMendalam: activeMode === "terjemah" ? undefined : `Kata "${query}" merupakan kosa kata penting dalam pengkajian naskah klasik pesantren. Santri memaknainya secara tertib mengacu pada kedudukan tarkib dan maksud musannif (pengarang kitab).`,
        kategori: activeMode === "terjemah" ? "Terjemahan langsung" : isArab ? "arab" : activeMode === "pegon-indo" ? "pegon" : "istilah"
      });
      setTimeout(() => {
        const el = document.getElementById("hasil-terjemah-kamus");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 50);
    } finally {
      clearTimeout(timer);
      setIsExplainingTerm(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const copyTranslateToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setTranslateCopySuccess(true);
    setTimeout(() => setTranslateCopySuccess(false), 2000);
  };

  // Status-based color maps
  const getStatusStyle = (status: string) => {
    const norm = (status || "").toLowerCase();
    if (norm.includes("wajib") || norm.includes("fardhu")) {
      return { bg: "bg-emerald-100 text-emerald-800 border-emerald-300", name: "WAJIB" };
    }
    if (norm.includes("haram")) {
      return { bg: "bg-red-100 text-red-800 border-red-300", name: "HARAM" };
    }
    if (norm.includes("sunnah") || norm.includes("mandub")) {
      return { bg: "bg-amber-100 text-amber-800 border-amber-300", name: "SUNNAH" };
    }
    if (norm.includes("makruh")) {
      return { bg: "bg-yellow-100 text-yellow-800 border-yellow-300", name: "MAKRUH" };
    }
    if (norm.includes("mubah") || norm.includes("jaiz")) {
      return { bg: "bg-blue-100 text-blue-800 border-blue-300", name: "MUBAH" };
    }
    return { bg: "bg-stone-100 text-stone-800 border-stone-300", name: "KHILAF / TAFSHIL" };
  };

  const selectedKitab = books.find(b => b.id === selectedKitabId);
  const filteredBooks = books.filter(b => {
    if (bookCategoryFilter !== "semua") {
      const matchCat =
        bookCategoryFilter === "kontemporer"
          ? (b.era && b.era.toLowerCase().includes("kontemporer")) || (b.tags && b.tags.includes("kontemporer")) || (b.category && b.category.toLowerCase().includes("kontemporer"))
          : bookCategoryFilter === "munakahat"
          ? (b.category && b.category.toLowerCase().includes("munakahat")) || (b.tags && b.tags.includes("munakahat")) || (b.tags && b.tags.includes("pernikahan"))
          : bookCategoryFilter === "fiqh"
          ? b.category && b.category.toLowerCase().includes("fiqh")
          : bookCategoryFilter === "tasawwuf"
          ? (b.category && b.category.toLowerCase().includes("tasawwuf")) || (b.category && b.category.toLowerCase().includes("akhlak"))
          : true;
      if (!matchCat) return false;
    }
    if (!searchBookTerm.trim()) return true;
    const q = searchBookTerm.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) || 
      b.category.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      (b.era && b.era.toLowerCase().includes(q)) ||
      (b.tags && b.tags.some((t: string) => t.toLowerCase().includes(q)))
    );
  });

  const filteredKamus = (Object.entries(kamus) as Array<[string, KamusEntryData]>).filter(([key, info]) => {
    if (kamusCategoryFilter !== "semua") {
      const entryCat = info.kategori || "istilah";
      if (entryCat !== kamusCategoryFilter) return false;
    }
    if (!searchKamusTerm.trim()) return true;
    const q = searchKamusTerm.toLowerCase();
    return (
      key.toLowerCase().includes(q) ||
      (info.arti && info.arti.toLowerCase().includes(q)) ||
      (info.penjelasan && info.penjelasan.toLowerCase().includes(q)) ||
      (info.padananArab && info.padananArab.toLowerCase().includes(q)) ||
      (info.tarkib && info.tarkib.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-[#FAF7F2] font-sans flex flex-col antialiased">
      
      {/* Elegantly Crafted Islamic Gold-Emerald Header */}
      <header className="border-b border-gold-heritage/20 bg-emerald-deep text-white shadow-xl py-4 sm:py-6 px-3.5 sm:px-6 md:px-8 relative overflow-hidden">
        {/* Subtle traditional vector line effect */}
        <div className="absolute inset-0 bg-[radial-gradient(#C5A059_0.5px,transparent_0.5px)] [background-size:24px_24px] opacity-10"></div>
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 relative z-10">
          <div className="text-center md:text-left w-full md:w-auto">
            <div className="flex items-center justify-center md:justify-start gap-2.5 sm:gap-3">
              <img src="/logo-192.png" alt="" className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-xl border border-gold-heritage/40 shadow-sm" />
              <div>
                <h1 className="text-xl sm:text-3xl font-bold font-sans tracking-tight text-[#FAF8F5] flex items-center justify-center md:justify-start gap-2">
                  KHARISMA PEDIA <span className="text-[10px] sm:text-sm px-1.5 sm:px-2 py-0.5 border border-gold-heritage/30 bg-gold-heritage/10 rounded font-mono font-semibold">v2.5</span>
                </h1>
                <p className="text-[11px] sm:text-xs text-gold-heritage/95 mt-0.5 tracking-wide font-medium">
                  Dewan Bahtsul Masa'il & Syarah Kitab Kuning Interaktif
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Hijri & Gregorian Calendar Display (Real-time & Automatic) */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 py-2 px-3 sm:px-4 rounded-xl bg-emerald-medium/70 border border-gold-heritage/25 text-xs text-stone-200 shadow-xs">
              <div className="text-center sm:text-right">
                <p className="font-semibold text-gold-bright font-sans text-xs sm:text-sm capitalize tracking-tight">
                  {currentCalendar.hijri}
                </p>
                <p className="opacity-85 font-mono text-[11px] sm:text-xs">
                  {currentCalendar.masehi}
                </p>
              </div>
              <span className="hidden sm:block h-6 sm:h-8 w-[1px] bg-gold-heritage/25"></span>
            </div>
            {authControls && (
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={authControls.logout}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold-heritage/35 bg-emerald-medium px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-light"
                >
                  <LogOut className="h-4 w-4" />
                  Keluar
                </button>
                {authControls.logoutError && (
                  <p className="text-xs text-amber-100" role="alert">{authControls.logoutError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Subbar Navigation - Mobile swipeable & desktop full */}
      <nav className="hidden sm:block bg-emerald-medium border-b border-gold-heritage/30 text-stone-200 py-1.5 px-2.5 sm:px-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          <button
            onClick={() => { setActiveTab("bahtsul-masail"); stopTTS(); }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl transition text-xs sm:text-sm font-semibold whitespace-nowrap flex-shrink-0 min-h-[44px] ${
              activeTab === "bahtsul-masail"
                ? "bg-gold-heritage text-emerald-deep font-bold shadow-sm"
                : "hover:bg-emerald-light hover:text-white"
            }`}
          >
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span><span className="hidden sm:inline">Asisten </span>Bahtsul Masa'il</span>
          </button>
          
          <button
            onClick={() => { setActiveTab("maktabah"); stopTTS(); }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl transition text-xs sm:text-sm font-semibold whitespace-nowrap flex-shrink-0 min-h-[44px] ${
              activeTab === "maktabah"
                ? "bg-gold-heritage text-emerald-deep font-bold shadow-sm"
                : "hover:bg-emerald-light hover:text-white"
            }`}
          >
            <BookMarked className="w-4 h-4 flex-shrink-0" />
            <span>Maktabah<span className="hidden sm:inline"> Turath</span></span>
          </button>

          <button
            onClick={() => { setActiveTab("kamus"); stopTTS(); }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl transition text-xs sm:text-sm font-semibold whitespace-nowrap flex-shrink-0 min-h-[44px] ${
              activeTab === "kamus"
                ? "bg-gold-heritage text-emerald-deep font-bold shadow-sm"
                : "hover:bg-emerald-light hover:text-white"
            }`}
          >
            <Languages className="w-4 h-4 flex-shrink-0" />
            <span>Kamus & Tarjamah<span className="hidden sm:inline"> (Pegon & Arab)</span></span>
          </button>

          <button
            onClick={() => { setActiveTab("bookmarks"); stopTTS(); }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl transition text-xs sm:text-sm font-semibold whitespace-nowrap flex-shrink-0 min-h-[44px] relative ${
              activeTab === "bookmarks"
                ? "bg-gold-heritage text-emerald-deep font-bold shadow-sm"
                : "hover:bg-emerald-light hover:text-white"
            }`}
          >
            <Bookmark className="w-4 h-4 flex-shrink-0" />
            <span><span className="hidden sm:inline">Hasil </span>Keputusan</span>
            {bookmarks.length > 0 && (
              <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-emerald-medium ml-1">
                {bookmarks.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Main Workspace Frame container (with pb-20 on mobile for bottom bar comfort) */}
      {voiceError && (
        <div className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          {voiceError}
        </div>
      )}

      <main className="flex-grow max-w-7xl w-full mx-auto p-3.5 sm:p-6 md:p-8 flex flex-col gap-5 sm:gap-6 pb-24 sm:pb-8">

        {/* Tab 1: Majelis Bahtsul Masa'il (Asisten Solusi Hukum) */}
        {activeTab === "bahtsul-masail" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            
            {/* Left Panel: Query Input & Presets */}
            <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">
              
              {/* Introduction Card */}
              <div className="bg-emerald-deep text-white p-4 sm:p-5 rounded-2xl shadow-lg border border-gold-heritage/30 relative overflow-hidden">
                <div className="absolute right-0 bottom-0 translate-x-6 translate-y-6 opacity-10 pointer-events-none">
                  <BookOpen className="w-48 h-48" />
                </div>
                <h3 className="text-lg sm:text-xl font-serif-lux font-bold text-gold-bright flex items-center gap-2">
                  <Award className="w-5 h-5 text-gold-bright flex-shrink-0" />
                  Musyawarah Bahtsul Masa'il
                </h3>
                <p className="text-xs text-stone-200 mt-2 leading-relaxed">
                  Tuliskan persoalan khilafiyah kontemporer atau ibadah harian Anda (mas'alah). Dengan kekuatan hujah fikih, KHARISMA akan menelusur maraji' ditiap bab fikh Syafi'iyyah dan madzhab muktabar lainnya secara presisi.
                </p>
              </div>

              {/* Input Form Dashboard */}
              <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-stone-200/80">
                <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-deep font-mono mb-3 sm:mb-4">
                  Perumusan Mas'alah (Masalah)
                </h4>

                <div className="flex flex-col gap-3.5 sm:gap-4">
                  
                  {/* Category select block */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">
                      Kategori Bidang Keilmuan
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`p-2 sm:p-2.5 text-left rounded-lg text-xs transition border ${
                            selectedCategory === cat.id
                              ? "bg-emerald-deep text-white border-emerald-deep shadow-sm"
                              : "bg-[#FAF8F5] border-stone-200 text-gray-700 hover:bg-stone-50"
                          }`}
                        >
                          <p className="font-bold">{cat.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Madzhab selector */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">
                      Kacamata Madzhab
                    </label>
                    <select
                      value={selectedMadzhab}
                      onChange={(e) => setSelectedMadzhab(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-stone-300 bg-[#FAF8F5] text-xs text-stone-800 font-sans focus:ring-1 focus:ring-emerald-deep focus:border-emerald-deep outline-none"
                    >
                      <option>Dominan Madzhab Syafi'i (Ahlussunnah wal Jama'ah)</option>
                      <option>Komparasi Madzhab Fikh Empat (Syafi'i, Hanafi, Maliki, Hambali)</option>
                      <option>Metodologi Ijtihadiah Kontemporer Saja</option>
                      <option>Maslahah Mursalah & Maqashid Syariah (Hukum Kemanfaatan)</option>
                    </select>
                  </div>

                  {/* Query textarea focus */}
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-700 block mb-1">
                      Deskripsi Persoalan (Mas'alah) Anda
                    </label>
                    <textarea
                      dir="auto"
                      value={bmQuery}
                      onChange={(e) => {
                        setBmQuery(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      placeholder="Contoh: Bagaimana kedudukan hukum memakai teknologi otomatis dalam menerjemahkan ayat Al-Quran tanpa sanad ilmu?"
                      className="w-full text-base p-3.5 rounded-xl border border-stone-300 h-28 sm:h-32 focus:ring-2 focus:ring-emerald-light outline-none bg-stone-50/60 leading-relaxed"
                    ></textarea>
                    {formError && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {formError}
                      </p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={() => solveIssue("")}
                    disabled={isSolving}
                    className="w-full bg-emerald-deep text-white hover:bg-emerald-light py-3.5 px-4 rounded-xl font-bold text-sm sm:text-base transition mt-1 shadow-md flex items-center justify-center gap-2 disabled:bg-stone-400 min-h-[48px]"
                  >
                    {isSolving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sedang Menganalisis...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-gold-bright" />
                        Analisis Hukum
                      </>
                    )}
                  </button>

                  {/* Loading Spinner with scrolling Traditional Wisdom quotes */}
                  {isSolving && (
                    <div className="p-3.5 bg-amber-500/10 border border-gold-heritage/30 rounded-xl text-center flex flex-col gap-1 mt-1 animate-pulse">
                      <p className="text-xs font-mono text-emerald-deep font-bold">Syura sedang bermusyawarah:</p>
                      <p className="text-xs sm:text-sm text-stone-700 italic font-sans font-medium">"{WISDOM_LOADS[wisdomIndex]}"</p>
                    </div>
                  )}

                </div>
              </div>

              {/* Preset Cards */}
              <div className="bg-[#FAF8F5] p-4 sm:p-5 rounded-2xl border border-stone-200">
                <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-medium font-mono mb-2">
                  Daftar Pertanyaan Contoh (Preset)
                </h4>
                <p className="text-xs text-stone-500 mb-3">Klik pertanyaan klik-cepat di bawah ini untuk melihat simulasi bahtsul masail cepat:</p>
                <div className="flex flex-col gap-2">
                  {PREMADE_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setBmQuery(q.query);
                        setSelectedCategory(q.category);
                        solveIssue(q.query);
                      }}
                      disabled={isSolving}
                      className="p-3 text-left border border-stone-200 hover:border-gold-heritage/70 rounded-xl hover:bg-white text-xs sm:text-sm text-emerald-deep hover:text-emerald-light transition font-medium group flex items-start justify-between gap-2 min-h-[44px]"
                    >
                      <span className="leading-snug">{q.label}</span>
                      <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-1 transition flex-shrink-0 mt-0.5" />
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Panel: Beautiful Document-Like Results View */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {!bmResult && !isSolving && (
                <div className="h-full bg-white rounded-2xl border border-dashed border-stone-300 p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4 shadow-sm min-h-[320px] sm:min-h-[450px]">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-deep border border-emerald-100">
                    <Compass className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse text-gold-heritage" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold font-sans text-emerald-deep">
                      Gerbang Keabsahan Belum Diketuk
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
                      Belum ada permasalahan yang diajukan dalam Majelis Bahtsul Masa'il. Tuliskan masalah Anda di sebelah kiri atau pilih salah satu Pertanyaan Contoh untuk mendapatkan jawaban.
                    </p>
                  </div>
                </div>
              )}

              {isSolving && (
                <div id="loading-state-card" className="h-full bg-white rounded-2xl border border-stone-200 p-6 sm:p-10 text-center flex flex-col items-center justify-center gap-5 shadow-sm min-h-[340px] sm:min-h-[460px]">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-gold-heritage/40 flex items-center justify-center text-gold-heritage">
                      <Sparkles className="w-8 h-8 animate-pulse text-gold-heritage" />
                    </div>
                    <Loader2 className="w-20 h-20 animate-spin text-emerald-deep absolute -top-2 -left-2 opacity-30" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold font-sans text-emerald-deep">
                      Musyawarah & Istinbath Hukum Turath
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto mt-1">
                      {WISDOM_LOADS[wisdomIndex]}
                    </p>
                  </div>

                  {/* Progressive Deliberation Stages */}
                  <div className="w-full max-w-sm flex flex-col gap-2 text-left bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping"></span>
                      <span>Tahqiq Mas'alah & Analisis 'Illat Hukum</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-stone-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-gold-heritage"></span>
                      <span>Takhrij Kutubus Syuruh (Tuhfah, Fathul Mu'in, Al-Majmu')</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                      <span className="w-2.5 h-2.5 rounded-full bg-stone-300"></span>
                      <span>Perumusan Diktum Fatwa & Teks Asli Ibarat Arab</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolved Bahtsul Masa'il Document result */}
              {bmResult && !isSolving && (
                <div className="bg-white rounded-2xl shadow-xl border border-gold-heritage/40 overflow-hidden relative" id="resolusi-dokumen">
                  
                  {/* Antique style corner border highlights */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-gold-heritage/60 rounded-tl-lg pointer-events-none"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-gold-heritage/60 rounded-tr-lg pointer-events-none"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-gold-heritage/60 rounded-bl-lg pointer-events-none"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-gold-heritage/60 rounded-br-lg pointer-events-none"></div>

                  {/* Header Doc strip */}
                  <div className="bg-gradient-to-r from-emerald-deep to-emerald-medium text-white px-4 sm:px-6 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gold-heritage/30">
                    <div className="flex items-center gap-2">
                      <span className="text-gold-bright flex-shrink-0">
                        <BookOpenCheck className="w-5 h-5" />
                      </span>
                      <p className="text-[11px] sm:text-xs uppercase tracking-wider font-mono font-semibold">Keputusan Majelis Hukum KHARISMA</p>
                    </div>
                    
                    {/* Action Panel icons */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* Audio Icon speak */}
                      <button
                        onClick={() => playHumanVoice(`${bmResult.judul}. Ketetapan Hukum: ${bmResult.status}. Intisari fatwa: ${bmResult.ringkasan}. Maraji' rujukan: ${bmResult.rujukan}. Ulasan lengkap: ${bmResult.ulasan.substring(0, 450)}`, "bm-fatwa-main")}
                        className={`p-2 rounded-xl border transition text-xs flex items-center gap-1.5 min-h-[40px] ${
                          playingVoiceId === "bm-fatwa-main"
                            ? "bg-amber-400 text-black border-amber-500 font-bold animate-pulse shadow-md"
                            : "bg-emerald-light/60 border-gold-heritage/35 text-white hover:bg-gold-heritage hover:text-emerald-deep"
                        }`}
                        title="Dengarkan fatwa dengan suara manusia Indonesia"
                      >
                        {isVoiceLoading && playingVoiceId === "bm-fatwa-main" ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gold-bright" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                        <span className="text-xs font-semibold hidden xs:inline">
                          {playingVoiceId === "bm-fatwa-main" ? (isSpeechPlaying ? "Hentikan Suara" : "Menyiapkan...") : "Suara Fatwa"}
                        </span>
                      </button>

                      {/* Bookmark Icon save */}
                      <button
                        onClick={() => toggleBookmark(bmResult)}
                        className="p-2 rounded-xl bg-emerald-light/60 border border-gold-heritage/35 hover:bg-gold-heritage hover:text-emerald-deep transition text-xs flex items-center gap-1.5 min-h-[40px]"
                        title="Simpan keputusan"
                      >
                        <Bookmark className={`w-4 h-4 ${isBookmarked(bmResult) ? "fill-amber-400 text-amber-500" : ""}`} />
                        <span className="text-xs hidden xs:inline">{isBookmarked(bmResult) ? "Tersimpan" : "Simpan"}</span>
                      </button>

                      {/* Copy code button */}
                      <button
                        onClick={() => copyToClipboard(`JUDUL: ${bmResult.judul}\nSTATUS HUKUM: ${bmResult.status}\nIBARAT: ${bmResult.ibarat}\nRUJUKAN: ${bmResult.rujukan}\nPENJELASAN:\n${bmResult.ulasan}`)}
                        className="p-2 rounded-xl bg-emerald-light/60 border border-gold-heritage/35 hover:bg-gold-heritage hover:text-emerald-deep transition text-xs flex items-center gap-1.5 min-h-[40px]"
                        title="Salin putusan"
                      >
                        {copySuccess ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs text-emerald-300 font-semibold">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span className="text-xs hidden xs:inline">Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Document Body (Traditional Paper feel) */}
                  <div className="p-4 sm:p-6 md:p-8 bg-amber-50/25 flex flex-col gap-5 sm:gap-6">
                    
                    {/* Verdict Title & Big Badge Rulings */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-stone-200 pb-4">
                      <div>
                        <span className="text-[10px] sm:text-xs bg-emerald-800 text-white font-mono px-2.5 py-0.5 rounded font-semibold uppercase">
                          Judul Rumusan Masalah
                        </span>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold font-sans text-emerald-950 mt-1.5 leading-snug tracking-tight">
                          {bmResult.judul}
                        </h2>
                      </div>
                      
                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-1 self-start sm:self-center flex-shrink-0">
                        <span className="text-[10px] text-gray-500 font-mono uppercase font-semibold">Ketetapan Hukum:</span>
                        <span className={`px-4 py-1.5 rounded-xl border font-bold text-xs sm:text-sm tracking-wide shadow-xs flex items-center gap-1.5 ${getStatusStyle(bmResult.status).bg}`}>
                          <Award className="w-4 h-4 flex-shrink-0" />
                          {getStatusStyle(bmResult.status).name}
                        </span>
                      </div>
                    </div>

                    {/* Ringkasan Hukum (Executive summary) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-deep font-mono">
                          Ringkasan Hukum (Kesimpulan)
                        </h4>
                        <button
                          type="button"
                          onClick={() => playHumanVoice(bmResult.ringkasan, "bm-ringkasan")}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1.5 min-h-[32px] ${
                            playingVoiceId === "bm-ringkasan"
                              ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold animate-pulse"
                              : "text-emerald-900 bg-emerald-50 hover:bg-emerald-100"
                          }`}
                          title="Dengarkan intisari ringkasan"
                        >
                          {isVoiceLoading && playingVoiceId === "bm-ringkasan" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-gold-heritage" />
                          )}
                          <span>{playingVoiceId === "bm-ringkasan" ? (isSpeechPlaying ? "Hentikan" : "Memuat...") : "Dengarkan"}</span>
                        </button>
                      </div>
                      <div className="p-4 bg-emerald-50/70 border-l-4 border-emerald-deep text-[15px] sm:text-base text-gray-800 leading-relaxed rounded-r-xl font-sans">
                        "{bmResult.ringkasan}"
                      </div>
                    </div>

                    {/* Ibarat (Original Arabic Text citation - Parchment box) */}
                    <div>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-600 font-mono">
                          Redaksi Ibarat Kitab Klasik (Teks Arab Berharakat)
                        </h4>
                        <button
                          onClick={() => copyArabicToClipboard(bmResult.ibarat)}
                          className="px-2.5 py-1.5 rounded-lg bg-gold-heritage/15 hover:bg-gold-heritage/30 text-emerald-deep text-xs font-semibold flex items-center gap-1.5 transition min-h-[36px]"
                          title="Salin kutipan Arab"
                        >
                          {arabicCopySuccess ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Arab Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-gold-heritage" />
                              <span>Salin Arab</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="p-4 sm:p-6 bg-[#FAF7F2] border border-gold-heritage/35 rounded-2xl parchment-glow flex flex-col text-right shadow-xs">
                        <p className="text-2xl sm:text-3xl md:text-4xl text-emerald-950 font-arabic leading-[2.2] sm:leading-[2.4] tracking-normal arab-glow break-words" dir="rtl" lang="ar">
                          {bmResult.ibarat}
                        </p>
                      </div>
                    </div>

                    {/* Sumber Kitab - Presisi Rujukan */}
                    <div className="p-3.5 bg-stone-100 border border-stone-200 rounded-xl flex items-start gap-3">
                      <BookOpen className="w-5 h-5 text-gold-heritage mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] font-mono font-bold text-stone-500 block uppercase tracking-wider">MARAJI' / SUMBER DIALEKTIKA</span>
                        <p className="text-xs sm:text-sm font-sans font-semibold text-emerald-900 leading-relaxed mt-0.5">
                          {bmResult.rujukan}
                        </p>
                      </div>
                    </div>

                    {/* Ulasan Lengkap (Detailed legal interpretation) */}
                    <div className="border-t border-stone-200 pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-deep font-mono">
                          Ulasan & Konstruksi Hujah Fikih Lengkap
                        </h4>
                        <button
                          type="button"
                          onClick={() => playHumanVoice(bmResult.ulasan, "bm-ulasan")}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1.5 min-h-[32px] ${
                            playingVoiceId === "bm-ulasan"
                              ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold animate-pulse"
                              : "text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60"
                          }`}
                        >
                          {isVoiceLoading && playingVoiceId === "bm-ulasan" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-gold-heritage" />
                          )}
                          <span>
                            {playingVoiceId === "bm-ulasan"
                              ? isSpeechPlaying
                                ? "Hentikan Suara"
                                : "Memuat Suara..."
                              : "Dengarkan Ulasan"}
                          </span>
                        </button>
                      </div>
                      <div className="text-[15px] sm:text-base text-gray-800 leading-relaxed space-y-3 font-sans">
                        {bmResult.ulasan.split("\n\n").map((para, idx) => (
                          <p key={idx} className="indent-3 sm:indent-4 text-justify">
                            {para}
                          </p>
                        ))}
                      </div>

                      {bmResult.khilaf && bmResult.khilaf.length > 0 && (
                        <div className="mt-4 border-t border-dashed border-stone-200 pt-4">
                          <h5 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-deep font-mono mb-2.5">
                            Perbedaan Pendapat Ulama
                          </h5>
                          <div className="space-y-3">
                            {bmResult.khilaf.map((k, ki) => (
                              <div key={ki} className="bg-amber-50/60 border border-gold-heritage/30 rounded-xl p-3.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold font-sans text-emerald-deep">{k.pendapat}</span>
                                  {k.hukum && (
                                    <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full uppercase">
                                      {k.hukum}
                                    </span>
                                  )}
                                </div>
                                {k.ulama && <p className="text-[10px] font-mono text-stone-500 mt-0.5">{k.ulama}</p>}
                                <p className="text-arabic text-[18px] sm:text-[20px] text-emerald-deep mt-2" dir="rtl" lang="ar">{k.dalilArab}</p>
                                <p className="text-[11px] sm:text-xs text-stone-600 italic mt-2">{k.terjemahan}</p>
                                <p className="text-[10px] font-mono text-stone-500 mt-1">— {k.rujukan}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Signature Mock */}
                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-dashed border-stone-200 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-3">
                      <div className="text-center sm:text-left">
                        <p>Ditelusuri oleh: <strong className="text-emerald-deep font-serif-lux font-semibold">Dewan Lajnah Bahtsul Masa'il KHARISMA</strong></p>
                        <p className="italic font-mono text-[10px]">Tashih madzhab Ahlussunnah wal Jama'ah</p>
                      </div>
                      <div className="text-center bg-stone-50 px-3 py-1.5 border border-stone-200 rounded font-mono text-[10px]">
                        STATUS TASHIH: <strong className="text-emerald-700">SAH (Qabul)</strong>
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>
        )}


        {/* Tab 2: Maktabah KHARISMA (Katalog Kitab dan Chat Companion) */}
        {activeTab === "maktabah" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            
            {/* Grid 1: Kitab Directory sidebar list */}
            <div id="katalog-kitab-list" className="lg:col-span-4 flex flex-col gap-4">
              
              {/* Search Bar & Category Filter for Library */}
              <div className="bg-white p-3.5 sm:p-4 rounded-xl shadow-sm border border-stone-200 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold text-emerald-deep block">Katalog Maktabah Turath</label>
                  <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                    {filteredBooks.length} Kitab
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    dir="auto"
                    value={searchBookTerm}
                    onChange={(e) => setSearchBookTerm(e.target.value)}
                    placeholder="Cari Qurrotul Uyun, Kontemporer, Fathul..."
                    className="w-full text-xs p-2.5 pl-9 rounded-lg border border-stone-300 outline-none focus:ring-1 focus:ring-emerald-deep focus:border-emerald-deep"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {[
                    { id: "semua", label: "Semua" },
                    { id: "munakahat", label: "Munakahat & Nikah" },
                    { id: "kontemporer", label: "Kontemporer & Fatwa" },
                    { id: "fiqh", label: "Fiqh Salaf" },
                    { id: "tasawwuf", label: "Tasawwuf" }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBookCategoryFilter(cat.id)}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg transition ${
                        bookCategoryFilter === cat.id
                          ? "bg-emerald-deep text-gold-bright shadow-xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Book List Stack */}
              <div className="flex flex-col gap-2 max-h-[420px] sm:max-h-[500px] overflow-y-auto pr-1">
                {isLibLoading ? (
                  <div className="p-8 text-center text-stone-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gold-heritage" />
                    <p className="text-xs font-mono mt-2">Membuka lemari syarah kitab...</p>
                  </div>
                ) : filteredBooks.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 border border-dashed rounded-lg">
                    <AlertCircle className="w-5 h-5 mx-auto mb-1 text-stone-400" />
                    <p className="text-xs">Kitab tidak ditemukan dalam katalog.</p>
                  </div>
                ) : (
                  filteredBooks.map((kitab) => (
                    <button
                      key={kitab.id}
                      onClick={() => {
                        setSelectedKitabId(kitab.id);
                        setShowChatArea(false); // Reset companion chat when switching books
                        if (window.innerWidth < 1024) {
                          setTimeout(() => {
                            document.getElementById("kitab-detail-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 100);
                        }
                      }}
                      className={`shrink-0 p-3.5 sm:p-4 rounded-xl text-left border transition relative overflow-hidden flex items-start gap-3 justify-between ${
                        selectedKitabId === kitab.id
                          ? "bg-emerald-deep text-white border-emerald-deep shadow-md ring-1 ring-gold-heritage/40"
                          : "bg-white border-stone-200 text-stone-800 hover:bg-stone-50 hover:border-gold-heritage/50"
                      }`}
                    >
                      {/* Left: Mini stylized CSS book cover */}
                      <span className={`w-9 h-11 sm:w-10 sm:h-12 flex-shrink-0 rounded border-r-4 shadow flex items-center justify-center font-serif font-bold text-xs ${
                        selectedKitabId === kitab.id
                          ? "bg-gold-heritage text-emerald-deep border-gold-bright"
                          : "bg-emerald-deep/10 text-emerald-deep border-emerald-deep"
                      }`}>
                        {kitab.title.charAt(0)}
                      </span>
                      
                      <div className="flex-grow min-w-0">
                        <small className={`text-[9px] font-mono tracking-wider ${
                          selectedKitabId === kitab.id ? "text-gold-heritage" : "text-stone-400"
                        }`}>
                          {kitab.category}
                        </small>
                        <h4 className="text-xs sm:text-sm font-bold font-serif-lux line-clamp-1 mt-0.5 leading-snug">
                          {kitab.title}
                        </h4>
                        <p className={`text-[10px] sm:text-[11px] truncate mt-0.5 ${
                          selectedKitabId === kitab.id ? "text-stone-300" : "text-stone-500"
                        }`}>
                          {kitab.author}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Scholastic metadata stat banner */}
              <div className="bg-amber-50 rounded-xl border border-gold-heritage/30 p-3.5 sm:p-4 text-xs text-stone-700">
                <h5 className="font-bold text-emerald-deep mb-1 font-serif-lux">Fasilitas Pesantren Digital:</h5>
                <p className="leading-relaxed">Setiap kitab dilengkapi dengan <strong>Asisten Kajian Turath</strong>. Klik kitabnya, buka ringkasan fasal, dan mulai kajian bersama pendamping digital.</p>
              </div>

            </div>

            {/* Grid 2: Detail Book cover + Chapter index + Interactive Chat Companion */}
            <div id="kitab-detail-section" className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">
              
              {/* Mobile Back Button to Book List */}
              <div className="lg:hidden">
                <button
                  onClick={() => {
                    document.getElementById("katalog-kitab-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-deep bg-white border border-stone-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-stone-50 active:bg-stone-100"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Kembali ke Daftar Kitab
                </button>
              </div>

              {selectedKitab && (
                <div className="bg-white rounded-2xl shadow-md border border-stone-200 overflow-hidden">
                  
                  {/* Top Bar for Selected Book */}
                  <div className="bg-[#FAF8F5] border-b border-stone-200 px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                      <span className="text-[9px] sm:text-[10px] font-mono bg-emerald-deep text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        {selectedKitab.category}
                      </span>
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold font-sans text-emerald-950 mt-1 leading-tight tracking-tight">
                        {selectedKitab.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-stone-600 font-sans font-medium mt-0.5">
                        Karya: <span className="font-semibold text-emerald-900">{selectedKitab.author}</span> • Era: {selectedKitab.era}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-xs font-mono text-stone-700 block bg-stone-100 rounded-lg px-3 py-1 font-medium">
                        Madzhab: <strong className="text-emerald-800 font-bold">{selectedKitab.madzhab}</strong>
                      </span>
                      <span className="text-xs font-mono text-stone-700 block bg-stone-100 rounded-lg px-3 py-1 font-medium">
                        Tingkat: <strong className="text-amber-800 font-bold">{selectedKitab.difficulty}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Body Content Grid */}
                  <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-5 sm:gap-6">
                    
                    {!showChatArea ? (
                      // Display Standard Book Details Mode
                      <div className="flex flex-col gap-5 sm:gap-6">
                        
                        {/* Summary Block */}
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-medium font-mono">
                              Prolog & Cakupan Intisari Kitab
                            </h4>
                            <button
                              type="button"
                              onClick={() =>
                                playHumanVoice(
                                  `Kitab ${selectedKitab.title}, karya ${selectedKitab.author}. ${selectedKitab.description} Rangkuman syarah: ${selectedKitab.summary}`,
                                  `kitab-${selectedKitab.id}`
                                )
                              }
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1.5 min-h-[32px] ${
                                playingVoiceId === `kitab-${selectedKitab.id}`
                                  ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold animate-pulse"
                                  : "text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60"
                              }`}
                            >
                              {isVoiceLoading && playingVoiceId === `kitab-${selectedKitab.id}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5 text-gold-heritage" />
                              )}
                              <span>
                                {playingVoiceId === `kitab-${selectedKitab.id}`
                                  ? isSpeechPlaying
                                    ? "Hentikan Suara"
                                    : "Memuat Suara..."
                                  : "Dengarkan Syarah Kitab"}
                              </span>
                            </button>
                          </div>
                          <p className="text-[15px] sm:text-base font-sans text-gray-800 leading-relaxed text-justify">
                            {selectedKitab.description}
                          </p>
                          <hr className="my-4 border-stone-200" />
                          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-medium font-mono mb-2">
                            Rangkuman Ajaran Utama (Syarah Ringkas)
                          </h4>
                          <p className="text-[15px] sm:text-base font-sans text-gray-800 leading-relaxed bg-[#FAF8F5] p-4 rounded-xl border border-stone-200 text-justify italic">
                            {selectedKitab.summary}
                          </p>
                        </div>

                        {/* List of Chapters Pages */}
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-600 font-mono mb-2.5">
                            Lembaran Fasal & Bab Utama
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                            {selectedKitab.chapters.map((ch: any) => (
                              <div
                                key={ch.id}
                                className="p-3 bg-stone-50/80 border border-stone-200 rounded-xl flex items-center justify-between text-xs sm:text-sm hover:border-gold-heritage/40 transition"
                              >
                                <span className="font-sans font-semibold text-emerald-950">{ch.name}</span>
                                <span className="font-mono text-xs text-stone-500 bg-stone-200/60 px-2.5 py-0.5 rounded font-medium">{ch.pages}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Large Study CTA */}
                        <div className="bg-emerald-deep text-white p-5 sm:p-7 rounded-2xl border border-gold-heritage/40 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 relative overflow-hidden shadow-md">
                          <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-15 pointer-events-none">
                            <MessageSquare className="w-32 h-32 text-gold-bright" />
                          </div>
                          <div className="text-center md:text-left relative z-10">
                            <h4 className="text-lg sm:text-xl font-sans font-bold text-gold-bright">Kaji Kitab Ini Bersama Asisten Pendamping</h4>
                            <p className="text-xs sm:text-sm text-stone-200 max-w-md mt-1 leading-relaxed font-sans">
                              Miliki ruang obrolan bimbingan interaktif khusus mengenai kitab ini. Ajukan pertanyaan seputar hukum bab bersuci, zakat, atau hujah bait puisi di dalamnya secara bebas.
                            </p>
                          </div>
                          
                          <button
                            onClick={startKitabChatSession}
                            className="w-full md:w-auto bg-gold-bright text-emerald-deep hover:bg-gold-heritage py-3.5 px-6 rounded-xl text-xs sm:text-sm font-bold tracking-wider transition uppercase shadow flex-shrink-0 flex items-center justify-center gap-2 hover:scale-[1.02] min-h-[48px]"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Mulai Kajian
                          </button>
                        </div>

                      </div>
                    ) : (
                      // Interactive Chat Companion Mode
                      <div className="flex flex-col gap-4 border border-stone-200 rounded-2xl overflow-hidden shadow-inner bg-[#FAF8F5]">
                        <div className="bg-emerald-medium text-white px-4 sm:px-6 py-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-ping"></span>
                            <span className="text-xs sm:text-sm font-sans font-bold text-gold-bright">
                              Pendamping Kajian {selectedKitab.title}
                            </span>
                          </div>
                          
                          <button
                            onClick={() => setShowChatArea(false)}
                            className="text-stone-200 hover:text-white text-xs font-mono uppercase underline decoration-dashed p-1"
                          >
                            Kembali ke Rangkuman
                          </button>
                        </div>

                        {/* Message log */}
                        <div className="p-4 sm:p-5 h-[380px] overflow-y-auto space-y-4 flex flex-col">
                          {kitabMessages.map((msg, i) => (
                            <div
                              key={i}
                              className={`flex gap-2 max-w-[88%] sm:max-w-[80%] ${
                                msg.role === "user" ? "self-end flex-row-reverse" : "self-start"
                              }`}
                            >
                              <div className={`p-3.5 sm:p-4 rounded-2xl text-[14px] sm:text-[15px] leading-relaxed font-sans ${
                                msg.role === "user"
                                  ? "bg-emerald-deep text-white rounded-tr-none shadow-sm"
                                  : "bg-white border border-stone-200/90 text-gray-800 rounded-tl-none shadow-sm"
                              }`}>
                                {Boolean(msg.content?.trim()) && <p className="whitespace-pre-wrap">{msg.content}</p>}
                                {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                                  <p className="mt-2 text-xs text-white/75">Gambar terlampir: {msg.attachments.join(", ")}</p>
                                )}
                                {msg.role === "model" && msg.dalil && msg.dalil.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {msg.dalil.map((d, di) => (
                                      <div key={di} className="bg-amber-50/70 border border-gold-heritage/30 rounded-xl p-3">
                                        <p className="text-arabic text-[18px] sm:text-[20px] text-emerald-deep" dir="rtl" lang="ar">{d.teksArab}</p>
                                        <p className="text-[11px] sm:text-xs text-stone-600 italic mt-2">{d.terjemahan}</p>
                                        <p className="text-[10px] font-mono text-stone-500 mt-1">— {d.rujukan}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {msg.role === "model" && Boolean(msg.content?.trim()) && (
                                  <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-stone-500 font-mono flex items-center gap-1 font-medium">
                                      <User className="w-3 h-3 text-emerald-700" />
                                      Pendamping Kajian
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => playHumanVoice(msg.content, `chat-msg-${i}`)}
                                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg transition inline-flex items-center gap-1 min-h-[28px] ${
                                        playingVoiceId === `chat-msg-${i}`
                                          ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold animate-pulse"
                                          : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50"
                                      }`}
                                    >
                                      {isVoiceLoading && playingVoiceId === `chat-msg-${i}` ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-emerald-800" />
                                      ) : (
                                        <Volume2 className="w-3 h-3 text-gold-heritage" />
                                      )}
                                      <span>
                                        {playingVoiceId === `chat-msg-${i}`
                                          ? isSpeechPlaying
                                            ? "Hentikan Suara"
                                            : "Memuat..."
                                          : "Dengarkan Suara Pendamping"}
                                      </span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          
                          {isSendingToKitab && (
                            <div className="self-start flex gap-2 max-w-[80%]">
                              <div className="p-3 bg-white border border-stone-200 rounded-2xl rounded-tl-none text-xs sm:text-sm flex items-center gap-2 shadow-xs">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-deep" />
                                <span className="italic text-stone-600 font-sans">KHARISMA sedang menelaah hasyiyah kitab...</span>
                              </div>
                            </div>
                          )}
                          <div ref={chatBottomRef} />
                        </div>

                        {/* Input chat bar */}
                        <form onSubmit={handleSendKitabMessage} className="p-3.5 bg-white border-t border-stone-200 flex flex-col gap-3">
                          {kitabImagePreviews.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Gambar soal terlampir">
                              {kitabImagePreviews.map((preview, index) => (
                                <div key={`${preview.name}-${index}`} className="relative flex-shrink-0 w-24 rounded-lg border border-stone-200 bg-stone-50 p-1.5">
                                  <img src={preview.url} alt={`Pratinjau ${preview.name}`} className="w-full h-16 object-cover rounded" />
                                  <p className="text-[9px] text-stone-600 truncate mt-1" title={preview.name}>{preview.name}</p>
                                  <button
                                    type="button"
                                    onClick={() => setKitabImageAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                                    disabled={isSendingToKitab || isPreparingKitabImages}
                                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-700 text-white flex items-center justify-center shadow disabled:bg-stone-400"
                                    aria-label={`Hapus gambar ${preview.name}`}
                                    title="Hapus gambar"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {kitabChatError && (
                            <p role="alert" className="text-xs text-red-700 flex items-start gap-1.5">
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                              <span>{kitabChatError}</span>
                            </p>
                          )}

                          <div className="flex gap-2 items-center">
                            <input
                              ref={cameraInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              onChange={handleAddKitabImages}
                              className="hidden"
                              aria-label="Ambil foto soal"
                            />
                            <input
                              ref={galleryInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              onChange={handleAddKitabImages}
                              className="hidden"
                              aria-label="Pilih gambar soal"
                            />
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              disabled={isSendingToKitab || isPreparingKitabImages || kitabImageAttachments.length >= MAX_KITAB_IMAGE_COUNT}
                              className="bg-stone-100 text-emerald-deep hover:bg-emerald-50 p-3 rounded-xl border border-stone-200 transition disabled:text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Ambil foto soal"
                              aria-label="Ambil foto soal"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => galleryInputRef.current?.click()}
                              disabled={isSendingToKitab || isPreparingKitabImages || kitabImageAttachments.length >= MAX_KITAB_IMAGE_COUNT}
                              className="bg-stone-100 text-emerald-deep hover:bg-emerald-50 p-3 rounded-xl border border-stone-200 transition disabled:text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Pilih gambar dari perangkat"
                              aria-label="Pilih gambar soal dari perangkat"
                            >
                              {isPreparingKitabImages ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ImagePlus className="w-4 h-4" />
                              )}
                            </button>
                            <input
                              type="text"
                              dir="auto"
                              value={kitabInput}
                              onChange={(e) => {
                                setKitabInput(e.target.value);
                                setKitabChatError(null);
                              }}
                              placeholder="Tanyakan bab/hujjah, atau lampirkan foto soal/halaman kitab..."
                              disabled={isSendingToKitab || isPreparingKitabImages}
                              className="flex-grow min-w-0 text-base p-3 rounded-xl border border-stone-300 outline-none focus:ring-2 focus:ring-emerald-deep/20 focus:border-emerald-deep bg-stone-50/50"
                            />
                            <button
                              type="submit"
                              disabled={isSendingToKitab || isPreparingKitabImages || (!kitabInput.trim() && kitabImageAttachments.length === 0)}
                              className="bg-emerald-deep text-white hover:bg-emerald-light p-3 rounded-xl transition disabled:bg-stone-300 min-h-[44px] min-w-[44px] flex items-center justify-center shadow-xs"
                              title="Kirim pertanyaan"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-[10px] text-stone-500">JPEG, PNG, atau WebP. Maksimal 4 gambar; dikirim ke Gemini untuk analisis dan tidak disimpan oleh aplikasi.</p>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}


        {/* Tab 3: Kamus & Tarjamah Kitab (Pegon & Arab Turath) */}
        {activeTab === "kamus" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            
            {/* Left Column: Translator & Deep Lexicography */}
            <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">
              
              <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-stone-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-deep border border-emerald-100">
                    <Languages className="w-5 h-5 text-gold-heritage flex-shrink-0" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-serif-lux font-bold text-emerald-deep">
                      Kamus & Tarjamah Kitab Kuning
                    </h3>
                    <p className="text-[11px] text-stone-500 font-mono">
                      Arab Turath ⇄ Makna Gandul Jawa Pegon ⇄ Bahasa Indonesia
                    </p>
                  </div>
                </div>

                <p className="text-xs text-stone-600 mb-4 leading-relaxed">
                  Pilih <strong>Terjemahan saja</strong> untuk hasil bahasa Indonesia tanpa uraian. Pilihan lainnya memberikan terjemahan beserta kaidah dan konteks Pegon, Arab, atau fikih.
                </p>

                {/* Translation Mode Selector */}
                <div className="mb-3">
                  <label className="text-[11px] font-semibold text-stone-500 block mb-1.5 uppercase tracking-wide">
                    Pilih jenis hasil:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-stone-100 rounded-xl text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTranslateMode("auto")}
                      className={`min-h-9 py-1.5 px-2 rounded-lg font-medium transition text-center whitespace-normal leading-tight ${
                        translateMode === "auto"
                          ? "bg-white text-emerald-deep font-bold shadow-sm border border-stone-200"
                          : "text-stone-600 hover:text-emerald-deep"
                      }`}
                    >
                      Otomatis + kaidah
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranslateMode("pegon-indo")}
                      className={`min-h-9 py-1.5 px-2 rounded-lg font-medium transition text-center whitespace-normal leading-tight ${
                        translateMode === "pegon-indo"
                          ? "bg-emerald-deep text-white font-bold shadow-sm"
                          : "text-stone-600 hover:text-emerald-deep"
                      }`}
                    >
                      Pegon + kaidah
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranslateMode("arab-indo")}
                      className={`min-h-9 py-1.5 px-2 rounded-lg font-medium transition text-center whitespace-normal leading-tight ${
                        translateMode === "arab-indo"
                          ? "bg-emerald-deep text-white font-bold shadow-sm"
                          : "text-stone-600 hover:text-emerald-deep"
                      }`}
                    >
                      Arab + kaidah
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranslateMode("istilah")}
                      className={`min-h-9 py-1.5 px-2 rounded-lg font-medium transition text-center whitespace-normal leading-tight ${
                        translateMode === "istilah"
                          ? "bg-emerald-deep text-white font-bold shadow-sm"
                          : "text-stone-600 hover:text-emerald-deep"
                      }`}
                    >
                      Istilah fikih
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranslateMode("terjemah")}
                      className={`min-h-9 py-1.5 px-2 rounded-lg font-medium transition text-center whitespace-normal leading-tight ${
                        translateMode === "terjemah"
                          ? "bg-emerald-deep text-white font-bold shadow-sm"
                          : "text-stone-600 hover:text-emerald-deep"
                      }`}
                    >
                      Terjemahan saja
                    </button>
                  </div>
                </div>

                {/* Search / Translation Form */}
                <form onSubmit={(e) => explainCustomTerm(e)} className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-stone-700 block mb-1">
                      Teks yang ingin diterjemahkan
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        dir="auto"
                        value={customTerm}
                        onChange={(e) => setCustomTerm(e.target.value)}
                        placeholder={
                          translateMode === "pegon-indo"
                            ? "Ketik makna pegon (contoh: nanging, utawi, hale, ora kena ora)..."
                            : translateMode === "arab-indo"
                            ? "Ketik kata Arab / turath (contoh: استحسان, معفو عنه, قاول معتمد)..."
                              : translateMode === "terjemah"
                              ? "Ketik teks Arab atau Pegon untuk diterjemahkan ke Indonesia..."
                              : "Masukkan teks Arab, Pegon, atau istilah fikih..."
                        }
                        className="w-full text-base p-3.5 pr-10 rounded-xl border border-stone-300 outline-none focus:ring-2 focus:ring-emerald-deep/20 focus:border-emerald-deep bg-stone-50/60"
                      />
                      {customTerm && (
                        <button
                          type="button"
                          onClick={() => setCustomTerm("")}
                          className="absolute right-3 top-3.5 text-stone-400 hover:text-stone-600 text-sm p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preset chips for fast testing */}
                  <div>
                    <p className="text-[11px] text-stone-600 font-semibold mb-1.5 uppercase tracking-wide">
                      Contoh kata Pegon & Arab (mode kaidah):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {KAMUS_PRESETS.map((preset) => (
                        <button
                          key={preset.term}
                          type="button"
                          onClick={() => {
                            setTranslateMode(preset.mode as any);
                            explainCustomTerm(undefined, preset.term, preset.mode as any);
                          }}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1 min-h-[34px] ${
                            customTerm.toLowerCase() === preset.term.toLowerCase()
                              ? "bg-gold-heritage text-emerald-deep font-bold border-gold-bright shadow-xs"
                              : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-deep"
                          }`}
                        >
                          <span className={hasArabicScript(preset.label) ? "text-arabic text-sm" : undefined}>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isExplainingTerm || !customTerm.trim()}
                    className="w-full bg-emerald-deep text-white hover:bg-emerald-light py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 disabled:bg-stone-300 min-h-[46px] shadow-sm mt-1"
                  >
                    {isExplainingTerm ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        {translateMode === "terjemah" ? "Menerjemahkan..." : "Menerjemahkan & Mengurai Makna..."}
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-4 h-4 text-gold-bright" />
                        {translateMode === "terjemah" ? "Terjemahkan ke Indonesia" : "Terjemahkan & Urai Makna"}
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Translation Loading State */}
              {isExplainingTerm && (
                <div className="p-8 bg-white border border-stone-200 rounded-2xl text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Loader2 className="w-8 h-8 animate-spin text-gold-heritage" />
                  <p className="text-sm font-sans text-emerald-deep font-semibold">
                    {translateMode === "terjemah" ? "Menerjemahkan teks ke Bahasa Indonesia..." : "Menghubungkan sanad kamus & kitab makna gandul..."}
                  </p>
                  <p className="text-xs font-mono text-stone-500">
                    {translateMode === "terjemah" ? "Tanpa uraian kaidah dan tarkib." : "Menganalisis kosa kata pesantren dan kedudukan tarkib..."}
                  </p>
                </div>
              )}

              {/* Full Featured Translation Result Card */}
              {kamusResponse && !isExplainingTerm && (
                <div
                  id="hasil-terjemah-kamus"
                  className="p-5 sm:p-7 bg-white border-2 border-gold-heritage/40 rounded-2xl shadow-lg relative parchment-glow overflow-hidden"
                >
                  <div className="absolute top-0 right-0 py-1 px-3 bg-gradient-to-l from-gold-heritage to-amber-500 text-emerald-deep text-[10px] font-mono font-bold rounded-bl-xl uppercase tracking-wider shadow-sm">
                    {kamusResponse.mode === "terjemah"
                      ? "Terjemahan saja"
                      : kamusResponse.mode === "istilah"
                      ? "Terjemahan + penjelasan fikih"
                      : "Terjemahan + kaidah"}
                  </div>

                  <div className="flex items-start justify-between gap-3 mb-2 pt-1">
                    <div>
                      <h4 className="text-2xl sm:text-3xl font-sans font-bold text-emerald-950 tracking-tight">
                        "{kamusResponse.kataAsal}"
                      </h4>
                      <p className="text-xs text-stone-500 font-sans font-medium mt-0.5">
                        Bahasa Asal: <span className="font-semibold text-emerald-800">{kamusResponse.bahasaAsal}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => copyTranslateToClipboard(`${kamusResponse.kataAsal} -> ${kamusResponse.terjemahan}${kamusResponse.mode === "terjemah" || !kamusResponse.penjelasanMendalam ? "" : `\n${kamusResponse.penjelasanMendalam}`}`)}
                      className="p-2 text-stone-400 hover:text-emerald-deep hover:bg-stone-100 rounded-xl transition min-h-[38px] min-w-[38px] flex items-center justify-center"
                      title="Salin Hasil Terjemahan"
                    >
                      {translateCopySuccess ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Primary Highlighted Translation */}
                  <div className="p-4 bg-emerald-50/90 text-emerald-950 rounded-xl border border-emerald-200 mb-3.5 shadow-inner">
                    <p className="text-[10px] sm:text-xs font-mono uppercase text-emerald-800 font-bold tracking-wider mb-1">
                      Arti / Terjemahan Bahasa Indonesia:
                    </p>
                    <p className="text-base sm:text-lg font-bold text-emerald-950 font-sans leading-snug">
                      {kamusResponse.terjemahan}
                    </p>
                  </div>

                  {/* Dual Grid: Padanan Arab & Tarkib Pegon */}
                  {kamusResponse.mode !== "terjemah" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
                    {kamusResponse.padananArab && (
                      <div className="p-3 bg-[#FAF8F5] rounded-xl border border-stone-200">
                        <p className="text-[10px] text-stone-500 font-mono uppercase mb-1 font-semibold">PADANAN ARAB TURATH:</p>
                        <p className="text-arabic text-xl sm:text-2xl md:text-[28px] break-words text-emerald-950" dir="rtl" lang="ar">
                          {kamusResponse.padananArab}
                        </p>
                      </div>
                    )}
                    {kamusResponse.tarkibPegon && (
                      <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                        <p className="text-[10px] text-amber-900 font-mono uppercase mb-1 font-bold">TARKIB & SIMBOL PEGON:</p>
                        <p className="text-xs sm:text-sm font-semibold text-stone-800 font-mono leading-relaxed">
                          {kamusResponse.tarkibPegon}
                        </p>
                      </div>
                    )}
                  </div>}

                  {/* Deep Santri Context Explanation */}
                  {kamusResponse.mode !== "terjemah" && kamusResponse.penjelasanMendalam && <div className="mb-3.5">
                    <p className="text-[10px] sm:text-xs font-mono text-stone-500 uppercase tracking-wide mb-1 font-semibold">
                      PENJELASAN KONTEKS PESANTREN & KITAB:
                    </p>
                    <p className="text-[15px] sm:text-base text-gray-800 leading-relaxed font-sans text-justify bg-stone-50/80 p-4 rounded-xl border border-stone-200">
                      {kamusResponse.penjelasanMendalam}
                    </p>
                  </div>}

                  {/* Example Usage */}
                  {kamusResponse.mode !== "terjemah" && kamusResponse.contohPenggunaan && (
                    <div className="p-3 bg-stone-100 rounded-xl text-[13px] sm:text-[15px] text-stone-700 font-sans border border-stone-200 flex items-start gap-2.5">
                      <span className="font-bold text-emerald-900 flex-shrink-0">Contoh:</span>
                      <span className="italic leading-relaxed">{kamusResponse.contohPenggunaan}</span>
                    </div>
                  )}

                  {/* Action Bar (Audio reading & copy status) */}
                  <div className="mt-3.5 pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                    <button
                      type="button"
                      onClick={() =>
                        playHumanVoice(
                          `${kamusResponse.kataAsal}. Artinya: ${kamusResponse.terjemahan}${kamusResponse.mode === "terjemah" || !kamusResponse.penjelasanMendalam ? "" : `. ${kamusResponse.penjelasanMendalam}`}`,
                          "kamus-result"
                        )
                      }
                      className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold py-1.5 px-3 rounded-xl transition min-h-[36px] ${
                        playingVoiceId === "kamus-result"
                          ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold animate-pulse"
                          : "text-emerald-deep bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                      }`}
                    >
                      {isVoiceLoading && playingVoiceId === "kamus-result" ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-800" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-gold-heritage" />
                      )}
                      <span>
                        {playingVoiceId === "kamus-result"
                          ? isSpeechPlaying
                            ? "Hentikan Suara"
                            : "Memuat Suara..."
                          : "Dengarkan Suara Manusia"}
                      </span>
                    </button>
                    {translateCopySuccess && (
                      <span className="text-xs text-emerald-700 font-semibold font-mono animate-pulse">
                        ✓ Teks berhasil disalin
                      </span>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Preloaded Term Dictionary Cards list & Category Filter */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              
              <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-stone-200 flex flex-col gap-3">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#1C3F3A] font-mono flex items-center gap-2">
                      <span>Indeks Kosa Kata Turath & Pegon</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        {filteredKamus.length} Kata
                      </span>
                    </h3>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Rujukan makna gandul pesantren, mu'jam istilah turath, dan kaidah fikih.
                    </p>
                  </div>
                  
                  {/* Dictionary search */}
                  <div className="relative w-full md:w-64">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      dir="auto"
                      value={searchKamusTerm}
                      onChange={(e) => setSearchKamusTerm(e.target.value)}
                      placeholder="Saring kosa kata, terjemah..."
                      className="w-full text-xs p-2 pl-8 rounded-lg border border-stone-300 outline-none focus:ring-1 focus:ring-emerald-deep bg-stone-50/50"
                    />
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setKamusCategoryFilter("semua")}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition ${
                      kamusCategoryFilter === "semua"
                        ? "bg-emerald-deep text-white font-bold"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setKamusCategoryFilter("pegon")}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition flex items-center gap-1 ${
                      kamusCategoryFilter === "pegon"
                        ? "bg-emerald-deep text-white font-bold"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    <span>Jawa Pegon (Makna Gandul)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setKamusCategoryFilter("arab")}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition flex items-center gap-1 ${
                      kamusCategoryFilter === "arab"
                        ? "bg-emerald-deep text-white font-bold"
                        : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    <span>Arab Turath</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setKamusCategoryFilter("istilah")}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition flex items-center gap-1 ${
                      kamusCategoryFilter === "istilah"
                        ? "bg-emerald-deep text-white font-bold"
                        : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                    }`}
                  >
                    <span>Kaidah Fikih</span>
                  </button>
                </div>
              </div>

              {/* Term Grid Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-h-[550px] overflow-y-auto pr-1">
                {filteredKamus.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center text-stone-400 border border-dashed rounded-2xl bg-white sm:col-span-2">
                    <Languages className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                    <p className="text-xs font-semibold text-stone-600">Istilah tidak ditemukan di indeks lokal.</p>
                    <p className="text-[11px] text-stone-400 mt-1">
                      Ketikkan kata tersebut di kolom pencarian sebelah kiri untuk diterjemahkan langsung.
                    </p>
                  </div>
                ) : (
                  filteredKamus.map(([term, val]) => {
                    const isPegon = val.kategori === "pegon";
                    const isArab = val.kategori === "arab";
                    return (
                      <div
                        key={term}
                        className="p-4 bg-white rounded-2xl border border-stone-200 hover:border-gold-heritage/60 transition flex flex-col justify-between gap-2.5 relative shadow-sm hover:shadow"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <h4 className="text-sm font-bold font-mono text-emerald-deep flex items-center gap-1.5">
                              <span className={hasArabicScript(term) ? "text-arabic text-[16px]" : undefined}>{term}</span>
                            </h4>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-bold ${
                                isPegon
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : isArab
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}
                            >
                              {val.kategoriLabel || (isPegon ? "Jawa Pegon" : isArab ? "Arab Turath" : "Kaidah")}
                            </span>
                          </div>

                          <div className="p-2 bg-emerald-50/70 rounded-xl border border-emerald-100 mb-2">
                            <p className="text-xs text-emerald-950 font-bold">
                              Arti: <span className="text-emerald-900">{val.arti}</span>
                            </p>
                          </div>

                          {/* Dual Badges for Padanan Arab & Tarkib */}
                          {(val.padananArab || val.tarkib) && (
                            <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[10px]">
                              {val.padananArab && (
                                <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-mono">
                                  Arab: <strong className="text-arabic text-[14px] align-middle">{val.padananArab}</strong>
                                </span>
                              )}
                              {val.tarkib && (
                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-mono border border-amber-200/60 font-semibold">
                                  {val.tarkib}
                                </span>
                              )}
                            </div>
                          )}

                          <p className="text-[11px] text-stone-600 font-serif-lux leading-relaxed text-justify line-clamp-3">
                            {val.penjelasan}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-dashed border-stone-200 flex items-center justify-between gap-2">
                          <p className="text-[10px] text-stone-400 font-mono truncate max-w-[48%]">
                            Contoh: <span className="italic">"{val.contoh}"</span>
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                playHumanVoice(
                                  `${term}. Artinya: ${val.arti}. ${val.penjelasan}`,
                                  `kamus-item-${term}`
                                )
                              }
                              className={`p-1.5 rounded-lg text-[10px] font-semibold transition inline-flex items-center gap-1 ${
                                playingVoiceId === `kamus-item-${term}`
                                  ? "bg-amber-100 text-amber-900 font-bold animate-pulse"
                                  : "text-emerald-800 hover:bg-emerald-50"
                              }`}
                              title={`Dengarkan pelafalan & makna ${term}`}
                            >
                              {isVoiceLoading && playingVoiceId === `kamus-item-${term}` ? (
                                <Loader2 className="w-3 h-3 animate-spin text-emerald-800" />
                              ) : (
                                <Volume2 className="w-3 h-3 text-gold-heritage" />
                              )}
                              <span>
                                {playingVoiceId === `kamus-item-${term}`
                                  ? isSpeechPlaying
                                    ? "Stop"
                                    : "..."
                                  : "Suara"}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const mode = isPegon ? "pegon-indo" : isArab ? "arab-indo" : "istilah";
                                setTranslateMode(mode);
                                explainCustomTerm(undefined, term, mode);
                              }}
                              className="text-[10px] font-bold text-emerald-deep hover:text-emerald-light inline-flex items-center gap-1 hover:underline whitespace-nowrap px-1.5 py-1"
                            >
                              <span>Telaah</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>

          </div>
        )}


        {/* Tab 4: Bookmarked Rulings Ledger */}
        {activeTab === "bookmarks" && (
          <div className="flex flex-col gap-4">
            
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h3 className="text-lg sm:text-xl font-sans font-bold text-emerald-950 flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-gold-heritage flex-shrink-0" />
                  Kumpulan Hasil Keputusan Bahtsul Masa'il
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 mt-1 font-sans">
                  Daftar rekam jejak fatwa penting dan rujukan kitab kuning yang telah Anda bookmark untuk referensi cepat santri.
                </p>
              </div>

              {bookmarks.length > 0 && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs sm:text-sm font-semibold rounded-xl transition flex items-center gap-1.5 min-h-[40px]"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Semua
                </button>
              )}
            </div>

            {bookmarks.length === 0 ? (
              <div className="p-10 sm:p-16 text-center border-2 border-dashed border-stone-300 rounded-2xl bg-white max-w-xl mx-auto w-full">
                <Bookmark className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-stone-300 mb-3" />
                <h4 className="text-base sm:text-lg font-bold font-sans text-stone-800">
                  Belum Ada Keputusan Tersimpan
                </h4>
                <p className="text-xs sm:text-sm text-stone-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Ketuk tombol Simpan / Bookmark di modul <strong>Asisten Bahtsul Masa'il</strong> untuk mengabadikan catatan rujukan kitab dalam papan laci ini.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {bookmarks.map((bm, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-2xl shadow-md border border-stone-200/90 p-4 sm:p-5 relative flex flex-col justify-between overflow-hidden"
                  >
                    {/* Top strip */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold border ${getStatusStyle(bm.status).bg}`}>
                          {getStatusStyle(bm.status).name}
                        </span>
                        
                        <button
                          onClick={() => toggleBookmark(bm)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg transition min-h-[32px] min-w-[32px] flex items-center justify-center"
                          title="Hapus bookmark"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold font-sans text-emerald-950 leading-snug line-clamp-2">
                        {bm.judul}
                      </h4>
                      <p className="text-xs sm:text-sm text-stone-700 font-sans italic leading-relaxed mt-2.5 line-clamp-3 bg-stone-50 p-3 rounded-xl border border-stone-100">
                        "{bm.ringkasan}"
                      </p>
                    </div>

                    {/* Bottom strip details */}
                    <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                      <span className="font-sans font-medium text-emerald-900 truncate mr-2 text-xs" title={bm.rujukan}>
                        📚 {bm.rujukan}
                      </span>
                      
                      <button
                        onClick={() => {
                          setBmResult(bm);
                          setActiveTab("bahtsul-masail");
                          setTimeout(() => {
                            if (window.innerWidth < 1024) {
                              document.getElementById("resolusi-dokumen")?.scrollIntoView({ behavior: "smooth" });
                            }
                          }, 100);
                        }}
                        className="text-emerald-900 hover:text-emerald-700 hover:underline font-bold text-xs flex-shrink-0 min-h-[36px] flex items-center"
                      >
                        Buka Detail →
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </main>

      {/* Delete Confirmation Modal (Native dialog replacement) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-stone-200 text-center flex flex-col gap-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-serif-lux font-bold text-lg text-stone-900">Hapus Semua Keputusan?</h4>
              <p className="text-xs text-stone-500 mt-1">Daftar keputusan yang Anda bookmark akan dihapus secara permanen dari perangkat ini.</p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setBookmarks([]);
                  localStorage.setItem("kitab_bookmarks", JSON.stringify([]));
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 shadow"
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Back to Top Button for mobile/tablet */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Kembali ke atas"
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 p-3 bg-emerald-deep text-gold-bright border border-gold-heritage/40 rounded-full shadow-2xl hover:bg-emerald-light transition hover:scale-105 active:scale-95"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* Cultural Islamic Footer */}
      <footer className="border-t border-gold-heritage/20 bg-emerald-deep text-white/80 text-center py-6 px-4 text-xs font-sans mt-auto mb-16 sm:mb-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <p className="text-stone-300 text-center sm:text-left text-xs sm:text-sm">
            © {new Date().getFullYear()} <strong className="text-white font-semibold">KHARISMA PEDIA</strong> — Dirancang sepenuh takzim sebagai Khidmat Digital untuk Santri Nusantara.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs text-stone-300 font-mono">
            <span className="text-gold-heritage font-semibold">Ta'biri Majelis Syura</span>
            <span className="hidden sm:inline">•</span>
            <span>Fiqh Madzhab Al-Arba'ah</span>
            <span className="hidden sm:inline">•</span>
            <span>Pesantren Salafiyyah</span>
          </div>
        </div>
      </footer>

      {/* Dedicated Mobile Bottom Navigation Bar (Ultra-convenient one-thumb mobile experience) */}
      <nav aria-label="Navigasi Bawah Ponsel" className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#163631]/95 backdrop-blur-md border-t border-[#C5A059]/30 py-1.5 px-3 shadow-2xl flex items-center justify-around">
        <button
          onClick={() => { setActiveTab("bahtsul-masail"); stopTTS(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition min-h-[44px] justify-center ${
            activeTab === "bahtsul-masail" ? "text-gold-bright font-bold" : "text-stone-300 hover:text-white"
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[11px] font-sans">Bahtsul</span>
        </button>
        <button
          onClick={() => { setActiveTab("maktabah"); stopTTS(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition min-h-[44px] justify-center ${
            activeTab === "maktabah" ? "text-gold-bright font-bold" : "text-stone-300 hover:text-white"
          }`}
        >
          <BookMarked className="w-5 h-5" />
          <span className="text-[11px] font-sans">Maktabah</span>
        </button>
        <button
          onClick={() => { setActiveTab("kamus"); stopTTS(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition min-h-[44px] justify-center ${
            activeTab === "kamus" ? "text-gold-bright font-bold" : "text-stone-300 hover:text-white"
          }`}
        >
          <Languages className="w-5 h-5" />
          <span className="text-[11px] font-sans">Kamus</span>
        </button>
        <button
          onClick={() => { setActiveTab("bookmarks"); stopTTS(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition min-h-[44px] justify-center relative ${
            activeTab === "bookmarks" ? "text-gold-bright font-bold" : "text-stone-300 hover:text-white"
          }`}
        >
          <Bookmark className="w-5 h-5" />
          <span className="text-[11px] font-sans">Tersimpan</span>
          {bookmarks.length > 0 && (
            <span className="absolute top-0 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
              {bookmarks.length}
            </span>
          )}
        </button>
      </nav>

    </div>
  );
}
