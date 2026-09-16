import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => v === undefined ? 'null' : canonicalJson(v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).filter((key) => obj[key] !== undefined).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(obj[key])).join(',') + '}';
}

export interface CompanySnapshot { name: string; sector?: string; marketCap?: number; summary?: string; oneLiner?: string }
export interface MetricSample { key: string; value: number; currency?: string; ts: number; source?: string }
export interface Thesis { id: string; createdTs: number; author: 'agent' | 'user'; intent: string; claims: string[]; evidenceRefs: string[]; confidence: number; auditRef?: string }
export interface WatchTrigger { id: string; description: string; condition: { metric?: string; op?: '>' | '<' | '>=' | '<=' | '==' | '!='; value?: number }; createdTs: number }
export interface EarningsCallNote { callId: string; callTs: number; toneDelta?: string; qaBalanceDelta?: string; transcriptRefs: string[] }
export interface Dossier<T = string> { ticker: T; snapshot: CompanySnapshot; metricsHistory: MetricSample[]; theses: Thesis[]; watchTriggers: WatchTrigger[]; earningsCalls: EarningsCallNote[]; freshnessTs: number; versionHash: string; createdTs: number; updatedTs: number }
export interface DossierOptions { filePath?: string; inMemory?: boolean; now?: () => number; generateId?: () => string }
export function hashDossier(d: Omit<Dossier, 'versionHash' | 'freshnessTs'>): string { return createHash('sha256').update(canonicalJson(d)).digest('hex').slice(0, 16); }

const defaultNow = () => Date.now();
const defaultId = () => randomUUID();
export class DossierStore {
  private readonly filePath?: string;
  private readonly inMemory: boolean;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly dossiers = new Map<string, Dossier>();
  private loaded = false;
  constructor(opts: DossierOptions = {}) { this.filePath = opts.filePath; this.inMemory = opts.inMemory ?? false; this.now = opts.now ?? defaultNow; this.generateId = opts.generateId ?? defaultId; }
  private ensureLoaded(): void {
    if (this.loaded) return;
    if (!this.inMemory && this.filePath) try { if (existsSync(this.filePath)) for (const line of readFileSync(this.filePath, 'utf8').split('\n').filter((l) => l.trim())) try { const obj = JSON.parse(line) as Dossier; this.dossiers.set(obj.ticker, obj); } catch {} } catch {}
    this.loaded = true;
  }
  flush(): void { if (this.inMemory || !this.filePath) return; mkdirSync(dirname(this.filePath), { recursive: true }); writeFileSync(this.filePath, Array.from(this.dossiers.values()).map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8'); }
  read(ticker: string): Dossier | undefined { this.ensureLoaded(); const d = this.dossiers.get(ticker); return d ? this.clone(d) : undefined; }
  create(ticker: string, snapshot: CompanySnapshot): Dossier { this.ensureLoaded(); const existing = this.dossiers.get(ticker); if (existing) return this.clone(existing); const t = this.now(); const draft: Omit<Dossier, 'versionHash'> = { ticker, snapshot, metricsHistory: [], theses: [], watchTriggers: [], earningsCalls: [], freshnessTs: t, createdTs: t, updatedTs: t }; const d = { ...draft, versionHash: hashDossier(draft) }; this.dossiers.set(ticker, d); this.flush(); return this.clone(d); }
  appendThesis(ticker: string, thesis: Omit<Thesis, 'id' | 'createdTs'> & { id?: string; createdTs?: number }): Dossier { this.ensureLoaded(); const d = this.requireDossier(ticker); const t = this.now(); const updated = this.clone(d); updated.theses = [...d.theses, { ...thesis, id: thesis.id ?? this.generateId(), createdTs: thesis.createdTs ?? t }]; updated.freshnessTs = t; updated.updatedTs = t; return this.commitUpdated(updated); }
  appendMetric(ticker: string, sample: MetricSample): Dossier { this.ensureLoaded(); const d = this.requireDossier(ticker); const t = this.now(); const updated = this.clone(d); updated.metricsHistory = [...d.metricsHistory, { ...sample, ts: sample.ts ?? t }]; updated.freshnessTs = t; updated.updatedTs = t; return this.commitUpdated(updated); }
  addTrigger(ticker: string, trigger: Omit<WatchTrigger, 'id' | 'createdTs'> & { id?: string; createdTs?: number }): Dossier { this.ensureLoaded(); const d = this.requireDossier(ticker); const t = this.now(); const updated = this.clone(d); updated.watchTriggers = [...d.watchTriggers, { ...trigger, id: trigger.id ?? this.generateId(), createdTs: trigger.createdTs ?? t }]; updated.freshnessTs = t; updated.updatedTs = t; return this.commitUpdated(updated); }
  removeTrigger(ticker: string, triggerId: string): Dossier { this.ensureLoaded(); const d = this.requireDossier(ticker); const updated = this.clone(d); updated.watchTriggers = d.watchTriggers.filter((trigger) => trigger.id !== triggerId); updated.freshnessTs = this.now(); updated.updatedTs = updated.freshnessTs; return this.commitUpdated(updated); }
  appendEarningsCall(ticker: string, note: Omit<EarningsCallNote, 'callTs'> & { callTs?: number }): Dossier { this.ensureLoaded(); const d = this.requireDossier(ticker); const t = this.now(); const updated = this.clone(d); updated.earningsCalls = [...d.earningsCalls, { ...note, callTs: note.callTs ?? t }]; updated.freshnessTs = t; updated.updatedTs = t; return this.commitUpdated(updated); }
  listTickers(): string[] { this.ensureLoaded(); return Array.from(this.dossiers.values()).sort((a, b) => b.updatedTs - a.updatedTs).map((d) => d.ticker); }
  toJSON(): Dossier[] { this.ensureLoaded(); return Array.from(this.dossiers.values()).map((d) => this.clone(d)); }
  private requireDossier(ticker: string): Dossier { const d = this.dossiers.get(ticker); if (!d) throw new Error(`DossierStore: no dossier for ticker "${ticker}". Call create() first.`); return d; }
  private clone(d: Dossier): Dossier { return { ...d, snapshot: { ...d.snapshot }, metricsHistory: d.metricsHistory.map((m) => ({ ...m })), theses: d.theses.map((t) => ({ ...t, claims: [...t.claims], evidenceRefs: [...t.evidenceRefs] })), watchTriggers: d.watchTriggers.map((w) => ({ ...w, condition: { ...w.condition } })), earningsCalls: d.earningsCalls.map((c) => ({ ...c, transcriptRefs: [...c.transcriptRefs] })) }; }
  private commitUpdated(d: Dossier): Dossier { const { versionHash: _, ...rest } = d; const final = { ...d, versionHash: hashDossier(rest) }; this.dossiers.set(d.ticker, final); this.flush(); return this.clone(final); }
}
export interface DossierPrePhaseContext { ticker: string; recentTheses: Thesis[]; exists: boolean; freshnessDays: number }
export interface DossierPostPhaseInput { ticker: string; intent: string; claims: string[]; evidenceRefs: string[]; confidence: number; author?: 'agent' | 'user'; auditRef?: string; snapshot?: CompanySnapshot }
export function dossierPrePhase(store: DossierStore, ticker: string, now = Date.now()): DossierPrePhaseContext { const d = store.read(ticker); if (!d) return { ticker, recentTheses: [], exists: false, freshnessDays: 0 }; return { ticker, recentTheses: d.theses.slice(-5), exists: true, freshnessDays: Math.floor((now - d.freshnessTs) / (24 * 60 * 60 * 1000)) }; }
export function dossierPostPhase(store: DossierStore, input: DossierPostPhaseInput): Dossier { if (!store.read(input.ticker)) store.create(input.ticker, input.snapshot ?? { name: input.ticker, oneLiner: 'no snapshot' }); return store.appendThesis(input.ticker, { author: input.author ?? 'agent', intent: input.intent, claims: input.claims, evidenceRefs: input.evidenceRefs, confidence: input.confidence, auditRef: input.auditRef }); }

export interface StrategyDependency { strategyId?: string; version?: number; dataSource?: string; note?: string }
export interface StrategyRecordInput { name: string; author: string; code: string; methodology: unknown; version: number; prevHash: string; dependencies?: StrategyDependency[]; parentStrategyId?: string; parentVersion?: number; description: string; tags?: string[] }
export interface StrategyRecord extends StrategyRecordInput { id: string; ts: number; signature: string }
export interface StrategyStoreOptions { filePath?: string; keyPath?: string; inMemory?: boolean; now?: () => number }
interface StrategyKeyPair { publicKey: string; privateKey: string }
function loadOrCreateStrategyKey(keyPath: string): StrategyKeyPair { if (existsSync(keyPath)) return JSON.parse(readFileSync(keyPath, 'utf8')) as StrategyKeyPair; const kp = generateKeyPairSync('ed25519'); const result = { publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }; mkdirSync(dirname(keyPath), { recursive: true }); writeFileSync(keyPath, JSON.stringify(result, null, 2)); return result; }
function strategyPublicKey(kp: StrategyKeyPair): KeyObject { return createPublicKey({ key: Buffer.from(kp.publicKey, 'base64'), format: 'der', type: 'spki' }); }
export class StrategyStore {
  private readonly filePath?: string; private readonly keyPath?: string; private keyPair: StrategyKeyPair | null = null; private readonly inMemory: boolean; private readonly now: () => number; private memRecords: StrategyRecord[] = [];
  constructor(opts: StrategyStoreOptions = {}) { this.filePath = opts.filePath; this.keyPath = opts.keyPath; this.inMemory = opts.inMemory ?? false; this.now = opts.now ?? defaultNow; this.load(); }
  private load(): void { if (this.inMemory || !this.filePath) { this.memRecords = []; return; } if (existsSync(this.filePath)) this.memRecords = readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as StrategyRecord); }
  private getKeyPair(): StrategyKeyPair { if (!this.keyPair) { if (this.inMemory) { const kp = generateKeyPairSync('ed25519'); this.keyPair = { publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }; } else { if (!this.keyPath) throw new Error('StrategyStore keyPath is required for persistent storage'); this.keyPair = loadOrCreateStrategyKey(this.keyPath); } } return this.keyPair; }
  getPublicKey(): string { return this.getKeyPair().publicKey; }
  publish(input: StrategyRecordInput): StrategyRecord { if (!input.name?.trim()) throw new Error('strategy name required'); if (!input.code?.trim()) throw new Error('strategy code required'); if (!input.methodology) throw new Error('strategy methodology required (P2.a.6)'); if (input.version < 1) throw new Error('strategy version must be >= 1'); if (!/^[0-9a-f]{64}$/.test(input.prevHash)) throw new Error(`prevHash must be 64-hex (got ${input.prevHash})`); const ts = this.now(); const unsigned: StrategyRecord = { ...input, id: `s-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ts, signature: '' }; const priv = createPrivateKey({ key: Buffer.from(this.getKeyPair().privateKey, 'base64'), format: 'der', type: 'pkcs8' }); const signature = sign(null, Buffer.from(canonicalJson(unsigned)), priv).toString('base64'); const record = { ...unsigned, signature }; this.memRecords.push(record); if (!this.inMemory && this.filePath) { mkdirSync(dirname(this.filePath), { recursive: true }); appendFileSync(this.filePath, JSON.stringify(record) + '\n'); } return record; }
  list(): StrategyRecord[] { return [...this.memRecords]; }
  getById(id: string): StrategyRecord | undefined { return this.memRecords.find((r) => r.id === id); }
  getVersions(name: string): StrategyRecord[] { return this.memRecords.filter((r) => r.name === name).sort((a, b) => a.version - b.version); }
  getByNameAndVersion(name: string, version: number): StrategyRecord | undefined { return this.memRecords.find((r) => r.name === name && r.version === version); }
  getLatest(name: string): StrategyRecord | undefined { return this.getVersions(name).at(-1); }
  latestPerName(records?: StrategyRecord[]): StrategyRecord[] { const byName = new Map<string, StrategyRecord[]>(); for (const record of records ?? this.memRecords) byName.set(record.name, [...(byName.get(record.name) ?? []), record]); return Array.from(byName.values()).map((items) => [...items].sort((a, b) => a.version - b.version).at(-1)!).filter(Boolean); }
  verifyRecord(record: StrategyRecord, publicKey: string): boolean { const { signature, ...rest } = record; return verify(null, Buffer.from(canonicalJson({ ...rest, signature: '' })), strategyPublicKey({ publicKey, privateKey: '' }), Buffer.from(signature, 'base64')); }
  verifyChain(): { valid: boolean; brokenAt?: StrategyRecord; reason?: string } { const pub = this.getPublicKey(); const byName = new Map<string, StrategyRecord[]>(); for (const record of this.memRecords) byName.set(record.name, [...(byName.get(record.name) ?? []), record]); for (const records of byName.values()) { const sorted = [...records].sort((a, b) => a.version - b.version); for (let i = 0; i < sorted.length; i++) { const record = sorted[i]!; if (!this.verifyRecord(record, pub)) return { valid: false, brokenAt: record, reason: 'signature invalid' }; if (i === 0 && record.prevHash !== '0'.repeat(64)) return { valid: false, brokenAt: record, reason: 'first record prevHash must be genesis' }; if (i > 0 && record.prevHash !== computeStrategyPrevHash(sorted[i - 1]!)) return { valid: false, brokenAt: record, reason: 'prevHash chain broken' }; } } return { valid: true }; }
}
export function computeStrategyPrevHash(prevRecord: StrategyRecord): string { return createHash('sha256').update(canonicalJson({ ...prevRecord, signature: '' })).digest('hex'); }
export function hashStrategyFingerprint(name: string, author: string, code: string): string { return createHash('sha256').update(canonicalJson({ name, author, code })).digest('hex'); }

export type AuditAction = 'BUY' | 'SELL' | 'COVER' | 'HOLD' | 'CANCEL';
export interface AgentStep { agentId: string; toolCalls: string[]; modelVersion: string }
export interface AuditRecord { id: string; intentId: string; ts: number; author: 'agent' | 'user'; ticker?: string; action: AuditAction; evidenceRefs: string[]; agentChain: AgentStep[]; payload: string; signature: string; prevHash: string }
export interface AuditInput { intentId: string; author: 'agent' | 'user'; action: AuditAction; ticker?: string; evidenceRefs?: string[]; agentChain?: AgentStep[]; ts?: number; id?: string }
export interface AuditVerifyResult { valid: boolean; brokenAt?: number; reason?: string }
export interface AuditKeyPair { publicKey: string; privateKey: string }
export interface AuditChainOptions { filePath?: string; keyPath?: string; inMemory?: boolean; now?: () => number; keyPair?: AuditKeyPair; rotate?: boolean }
const GENESIS_HASH = '0'.repeat(64);
function newAuditKeyPair(): AuditKeyPair { const kp = generateKeyPairSync('ed25519'); return { publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }; }
function auditPrivateKey(kp: AuditKeyPair): KeyObject { return createPrivateKey({ key: Buffer.from(kp.privateKey, 'base64'), format: 'der', type: 'pkcs8' }); }
function auditPublicKey(kp: AuditKeyPair): KeyObject { return createPublicKey({ key: Buffer.from(kp.publicKey, 'base64'), format: 'der', type: 'spki' }); }
export class AuditChain {
  private readonly filePath?: string; private readonly keyPath?: string; private readonly inMemory: boolean; private readonly now: () => number; private readonly records: AuditRecord[] = []; private loaded = false; private keyPair: AuditKeyPair;
  constructor(opts: AuditChainOptions = {}) { this.filePath = opts.filePath; this.keyPath = opts.keyPath; this.inMemory = opts.inMemory ?? false; this.now = opts.now ?? defaultNow; this.keyPair = opts.keyPair ?? this.loadOrCreateKey(opts.rotate === true); }
  append(input: AuditInput): AuditRecord { this.ensureLoaded(); const ts = input.ts ?? this.now(); const prevHash = this.records.length ? createHash('sha256').update(canonicalJson(this.records.at(-1))).digest('hex') : GENESIS_HASH; const draft = { id: input.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, intentId: input.intentId, ts, author: input.author, ticker: input.ticker, action: input.action, evidenceRefs: input.evidenceRefs ?? [], agentChain: input.agentChain ?? [] }; const payload = canonicalJson(draft); const record = { ...draft, payload, signature: sign(null, Buffer.from(payload), auditPrivateKey(this.keyPair)).toString('base64'), prevHash }; this.records.push(record); if (!this.inMemory && this.filePath) { mkdirSync(dirname(this.filePath), { recursive: true }); appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8'); } return record; }
  list(): AuditRecord[] { this.ensureLoaded(); return this.records.map((r) => ({ ...r })); }
  getByIntent(intentId: string): AuditRecord | undefined { this.ensureLoaded(); return [...this.records].reverse().find((r) => r.intentId === intentId); }
  verify(publicKey: string): AuditVerifyResult { this.ensureLoaded(); const pub = auditPublicKey({ publicKey, privateKey: this.keyPair.privateKey }); let expected = GENESIS_HASH; for (let i = 0; i < this.records.length; i++) { const record = this.records[i]!; const { payload: _, signature, prevHash: __, ...signed } = record; if (!verify(null, Buffer.from(canonicalJson(signed)), pub, Buffer.from(signature, 'base64'))) return { valid: false, brokenAt: i, reason: 'signature-mismatch' }; if (record.prevHash !== expected) return { valid: false, brokenAt: i, reason: 'prevHash-mismatch' }; expected = createHash('sha256').update(canonicalJson(record)).digest('hex'); } return { valid: true }; }
  getPublicKey(): string { return this.keyPair.publicKey; }
  private ensureLoaded(): void { if (this.loaded) return; if (!this.inMemory && this.filePath) try { if (existsSync(this.filePath)) for (const line of readFileSync(this.filePath, 'utf8').split('\n').filter((l) => l.trim())) try { this.records.push(JSON.parse(line) as AuditRecord); } catch {} } catch {} this.loaded = true; }
  private loadOrCreateKey(rotate: boolean): AuditKeyPair { if (this.inMemory) return newAuditKeyPair(); if (!this.keyPath) throw new Error('AuditChain keyPath is required for persistent storage'); if (!rotate && existsSync(this.keyPath)) try { return JSON.parse(readFileSync(this.keyPath, 'utf8')) as AuditKeyPair; } catch {} const kp = newAuditKeyPair(); mkdirSync(dirname(this.keyPath), { recursive: true }); writeFileSync(this.keyPath, JSON.stringify(kp, null, 2), 'utf8'); return kp; }
}
let defaultAuditChain: AuditChain | null = null;
export function getDefaultAuditChain(rotate = false, options: Omit<AuditChainOptions, 'rotate'> = {}): AuditChain { if (!defaultAuditChain || rotate) defaultAuditChain = new AuditChain({ ...options, rotate }); return defaultAuditChain; }
export function _resetDefaultAuditChain(): void { defaultAuditChain = null; }

// ============================================================================
// Physical modules migrated from src/storage/* (Round 6.3)
// ============================================================================

export * from './crypto-utils';
export * from './storage-adapter';
export * from './file-history';
export * from './shell-snapshots';
export * from './stats-cache';
export * from './project-storage';
export * from './fund-storage';
export * from './file-lock';
