/**
 * Lightweight client-side tokenizer.
 * Handles word/sentence segmentation without external dependencies.
 * For ONNX models, loads a HuggingFace-compatible tokenizer.json.
 */

export class LightweightTokenizer {
  private vocab: Map<string, number> = new Map();
  private reverseVocab: Map<number, string> = new Map();
  private merges: [string, string][] = [];
  private initialized = false;

  /** Split text into sentences using rule-based segmentation */
  static splitSentences(text: string): string[] {
    const raw = text
      .replace(/([.!?])\s+/g, "\$1|SPLIT|")
      .replace(/\n+/g, "|SPLIT|")
      .split("|SPLIT|")
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    return raw;
  }

  /** Tokenize text into word tokens */
  static tokenizeWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  /** Load a HuggingFace tokenizer.json for ONNX model */
  async loadFromJSON(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Tokenizer fetch failed: ${response.status}`);

      const data = await response.json();
      if (data.model?.vocab) {
        for (const [token, id] of Object.entries(data.model.vocab)) {
          this.vocab.set(token, id as number);
          this.reverseVocab.set(id as number, token);
        }
      }
      if (data.model?.merges) {
        this.merges = data.model.merges.map((m: string) => {
          const parts = m.split(" ");
          return [parts[0], parts[1]] as [string, string];
        });
      }
      this.initialized = true;
    } catch (error) {
      console.warn("Tokenizer load failed, using fallback:", error);
    }
  }

  /** Encode text to token IDs (BPE) */
  encode(text: string): number[] {
    if (!this.initialized) return this.fallbackEncode(text);

    const words = text.toLowerCase().split(/\s+/);
    const ids: number[] = [];
    for (const word of words) {
      const id = this.vocab.get(word) ?? this.vocab.get(`▁${word}`) ?? 0;
      ids.push(id);
    }
    return ids;
  }

  /** Decode token IDs back to text */
  decode(ids: number[]): string {
    if (!this.initialized) return "";
    return ids
      .map((id) => this.reverseVocab.get(id) ?? "")
      .join("")
      .replace(/▁/g, " ")
      .trim();
  }

  private fallbackEncode(text: string): number[] {
    // Simple character-level fallback
    return Array.from(text).map((c) => c.charCodeAt(0));
  }
}

/**
 * TF-IDF computation for extractive summarization.
 * Entirely client-side, zero model dependency.
 */
export class TFIDFVectorizer {
  private idfMap: Map<string, number> = new Map();
  private vocabulary: string[] = [];

  fit(documents: string[]): void {
    const df = new Map<string, number>();
    const N = documents.length;

    for (const doc of documents) {
      const uniqueTerms = new Set(LightweightTokenizer.tokenizeWords(doc));
      for (const term of uniqueTerms) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    this.vocabulary = [...df.keys()];
    for (const [term, freq] of df) {
      this.idfMap.set(term, Math.log((N + 1) / (freq + 1)) + 1);
    }
  }

  transform(document: string): Float32Array {
    const tokens = LightweightTokenizer.tokenizeWords(document);
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }

    const vector = new Float32Array(this.vocabulary.length);
    for (let i = 0; i < this.vocabulary.length; i++) {
      const term = this.vocabulary[i];
      const termFreq = (tf.get(term) ?? 0) / Math.max(tokens.length, 1);
      const idf = this.idfMap.get(term) ?? 0;
      vector[i] = termFreq * idf;
    }
    return vector;
  }

  /** Cosine similarity between two vectors */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}