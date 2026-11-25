import { describe, expect, it } from "vitest";
import {
  buildFirstDalilNumberByText,
  dedupeSectionDalil,
  getDalilForImageQuestion,
  getImageAnswerParts,
  getOcrQuestionText,
  normalizeQuestionNumber
} from "./imageAnswer";

describe("format jawaban bernomor Maktabah", () => {
  it("menyusun urutan nomor, teks OCR, terjemah, lalu penjelasan", () => {
    const formatted = getImageAnswerParts(
      [
        "1.",
        "Teks OCR: مَا حُكْمُ الطَّهَارَةِ؟",
        "Terjemah: Apa hukum bersuci?",
        "Penjelasan: Wajib dipelajari sebelum sholat.",
        "2.",
        "Teks OCR: مَا حُكْمُ الصَّلَاةِ؟",
        "Penjelasan: Sama dengan nomor 1."
      ].join("\n")
    );

    expect(formatted.sections).toHaveLength(2);
    expect(formatted.sections[0].number).toBe("1");
    expect(formatted.sections[0].parts.map((part) => part.label)).toEqual([
      "Teks hasil OCR",
      "Terjemah",
      "Penjelasan"
    ]);
    expect(formatted.sections[1].number).toBe("2");
    expect(formatted.sections[1].parts.map((part) => part.label)).toEqual([
      "Teks hasil OCR",
      "Penjelasan"
    ]);
    expect(formatted.sections[1].parts[1].text).toBe("Sama dengan nomor 1.");
  });

  it("mengenali nomor Arab-Indic dan tidak menampilkan terjemah yang tidak diperlukan", () => {
    const formatted = getImageAnswerParts(
      ["١.", "Teks Arab: مَا حُكْمُ الطَّهَارَةِ؟", "Terjemah: Tidak diperlukan.", "Penjelasan: Wajib."].join("\n")
    );

    expect(formatted.sections[0].number).toBe("١");
    expect(formatted.sections[0].parts).toEqual([
      { label: "Teks hasil OCR", text: "مَا حُكْمُ الطَّهَارَةِ؟" },
      { label: "Penjelasan", text: "Wajib." }
    ]);
  });

  it("menormalkan angka Arab dan angka Latin", () => {
    expect(normalizeQuestionNumber("١٢")).toBe("12");
    expect(normalizeQuestionNumber("۱۲")).toBe("12");
    expect(normalizeQuestionNumber("12")).toBe("12");
  });

  it("mengambil teks soal dari OCR perangkat untuk nomor yang cocok", () => {
    const ocrText = "[OCR gambar 1]\n1. مَا حُكْمُ الطَّهَارَةِ؟\n2. مَا حُكْمُ الصَّلَاةِ؟";

    expect(getOcrQuestionText(ocrText, "2")).toBe("مَا حُكْمُ الصَّلَاةِ؟");
    expect(getOcrQuestionText(ocrText, "9")).toBe("");
  });
});

describe("pencocokan dan pengulangan dalil", () => {
  const dalil = [
    {
      teksArab: "الطَّهَارَةُ شَطْرُ الْإِيمَانِ",
      terjemahan: "Bersuci adalah separuh iman.",
      rujukan: "HR. Muslim",
      nomorSoal: "1",
      rujukDalilNomorSoal: ""
    },
    {
      teksArab: "الطَّهَارَةُ شَطْرُ الْإِيمَانِ",
      terjemahan: "Bersuci adalah separuh iman.",
      rujukan: "HR. Muslim",
      nomorSoal: "2",
      rujukDalilNomorSoal: ""
    }
  ];

  it("memilih dalil sesuai nomor soal", () => {
    expect(getDalilForImageQuestion(dalil, "١", 0)).toHaveLength(1);
    expect(getDalilForImageQuestion(dalil, "١", 0)[0].nomorSoal).toBe("1");
  });

  it("merujuk nomor sebelumnya saat kutipan dalil berulang", () => {
    const firstNumbers = buildFirstDalilNumberByText(dalil);
    const unique = dedupeSectionDalil([dalil[0]], "1", firstNumbers);
    expect(unique[0].teksArab).toBe("الطَّهَارَةُ شَطْرُ الْإِيمَانِ");

    const repeated = dedupeSectionDalil([dalil[1]], "2", firstNumbers);
    expect(repeated[0].teksArab).toBe("");
    expect(repeated[0].rujukDalilNomorSoal).toBe("1");
  });

  it("mempertahankan rujukan dalil yang sudah diberikan model", () => {
    const items = [{
      teksArab: "",
      terjemahan: "",
      rujukan: "",
      nomorSoal: "3",
      rujukDalilNomorSoal: "1"
    }];
    const result = dedupeSectionDalil(items, "3", buildFirstDalilNumberByText(items));
    expect(result[0].rujukDalilNomorSoal).toBe("1");
  });
});
