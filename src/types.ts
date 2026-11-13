export interface MarketTelemetry {
  updatedAt: number;
  quaiUsd: number;
  quaiChange24h: number;
  quaiHigh24h: number;
  quaiLow24h: number;
  quaiVolumeUsd24h: number;
  usdRubCbr: number;
  usdRubDate: string;
  oneQiInQuai: number;
  qiUsd: number;
  quaiRub: number;
  qiRub: number;
  avgBlockTimeMs: number;
  currentBlock: number;
}

export interface DenominationRow {
  denomIndex: number;
  hexCode: string;
  label: string;
  qiPerUnit: string;
  totalCount: number;
  unlockedCount: number;
  lockedCount: number;
  totalQi: string;
  totalQuaiEquivalent: string;
  totalUsdEquivalent: string;
  totalRubEquivalent: string;
}

export interface UnlockScheduleRow {
  dayOffset: number;
  estimatedDate: string;
  startBlock: number;
  endBlock: number;
  utxoCount: number;
  qiAmount: string;
  quaiEquivalent: string;
  usdEquivalent: string;
  rubEquivalent: string;
  cumulativeQi: string;
  cumulativeQuai: string;
}

export interface UnlockedOutpointItem {
  txHash: string;
  index: number;
  denominationIndex: number;
  qit: string;
  qi: string;
  lockBlock: number;
  status: 'UNLOCKED';
}

export interface LockedOutpointItem {
  txHash: string;
  index: number;
  denominationIndex: number;
  qit: string;
  qi: string;
  lockBlock: number;
  blocksRemaining: number;
  estimatedHoursRemaining: number;
  status: 'LOCKED';
}

export interface WalletInspectionResult {
  address: string;
  publicKey: string | null;
  hasPrivateKey: boolean;
  ledgerType: 'QI_UTXO' | 'QUAI_EVM';
  zone: string;
  zoneName: string;
  currentBlock: number;
  evmNonce?: number;
  market: MarketTelemetry;
  exchangeRate: {
    oneQiInQuai: string;
    oneQuaiInQi: string;
  };
  balances: {
    totalQi: string;
    totalQit: string;
    totalQuaiEquivalent: string;
    totalUsd: string;
    totalRub: string;
    unlockedQi: string;
    unlockedQit: string;
    unlockedQuaiEquivalent: string;
    unlockedUsd: string;
    unlockedRub: string;
    lockedQi: string;
    lockedQit: string;
    lockedQuaiEquivalent: string;
    lockedUsd: string;
    lockedRub: string;
  };
  utxoSummary: {
    totalOutpoints: number;
    unlockedOutpointsCount: number;
    lockedOutpointsCount: number;
    minLockBlock: number | null;
    maxLockBlock: number | null;
    nextUnlockBlocksRemaining: number;
    nextUnlockEstimatedHours: number;
    fullUnlockBlocksRemaining: number;
    fullUnlockEstimatedDays: number;
  };
  bip44IsolatedInfo: {
    status: string;
    derivationContainer: string;
    changeRoutingAddress: string;
  } | null;
  denominationsBreakdown: DenominationRow[];
  unlockSchedule: UnlockScheduleRow[];
  unlockedOutpointsList: UnlockedOutpointItem[];
  lockedSampleList: LockedOutpointItem[];
}

export interface ConversionOutputDetail {
  address: string;
  denominationIndex: number;
  qiAmount: string;
  type: 'CONVERSION_TO_QUAI' | 'CHANGE_BACK_TO_QI_WALLET';
  changePrivateKey?: string;
}

export interface ConversionPreviewResult {
  mode: 'DRY_RUN' | 'BROADCASTED';
  sourceQiAddress: string;
  destinationQuaiAddress: string;
  requestedAmountQi: string;
  estimatedFeeQi?: string;
  totalOutputQi?: string;
  expectedQuaiReceived: string;
  conversionDataHex?: string;
  slippageBps?: number;
  inputsUsedCount?: number;
  outputs?: ConversionOutputDetail[];
  txHashPreview?: string;
  txHash?: string;
  signedRawBytesLength?: number;
  signedTxSnippet?: string;
}

export interface DecryptedQuaiWallet {
  address: string;
  privateKey: string;
  ledgerType: 'QUAI_EVM' | 'QI_UTXO' | 'UNKNOWN';
  zone: string;
  nonce: number;
  balanceQuai: string;
  balanceQiEquivalent: string;
  balanceUsd: string;
  balanceRub: string;
  qiCompanionAddress: string | null;
  qiCompanionPrivateKey: string | null;
  sourceLabel: string;
}

export interface QuaiActionResult {
  mode: 'DRY_RUN' | 'BROADCASTED';
  actionType: 'CONVERT_QUAI_TO_QI' | 'TRANSFER_QUAI';
  fromQuaiAddress: string;
  toAddress: string;
  amountQuai: string;
  expectedQiOutput: string | null;
  estimatedFeeQuai: string;
  gasLimit: string;
  nonce: number;
  dataHex: string;
  txHash: string;
  signedTxSnippet?: string;
}

export interface GeneratedQuaiReceiver {
  address: string;
  privateKey: string;
  mnemonicPhrase: string;
  zone: string;
  derivationPath: string;
  isQuaiAddress: boolean;
}

export type TransactionStatusType = 'SUCCESS' | 'PENDING' | 'FAILED';

export interface WalletTransactionItem {
  txHash: string;
  timestamp: string | null;
  blockNumber: number | null;
  confirmations: number;
  status: TransactionStatusType;
  statusLabel: string;
  direction: 'IN' | 'OUT' | 'SELF' | 'CONVERSION';
  operationType:
    | 'TRANSFER_QUAI'
    | 'CONVERT_QUAI_TO_QI'
    | 'CONVERT_QI_TO_QUAI'
    | 'MINING_REWARD'
    | 'CONTRACT_CALL'
    | 'UTXO_OUTPUT';
  operationLabel: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  currency: 'QUAI' | 'QI';
  amountUsd: string;
  amountRub: string;
  feeQuai: string | null;
  explorerTxUrl: string;
  explorerFromUrl: string;
  explorerToUrl: string;
}

export interface WalletTransactionsResponse {
  address: string;
  ledgerType: 'QUAI_EVM' | 'QI_UTXO';
  currentBlock: number;
  totalCount: number;
  transactions: WalletTransactionItem[];
}

