import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import * as quais from 'quais';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_BASE_URL = 'https://rpc.quai.network';
const CYPRUS1_RPC_URL = 'https://rpc.quai.network/cyprus1';

const DENOMINATION_LABELS: Record<number, { qit: bigint; qi: string; label: string }> = {
  0: { qit: 1n, qi: '0.001', label: '0.001 QI (1 Qit)' },
  1: { qit: 5n, qi: '0.005', label: '0.005 QI (5 Qit)' },
  2: { qit: 10n, qi: '0.010', label: '0.010 QI (10 Qit)' },
  3: { qit: 50n, qi: '0.050', label: '0.050 QI (50 Qit)' },
  4: { qit: 100n, qi: '0.100', label: '0.100 QI (100 Qit)' },
  5: { qit: 500n, qi: '0.500', label: '0.500 QI (500 Qit)' },
  6: { qit: 1000n, qi: '1.000', label: '1.000 QI (1,000 Qit)' },
  7: { qit: 5000n, qi: '5.000', label: '5.000 QI (5,000 Qit)' },
  8: { qit: 10000n, qi: '10.000', label: '10.000 QI (10,000 Qit)' },
  9: { qit: 20000n, qi: '20.000', label: '20.000 QI (20,000 Qit)' },
  10: { qit: 100000n, qi: '100.000', label: '100.000 QI' },
  11: { qit: 1000000n, qi: '1000.000', label: '1,000.000 QI' },
  12: { qit: 10000000n, qi: '10000.000', label: '10,000.000 QI' },
  13: { qit: 100000000n, qi: '100000.000', label: '100,000.000 QI' },
  14: { qit: 1000000000n, qi: '1000000.000', label: '1,000,000.000 QI' },
};

interface MarketRatesCache {
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

let cachedMarket: MarketRatesCache | null = null;

async function rpcBatchCall(requests: Array<{ method: string; params: unknown[] }>) {
  const payload = requests.map((req, idx) => ({
    jsonrpc: '2.0',
    id: idx + 1,
    method: req.method,
    params: req.params,
  }));

  const response = await fetch(CYPRUS1_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ошибка соединения с узлом Quai RPC: HTTP ${response.status}`);
  }

  const results = (await response.json()) as Array<{ id: number; result?: any; error?: { message: string } }>;
  results.sort((a, b) => a.id - b.id);
  return results;
}

async function fetchLiveMarketAndNetwork(): Promise<MarketRatesCache> {
  const now = Date.now();
  if (cachedMarket && now - cachedMarket.updatedAt < 25_000) {
    return cachedMarket;
  }

  let quaiUsd = cachedMarket?.quaiUsd ?? 0.00676;
  let quaiChange24h = cachedMarket?.quaiChange24h ?? 0;
  let quaiHigh24h = cachedMarket?.quaiHigh24h ?? 0.0071;
  let quaiLow24h = cachedMarket?.quaiLow24h ?? 0.0065;
  let quaiVolumeUsd24h = cachedMarket?.quaiVolumeUsd24h ?? 12800;
  let usdRubCbr = cachedMarket?.usdRubCbr ?? 83.15;
  let usdRubDate = cachedMarket?.usdRubDate ?? new Date().toISOString();
  let avgBlockTimeMs = cachedMarket?.avgBlockTimeMs ?? 5000;
  let oneQiInQuai = cachedMarket?.oneQiInQuai ?? 153.5065;
  let currentBlock = cachedMarket?.currentBlock ?? 11091000;

  const [rpcRes, gateRes, cgRes, cbrRes, statsRes] = await Promise.allSettled([
    rpcBatchCall([
      { method: 'quai_blockNumber', params: [] },
      { method: 'quai_qiToQuai', params: ['0x3e8', 'latest'] },
    ]),
    fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=QUAI_USDT', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.json()),
    fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=quai-network&vs_currencies=usd,rub&include_24hr_change=true',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    ).then((r) => r.json()),
    fetch('https://www.cbr-xml-daily.ru/daily_json.js', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.json()),
    fetch('https://quaiscan.io/api/v2/stats', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.json()),
  ]);

  if (rpcRes.status === 'fulfilled') {
    const bHex = rpcRes.value[0]?.result;
    const qHex = rpcRes.value[1]?.result;
    if (bHex) currentBlock = parseInt(bHex, 16);
    if (qHex) oneQiInQuai = Number(quais.formatQuai(qHex));
  }

  if (gateRes.status === 'fulfilled' && Array.isArray(gateRes.value) && gateRes.value[0]) {
    const t = gateRes.value[0];
    const last = Number(t.last);
    if (last > 0) quaiUsd = last;
    if (t.change_percentage != null) quaiChange24h = Number(t.change_percentage);
    if (t.high_24h != null) quaiHigh24h = Number(t.high_24h);
    if (t.low_24h != null) quaiLow24h = Number(t.low_24h);
    if (t.quote_volume != null) quaiVolumeUsd24h = Number(t.quote_volume);
  } else if (cgRes.status === 'fulfilled' && cgRes.value?.['quai-network']?.usd) {
    quaiUsd = Number(cgRes.value['quai-network'].usd);
    if (cgRes.value['quai-network'].usd_24h_change != null) {
      quaiChange24h = Number(cgRes.value['quai-network'].usd_24h_change);
    }
  }

  if (cbrRes.status === 'fulfilled' && cbrRes.value?.Valute?.USD?.Value) {
    usdRubCbr = Number(cbrRes.value.Valute.USD.Value);
    if (cbrRes.value.Date) usdRubDate = String(cbrRes.value.Date);
  }

  if (statsRes.status === 'fulfilled' && statsRes.value?.average_block_time) {
    avgBlockTimeMs = Number(statsRes.value.average_block_time);
  }

  const qiUsd = oneQiInQuai * quaiUsd;
  const quaiRub = quaiUsd * usdRubCbr;
  const qiRub = qiUsd * usdRubCbr;

  cachedMarket = {
    updatedAt: now,
    quaiUsd,
    quaiChange24h,
    quaiHigh24h,
    quaiLow24h,
    quaiVolumeUsd24h,
    usdRubCbr,
    usdRubDate,
    oneQiInQuai,
    qiUsd,
    quaiRub,
    qiRub,
    avgBlockTimeMs,
    currentBlock,
  };

  return cachedMarket;
}

/**
 * Creates a deterministic QiHDWallet from a 32-byte private key so that:
 * 1. The imported private key never collides with the BIP44 derivation tree.
 * 2. Any UTXO change outputs receive deterministic, unique Qi change addresses
 *    (required by go-quai's "Enforce no address reuse" rule in state_processor.go).
 */
async function createDeterministicQiWallet(normalizedPk: string) {
  const entropy = quais.getBytes(quais.keccak256(normalizedPk)).slice(0, 16);
  const deterministicMnemonic = quais.Mnemonic.fromEntropy(entropy);
  const qiWallet = quais.QiHDWallet.fromMnemonic(deterministicMnemonic);
  const addrInfo = await qiWallet.importPrivateKey(normalizedPk);

  const changeAddresses: Array<{ address: string; index: number; privateKey: string }> = [];
  for (let i = 0; i < 6; i++) {
    const chInfo = qiWallet.getNextChangeAddressSync(0, quais.Zone.Cyprus1);
    const chPk = qiWallet.getPrivateKey(chInfo.address);
    changeAddresses.push({
      address: chInfo.address,
      index: chInfo.index,
      privateKey: chPk,
    });
  }

  return {
    qiWallet,
    addrInfo,
    changeAddresses,
    deterministicSeedPhrase: deterministicMnemonic.phrase,
  };
}

function buildConversionDataPayload(qiRefundAddress: string, slippageBps = 1000): Uint8Array {
  const clampedSlippage = Math.max(50, Math.min(9000, Math.floor(slippageBps)));
  const dataBytes = new Uint8Array(22);
  dataBytes[0] = (clampedSlippage >> 8) & 0xff;
  dataBytes[1] = clampedSlippage & 0xff;
  dataBytes.set(quais.getBytes(qiRefundAddress), 2);
  return dataBytes;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Live Market & Network Telemetry (QUAI/USD, QI/USD, CBR USD/RUB, Cyprus-1 Block & Protocol Rate)
  app.get('/api/market', async (_req, res) => {
    try {
      const market = await fetchLiveMarketAndNetwork();
      res.json(market);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Ошибка получения курсов валют и статистики сети.' });
    }
  });

  // Inspect a Qi or Quai wallet by address or privateKey (Stateless, never logs or stores keys)
  app.post('/api/wallet/inspect', async (req, res) => {
    try {
      const { input } = req.body as { input?: string };
      if (!input || typeof input !== 'string' || !input.trim()) {
        res.status(400).json({ error: 'Введите приватный ключ (0x...) или адрес кошелька QI / QUAI.' });
        return;
      }

      const trimmed = input.trim();
      const normalizedHex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;

      let targetAddress = '';
      let publicKey: string | null = null;
      let hasPrivateKey = false;
      let deterministicChangeAddresses: Array<{ address: string; index: number; privateKey: string }> = [];
      let bip44IsolatedInfo: {
        status: string;
        derivationContainer: string;
        changeRoutingAddress: string;
      } | null = null;

      if (quais.isHexString(normalizedHex, 32)) {
        hasPrivateKey = true;
        const rawWallet = new quais.Wallet(normalizedHex);
        if (quais.isQiAddress(rawWallet.address)) {
          const { addrInfo, changeAddresses } = await createDeterministicQiWallet(normalizedHex);
          targetAddress = addrInfo.address;
          publicKey = addrInfo.pubKey;
          deterministicChangeAddresses = changeAddresses;
          bip44IsolatedInfo = {
            status: 'Изолированный контейнер PrivateKey + детерминированные адреса сдачи инициализированы',
            derivationContainer: 'QiHDWallet.privatekeyWallet (index: -1, zone: 0x00)',
            changeRoutingAddress: changeAddresses[0]?.address || addrInfo.address,
          };
        } else {
          targetAddress = rawWallet.address;
          publicKey = rawWallet.signingKey.compressedPublicKey;
          bip44IsolatedInfo = {
            status: 'Кошелек QUAI (EVM) успешно расшифрован из приватного ключа',
            derivationContainer: 'Quai EVM Signer (Zone 0x00 Cyprus-1)',
            changeRoutingAddress: rawWallet.address,
          };
        }
      } else if (quais.isHexString(normalizedHex, 20)) {
        targetAddress = quais.getAddress(normalizedHex);
      } else {
        res.status(400).json({
          error:
            'Некорректный формат. Введите 64-символьный приватный ключ (0x...) или 40-символьный адрес кошелька (0x...).',
        });
        return;
      }

      const isQi = quais.isQiAddress(targetAddress);
      const zone = quais.getZoneForAddress(targetAddress) || '0x00';

      const [market, batchResults] = await Promise.all([
        fetchLiveMarketAndNetwork(),
        (async () => {
          const rpcQueries: Array<{ method: string; params: unknown[] }> = [
            { method: 'quai_blockNumber', params: [] },
            { method: 'quai_getBalance', params: [targetAddress, 'latest'] },
            { method: 'quai_getOutpointsByAddress', params: [targetAddress] },
            { method: 'quai_qiToQuai', params: ['0x3e8', 'latest'] },
            { method: 'quai_getTransactionCount', params: [targetAddress, 'latest'] },
          ];
          for (const ch of deterministicChangeAddresses) {
            rpcQueries.push({ method: 'quai_getOutpointsByAddress', params: [ch.address] });
          }
          return rpcBatchCall(rpcQueries);
        })(),
      ]);

      const currentBlockHex = batchResults[0]?.result || '0x0';
      const currentBlock = parseInt(currentBlockHex, 16);
      const rawBalanceHex = batchResults[1]?.result || '0x0';
      const primaryOutpoints: Array<{
        denomination: string;
        index: string;
        lock: string;
        txHash: string;
      }> = Array.isArray(batchResults[2]?.result) ? batchResults[2].result : [];
      const oneQiInQuaiWeiHex = batchResults[3]?.result || '0x0';
      const oneQiInQuai = oneQiInQuaiWeiHex ? Number(quais.formatQuai(oneQiInQuaiWeiHex)) : market.oneQiInQuai;
      const evmNonce = batchResults[4]?.result ? parseInt(batchResults[4].result, 16) : 0;

      const rawOutpoints = [...primaryOutpoints];
      for (let i = 0; i < deterministicChangeAddresses.length; i++) {
        const chOutpoints = batchResults[5 + i]?.result;
        if (Array.isArray(chOutpoints) && chOutpoints.length > 0) {
          rawOutpoints.push(...chOutpoints);
        }
      }

      if (isQi) {
        let totalQit = 0n;
        let unlockedQit = 0n;
        let lockedQit = 0n;
        let unlockedCount = 0;
        let lockedCount = 0;

        const denomStats: Record<
          number,
          {
            denomIndex: number;
            label: string;
            qiPerUnit: string;
            totalCount: number;
            unlockedCount: number;
            lockedCount: number;
            totalQit: bigint;
          }
        > = {};

        const unlockedOutpointsList: Array<{
          txHash: string;
          index: number;
          denominationIndex: number;
          qit: string;
          qi: string;
          lockBlock: number;
          status: 'UNLOCKED';
        }> = [];

        const lockedSampleList: Array<{
          txHash: string;
          index: number;
          denominationIndex: number;
          qit: string;
          qi: string;
          lockBlock: number;
          blocksRemaining: number;
          estimatedHoursRemaining: number;
          status: 'LOCKED';
        }> = [];

        let minLockBlock = Infinity;
        let maxLockBlock = 0;

        for (const op of rawOutpoints) {
          const dIdx = parseInt(op.denomination, 16);
          const qitVal = quais.denominations[dIdx] ?? 0n;
          const lockBlock = parseInt(op.lock || '0x0', 16);
          const idxNum = parseInt(op.index, 16);
          const isUnlocked = lockBlock === 0 || lockBlock <= currentBlock;

          totalQit += qitVal;

          if (!denomStats[dIdx]) {
            const meta = DENOMINATION_LABELS[dIdx] || {
              qit: qitVal,
              qi: quais.formatQi(qitVal),
              label: `${quais.formatQi(qitVal)} QI`,
            };
            denomStats[dIdx] = {
              denomIndex: dIdx,
              label: meta.label,
              qiPerUnit: meta.qi,
              totalCount: 0,
              unlockedCount: 0,
              lockedCount: 0,
              totalQit: 0n,
            };
          }

          denomStats[dIdx].totalCount += 1;
          denomStats[dIdx].totalQit += qitVal;

          if (isUnlocked) {
            unlockedQit += qitVal;
            unlockedCount += 1;
            denomStats[dIdx].unlockedCount += 1;
            if (unlockedOutpointsList.length < 100) {
              unlockedOutpointsList.push({
                txHash: op.txHash,
                index: idxNum,
                denominationIndex: dIdx,
                qit: qitVal.toString(),
                qi: quais.formatQi(qitVal),
                lockBlock,
                status: 'UNLOCKED',
              });
            }
          } else {
            lockedQit += qitVal;
            lockedCount += 1;
            denomStats[dIdx].lockedCount += 1;
            if (lockBlock < minLockBlock) minLockBlock = lockBlock;
            if (lockBlock > maxLockBlock) maxLockBlock = lockBlock;
          }
        }

        const lockedRawSorted = rawOutpoints
          .map((op) => ({
            txHash: op.txHash,
            index: parseInt(op.index, 16),
            denominationIndex: parseInt(op.denomination, 16),
            lockBlock: parseInt(op.lock || '0x0', 16),
          }))
          .filter((item) => item.lockBlock > currentBlock)
          .sort((a, b) => a.lockBlock - b.lockBlock);

        for (const item of lockedRawSorted.slice(0, 60)) {
          const qitVal = quais.denominations[item.denominationIndex] ?? 0n;
          const blocksRem = Math.max(0, item.lockBlock - currentBlock);
          lockedSampleList.push({
            txHash: item.txHash,
            index: item.index,
            denominationIndex: item.denominationIndex,
            qit: qitVal.toString(),
            qi: quais.formatQi(qitVal),
            lockBlock: item.lockBlock,
            blocksRemaining: blocksRem,
            estimatedHoursRemaining: Number(((blocksRem * 5) / 3600).toFixed(1)),
            status: 'LOCKED',
          });
        }

        const BLOCKS_PER_DAY = 17280;
        const scheduleMap = new Map<
          number,
          {
            dayOffset: number;
            startBlock: number;
            endBlock: number;
            utxoCount: number;
            qitAmount: bigint;
          }
        >();

        for (const item of lockedRawSorted) {
          const blocksRem = item.lockBlock - currentBlock;
          const dayBucket = Math.max(1, Math.ceil(blocksRem / BLOCKS_PER_DAY));
          const qitVal = quais.denominations[item.denominationIndex] ?? 0n;
          const existing = scheduleMap.get(dayBucket);
          if (!existing) {
            scheduleMap.set(dayBucket, {
              dayOffset: dayBucket,
              startBlock: item.lockBlock,
              endBlock: item.lockBlock,
              utxoCount: 1,
              qitAmount: qitVal,
            });
          } else {
            existing.endBlock = Math.max(existing.endBlock, item.lockBlock);
            existing.utxoCount += 1;
            existing.qitAmount += qitVal;
          }
        }

        let cumulativeUnlockedQit = unlockedQit;
        const unlockSchedule = Array.from(scheduleMap.values())
          .sort((a, b) => a.dayOffset - b.dayOffset)
          .map((bucket) => {
            cumulativeUnlockedQit += bucket.qitAmount;
            const qiFloat = Number(quais.formatQi(bucket.qitAmount));
            const cumQiFloat = Number(quais.formatQi(cumulativeUnlockedQit));
            const quaiEq = qiFloat * oneQiInQuai;
            return {
              dayOffset: bucket.dayOffset,
              estimatedDate: new Date(Date.now() + bucket.dayOffset * 86400 * 1000).toISOString(),
              startBlock: bucket.startBlock,
              endBlock: bucket.endBlock,
              utxoCount: bucket.utxoCount,
              qiAmount: quais.formatQi(bucket.qitAmount),
              quaiEquivalent: quaiEq.toFixed(2),
              usdEquivalent: (quaiEq * market.quaiUsd).toFixed(2),
              rubEquivalent: (quaiEq * market.quaiRub).toFixed(2),
              cumulativeQi: quais.formatQi(cumulativeUnlockedQit),
              cumulativeQuai: (cumQiFloat * oneQiInQuai).toFixed(2),
            };
          });

        const totalQiFloat = Number(quais.formatQi(totalQit));
        const unlockedQiFloat = Number(quais.formatQi(unlockedQit));
        const lockedQiFloat = Number(quais.formatQi(lockedQit));

        let totalInQuai = (totalQiFloat * oneQiInQuai).toFixed(4);
        let unlockedInQuai = (unlockedQiFloat * oneQiInQuai).toFixed(4);
        let lockedInQuai = (lockedQiFloat * oneQiInQuai).toFixed(4);

        const convCalls: Array<{ method: string; params: unknown[] }> = [];
        if (totalQit > 0n) {
          convCalls.push({ method: 'quai_qiToQuai', params: [`0x${totalQit.toString(16)}`, 'latest'] });
        }
        if (unlockedQit > 0n) {
          convCalls.push({ method: 'quai_qiToQuai', params: [`0x${unlockedQit.toString(16)}`, 'latest'] });
        }
        if (lockedQit > 0n) {
          convCalls.push({ method: 'quai_qiToQuai', params: [`0x${lockedQit.toString(16)}`, 'latest'] });
        }

        if (convCalls.length > 0) {
          try {
            const convRes = await rpcBatchCall(convCalls);
            let ptr = 0;
            if (totalQit > 0n && convRes[ptr]?.result) {
              totalInQuai = Number(quais.formatQuai(convRes[ptr].result)).toFixed(4);
              ptr++;
            }
            if (unlockedQit > 0n && convRes[ptr]?.result) {
              unlockedInQuai = Number(quais.formatQuai(convRes[ptr].result)).toFixed(4);
              ptr++;
            }
            if (lockedQit > 0n && convRes[ptr]?.result) {
              lockedInQuai = Number(quais.formatQuai(convRes[ptr].result)).toFixed(4);
            }
          } catch {
            // Fallback to linear rate
          }
        }

        const totalQuaiNum = Number(totalInQuai);
        const unlockedQuaiNum = Number(unlockedInQuai);
        const lockedQuaiNum = Number(lockedInQuai);

        const denominationsBreakdown = Object.values(denomStats)
          .sort((a, b) => b.denomIndex - a.denomIndex)
          .map((d) => {
            const qiStr = quais.formatQi(d.totalQit);
            const quaiEq = Number(qiStr) * oneQiInQuai;
            return {
              denomIndex: d.denomIndex,
              hexCode: `0x${d.denomIndex.toString(16)}`,
              label: d.label,
              qiPerUnit: d.qiPerUnit,
              totalCount: d.totalCount,
              unlockedCount: d.unlockedCount,
              lockedCount: d.lockedCount,
              totalQi: qiStr,
              totalQuaiEquivalent: quaiEq.toFixed(2),
              totalUsdEquivalent: (quaiEq * market.quaiUsd).toFixed(2),
              totalRubEquivalent: (quaiEq * market.quaiRub).toFixed(2),
            };
          });

        res.json({
          address: targetAddress,
          publicKey,
          hasPrivateKey,
          ledgerType: 'QI_UTXO',
          zone,
          zoneName: zone === '0x00' ? 'Cyprus-1 (Mainnet)' : `Zone ${zone}`,
          currentBlock,
          evmNonce: 0,
          market,
          exchangeRate: {
            oneQiInQuai: oneQiInQuai.toFixed(6),
            oneQuaiInQi: oneQiInQuai > 0 ? (1 / oneQiInQuai).toFixed(6) : '0',
          },
          balances: {
            totalQi: quais.formatQi(totalQit),
            totalQit: totalQit.toString(),
            totalQuaiEquivalent: totalInQuai,
            totalUsd: (totalQuaiNum * market.quaiUsd).toFixed(2),
            totalRub: (totalQuaiNum * market.quaiRub).toFixed(2),
            unlockedQi: quais.formatQi(unlockedQit),
            unlockedQit: unlockedQit.toString(),
            unlockedQuaiEquivalent: unlockedInQuai,
            unlockedUsd: (unlockedQuaiNum * market.quaiUsd).toFixed(2),
            unlockedRub: (unlockedQuaiNum * market.quaiRub).toFixed(2),
            lockedQi: quais.formatQi(lockedQit),
            lockedQit: lockedQit.toString(),
            lockedQuaiEquivalent: lockedInQuai,
            lockedUsd: (lockedQuaiNum * market.quaiUsd).toFixed(2),
            lockedRub: (lockedQuaiNum * market.quaiRub).toFixed(2),
          },
          utxoSummary: {
            totalOutpoints: rawOutpoints.length,
            unlockedOutpointsCount: unlockedCount,
            lockedOutpointsCount: lockedCount,
            minLockBlock: minLockBlock === Infinity ? null : minLockBlock,
            maxLockBlock: maxLockBlock === 0 ? null : maxLockBlock,
            nextUnlockBlocksRemaining:
              minLockBlock === Infinity ? 0 : Math.max(0, minLockBlock - currentBlock),
            nextUnlockEstimatedHours:
              minLockBlock === Infinity
                ? 0
                : Number((((minLockBlock - currentBlock) * 5) / 3600).toFixed(1)),
            fullUnlockBlocksRemaining:
              maxLockBlock === 0 ? 0 : Math.max(0, maxLockBlock - currentBlock),
            fullUnlockEstimatedDays:
              maxLockBlock === 0
                ? 0
                : Number((((maxLockBlock - currentBlock) * 5) / 86400).toFixed(1)),
          },
          bip44IsolatedInfo,
          denominationsBreakdown,
          unlockSchedule,
          unlockedOutpointsList,
          lockedSampleList,
        });
        return;
      } else {
        const quaiBalanceWei = BigInt(rawBalanceHex);
        const quaiFormatted = quais.formatQuai(quaiBalanceWei);
        const quaiFloat = Number(quaiFormatted);
        const qiEquivalent = oneQiInQuai > 0 ? (quaiFloat / oneQiInQuai).toFixed(4) : '0.0000';
        const usdVal = (quaiFloat * market.quaiUsd).toFixed(2);
        const rubVal = (quaiFloat * market.quaiRub).toFixed(2);

        res.json({
          address: targetAddress,
          publicKey,
          hasPrivateKey,
          ledgerType: 'QUAI_EVM',
          zone,
          zoneName: zone === '0x00' ? 'Cyprus-1 (Mainnet)' : `Zone ${zone}`,
          currentBlock,
          evmNonce,
          market,
          exchangeRate: {
            oneQiInQuai: oneQiInQuai.toFixed(6),
            oneQuaiInQi: oneQiInQuai > 0 ? (1 / oneQiInQuai).toFixed(6) : '0',
          },
          balances: {
            totalQi: qiEquivalent,
            totalQit: '0',
            totalQuaiEquivalent: quaiFloat.toFixed(4),
            totalUsd: usdVal,
            totalRub: rubVal,
            unlockedQi: qiEquivalent,
            unlockedQit: '0',
            unlockedQuaiEquivalent: quaiFloat.toFixed(4),
            unlockedUsd: usdVal,
            unlockedRub: rubVal,
            lockedQi: '0.000',
            lockedQit: '0',
            lockedQuaiEquivalent: '0.0000',
            lockedUsd: '0.00',
            lockedRub: '0.00',
          },
          utxoSummary: {
            totalOutpoints: 0,
            unlockedOutpointsCount: 0,
            lockedOutpointsCount: 0,
            minLockBlock: null,
            maxLockBlock: null,
            nextUnlockBlocksRemaining: 0,
            nextUnlockEstimatedHours: 0,
            fullUnlockBlocksRemaining: 0,
            fullUnlockEstimatedDays: 0,
          },
          bip44IsolatedInfo,
          denominationsBreakdown: [],
          unlockSchedule: [],
          unlockedOutpointsList: [],
          lockedSampleList: [],
        });
      }
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Не удалось выполнить запрос к сети Quai Network.',
      });
    }
  });

  // Decrypt / Open QUAI & QI Wallet from Keystore JSON + Password, Mnemonic Seed Phrase, or Private Key
  app.post('/api/wallet/decrypt-quai', async (req, res) => {
    try {
      const { mode, keystoreJson, password, mnemonicPhrase, privateKey, accountIndex } = req.body as {
        mode: 'KEYSTORE' | 'MNEMONIC' | 'PRIVATE_KEY';
        keystoreJson?: string;
        password?: string;
        mnemonicPhrase?: string;
        privateKey?: string;
        accountIndex?: number;
      };

      const accIdx = Math.max(0, Number(accountIndex) || 0);
      let quaiAddress = '';
      let quaiPrivateKey = '';
      let qiCompanionAddress: string | null = null;
      let qiCompanionPrivateKey: string | null = null;
      let sourceLabel = '';

      if (mode === 'KEYSTORE') {
        if (!keystoreJson || !password) {
          res.status(400).json({ error: 'Загрузите содержимое JSON Keystore файла и введите пароль расшифровки.' });
          return;
        }
        const decrypted = quais.decryptKeystoreJsonSync(keystoreJson.trim(), password);
        quaiAddress = decrypted.address;
        quaiPrivateKey = decrypted.privateKey;
        sourceLabel = 'Расшифрован из JSON Keystore (Web3 Secret Storage)';
      } else if (mode === 'MNEMONIC') {
        if (!mnemonicPhrase || mnemonicPhrase.trim().split(/\s+/).length < 12) {
          res.status(400).json({ error: 'Введите корректную сид-фразу из 12 или 24 слов (BIP-39).' });
          return;
        }
        const mnemonic = quais.Mnemonic.fromPhrase(mnemonicPhrase.trim());
        const quaiHd = quais.QuaiHDWallet.fromMnemonic(mnemonic);
        let quaiInfo = await quaiHd.getNextAddress(accIdx, quais.Zone.Cyprus1);
        for (let i = 0; i < accIdx; i++) {
          quaiInfo = await quaiHd.getNextAddress(0, quais.Zone.Cyprus1);
        }
        quaiAddress = quaiInfo.address;
        quaiPrivateKey = quaiHd.getPrivateKey(quaiAddress);

        const qiHd = quais.QiHDWallet.fromMnemonic(mnemonic);
        const qiInfo = await qiHd.getNextAddress(0, quais.Zone.Cyprus1);
        qiCompanionAddress = qiInfo.address;
        qiCompanionPrivateKey = qiHd.getPrivateKey(qiCompanionAddress);
        sourceLabel = `Вычислен из BIP-39 сид-фразы (Cyprus-1, аккаунт #${accIdx})`;
      } else {
        if (!privateKey || !privateKey.trim()) {
          res.status(400).json({ error: 'Введите 64-символьный приватный ключ (0x...).' });
          return;
        }
        const normPk = privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`;
        if (!quais.isHexString(normPk, 32)) {
          res.status(400).json({ error: 'Некорректный формат 32-байтного приватного ключа.' });
          return;
        }
        const w = new quais.Wallet(normPk);
        quaiAddress = w.address;
        quaiPrivateKey = w.privateKey;
        sourceLabel = quais.isQuaiAddress(quaiAddress)
          ? 'Открыт из приватного ключа QUAI (EVM)'
          : 'Открыт из приватного ключа QI (UTXO)';
      }

      const [market, rpcRes] = await Promise.all([
        fetchLiveMarketAndNetwork(),
        rpcBatchCall([
          { method: 'quai_getBalance', params: [quaiAddress, 'latest'] },
          { method: 'quai_getTransactionCount', params: [quaiAddress, 'latest'] },
        ]),
      ]);

      const rawBalanceHex = rpcRes[0]?.result || '0x0';
      const nonceHex = rpcRes[1]?.result || '0x0';
      const isQuai = quais.isQuaiAddress(quaiAddress);
      const isQi = quais.isQiAddress(quaiAddress);

      let balanceQuai = '0.0000';
      let balanceQiEquivalent = '0.0000';
      if (isQuai) {
        const quaiFloat = Number(quais.formatQuai(BigInt(rawBalanceHex)));
        balanceQuai = quaiFloat.toFixed(4);
        balanceQiEquivalent = market.oneQiInQuai > 0 ? (quaiFloat / market.oneQiInQuai).toFixed(4) : '0.0000';
      } else {
        const qiFloat = Number(quais.formatQi(BigInt(rawBalanceHex)));
        balanceQiEquivalent = qiFloat.toFixed(3);
        balanceQuai = (qiFloat * market.oneQiInQuai).toFixed(4);
      }

      const quaiFloatVal = Number(balanceQuai);

      res.json({
        address: quaiAddress,
        privateKey: quaiPrivateKey,
        ledgerType: isQuai ? 'QUAI_EVM' : isQi ? 'QI_UTXO' : 'UNKNOWN',
        zone: quais.getZoneForAddress(quaiAddress) || '0x00',
        nonce: parseInt(nonceHex, 16),
        balanceQuai,
        balanceQiEquivalent,
        balanceUsd: (quaiFloatVal * market.quaiUsd).toFixed(2),
        balanceRub: (quaiFloatVal * market.quaiRub).toFixed(2),
        qiCompanionAddress,
        qiCompanionPrivateKey,
        sourceLabel,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Ошибка при расшифровке кошелька. Проверьте пароль, JSON или сид-фразу.',
      });
    }
  });

  // Encrypt any Private Key into a Web3 Keystore JSON
  app.post('/api/wallet/encrypt-keystore', async (req, res) => {
    try {
      const { privateKey, password } = req.body as { privateKey?: string; password?: string };
      if (!privateKey || !password || password.length < 4) {
        res.status(400).json({ error: 'Укажите приватный ключ и пароль (минимум 4 символа) для шифрования JSON Keystore.' });
        return;
      }
      const normPk = privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`;
      const w = new quais.Wallet(normPk);
      const keystoreJson = quais.encryptKeystoreJsonSync(w, password, { scrypt: { N: 1024 } });
      res.json({
        address: w.address,
        keystoreJson,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Не удалось зашифровать Keystore JSON.' });
    }
  });

  // Execute or Dry-Run QUAI (EVM) Action: Send QUAI->QUAI or Convert QUAI->QI
  app.post('/api/wallet/quai-action', async (req, res) => {
    try {
      const { privateKey, toAddress, amountQuai, slippagePercent, broadcast } = req.body as {
        privateKey?: string;
        toAddress?: string;
        amountQuai?: string;
        slippagePercent?: number;
        broadcast?: boolean;
      };

      if (!privateKey || !privateKey.trim()) {
        res.status(400).json({ error: 'Введите приватный ключ вашего QUAI-кошелька.' });
        return;
      }
      const normPk = privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`;
      if (!quais.isHexString(normPk, 32)) {
        res.status(400).json({ error: 'Некорректный 32-байтный приватный ключ.' });
        return;
      }

      const senderWallet = new quais.Wallet(normPk);
      if (!quais.isQuaiAddress(senderWallet.address)) {
        res.status(400).json({
          error: `Ключ принадлежит QI-адресу (${senderWallet.address}). Для отправки с QI-кошелька используйте вкладку «Конвертер QI → QUAI».`,
        });
        return;
      }

      if (!toAddress || !quais.isHexString(toAddress.trim(), 20)) {
        res.status(400).json({ error: 'Введите корректный 42-символьный адрес получателя (QUAI или QI).' });
        return;
      }

      const cleanTo = quais.getAddress(toAddress.trim());
      const isRecipientQi = quais.isQiAddress(cleanTo);
      const isRecipientQuai = quais.isQuaiAddress(cleanTo);

      if (!isRecipientQi && !isRecipientQuai) {
        res.status(400).json({ error: 'Адрес получателя не принадлежит зоне Cyprus-1 Quai Network.' });
        return;
      }

      const valueWei = quais.parseQuai(String(amountQuai || '0'));
      if (valueWei <= 0n) {
        res.status(400).json({ error: 'Сумма отправки должна быть больше 0 QUAI.' });
        return;
      }

      const provider = new quais.JsonRpcProvider(RPC_BASE_URL, undefined, { usePathing: true });
      const connectedWallet = senderWallet.connect(provider);

      const [balanceWei, nonce, feeData, quaiToQiRes] = await Promise.all([
        provider.getBalance(senderWallet.address, 'latest'),
        provider.getTransactionCount(senderWallet.address, 'latest'),
        provider.getFeeData(quais.Zone.Cyprus1),
        isRecipientQi
          ? rpcBatchCall([{ method: 'quai_quaiToQi', params: [`0x${valueWei.toString(16)}`, 'latest'] }])
          : Promise.resolve([]),
      ]);

      const gasPrice = feeData.gasPrice || 2000000000n;
      const gasLimit = isRecipientQi ? 350000n : 42000n;
      const estimatedGasFeeWei = gasPrice * gasLimit;

      if (valueWei + estimatedGasFeeWei > balanceWei) {
        res.status(400).json({
          error: `Недостаточно QUAI на балансе (${quais.formatQuai(balanceWei)} QUAI) для отправки ${amountQuai} QUAI и оплаты газа (~${quais.formatQuai(estimatedGasFeeWei)} QUAI).`,
        });
        return;
      }

      // If recipient is a QI address (QUAI -> QI conversion), include 2-byte big-endian slippage in data
      let txDataHex = '0x';
      if (isRecipientQi) {
        const slipBps = Math.max(50, Math.min(9000, Math.round((Number(slippagePercent) || 10) * 100)));
        const slipBytes = new Uint8Array(2);
        slipBytes[0] = (slipBps >> 8) & 0xff;
        slipBytes[1] = slipBps & 0xff;
        txDataHex = quais.hexlify(slipBytes);
      }

      const expectedQiOutput =
        isRecipientQi && quaiToQiRes[0]?.result ? quais.formatQi(quaiToQiRes[0].result) : null;

      const txRequest = {
        from: senderWallet.address,
        to: cleanTo,
        value: valueWei,
        nonce,
        gasLimit,
        gasPrice,
        chainId: 9n,
        type: 0,
        data: txDataHex,
      };

      const signedRawTx = await connectedWallet.signTransaction(txRequest);
      const decoded = quais.QuaiTransaction.from(signedRawTx);

      if (!broadcast) {
        res.json({
          mode: 'DRY_RUN',
          actionType: isRecipientQi ? 'CONVERT_QUAI_TO_QI' : 'TRANSFER_QUAI',
          fromQuaiAddress: senderWallet.address,
          toAddress: cleanTo,
          amountQuai: quais.formatQuai(valueWei),
          expectedQiOutput,
          estimatedFeeQuai: Number(quais.formatQuai(estimatedGasFeeWei)).toFixed(6),
          gasLimit: gasLimit.toString(),
          nonce,
          dataHex: txDataHex,
          txHash: decoded.hash,
          signedTxSnippet: `${signedRawTx.slice(0, 84)}...`,
        });
        return;
      } else {
        const broadcastRpc = await rpcBatchCall([
          { method: 'quai_sendRawTransaction', params: [signedRawTx] },
        ]);
        if (broadcastRpc[0]?.error) {
          throw new Error(broadcastRpc[0].error.message);
        }
        res.json({
          mode: 'BROADCASTED',
          actionType: isRecipientQi ? 'CONVERT_QUAI_TO_QI' : 'TRANSFER_QUAI',
          fromQuaiAddress: senderWallet.address,
          toAddress: cleanTo,
          amountQuai: quais.formatQuai(valueWei),
          expectedQiOutput,
          estimatedFeeQuai: Number(quais.formatQuai(estimatedGasFeeWei)).toFixed(6),
          gasLimit: gasLimit.toString(),
          nonce,
          dataHex: txDataHex,
          txHash: broadcastRpc[0]?.result || decoded.hash,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Ошибка при выполнении транзакции QUAI.',
      });
    }
  });

  // Preview (Dry-Run) or Broadcast QI -> QUAI protocol conversion
  app.post('/api/wallet/convert', async (req, res) => {
    try {
      const { privateKey, destinationQuaiAddress, amountQi, slippagePercent, broadcast } = req.body as {
        privateKey?: string;
        destinationQuaiAddress?: string;
        amountQi?: string;
        slippagePercent?: number;
        broadcast?: boolean;
      };

      if (!privateKey || typeof privateKey !== 'string') {
        res.status(400).json({
          error: 'Для подписи UTXO-транзакции конвертации необходим приватный ключ кошелька QI.',
        });
        return;
      }

      const normalizedPk = privateKey.trim().startsWith('0x')
        ? privateKey.trim()
        : `0x${privateKey.trim()}`;

      if (!quais.isHexString(normalizedPk, 32)) {
        res.status(400).json({ error: 'Некорректный 32-байтный приватный ключ.' });
        return;
      }

      if (!destinationQuaiAddress || !quais.isHexString(destinationQuaiAddress.trim(), 20)) {
        res.status(400).json({
          error: 'Введите корректный адрес получателя QUAI (0x00...) в зоне Cyprus-1.',
        });
        return;
      }

      const cleanDest = quais.getAddress(destinationQuaiAddress.trim());
      if (quais.isQiAddress(cleanDest) || !quais.isQuaiAddress(cleanDest)) {
        res.status(400).json({
          error: `Адрес ${cleanDest} является QI-адресом (второй байт >= 0x80). Для конвертации QI → QUAI укажите QUAI-адрес (начинается с 0x0000...–0x007f...).`,
        });
        return;
      }

      const parsedAmountQit = quais.parseQi(String(amountQi || '0'));
      if (parsedAmountQit <= 0n) {
        res.status(400).json({ error: 'Сумма конвертации должна быть больше 0 QI.' });
        return;
      }

      const provider = new quais.JsonRpcProvider(RPC_BASE_URL, undefined, { usePathing: true });

      const entropy = quais.getBytes(quais.keccak256(normalizedPk)).slice(0, 16);
      const deterministicMnemonic = quais.Mnemonic.fromEntropy(entropy);
      const qiWallet = quais.QiHDWallet.fromMnemonic(deterministicMnemonic);
      qiWallet.connect(provider);

      const addrInfo = await qiWallet.importPrivateKey(normalizedPk);
      const primaryOutpoints = await provider.getOutpointsByAddress(addrInfo.address);

      const allFormattedOutpoints = primaryOutpoints.map((op) => ({
        outpoint: op,
        address: addrInfo.address,
        zone: quais.Zone.Cyprus1,
        derivationPath: 'PrivateKey',
      }));

      const derivedChangeMap = new Map<string, string>();
      for (let i = 0; i < 6; i++) {
        const chAddrInfo = qiWallet.getNextChangeAddressSync(0, quais.Zone.Cyprus1);
        const chPk = qiWallet.getPrivateKey(chAddrInfo.address);
        derivedChangeMap.set(chAddrInfo.address.toLowerCase(), chPk);
        const chOps = await provider.getOutpointsByAddress(chAddrInfo.address);
        if (chOps.length > 0) {
          for (const op of chOps) {
            allFormattedOutpoints.push({
              outpoint: op,
              address: chAddrInfo.address,
              zone: quais.Zone.Cyprus1,
              derivationPath: 'BIP44:change',
            });
          }
        }
      }

      const freshQiWallet = quais.QiHDWallet.fromMnemonic(deterministicMnemonic);
      freshQiWallet.connect(provider);
      await freshQiWallet.importPrivateKey(normalizedPk);
      freshQiWallet.importOutpoints(allFormattedOutpoints);

      const slippageBps = Math.round((Number(slippagePercent) || 10) * 100);
      const conversionDataBytes = buildConversionDataPayload(addrInfo.address, slippageBps);
      const conversionDataHex = quais.hexlify(conversionDataBytes);

      const origPrepFee = (freshQiWallet as any).prepareFeeEstimationTransaction.bind(freshQiWallet);
      (freshQiWallet as any).prepareFeeEstimationTransaction = (
        selection: any,
        inputPubKeys: string[],
        sendAddresses: string[],
        changeAddresses: string[]
      ) => {
        const base = origPrepFee(selection, inputPubKeys, sendAddresses, changeAddresses);
        return { ...base, data: conversionDataHex };
      };

      const spendableQit = await freshQiWallet.getSpendableBalance(quais.Zone.Cyprus1);
      if (parsedAmountQit > spendableQit) {
        res.status(400).json({
          error: `Недостаточно разблокированных средств. Сейчас доступно для траты: ${quais.formatQi(spendableQit)} QI (остальные средства находятся в 2-недельном периоде разблокировки майнинга).`,
        });
        return;
      }

      const convRpc = await rpcBatchCall([
        { method: 'quai_qiToQuai', params: [`0x${parsedAmountQit.toString(16)}`, 'latest'] },
      ]);
      const expectedQuaiFormatted = convRpc[0]?.result
        ? Number(quais.formatQuai(convRpc[0].result)).toFixed(4)
        : '0.0000';

      if (!broadcast) {
        let capturedSignedTx = '';

        (provider as any).broadcastTransaction = async (zone: string, signedTx: string) => {
          capturedSignedTx = signedTx;
          const decoded = quais.QiTransaction.from(signedTx);
          return {
            hash: decoded.hash,
            rawSignedTransaction: signedTx,
            zone,
          };
        };

        const txResult: any = await freshQiWallet.convertToQuai(cleanDest, parsedAmountQit, {
          data: conversionDataBytes,
        });
        const decodedTx = quais.QiTransaction.from(capturedSignedTx);

        const inputsCount = decodedTx.txInputs?.length || 0;
        const outputs = (decodedTx.txOutputs || []).map((out: any) => {
          const dIdx = Number(out.denomination);
          const qitVal = quais.denominations[dIdx] ?? 0n;
          const isConv = out.address.toLowerCase() === cleanDest.toLowerCase();
          let changePrivateKey: string | undefined;
          if (!isConv) {
            try {
              changePrivateKey = freshQiWallet.getPrivateKey(out.address);
            } catch {
              changePrivateKey = derivedChangeMap.get(out.address.toLowerCase());
            }
          }
          return {
            address: out.address,
            denominationIndex: dIdx,
            qiAmount: quais.formatQi(qitVal),
            type: isConv ? 'CONVERSION_TO_QUAI' : 'CHANGE_BACK_TO_QI_WALLET',
            changePrivateKey,
          };
        });

        const totalOutputQit = (decodedTx.txOutputs || []).reduce((acc: bigint, out: any) => {
          const dIdx = Number(out.denomination);
          return acc + (quais.denominations[dIdx] ?? 0n);
        }, 0n);

        const actualFeeQit = (freshQiWallet as any).calculateActualTransactionFee(decodedTx);

        res.json({
          mode: 'DRY_RUN',
          sourceQiAddress: addrInfo.address,
          destinationQuaiAddress: cleanDest,
          requestedAmountQi: quais.formatQi(parsedAmountQit),
          estimatedFeeQi: quais.formatQi(actualFeeQit),
          totalOutputQi: quais.formatQi(totalOutputQit),
          expectedQuaiReceived: expectedQuaiFormatted,
          conversionDataHex,
          slippageBps,
          inputsUsedCount: inputsCount,
          outputs,
          txHashPreview: txResult.hash,
          signedRawBytesLength: (capturedSignedTx.length - 2) / 2,
          signedTxSnippet: `${capturedSignedTx.slice(0, 86)}...`,
        });
        return;
      } else {
        let capturedSignedTx = '';
        const origBroadcast = provider.broadcastTransaction.bind(provider);
        (provider as any).broadcastTransaction = async (zone: quais.Zone, signedTx: string) => {
          capturedSignedTx = signedTx;
          return origBroadcast(zone, signedTx);
        };

        const txResponse: any = await freshQiWallet.convertToQuai(cleanDest, parsedAmountQit, {
          data: conversionDataBytes,
        });

        const decodedTx = capturedSignedTx ? quais.QiTransaction.from(capturedSignedTx) : null;
        const outputs = (decodedTx?.txOutputs || []).map((out: any) => {
          const dIdx = Number(out.denomination);
          const qitVal = quais.denominations[dIdx] ?? 0n;
          const isConv = out.address.toLowerCase() === cleanDest.toLowerCase();
          let changePrivateKey: string | undefined;
          if (!isConv) {
            try {
              changePrivateKey = freshQiWallet.getPrivateKey(out.address);
            } catch {
              changePrivateKey = derivedChangeMap.get(out.address.toLowerCase());
            }
          }
          return {
            address: out.address,
            denominationIndex: dIdx,
            qiAmount: quais.formatQi(qitVal),
            type: isConv ? 'CONVERSION_TO_QUAI' : 'CHANGE_BACK_TO_QI_WALLET',
            changePrivateKey,
          };
        });

        res.json({
          mode: 'BROADCASTED',
          sourceQiAddress: addrInfo.address,
          destinationQuaiAddress: cleanDest,
          requestedAmountQi: quais.formatQi(parsedAmountQit),
          expectedQuaiReceived: expectedQuaiFormatted,
          conversionDataHex,
          slippageBps,
          outputs,
          txHash: txResponse?.hash || String(txResponse),
        });
      }
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Ошибка при формировании транзакции конвертации QI → QUAI.',
      });
    }
  });

  // Explorer Lookup Tool (Transactions, Blocks, Addresses on Cyprus-1)
  app.post('/api/explorer/lookup', async (req, res) => {
    try {
      const { query } = req.body as { query?: string };
      if (!query || !query.trim()) {
        res.status(400).json({ error: 'Введите хэш транзакции (0x...), адрес (0x...) или номер блока.' });
        return;
      }
      const q = query.trim();

      if (quais.isHexString(q, 32)) {
        // 32-byte Transaction Hash
        const rpcRes = await rpcBatchCall([
          { method: 'quai_getTransactionByHash', params: [q] },
          { method: 'quai_getTransactionReceipt', params: [q] },
        ]);
        res.json({
          lookupType: 'TRANSACTION',
          query: q,
          explorerUrl: `https://explorer.qu.ai/tx/${q}`,
          transaction: rpcRes[0]?.result || null,
          receipt: rpcRes[1]?.result || null,
        });
        return;
      } else if (/^\d+$/.test(q) || (q.startsWith('0x') && q.length <= 12)) {
        const blockHex = q.startsWith('0x') ? q : `0x${parseInt(q, 10).toString(16)}`;
        const blockNumDec = parseInt(blockHex, 16);
        const rpcRes = await rpcBatchCall([{ method: 'quai_getBlockByNumber', params: [blockHex, false] }]);
        res.json({
          lookupType: 'BLOCK',
          query: String(blockNumDec),
          explorerUrl: `https://explorer.qu.ai/block/${blockNumDec}`,
          block: rpcRes[0]?.result || null,
        });
        return;
      } else if (quais.isHexString(q, 20)) {
        const addr = quais.getAddress(q);
        res.json({
          lookupType: 'ADDRESS',
          query: addr,
          explorerUrl: `https://explorer.qu.ai/address/${addr}`,
          isQi: quais.isQiAddress(addr),
          isQuai: quais.isQuaiAddress(addr),
          zone: quais.getZoneForAddress(addr) || '0x00',
        });
        return;
      } else {
        res.status(400).json({
          error: 'Не удалось распознать запрос. Укажите хэш транзакции (66 символов), адрес (42 символа) или номер блока.',
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Ошибка поиска в блокчейне Quai.' });
    }
  });

  // Generate a fresh, uncompromised Cyprus-1 QUAI (EVM) wallet for receiving converted QUAI
  app.post('/api/wallet/generate-quai-receiver', async (_req, res) => {
    try {
      const mnemonic = quais.Mnemonic.fromEntropy(quais.randomBytes(16));
      const quaiHd = quais.QuaiHDWallet.fromMnemonic(mnemonic);
      const addressInfo = await quaiHd.getNextAddress(0, quais.Zone.Cyprus1);
      const privateKey = quaiHd.getPrivateKey(addressInfo.address);

      res.json({
        address: addressInfo.address,
        privateKey,
        mnemonicPhrase: mnemonic.phrase,
        zone: 'Cyprus-1 (0x00)',
        derivationPath: (addressInfo as any).derivationPath || "m/44'/994'/0'/0/0",
        isQuaiAddress: quais.isQuaiAddress(addressInfo.address),
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Не удалось сгенерировать QUAI-адрес в зоне Cyprus-1.',
      });
    }
  });

  // Fetch Transaction History for a QUAI or QI wallet address + real-time RPC status for recent/pending txHashes
  app.post('/api/wallet/transactions', async (req, res) => {
    try {
      const { address, recentTxHashes } = req.body as {
        address?: string;
        recentTxHashes?: string[];
      };

      if (!address || typeof address !== 'string' || !quais.isHexString(address.trim(), 20)) {
        res.status(400).json({ error: 'Укажите корректный 42-символьный адрес кошелька QUAI или QI (0x00...).' });
        return;
      }

      const cleanAddress = quais.getAddress(address.trim());
      const isQi = quais.isQiAddress(cleanAddress);
      const cleanRecentHashes = Array.isArray(recentTxHashes)
        ? Array.from(new Set(recentTxHashes.filter((h) => typeof h === 'string' && quais.isHexString(h.trim(), 32))))
        : [];

      const [market, explorerRes, outpointsRes, recentRpcRes] = await Promise.allSettled([
        fetchLiveMarketAndNetwork(),
        fetch(`https://quaiscan.io/api/v2/addresses/${cleanAddress}/transactions`, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        }).then(async (r) => (r.ok ? r.json() : { items: [] })),
        isQi
          ? rpcBatchCall([{ method: 'quai_getOutpointsByAddress', params: [cleanAddress] }])
          : Promise.resolve([]),
        cleanRecentHashes.length > 0
          ? rpcBatchCall(
              cleanRecentHashes.flatMap((h) => [
                { method: 'quai_getTransactionByHash', params: [h] },
                { method: 'quai_getTransactionReceipt', params: [h] },
              ])
            )
          : Promise.resolve([]),
      ]);

      const activeMarket =
        market.status === 'fulfilled'
          ? market.value
          : {
              quaiUsd: 0.00676,
              quaiRub: 0.562,
              qiUsd: 1.037,
              qiRub: 86.25,
              oneQiInQuai: 153.5065,
              currentBlock: 11095000,
            };

      const currentBlock = activeMarket.currentBlock;
      const txMap = new Map<string, any>();

      // 1. Process tracked / recently broadcasted transactions via direct Quai RPC
      if (recentRpcRes.status === 'fulfilled' && cleanRecentHashes.length > 0) {
        const rpcArr = recentRpcRes.value;
        for (let i = 0; i < cleanRecentHashes.length; i++) {
          const hash = cleanRecentHashes[i];
          const txObj = rpcArr[i * 2]?.result;
          const receiptObj = rpcArr[i * 2 + 1]?.result;

          const blockNum = receiptObj?.blockNumber
            ? parseInt(receiptObj.blockNumber, 16)
            : txObj?.blockNumber
              ? parseInt(txObj.blockNumber, 16)
              : null;

          let status: 'SUCCESS' | 'PENDING' | 'FAILED' = 'PENDING';
          let statusLabel = 'В ожидании';
          if (receiptObj) {
            if (receiptObj.status === '0x0') {
              status = 'FAILED';
              statusLabel = 'Ошибка';
            } else {
              status = 'SUCCESS';
              statusLabel = 'Успешно';
            }
          } else if (blockNum && blockNum > 0) {
            status = 'SUCCESS';
            statusLabel = 'Успешно';
          }

          const fromAddr = txObj?.from ? quais.getAddress(txObj.from) : cleanAddress;
          const toAddr = txObj?.to ? quais.getAddress(txObj.to) : cleanAddress;
          const isToQi = toAddr && quais.isHexString(toAddr, 20) ? quais.isQiAddress(toAddr) : false;
          const isFromQi = fromAddr && quais.isHexString(fromAddr, 20) ? quais.isQiAddress(fromAddr) : false;

          let amountFloat = 0;
          let currency: 'QUAI' | 'QI' = 'QUAI';
          if (txObj?.value) {
            amountFloat = Number(quais.formatQuai(BigInt(txObj.value)));
          } else if (txObj?.txOutputs && Array.isArray(txObj.txOutputs)) {
            currency = 'QI';
            let qitSum = 0n;
            for (const out of txObj.txOutputs) {
              const dIdx = typeof out.denomination === 'string' ? parseInt(out.denomination, 16) : Number(out.denomination || 0);
              qitSum += quais.denominations[dIdx] ?? 0n;
            }
            amountFloat = Number(quais.formatQi(qitSum));
          }

          const isConversionToQi = !isFromQi && isToQi;
          const isConversionToQuai = isFromQi && !isToQi;

          const usdVal =
            currency === 'QUAI' ? amountFloat * activeMarket.quaiUsd : amountFloat * activeMarket.qiUsd;
          const rubVal =
            currency === 'QUAI' ? amountFloat * activeMarket.quaiRub : amountFloat * activeMarket.qiRub;

          txMap.set(hash.toLowerCase(), {
            txHash: hash,
            timestamp: new Date().toISOString(),
            blockNumber: blockNum,
            confirmations: blockNum ? Math.max(1, currentBlock - blockNum) : 0,
            status,
            statusLabel,
            direction:
              isConversionToQi || isConversionToQuai
                ? 'CONVERSION'
                : fromAddr.toLowerCase() === cleanAddress.toLowerCase()
                  ? 'OUT'
                  : 'IN',
            operationType: isConversionToQi
              ? 'CONVERT_QUAI_TO_QI'
              : isConversionToQuai
                ? 'CONVERT_QI_TO_QUAI'
                : 'TRANSFER_QUAI',
            operationLabel: isConversionToQi
              ? 'Конвертация QUAI → QI'
              : isConversionToQuai
                ? 'Конвертация QI → QUAI'
                : 'Перевод QUAI',
            fromAddress: fromAddr,
            toAddress: toAddr,
            amount: currency === 'QUAI' ? amountFloat.toFixed(4) : amountFloat.toFixed(3),
            currency,
            amountUsd: usdVal.toFixed(2),
            amountRub: rubVal.toFixed(2),
            feeQuai: null,
            explorerTxUrl: `https://explorer.qu.ai/tx/${hash}`,
            explorerFromUrl: `https://explorer.qu.ai/address/${fromAddr}`,
            explorerToUrl: `https://explorer.qu.ai/address/${toAddr}`,
          });
        }
      }

      // 2. Process indexed transactions from Quai Explorer API (quaiscan.io / explorer.qu.ai)
      if (explorerRes.status === 'fulfilled' && Array.isArray(explorerRes.value?.items)) {
        for (const item of explorerRes.value.items) {
          const hash: string = item.hash;
          if (!hash) continue;

          const fromHash: string = item.from?.hash || cleanAddress;
          const toHash: string = item.to?.hash || cleanAddress;
          const isFromMe = fromHash.toLowerCase() === cleanAddress.toLowerCase();
          const isToMe = toHash.toLowerCase() === cleanAddress.toLowerCase();

          let toIsQi = false;
          let fromIsQi = false;
          try {
            if (quais.isHexString(toHash, 20)) toIsQi = quais.isQiAddress(quais.getAddress(toHash));
            if (quais.isHexString(fromHash, 20)) fromIsQi = quais.isQiAddress(quais.getAddress(fromHash));
          } catch {
            // Ignore address checksum edge cases
          }

          let status: 'SUCCESS' | 'PENDING' | 'FAILED' = 'SUCCESS';
          let statusLabel = 'Успешно';
          if (item.status === 'pending' || item.block == null) {
            status = 'PENDING';
            statusLabel = 'В ожидании';
          } else if (item.status === 'error' || item.result === 'reverted') {
            status = 'FAILED';
            statusLabel = 'Ошибка';
          }

          let operationType:
            | 'TRANSFER_QUAI'
            | 'CONVERT_QUAI_TO_QI'
            | 'CONVERT_QI_TO_QUAI'
            | 'MINING_REWARD'
            | 'CONTRACT_CALL' = 'TRANSFER_QUAI';
          let operationLabel = isFromMe ? 'Отправка QUAI' : 'Получение QUAI';
          let direction: 'IN' | 'OUT' | 'SELF' | 'CONVERSION' = isFromMe && isToMe ? 'SELF' : isFromMe ? 'OUT' : 'IN';

          if (item.etx_type === 'coinbase' || item.type === 1) {
            if (item.etx_type === 'conversion' || toIsQi || fromIsQi) {
              operationType = toIsQi ? 'CONVERT_QUAI_TO_QI' : 'CONVERT_QI_TO_QUAI';
              operationLabel = toIsQi ? 'Конвертация QUAI → QI' : 'Конвертация QI → QUAI';
              direction = 'CONVERSION';
            } else if (item.etx_type === 'coinbase') {
              operationType = 'MINING_REWARD';
              operationLabel = 'Награда / Внешняя ETX';
              direction = 'IN';
            }
          } else if (toIsQi && !fromIsQi) {
            operationType = 'CONVERT_QUAI_TO_QI';
            operationLabel = 'Конвертация QUAI → QI';
            direction = 'CONVERSION';
          } else if (fromIsQi && !toIsQi) {
            operationType = 'CONVERT_QI_TO_QUAI';
            operationLabel = 'Конвертация QI → QUAI';
            direction = 'CONVERSION';
          } else if (item.method) {
            operationType = 'CONTRACT_CALL';
            operationLabel = `Вызов: ${item.method}`;
          }

          const rawVal = item.value ? BigInt(item.value) : 0n;
          const amountQuaiFloat = Number(quais.formatQuai(rawVal));
          const usdVal = amountQuaiFloat * activeMarket.quaiUsd;
          const rubVal = amountQuaiFloat * activeMarket.quaiRub;

          let feeQuai: string | null = null;
          if (item.fee?.value) {
            try {
              feeQuai = Number(quais.formatQuai(BigInt(item.fee.value))).toFixed(6);
            } catch {
              feeQuai = null;
            }
          }

          txMap.set(hash.toLowerCase(), {
            txHash: hash,
            timestamp: item.timestamp || null,
            blockNumber: typeof item.block === 'number' ? item.block : null,
            confirmations: typeof item.confirmations === 'number' ? item.confirmations : 0,
            status,
            statusLabel,
            direction,
            operationType,
            operationLabel,
            fromAddress: fromHash,
            toAddress: toHash,
            amount: amountQuaiFloat.toFixed(4),
            currency: 'QUAI',
            amountUsd: usdVal.toFixed(2),
            amountRub: rubVal.toFixed(2),
            feeQuai,
            explorerTxUrl: `https://explorer.qu.ai/tx/${hash}`,
            explorerFromUrl: `https://explorer.qu.ai/address/${fromHash}`,
            explorerToUrl: `https://explorer.qu.ai/address/${toHash}`,
          });
        }
      }

      // 3. If inspecting a QI UTXO address, aggregate UTXO transactions by txHash so the user sees all UTXO operations
      if (isQi && outpointsRes.status === 'fulfilled') {
        const rawOutpoints: Array<{ denomination: string; index: string; lock: string; txHash: string }> =
          Array.isArray(outpointsRes.value[0]?.result) ? outpointsRes.value[0].result : [];

        const groupedByTx = new Map<
          string,
          { txHash: string; totalQit: bigint; lockBlock: number; utxoCount: number }
        >();

        for (const op of rawOutpoints) {
          const dIdx = parseInt(op.denomination, 16);
          const qitVal = quais.denominations[dIdx] ?? 0n;
          const lockBlock = parseInt(op.lock || '0x0', 16);
          const existing = groupedByTx.get(op.txHash);
          if (!existing) {
            groupedByTx.set(op.txHash, {
              txHash: op.txHash,
              totalQit: qitVal,
              lockBlock,
              utxoCount: 1,
            });
          } else {
            existing.totalQit += qitVal;
            existing.utxoCount += 1;
            existing.lockBlock = Math.max(existing.lockBlock, lockBlock);
          }
        }

        const sortedUtxoTxs = Array.from(groupedByTx.values()).sort((a, b) => b.lockBlock - a.lockBlock);
        for (const utxoTx of sortedUtxoTxs.slice(0, 40)) {
          if (txMap.has(utxoTx.txHash.toLowerCase())) continue;
          const isUnlocked = utxoTx.lockBlock === 0 || utxoTx.lockBlock <= currentBlock;
          const qiFloat = Number(quais.formatQi(utxoTx.totalQit));
          const usdVal = qiFloat * activeMarket.qiUsd;
          const rubVal = qiFloat * activeMarket.qiRub;

          txMap.set(utxoTx.txHash.toLowerCase(), {
            txHash: utxoTx.txHash,
            timestamp: null,
            blockNumber: utxoTx.lockBlock > 0 ? utxoTx.lockBlock : null,
            confirmations: isUnlocked ? 100 : 0,
            status: isUnlocked ? 'SUCCESS' : 'PENDING',
            statusLabel: isUnlocked ? 'Успешно (Разблокирован)' : 'В ожидании разблокировки',
            direction: 'IN',
            operationType: 'UTXO_OUTPUT',
            operationLabel: `Зачисление QI (${utxoTx.utxoCount} UTXO)`,
            fromAddress: 'Coinbase / Протокол Quai',
            toAddress: cleanAddress,
            amount: qiFloat.toFixed(3),
            currency: 'QI',
            amountUsd: usdVal.toFixed(2),
            amountRub: rubVal.toFixed(2),
            feeQuai: null,
            explorerTxUrl: `https://explorer.qu.ai/tx/${utxoTx.txHash}`,
            explorerFromUrl: `https://explorer.qu.ai/address/${cleanAddress}`,
            explorerToUrl: `https://explorer.qu.ai/address/${cleanAddress}`,
          });
        }
      }

      const transactions = Array.from(txMap.values());

      res.json({
        address: cleanAddress,
        ledgerType: isQi ? 'QI_UTXO' : 'QUAI_EVM',
        currentBlock,
        totalCount: transactions.length,
        transactions,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Не удалось получить историю операций из сети Quai Network.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuaiVault server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
