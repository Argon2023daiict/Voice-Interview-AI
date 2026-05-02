import type { SummaryResult, TranscriptEntry } from "../types";
import { APP_CONFIG } from "../config";
import { LightweightTokenizer, TFIDFVectorizer } from "./tokenizer";

/**
 * Production extractive summarizer using TextRank algorithm.
 * Runs entirely client-side with ZERO model files.
 * Typical inference: 2–15ms for conversations up to 5000 words.
 */
export class ExtractiveSummarizer {
  private readonly damping = 0.85;
  private readonly convergenceThreshold = 0.0001;
  private readonly maxIterations = 50;

  /** Generate summary from transcript entries */
  summarize(
    entries: readonly TranscriptEntry[],
    maxSentences: number = APP_CONFIG.maxSummarySentences
  ): SummaryResult {
    const startTime = performance.now();

    const fullText = entries.map((e) => e.text).join(". ");
    const sentences = LightweightTokenizer.splitSentences(fullText);

    if (sentences.length <= maxSentences) {
      return {
        text: sentences.join(" "),
        keyPoints: sentences,
        confidence: 1.0,
        latencyMs: performance.now() - startTime,
        method: "extractive",
      };
    }

    // Build TF-IDF vectors
    const vectorizer = new TFIDFVectorizer();
    vectorizer.fit(sentences);
    const vectors = sentences.map((s) => vectorizer.transform(s));

    // Build similarity matrix
    const n = sentences.length;
    const similarity = Array.from({ length: n }, () => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = TFIDFVectorizer.cosineSimilarity(vectors[i], vectors[j]);
        similarity[i][j] = sim;
        similarity[j][i] = sim;
      }
    }

    // TextRank iteration
    const scores = this.textRank(similarity, n);

    // Select top sentences preserving original order
    const ranked = scores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .sort((a, b) => a.idx - b.idx);

    const keyPoints = ranked.map((r) => sentences[r.idx]);
    const avgConfidence =
      ranked.reduce((sum, r) => sum + r.score, 0) / ranked.length;

    const latencyMs = performance.now() - startTime;

    return {
      text: keyPoints.join(" "),
      keyPoints,
      confidence: Math.min(avgConfidence / (scores[0] || 1), 1.0),
      latencyMs,
      method: "extractive",
    };
  }

  /** Summarize plain text (convenience method) */
  summarizeText(text: string, maxSentences?: number): SummaryResult {
    const entry: TranscriptEntry = {
      id: "direct",
      speaker: "candidate",
      text,
      timestamp: Date.now(),
    };
    return this.summarize([entry], maxSentences);
  }

  /** TextRank algorithm (PageRank variant for sentences) */
  private textRank(similarity: Float32Array[], n: number): number[] {
    const scores = new Float32Array(n).fill(1.0 / n);
    const outSum = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        outSum[i] += similarity[i][j];
      }
    }

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const newScores = new Float32Array(n);
      let maxDelta = 0;

      for (let i = 0; i < n; i++) {
        let rank = 0;
        for (let j = 0; j < n; j++) {
          if (j !== i && outSum[j] > 0) {
            rank += (similarity[j][i] / outSum[j]) * scores[j];
          }
        }
        newScores[i] = (1 - this.damping) / n + this.damping * rank;
        maxDelta = Math.max(maxDelta, Math.abs(newScores[i] - scores[i]));
      }

      scores.set(newScores);
      if (maxDelta < this.convergenceThreshold) break;
    }

    return Array.from(scores);
  }

  /** Extract key topics from transcript */
  extractTopics(entries: readonly TranscriptEntry[], topN = 8): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "need", "dare", "ought",
      "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
      "as", "into", "through", "during", "before", "after", "above",
      "below", "between", "out", "off", "over", "under", "again",
      "further", "then", "once", "i", "me", "my", "we", "our", "you",
      "your", "he", "him", "she", "her", "it", "its", "they", "them",
      "what", "which", "who", "whom", "this", "that", "these", "those",
      "am", "and", "but", "if", "or", "because", "not", "no", "so",
      "very", "just", "about", "also", "like", "well", "really", "think",
      "know", "going", "get", "got", "much", "many", "some", "any",
    ]);

    const freq = new Map<string, number>();
    for (const entry of entries) {
      const words = LightweightTokenizer.tokenizeWords(entry.text);
      for (const word of words) {
        if (word.length > 2 && !stopWords.has(word)) {
          freq.set(word, (freq.get(word) ?? 0) + 1);
        }
      }
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }
}