export const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type DalilItem = {
  teksArab: string;
  terjemahan: string;
  rujukan: string;
  nomorSoal?: string;
  rujukDalilNomorSoal?: string;
};

export type ImageAnswerPart = { label: string; text: string };

export type ImageAnswerSection = {
  number: string;
  text: string;
  parts: ImageAnswerPart[];
};

const MARKER_PATTERN = /((?:^|[\r\n]|[؟?]|\()\s*)([0-9٠-٩۰-۹]+)(?:\)|[.)\-:\u2010-\u2015\u2212]|(?=\r?\n)|(?=\s*[\p{L}]))\s*/gmu;
const LABEL_PATTERN = /(^|\s)(Teks(?:\s+hasil)?\s*OCR|Teks\s+soal\s*\(OCR\)|Hasil\s+OCR|Teks(?:\s+soal)?(?:\s+Arab)?(?:\s+terbaca)?|Terjemah(?:an)?|Jawaban|Penjelasan|Ibarat(?:\s*\/\s*Dalil)?|Dalil|النص(?:\s+المقروء)?|الترجمة|الجواب|الإجابة|الشرح|العبارة)(?=[:：]|\s|[A-Z(]|$)\s*[:：]?\s*/giu;
const QUESTION_TEXT_LABEL = /^(?:Teks(?:\s+hasil)?\s*OCR|Teks\s+soal\s*\(OCR\)|Hasil\s+OCR|Teks(?:\s+soal)?(?:\s+Arab)?(?:\s+terbaca)?|النص(?:\s+المقروء)?)$/iu;

export function cleanOrphanSymbols(text: string) {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/[©®™]/gu, "")
    .replace(/(^|\s)[.·•]+(?=[\p{L}0-9٠-٩۰-۹]|\s|$)/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

export function normalizeQuestionNumber(number: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const digits = number.match(/[0-9٠-٩۰-۹]/gu) || [];
  return digits.map((digit) => {
    if (/[0-9]/u.test(digit)) return digit;
    const arabicIndex = arabicDigits.indexOf(digit);
    return String(arabicIndex >= 0 ? arabicIndex : persianDigits.indexOf(digit));
  }).join("");
}

export function isArabicFirst(text: string) {
  const firstArabic = text.search(ARABIC_SCRIPT);
  const firstLatin = text.search(/[A-Za-z0-9]/);
  return firstArabic >= 0 && (firstLatin < 0 || firstArabic < firstLatin);
}

export function normalizeImageAnswerLabel(label: string, text: string) {
  if (QUESTION_TEXT_LABEL.test(label)) return "Teks hasil OCR";
  if (/^(?:Terjemah(?:an)?|الترجمة)$/iu.test(label)) return "Terjemah";
  if (/^(?:Jawaban|الجواب|الإجابة)$/iu.test(label)) return "Penjelasan";
  if (/^(?:Penjelasan|الشرح)$/iu.test(label)) return "Penjelasan";
  if (/^(?:Ibarat(?:\s*\/\s*Dalil)?|Dalil|العبارة)$/iu.test(label)) return "";
  if (!label) return isArabicFirst(text) ? "Teks hasil OCR" : "Jawaban";
  return label;
}

export function imageAnswerLabelOrder(label: string) {
  const order: Record<string, number> = {
    "Teks hasil OCR": 0,
    "Teks Arab": 0,
    Soal: 0,
    Terjemah: 1,
    Jawaban: 2,
    Penjelasan: 3
  };
  return order[label] ?? 4;
}

export function getImageAnswerParts(text: string): { intro: string; sections: ImageAnswerSection[] } {
  const cleanedText = cleanOrphanSymbols(text);
  const markers = Array.from(cleanedText.matchAll(MARKER_PATTERN));
  const questionParts = markers.map((marker, index) => {
    const start = (marker.index || 0) + marker[0].length;
    const nextMarker = markers[index + 1];
    const nextMarkerPrefix = nextMarker?.[1] || "";
    const end = nextMarker
      ? (nextMarker.index || 0) + (nextMarkerPrefix.startsWith("(") ? 0 : nextMarkerPrefix.length)
      : cleanedText.length;
    return { number: marker[2], text: cleanedText.slice(start, end).trim() };
  });
  const intro = markers.length ? cleanedText.slice(0, markers[0].index || 0).trim() : "";
  const sections = questionParts.length
    ? questionParts
    : [{ number: "", text: cleanedText }];

  return {
    intro,
    sections: sections.map((section) => {
      const labels = Array.from(section.text.matchAll(LABEL_PATTERN));
      const parts: ImageAnswerPart[] = [];
      if (labels.length === 0) {
        parts.push({ label: "", text: section.text });
      } else {
        if ((labels[0].index || 0) > 0) {
          parts.push({ label: "", text: section.text.slice(0, (labels[0].index || 0) + labels[0][1].length).trim() });
        }
        labels.forEach((label, index) => {
          const start = (label.index || 0) + label[0].length;
          const end = labels[index + 1]?.index ?? section.text.length;
          parts.push({ label: label[2], text: section.text.slice(start, end).trim() });
        });
      }

      const formattedParts = parts.flatMap((part) => {
        const isQuestionText = QUESTION_TEXT_LABEL.test(part.label);
        if (part.label && !isQuestionText) return [part];
        const inlineTranslation = part.text.match(/^([\s\S]*?[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF][\s\S]*?)\s*[(（]([^()（）]+)[)）]\s*[.؟!?]*$/u);
        if (!inlineTranslation || !ARABIC_SCRIPT.test(inlineTranslation[1]) || ARABIC_SCRIPT.test(inlineTranslation[2]) || !/[A-Za-z]/u.test(inlineTranslation[2])) {
          return [part];
        }
        return [
          { label: part.label, text: inlineTranslation[1].trim() },
          { label: "Terjemahan", text: inlineTranslation[2].trim() }
        ];
      });

      const hasTranslationLabel = formattedParts.some((part) => /^Terjemah(?:an)?$/iu.test(part.label));
      const visibleParts = (hasTranslationLabel
        ? formattedParts.filter((part) => !(/^Terjemah(?:an)?$/iu.test(part.label) && /^(?:tidak diperlukan|tidak ada)\.?$/iu.test(part.text)))
        : formattedParts)
        .map((part) => ({
          label: normalizeImageAnswerLabel(part.label, part.text),
          text: part.text
        }))
        .filter((part) => Boolean(part.label))
        .sort((left, right) => imageAnswerLabelOrder(left.label) - imageAnswerLabelOrder(right.label));
      const mergedParts = visibleParts.reduce<ImageAnswerPart[]>((result, part) => {
        if (part.label === "Penjelasan") {
          const existingExplanation = result.find((item) => item.label === "Penjelasan");
          if (existingExplanation) {
            existingExplanation.text = [existingExplanation.text, part.text].filter(Boolean).join("\n\n");
          } else {
            result.push(part);
          }
        } else {
          result.push(part);
        }
        return result;
      }, []);
      return { ...section, parts: mergedParts };
    })
  };
}

export function getOcrQuestionText(ocrText: string | undefined, questionNumber: string) {
  if (!ocrText?.trim()) return "";
  const cleanedText = cleanOrphanSymbols(ocrText.replace(/\[OCR gambar \d+\]/giu, ""));
  const markers = Array.from(cleanedText.matchAll(MARKER_PATTERN));
  const normalizedNumber = normalizeQuestionNumber(questionNumber);
  const markerIndex = markers.findIndex((marker) => normalizeQuestionNumber(marker[2]) === normalizedNumber);
  if (markerIndex < 0) return "";
  const marker = markers[markerIndex];
  const start = (marker.index || 0) + marker[0].length;
  const nextMarker = markers[markerIndex + 1];
  const nextPrefix = nextMarker?.[1] || "";
  const end = nextMarker
    ? (nextMarker.index || 0) + (nextPrefix.startsWith("(") ? 0 : nextPrefix.length)
    : cleanedText.length;
  const questionText = cleanedText.slice(start, end).trim();
  return ARABIC_SCRIPT.test(questionText) ? questionText : "";
}

export function getDalilForImageQuestion(
  dalil: DalilItem[] | undefined,
  questionNumber: string,
  questionIndex: number
): DalilItem[] {
  if (!dalil?.length) return [];
  const normalizedNumber = normalizeQuestionNumber(questionNumber);
  const matchingDalil = dalil.filter((item) =>
    item.nomorSoal && normalizeQuestionNumber(item.nomorSoal) === normalizedNumber
  );
  if (matchingDalil.length > 0) return matchingDalil;
  if (dalil.every((item) => !item.nomorSoal)) {
    return dalil[questionIndex] ? [dalil[questionIndex]] : [];
  }
  return [];
}

function normalizeDalilText(text: string | undefined) {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function buildFirstDalilNumberByText(dalil: DalilItem[] | undefined) {
  const firstNumberByText = new Map<string, string>();
  for (const item of dalil ?? []) {
    const key = normalizeDalilText(item.teksArab);
    if (!key || !item.nomorSoal?.trim() || firstNumberByText.has(key)) continue;
    firstNumberByText.set(key, item.nomorSoal);
  }
  return firstNumberByText;
}

export function dedupeSectionDalil(
  items: DalilItem[],
  sectionNumber: string,
  firstNumberByText: Map<string, string>
): DalilItem[] {
  return items.map((item) => {
    const key = normalizeDalilText(item.teksArab);
    const firstNumber = key ? firstNumberByText.get(key) : undefined;
    if (!firstNumber || !sectionNumber || normalizeQuestionNumber(firstNumber) === normalizeQuestionNumber(sectionNumber)) {
      return item;
    }
    return {
      ...item,
      teksArab: "",
      terjemahan: "",
      rujukan: "",
      rujukDalilNomorSoal: firstNumber
    };
  });
}
