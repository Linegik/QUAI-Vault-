import React, { useState } from 'react';
import {
  Download,
  Terminal,
  Monitor,
  Server,
  HardDrive,
  Check,
  Copy,
  ShieldCheck,
  Cpu,
  CheckCircle2,
} from 'lucide-react';

interface WindowsSetupSectionProps {
  onDownloadCliMjs: () => void;
  onDownloadCliBat: () => void;
}

/**
 * Encodes a UTF-8 string into 64-character ASCII Base64 lines so that Windows cmd.exe
 * can write it without any codepage (CP866/UTF-8) or special-character (<, >, (, ), &, |) bugs,
 * and decode it byte-for-byte via built-in Windows `certutil -f -decode`.
 */
function encodeUtf8ToBase64Lines(str: string): string[] {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64 = btoa(binary);
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    chunks.push(base64.slice(i, i + 64));
  }
  return chunks;
}

export const WindowsSetupSection: React.FC<WindowsSetupSectionProps> = ({
  onDownloadCliMjs,
  onDownloadCliBat,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyCommand = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 1800);
  };

  const handleDownloadWindowsGuiInstaller = () => {
    // Complete standalone Node.js + Express + Quais Russian GUI application for Windows (127.0.0.1:3000)
    // Includes:
    // 1. QI / QUAI Balance & UTXO Inspector (USD $ + CBR RUB ₽)
    // 2. Decrypt QUAI Wallet (Private Key / Mnemonic / Keystore JSON) + Send QUAI & Convert QUAI -> QI (Dry-run & Broadcast)
    // 3. Real-time Wallet Transaction History (Cyprus-1) with Auto-Refresh, txHash tracker & explorer.qu.ai links
    // 4. Built-in QI -> QUAI Converter (22-byte payload) + Fresh QUAI Wallet Generator
    // 5. Blockchain Search: Transactions, Blocks & Addresses on explorer.qu.ai
    const desktopServerMjs = `import express from 'express';
import * as quais from 'quais';

const app = express();
app.use(express.json({ limit: '2mb' }));

const RPC_BASE_URL = 'https://rpc.quai.network';
const CYPRUS1_RPC_URL = 'https://rpc.quai.network/cyprus1';

async function rpcBatch(requests) {
  const payload = requests.map((r, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: r.method,
    params: r.params,
  }));
  const res = await fetch(CYPRUS1_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  data.sort((a, b) => a.id - b.id);
  return data;
}

function buildConversionDataPayload(qiRefundAddress, slippageBps = 1000) {
  const clamped = Math.max(50, Math.min(9000, Math.floor(slippageBps)));
  const bytes = new Uint8Array(22);
  bytes[0] = (clamped >> 8) & 0xff;
  bytes[1] = clamped & 0xff;
  bytes.set(quais.getBytes(qiRefundAddress), 2);
  return bytes;
}

let cachedRates = null;
async function getLiveRates() {
  const now = Date.now();
  if (cachedRates && now - cachedRates.updatedAt < 20000) {
    return cachedRates;
  }
  const [rpcRes, gateRes, cbrRes] = await Promise.allSettled([
    rpcBatch([
      { method: 'quai_blockNumber', params: [] },
      { method: 'quai_qiToQuai', params: ['0x3e8', 'latest'] },
    ]),
    fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=QUAI_USDT').then((r) => r.json()),
    fetch('https://www.cbr-xml-daily.ru/daily_json.js').then((r) => r.json()),
  ]);

  let currentBlock = cachedRates?.currentBlock ?? 11095000;
  let oneQiInQuai = cachedRates?.oneQiInQuai ?? 153.5065;
  let quaiUsd = cachedRates?.quaiUsd ?? 0.00676;
  let usdRub = cachedRates?.usdRub ?? 83.15;

  if (rpcRes.status === 'fulfilled') {
    if (rpcRes.value[0]?.result) currentBlock = parseInt(rpcRes.value[0].result, 16);
    if (rpcRes.value[1]?.result) oneQiInQuai = Number(quais.formatQuai(rpcRes.value[1].result));
  }
  if (gateRes.status === 'fulfilled' && gateRes.value?.[0]?.last) {
    quaiUsd = Number(gateRes.value[0].last);
  }
  if (cbrRes.status === 'fulfilled' && cbrRes.value?.Valute?.USD?.Value) {
    usdRub = Number(cbrRes.value.Valute.USD.Value);
  }

  const quaiRub = quaiUsd * usdRub;
  const qiUsd = oneQiInQuai * quaiUsd;
  const qiRub = qiUsd * usdRub;

  cachedRates = { updatedAt: now, currentBlock, oneQiInQuai, quaiUsd, usdRub, quaiRub, qiUsd, qiRub };
  return cachedRates;
}

app.get('/api/market', async (_req, res) => {
  try {
    const rates = await getLiveRates();
    res.json(rates);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 1. Inspect QI or QUAI Wallet
app.post('/api/inspect', async (req, res) => {
  try {
    const raw = String(req.body.input || '').trim();
    if (!raw) throw new Error('Введите приватный ключ (0x...) или адрес кошелька QI / QUAI.');
    const hex = raw.startsWith('0x') ? raw : '0x' + raw;

    let address = '';
    const changeAddresses = [];
    if (quais.isHexString(hex, 32)) {
      const w = new quais.Wallet(hex);
      if (quais.isQiAddress(w.address)) {
        const ent = quais.getBytes(quais.keccak256(hex)).slice(0, 16);
        const qiW = quais.QiHDWallet.fromMnemonic(quais.Mnemonic.fromEntropy(ent));
        const info = await qiW.importPrivateKey(hex);
        address = info.address;
        for (let i = 0; i < 6; i++) {
          changeAddresses.push(qiW.getNextChangeAddressSync(0, quais.Zone.Cyprus1).address);
        }
      } else {
        address = w.address;
      }
    } else if (quais.isHexString(hex, 20)) {
      address = quais.getAddress(hex);
    } else {
      throw new Error('Некорректный формат ключа (64 символа) или адреса (40 символов).');
    }

    const isQi = quais.isQiAddress(address);
    const rpcQueries = [
      { method: 'quai_getBalance', params: [address, 'latest'] },
      { method: 'quai_getOutpointsByAddress', params: [address] },
    ];
    for (const ch of changeAddresses) {
      rpcQueries.push({ method: 'quai_getOutpointsByAddress', params: [ch] });
    }

    const [rates, rpcRes] = await Promise.all([getLiveRates(), rpcBatch(rpcQueries)]);

    const rawOutpoints = [...(rpcRes[1]?.result || [])];
    for (let i = 0; i < changeAddresses.length; i++) {
      const extra = rpcRes[2 + i]?.result;
      if (Array.isArray(extra)) rawOutpoints.push(...extra);
    }

    let totalQit = 0n;
    let unlockedQit = 0n;
    let lockedQit = 0n;
    let unlockedCount = 0;
    let lockedCount = 0;

    for (const op of rawOutpoints) {
      const val = quais.denominations[parseInt(op.denomination, 16)] || 0n;
      const lb = parseInt(op.lock || '0x0', 16);
      totalQit += val;
      if (lb === 0 || lb <= rates.currentBlock) {
        unlockedQit += val;
        unlockedCount++;
      } else {
        lockedQit += val;
        lockedCount++;
      }
    }

    const totalQi = Number(quais.formatQi(totalQit));
    const unlockedQi = Number(quais.formatQi(unlockedQit));
    const lockedQi = Number(quais.formatQi(lockedQit));

    const quaiBal = isQi
      ? totalQi * rates.oneQiInQuai
      : Number(quais.formatQuai(BigInt(rpcRes[0]?.result || '0x0')));

    res.json({
      address,
      isQi,
      rates,
      totalQi: totalQi.toFixed(3),
      unlockedQi: unlockedQi.toFixed(3),
      lockedQi: lockedQi.toFixed(3),
      unlockedCount,
      lockedCount,
      totalOutpoints: rawOutpoints.length,
      quaiBal: quaiBal.toFixed(4),
      usdVal: (quaiBal * rates.quaiUsd).toFixed(2),
      rubVal: (quaiBal * rates.quaiRub).toFixed(2),
      unlockedUsd: (unlockedQi * rates.qiUsd).toFixed(2),
      unlockedRub: (unlockedQi * rates.qiRub).toFixed(2),
      lockedUsd: (lockedQi * rates.qiUsd).toFixed(2),
      lockedRub: (lockedQi * rates.qiRub).toFixed(2),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

// 2. Decrypt QUAI Wallet (Private Key, Seed Phrase, or Keystore JSON)
app.post('/api/wallet/decrypt-quai', async (req, res) => {
  try {
    const { mode, privateKey, mnemonicPhrase, keystoreJson, password } = req.body;
    let quaiAddress = '';
    let quaiPrivateKey = '';
    let qiCompanionAddress = null;
    let sourceLabel = '';

    if (mode === 'KEYSTORE') {
      if (!keystoreJson || !password) throw new Error('Укажите JSON Keystore и пароль.');
      const dec = quais.decryptKeystoreJsonSync(keystoreJson.trim(), password);
      quaiAddress = dec.address;
      quaiPrivateKey = dec.privateKey;
      sourceLabel = 'Расшифрован из Keystore JSON';
    } else if (mode === 'MNEMONIC') {
      if (!mnemonicPhrase || mnemonicPhrase.trim().split(/\\s+/).length < 12) {
        throw new Error('Введите корректную сид-фразу из 12 или 24 слов.');
      }
      const mn = quais.Mnemonic.fromPhrase(mnemonicPhrase.trim());
      const quaiHd = quais.QuaiHDWallet.fromMnemonic(mn);
      const qInfo = await quaiHd.getNextAddress(0, quais.Zone.Cyprus1);
      quaiAddress = qInfo.address;
      quaiPrivateKey = quaiHd.getPrivateKey(quaiAddress);

      const qiHd = quais.QiHDWallet.fromMnemonic(mn);
      const qiInfo = await qiHd.getNextAddress(0, quais.Zone.Cyprus1);
      qiCompanionAddress = qiInfo.address;
      sourceLabel = 'Вычислен из BIP-39 сид-фразы (Cyprus-1)';
    } else {
      if (!privateKey || !privateKey.trim()) throw new Error('Введите 64-символьный приватный ключ (0x...).');
      const normPk = privateKey.trim().startsWith('0x') ? privateKey.trim() : '0x' + privateKey.trim();
      const w = new quais.Wallet(normPk);
      quaiAddress = w.address;
      quaiPrivateKey = w.privateKey;
      sourceLabel = quais.isQuaiAddress(quaiAddress) ? 'Открыт из приватного ключа QUAI' : 'Открыт из приватного ключа QI';
    }

    const [rates, rpcRes] = await Promise.all([
      getLiveRates(),
      rpcBatch([{ method: 'quai_getBalance', params: [quaiAddress, 'latest'] }]),
    ]);
    const rawHex = rpcRes[0]?.result || '0x0';
    const isQuai = quais.isQuaiAddress(quaiAddress);
    const balQuai = isQuai
      ? Number(quais.formatQuai(BigInt(rawHex)))
      : Number(quais.formatQi(BigInt(rawHex))) * rates.oneQiInQuai;

    res.json({
      address: quaiAddress,
      privateKey: quaiPrivateKey,
      qiCompanionAddress,
      sourceLabel,
      balanceQuai: balQuai.toFixed(4),
      balanceQiEquivalent: (balQuai / rates.oneQiInQuai).toFixed(4),
      balanceUsd: (balQuai * rates.quaiUsd).toFixed(2),
      balanceRub: (balQuai * rates.quaiRub).toFixed(2),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

// 3. Send QUAI (EVM) or Convert QUAI -> QI (Dry-run & Broadcast)
app.post('/api/wallet/quai-action', async (req, res) => {
  try {
    const { privateKey, toAddress, amountQuai, slippagePercent, broadcast } = req.body;
    if (!privateKey || !privateKey.trim()) {
      throw new Error('Введите приватный ключ вашего QUAI-кошелька (или расшифруйте кошелек слева).');
    }
    const normPk = privateKey.trim().startsWith('0x') ? privateKey.trim() : '0x' + privateKey.trim();
    const senderWallet = new quais.Wallet(normPk);
    if (!quais.isQuaiAddress(senderWallet.address)) {
      throw new Error('Этот ключ принадлежит QI-адресу (' + senderWallet.address + '). Для QI используйте блок конвертера QI → QUAI.');
    }
    if (!toAddress || !quais.isHexString(toAddress.trim(), 20)) {
      throw new Error('Введите корректный 42-символьный адрес получателя (QUAI или QI).');
    }
    const cleanTo = quais.getAddress(toAddress.trim());
    const isRecipientQi = quais.isQiAddress(cleanTo);
    const valueWei = quais.parseQuai(String(amountQuai || '0'));
    if (valueWei <= 0n) throw new Error('Сумма отправки должна быть больше 0 QUAI.');

    const provider = new quais.JsonRpcProvider(RPC_BASE_URL, undefined, { usePathing: true });
    const connectedWallet = senderWallet.connect(provider);

    const [balanceWei, nonce, feeData, quaiToQiRes] = await Promise.all([
      provider.getBalance(senderWallet.address, 'latest'),
      provider.getTransactionCount(senderWallet.address, 'latest'),
      provider.getFeeData(quais.Zone.Cyprus1),
      isRecipientQi
        ? rpcBatch([{ method: 'quai_quaiToQi', params: ['0x' + valueWei.toString(16), 'latest'] }])
        : Promise.resolve([]),
    ]);

    const gasPrice = feeData.gasPrice || 2000000000n;
    const gasLimit = isRecipientQi ? 350000n : 42000n;
    const estimatedGasFeeWei = gasPrice * gasLimit;

    if (valueWei + estimatedGasFeeWei > balanceWei) {
      throw new Error(
        'Недостаточно QUAI на балансе (' +
          quais.formatQuai(balanceWei) +
          ' QUAI) для отправки ' +
          amountQuai +
          ' QUAI и оплаты газа (~' +
          quais.formatQuai(estimatedGasFeeWei) +
          ' QUAI).'
      );
    }

    let txDataHex = '0x';
    if (isRecipientQi) {
      const slipBps = Math.max(50, Math.min(9000, Math.round((Number(slippagePercent) || 10) * 100)));
      const slipBytes = new Uint8Array(2);
      slipBytes[0] = (slipBps >> 8) & 0xff;
      slipBytes[1] = slipBps & 0xff;
      txDataHex = quais.hexlify(slipBytes);
    }

    const expectedQiOutput = isRecipientQi && quaiToQiRes[0]?.result ? quais.formatQi(quaiToQiRes[0].result) : null;

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
        txHash: decoded.hash,
      });
      return;
    }

    const broadcastRpc = await rpcBatch([{ method: 'quai_sendRawTransaction', params: [signedRawTx] }]);
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
      txHash: broadcastRpc[0]?.result || decoded.hash,
    });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

// 4. Wallet Transaction History (Cyprus-1) + Live RPC txHash status check
app.post('/api/wallet/transactions', async (req, res) => {
  try {
    const { address, recentTxHashes } = req.body;
    if (!address || !quais.isHexString(address.trim(), 20)) {
      throw new Error('Введите корректный 42-символьный адрес кошелька QUAI или QI (0x00...).');
    }
    const cleanAddress = quais.getAddress(address.trim());
    const isQi = quais.isQiAddress(cleanAddress);
    const cleanRecent = Array.isArray(recentTxHashes)
      ? Array.from(new Set(recentTxHashes.filter((h) => typeof h === 'string' && quais.isHexString(h.trim(), 32))))
      : [];

    const [rates, explorerRes, outpointsRes, recentRpcRes] = await Promise.allSettled([
      getLiveRates(),
      fetch('https://quaiscan.io/api/v2/addresses/' + cleanAddress + '/transactions', {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      }).then((r) => (r.ok ? r.json() : { items: [] })),
      isQi ? rpcBatch([{ method: 'quai_getOutpointsByAddress', params: [cleanAddress] }]) : Promise.resolve([]),
      cleanRecent.length > 0
        ? rpcBatch(
            cleanRecent.flatMap((h) => [
              { method: 'quai_getTransactionByHash', params: [h] },
              { method: 'quai_getTransactionReceipt', params: [h] },
            ])
          )
        : Promise.resolve([]),
    ]);

    const activeRates =
      rates.status === 'fulfilled'
        ? rates.value
        : { currentBlock: 11095000, quaiUsd: 0.00676, quaiRub: 0.562, qiUsd: 1.037, qiRub: 86.25 };

    const txMap = new Map();

    if (recentRpcRes.status === 'fulfilled' && cleanRecent.length > 0) {
      const rpcArr = recentRpcRes.value;
      for (let i = 0; i < cleanRecent.length; i++) {
        const hash = cleanRecent[i];
        const txObj = rpcArr[i * 2]?.result;
        const receiptObj = rpcArr[i * 2 + 1]?.result;
        const blockNum = receiptObj?.blockNumber
          ? parseInt(receiptObj.blockNumber, 16)
          : txObj?.blockNumber
            ? parseInt(txObj.blockNumber, 16)
            : null;

        let status = 'PENDING';
        let statusLabel = 'В ожидании';
        if (receiptObj) {
          status = receiptObj.status === '0x0' ? 'FAILED' : 'SUCCESS';
          statusLabel = receiptObj.status === '0x0' ? 'Ошибка' : 'Успешно';
        } else if (blockNum && blockNum > 0) {
          status = 'SUCCESS';
          statusLabel = 'Успешно';
        }

        const fromAddr = txObj?.from ? quais.getAddress(txObj.from) : cleanAddress;
        const toAddr = txObj?.to ? quais.getAddress(txObj.to) : cleanAddress;
        const isToQi = toAddr && quais.isHexString(toAddr, 20) ? quais.isQiAddress(toAddr) : false;
        const isFromQi = fromAddr && quais.isHexString(fromAddr, 20) ? quais.isQiAddress(fromAddr) : false;

        let amountFloat = 0;
        let currency = 'QUAI';
        if (txObj?.value) {
          amountFloat = Number(quais.formatQuai(BigInt(txObj.value)));
        }
        const isConv = isToQi !== isFromQi;
        txMap.set(hash.toLowerCase(), {
          txHash: hash,
          blockNumber: blockNum,
          status,
          statusLabel,
          direction: isConv ? 'CONVERSION' : 'OUT',
          operationLabel: isToQi ? 'Конвертация QUAI → QI' : 'Перевод QUAI',
          fromAddress: fromAddr,
          toAddress: toAddr,
          amount: amountFloat.toFixed(4),
          currency,
          amountUsd: (amountFloat * activeRates.quaiUsd).toFixed(2),
          amountRub: (amountFloat * activeRates.quaiRub).toFixed(2),
          explorerTxUrl: 'https://explorer.qu.ai/tx/' + hash,
        });
      }
    }

    if (explorerRes.status === 'fulfilled' && Array.isArray(explorerRes.value?.items)) {
      for (const item of explorerRes.value.items) {
        if (!item.hash) continue;
        const fromHash = item.from?.hash || cleanAddress;
        const toHash = item.to?.hash || cleanAddress;
        let toIsQi = false;
        let fromIsQi = false;
        try {
          if (quais.isHexString(toHash, 20)) toIsQi = quais.isQiAddress(quais.getAddress(toHash));
          if (quais.isHexString(fromHash, 20)) fromIsQi = quais.isQiAddress(quais.getAddress(fromHash));
        } catch {}

        const status = item.status === 'pending' || item.block == null ? 'PENDING' : item.status === 'error' ? 'FAILED' : 'SUCCESS';
        const statusLabel = status === 'PENDING' ? 'В ожидании' : status === 'FAILED' ? 'Ошибка' : 'Успешно';
        const isConv = toIsQi !== fromIsQi || item.etx_type === 'conversion';
        const rawVal = item.value ? BigInt(item.value) : 0n;
        const amountQuai = Number(quais.formatQuai(rawVal));

        txMap.set(item.hash.toLowerCase(), {
          txHash: item.hash,
          blockNumber: item.block || null,
          status,
          statusLabel,
          direction: isConv ? 'CONVERSION' : fromHash.toLowerCase() === cleanAddress.toLowerCase() ? 'OUT' : 'IN',
          operationLabel: toIsQi
            ? 'Конвертация QUAI → QI'
            : fromIsQi
              ? 'Конвертация QI → QUAI'
              : item.etx_type === 'coinbase'
                ? 'Награда / Внешняя ETX'
                : 'Перевод QUAI',
          fromAddress: fromHash,
          toAddress: toHash,
          amount: amountQuai.toFixed(4),
          currency: 'QUAI',
          amountUsd: (amountQuai * activeRates.quaiUsd).toFixed(2),
          amountRub: (amountQuai * activeRates.quaiRub).toFixed(2),
          explorerTxUrl: 'https://explorer.qu.ai/tx/' + item.hash,
        });
      }
    }

    if (isQi && outpointsRes.status === 'fulfilled') {
      const rawOps = Array.isArray(outpointsRes.value[0]?.result) ? outpointsRes.value[0].result : [];
      const grouped = new Map();
      for (const op of rawOps) {
        const dIdx = parseInt(op.denomination, 16);
        const qitVal = quais.denominations[dIdx] ?? 0n;
        const lb = parseInt(op.lock || '0x0', 16);
        const ex = grouped.get(op.txHash);
        if (!ex) grouped.set(op.txHash, { txHash: op.txHash, totalQit: qitVal, lockBlock: lb, count: 1 });
        else {
          ex.totalQit += qitVal;
          ex.count++;
          ex.lockBlock = Math.max(ex.lockBlock, lb);
        }
      }
      const sorted = Array.from(grouped.values()).sort((a, b) => b.lockBlock - a.lockBlock);
      for (const u of sorted.slice(0, 35)) {
        if (txMap.has(u.txHash.toLowerCase())) continue;
        const unlocked = u.lockBlock === 0 || u.lockBlock <= activeRates.currentBlock;
        const qiVal = Number(quais.formatQi(u.totalQit));
        txMap.set(u.txHash.toLowerCase(), {
          txHash: u.txHash,
          blockNumber: u.lockBlock || null,
          status: unlocked ? 'SUCCESS' : 'PENDING',
          statusLabel: unlocked ? 'Успешно (Разблокирован)' : 'В ожидании разблокировки',
          direction: 'IN',
          operationLabel: 'Зачисление QI (' + u.count + ' UTXO)',
          fromAddress: 'Coinbase / Протокол Quai',
          toAddress: cleanAddress,
          amount: qiVal.toFixed(3),
          currency: 'QI',
          amountUsd: (qiVal * activeRates.qiUsd).toFixed(2),
          amountRub: (qiVal * activeRates.qiRub).toFixed(2),
          explorerTxUrl: 'https://explorer.qu.ai/tx/' + u.txHash,
        });
      }
    }

    res.json({
      address: cleanAddress,
      transactions: Array.from(txMap.values()),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

// 5. Convert QI -> QUAI
app.post('/api/convert-qi-to-quai', async (req, res) => {
  try {
    const { privateKey, destQuaiAddress, amountQi, broadcast } = req.body;
    const normPk = privateKey.trim().startsWith('0x') ? privateKey.trim() : '0x' + privateKey.trim();
    const cleanDest = quais.getAddress(destQuaiAddress.trim());
    if (!quais.isQuaiAddress(cleanDest)) {
      throw new Error('Укажите корректный QUAI-адрес (0x00..., второй байт < 0x80).');
    }
    const amountQit = quais.parseQi(String(amountQi || '0'));
    const provider = new quais.JsonRpcProvider(RPC_BASE_URL, undefined, { usePathing: true });
    const ent = quais.getBytes(quais.keccak256(normPk)).slice(0, 16);
    const mnemonic = quais.Mnemonic.fromEntropy(ent);
    const qiW = quais.QiHDWallet.fromMnemonic(mnemonic);
    qiW.connect(provider);
    const addrInfo = await qiW.importPrivateKey(normPk);
    const primaryOps = await provider.getOutpointsByAddress(addrInfo.address);
    const allOps = primaryOps.map((op) => ({
      outpoint: op,
      address: addrInfo.address,
      zone: quais.Zone.Cyprus1,
      derivationPath: 'PrivateKey',
    }));
    for (let i = 0; i < 6; i++) {
      const ch = qiW.getNextChangeAddressSync(0, quais.Zone.Cyprus1);
      const chOps = await provider.getOutpointsByAddress(ch.address);
      for (const op of chOps) {
        allOps.push({ outpoint: op, address: ch.address, zone: quais.Zone.Cyprus1, derivationPath: 'BIP44:change' });
      }
    }
    const freshW = quais.QiHDWallet.fromMnemonic(mnemonic);
    freshW.connect(provider);
    await freshW.importPrivateKey(normPk);
    freshW.importOutpoints(allOps);

    const dataBytes = buildConversionDataPayload(addrInfo.address, 1000);
    const dataHex = quais.hexlify(dataBytes);
    const origPrep = freshW.prepareFeeEstimationTransaction.bind(freshW);
    freshW.prepareFeeEstimationTransaction = (sel, inPub, sendA, chA) => ({
      ...origPrep(sel, inPub, sendA, chA),
      data: dataHex,
    });

    if (!broadcast) {
      provider.broadcastTransaction = async (_zone, signedTx) => {
        const dec = quais.QiTransaction.from(signedTx);
        return { hash: dec.hash };
      };
    }
    const txRes = await freshW.convertToQuai(cleanDest, amountQit, { data: dataBytes });
    res.json({
      mode: broadcast ? 'BROADCASTED' : 'DRY_RUN',
      txHash: txRes.hash || String(txRes),
      explorerUrl: 'https://explorer.qu.ai/tx/' + (txRes.hash || String(txRes)),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

// 6. Explorer Lookup (Transactions, Blocks, Addresses on explorer.qu.ai)
app.post('/api/explorer/lookup', async (req, res) => {
  try {
    const q = String(req.body.query || '').trim();
    if (!q) throw new Error('Введите хэш транзакции (0x...), адрес (0x...) или номер блока Cyprus-1.');
    if (quais.isHexString(q, 32)) {
      const rpcRes = await rpcBatch([
        { method: 'quai_getTransactionByHash', params: [q] },
        { method: 'quai_getTransactionReceipt', params: [q] },
      ]);
      res.json({
        lookupType: 'TRANSACTION',
        query: q,
        explorerUrl: 'https://explorer.qu.ai/tx/' + q,
        transaction: rpcRes[0]?.result || null,
        receipt: rpcRes[1]?.result || null,
      });
    } else if (/^\\d+$/.test(q) || (q.startsWith('0x') && q.length <= 12)) {
      const blockHex = q.startsWith('0x') ? q : '0x' + parseInt(q, 10).toString(16);
      const blockDec = parseInt(blockHex, 16);
      const rpcRes = await rpcBatch([{ method: 'quai_getBlockByNumber', params: [blockHex, false] }]);
      res.json({
        lookupType: 'BLOCK',
        query: String(blockDec),
        explorerUrl: 'https://explorer.qu.ai/block/' + blockDec,
        block: rpcRes[0]?.result || null,
      });
    } else if (quais.isHexString(q, 20)) {
      const addr = quais.getAddress(q);
      res.json({
        lookupType: 'ADDRESS',
        query: addr,
        explorerUrl: 'https://explorer.qu.ai/address/' + addr,
        isQi: quais.isQiAddress(addr),
        isQuai: quais.isQuaiAddress(addr),
        zone: quais.getZoneForAddress(addr) || '0x00',
      });
    } else {
      throw new Error('Не удалось распознать запрос. Введите 66-символьный txHash, 42-символьный адрес или номер блока.');
    }
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.get('/', (_req, res) => {
  res.send(\`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>QuaiVault Windows Desktop — Полный терминал QI и QUAI</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0B0F17; color: #F8FAFC; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px 28px; }
    .container { max-width: 1320px; margin: 0 auto; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1E293B; padding-bottom: 14px; margin-bottom: 18px; gap: 16px; flex-wrap: wrap; }
    .brand { font-size: 20px; font-weight: 700; color: #F8FAFC; }
    .sub { color: #94A3B8; font-size: 12px; line-height: 1.5; }
    .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
    @media (max-width: 980px) { .two-col { grid-template-columns: 1fr; } }
    .row { display: flex; gap: 10px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
    label { display: block; font-size: 12px; color: #CBD5E1; margin-bottom: 5px; font-weight: 500; }
    input, textarea { background: #0B0F17; border: 1px solid #334155; color: #F8FAFC; padding: 10px 13px; border-radius: 8px; width: 100%; font-family: Consolas, monospace; font-size: 13px; }
    input:focus, textarea:focus { outline: none; border-color: #E11D48; }
    button { background: #E11D48; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; white-space: nowrap; }
    button.sec { background: #1E293B; color: #E2E8F0; border: 1px solid #334155; }
    button.light { background: #F1F5F9; color: #0F172A; }
    button:hover { opacity: 0.92; }
    .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .kpi-title { font-size: 12px; color: #94A3B8; }
    .kpi-val { font-size: 21px; font-weight: 700; font-family: Consolas, monospace; margin: 6px 0; }
    .kpi-sub { font-size: 12px; font-family: Consolas, monospace; color: #CBD5E1; }
    .emerald { color: #34D399; }
    .amber { color: #FBBF24; }
    .rose { color: #FB7185; }
    a { color: #FB7185; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: Consolas, monospace; margin-top: 12px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #1E293B; text-align: left; }
    th { color: #94A3B8; font-weight: 600; background: #0B0F17; }
    .tabs { display: flex; gap: 6px; background: #0B0F17; padding: 4px; border-radius: 8px; border: 1px solid #1E293B; margin-bottom: 12px; }
    .tab-btn { flex: 1; background: transparent; color: #94A3B8; border: none; padding: 7px 10px; font-size: 12px; border-radius: 6px; cursor: pointer; }
    .tab-btn.active { background: #1E293B; color: #F8FAFC; }
    pre { background: #0B0F17; border: 1px solid #1E293B; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 11px; color: #CBD5E1; max-height: 280px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand">QuaiVault Windows Desktop (127.0.0.1:3000)</div>
        <div class="sub" id="marketStrip">Загрузка курсов QUAI/USD и ЦБ РФ...</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="sec" onclick="loadMarket()">Обновить котировки</button>
        <a href="https://explorer.qu.ai/" target="_blank" style="font-size:13px;font-weight:600">explorer.qu.ai ↗</a>
      </div>
    </div>

    <!-- БЛОК 1: КОШЕЛЕК QI И UTXO -->
    <div class="card">
      <div class="sub">Некастодиальный режим (данные не сохраняются) · Шард Cyprus-1 (0x00) · Обход коллизии BIP44</div>
      <h2 style="margin:4px 0 8px;font-size:18px">1. Проверка баланса кошелька QI / QUAI в долларах ($) и рублях ЦБ РФ (₽)</h2>
      <div class="row">
        <input id="inp" type="password" placeholder="Вставьте адрес 0x00... или приватный ключ 0x... для расчета баланса" style="flex:1" />
        <button class="sec" onclick="const el=document.getElementById('inp');el.type=el.type==='password'?'text':'password'">Показать/Скрыть</button>
        <button class="light" onclick="inspect()">Проверить баланс и UTXO</button>
      </div>
      <div id="err" class="rose" style="font-size:12px;margin-top:8px"></div>
      <div id="dashboard" style="margin-top:14px"></div>
    </div>

    <!-- БЛОК 2: РАСШИФРОВКА КОШЕЛЬКА QUAI И ОТПРАВКА QUAI / КОНВЕРТАЦИЯ QUAI -> QI -->
    <div class="two-col">
      <!-- Левая колонка: Расшифровать кошелек QUAI -->
      <div class="card">
        <div class="sub">Расшифровка кошелька QUAI (EVM) · Keystore JSON / BIP-39 Сид-фраза / Приватный ключ</div>
        <h3 style="margin:4px 0 6px;font-size:16px">Открыть или расшифровать кошелек QUAI</h3>
        <div class="sub" style="margin-bottom:12px">Расшифруйте ваш кошелек QUAI из зашифрованного файла Keystore JSON с паролем, мнемонической фразы из 12/24 слов (Pelagus) или приватного ключа.</div>

        <div class="tabs">
          <button class="tab-btn active" id="tab-pk" onclick="setDecMode('PRIVATE_KEY')">Приватный ключ</button>
          <button class="tab-btn" id="tab-mn" onclick="setDecMode('MNEMONIC')">Сид-фраза (12/24 слова)</button>
          <button class="tab-btn" id="tab-ks" onclick="setDecMode('KEYSTORE')">Keystore JSON + Пароль</button>
        </div>

        <div id="box-pk">
          <label>Приватный ключ QUAI (0x...)</label>
          <input id="quaiPk" type="password" placeholder="0x..." />
        </div>
        <div id="box-mn" style="display:none">
          <label>Мнемоническая фраза BIP-39 (12 или 24 слова через пробел)</label>
          <textarea id="quaiMn" rows="3" placeholder="word1 word2 word3 ... word12"></textarea>
        </div>
        <div id="box-ks" style="display:none">
          <label>Содержимое JSON Keystore файла</label>
          <textarea id="quaiKs" rows="3" placeholder='{"version":3,"crypto":{...}}'></textarea>
          <label style="margin-top:8px">Пароль расшифровки Keystore</label>
          <input id="quaiKsPass" type="password" placeholder="Введите пароль от Keystore..." />
        </div>

        <button class="light" style="width:100%;margin-top:12px" onclick="decryptQuai()">Расшифровать кошелек и загрузить баланс</button>
        <div id="decOut" style="margin-top:12px;font-size:12px;font-family:Consolas,monospace"></div>
      </div>

      <!-- Правая колонка: Отправка QUAI (EVM) и Протокольная конвертация QUAI -> QI -->
      <div class="card">
        <div class="sub">Отправка QUAI (EVM) и Протокольная конвертация QUAI → QI</div>
        <h3 style="margin:4px 0 6px;font-size:16px">Отправить QUAI или конвертировать QUAI → QI</h3>
        <div class="sub" style="margin-bottom:12px">
          Если указать в качестве получателя адрес <b>QUAI</b> (второй байт &lt; 0x80), выполнится обычный перевод QUAI. Если указать адрес <b>QI</b> (второй байт &gt;= 0x80, например 0x00AC...), протокол Quai автоматически сконвертирует отправленные QUAI в UTXO-купюры QI!
        </div>

        <div>
          <label>Адрес получателя (QUAI-адрес для перевода или QI-адрес для конвертации в QI)</label>
          <input id="quaiToAddr" type="text" placeholder="0x00... (QUAI или QI адрес в зоне Cyprus-1)" />
        </div>

        <div class="two-col" style="gap:12px;margin-top:12px">
          <div>
            <label>Сумма отправки (QUAI)</label>
            <input id="quaiSendAmt" type="number" step="0.1" value="10" oninput="updateQuaiCalc()" />
            <div class="sub" id="quaiAmtFiat" style="margin-top:4px;font-family:Consolas,monospace">≈ $0.07 USD · 5.54 ₽</div>
          </div>
          <div>
            <label>Макс. проскальзывание для QUAI → QI (%)</label>
            <input id="quaiSlip" type="number" step="1" min="1" max="50" value="10" oninput="updateQuaiCalc()" />
            <div class="sub" id="quaiExpectedQi" style="margin-top:4px;font-family:Consolas,monospace">Ожидаемый выход в QI: ≈ 0.065 QI</div>
          </div>
        </div>

        <div class="row" style="margin-top:14px">
          <button class="sec" style="flex:1" onclick="runQuaiAction(false)">1. Предпросмотр и расчет газа (Без отправки)</button>
          <button style="flex:1" onclick="runQuaiAction(true)">2. Подписать и отправить в сеть Quai</button>
        </div>
        <div id="quaiActionOut" style="margin-top:12px;font-size:12px;font-family:Consolas,monospace"></div>
      </div>
    </div>

    <!-- БЛОК 3: ИСТОРИЯ ОПЕРАЦИЙ КОШЕЛЬКА (CYPRUS-1) -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="sub">История операций кошелька (Cyprus-1) · Статусы RPC в реальном времени · Прямая интеграция с explorer.qu.ai</div>
          <h3 style="margin:4px 0 0;font-size:16px">История операций и статусы транзакций (QUAI ↔ QI)</h3>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="sec" id="autoPollBtn" onclick="toggleAutoPoll()" style="color:#34D399;border-color:#065F46">Автообновление: ВКЛ</button>
          <button class="sec" onclick="loadHistory()">Обновить историю</button>
        </div>
      </div>

      <div class="two-col" style="gap:12px;margin-top:14px">
        <div style="display:flex;gap:8px">
          <input id="histAddr" type="text" placeholder="Введите адрес кошелька QUAI или QI (0x00...) для загрузки истории операций..." />
          <button onclick="loadHistory()">Загрузить операции</button>
        </div>
        <div style="display:flex;gap:8px">
          <input id="trackHashInp" type="text" placeholder="Добавить хэш транзакции (0x...) для отслеживания статуса..." />
          <button class="sec" onclick="addTrackedHash()">Проверить txHash</button>
        </div>
      </div>

      <div id="histContainer" style="margin-top:14px">
        <div class="sub" style="text-align:center;padding:18px 0">
          Откройте кошелек QUAI слева или введите адрес кошелька (0x00...) в поле выше.<br>
          Здесь отобразятся последние транзакции по адресу кошелька, включая переводы QUAI, протокольные конвертации QUAI ↔ QI, статус подтверждения и прямые ссылки на explorer.qu.ai.
        </div>
      </div>
    </div>

    <!-- БЛОК 4: ВСТРОЕННЫЙ КОНВЕРТЕР QI -> QUAI -->
    <div class="card">
      <div class="sub">Протокольная конвертация UTXO · QiHDWallet.convertToQuai (22-байтный payload go-quai)</div>
      <h3 style="margin:4px 0 8px;font-size:16px">Конвертация разблокированных QI → QUAI (Cyprus-1)</h3>
      <div class="row">
        <input id="destQuai" type="text" placeholder="Адрес получателя QUAI (0x00..., второй байт < 0x80)" style="flex:2" />
        <input id="amtQi" type="number" step="0.001" value="0.05" style="max-width:160px" />
        <button class="sec" onclick="convertQi(false)">1. Проверить комиссию и подпись (Без отправки)</button>
        <button onclick="convertQi(true)">2. Подписать и отправить в сеть Quai Mainnet</button>
      </div>
      <div id="convOut" style="margin-top:10px;font-family:Consolas,monospace;font-size:12px"></div>
    </div>

    <!-- БЛОК 5: ПОИСК ТРАНЗАКЦИЙ, БЛОКОВ И ПРОВЕРКА АДРЕСОВ QUAI NETWORK -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div class="sub">Интеграция с официальным обозревателем https://explorer.qu.ai/</div>
          <h3 style="margin:4px 0 0;font-size:16px">Поиск транзакций, блоков и проверка адресов Quai Network</h3>
        </div>
        <a href="https://explorer.qu.ai/" target="_blank" style="font-size:12px">Открыть explorer.qu.ai ↗</a>
      </div>
      <div class="row">
        <input id="expQuery" type="text" placeholder="Введите хэш транзакции (0x...), адрес (0x...) или номер блока Cyprus-1..." />
        <button onclick="lookupExplorer()">Найти в блокчейне</button>
      </div>
      <div id="expOut" style="margin-top:12px"></div>
    </div>
  </div>

  <script>
    let currentRates = { quaiUsd: 0.00676, usdRub: 83.15, quaiRub: 0.562, oneQiInQuai: 153.5065, qiUsd: 1.037, qiRub: 86.25, currentBlock: 11095000 };
    let decMode = 'PRIVATE_KEY';
    let openedQuaiPrivateKey = '';
    let trackedTxHashes = [];
    let autoPoll = true;

    async function loadMarket() {
      try {
        const r = await fetch('/api/market');
        if (r.ok) {
          currentRates = await r.json();
          document.getElementById('marketStrip').innerHTML =
            'Курс QUAI: <b>$' + currentRates.quaiUsd.toFixed(5) + '</b> · <span class="emerald">' + currentRates.quaiRub.toFixed(3) + ' ₽</span> &nbsp;|&nbsp; ' +
            '1 QI (протокол): <b>' + currentRates.oneQiInQuai.toFixed(2) + ' QUAI</b> · $' + currentRates.qiUsd.toFixed(2) + ' · <span class="emerald">' + currentRates.qiRub.toFixed(2) + ' ₽</span> &nbsp;|&nbsp; ' +
            'Курс ЦБ РФ: <b>' + currentRates.usdRub.toFixed(2) + ' ₽/$</b> &nbsp;|&nbsp; Блок Cyprus-1: #' + currentRates.currentBlock;
          updateQuaiCalc();
        }
      } catch {}
    }

    function updateQuaiCalc() {
      const amt = Number(document.getElementById('quaiSendAmt').value || '0');
      const usd = (amt * currentRates.quaiUsd).toFixed(2);
      const rub = (amt * currentRates.quaiRub).toFixed(2);
      const qiOut = currentRates.oneQiInQuai > 0 ? (amt / currentRates.oneQiInQuai).toFixed(3) : '0.000';
      document.getElementById('quaiAmtFiat').textContent = '≈ $' + usd + ' USD · ' + rub + ' ₽';
      document.getElementById('quaiExpectedQi').textContent = 'Ожидаемый выход в QI: ≈ ' + qiOut + ' QI';
    }

    function setDecMode(m) {
      decMode = m;
      document.getElementById('tab-pk').className = 'tab-btn' + (m === 'PRIVATE_KEY' ? ' active' : '');
      document.getElementById('tab-mn').className = 'tab-btn' + (m === 'MNEMONIC' ? ' active' : '');
      document.getElementById('tab-ks').className = 'tab-btn' + (m === 'KEYSTORE' ? ' active' : '');
      document.getElementById('box-pk').style.display = m === 'PRIVATE_KEY' ? 'block' : 'none';
      document.getElementById('box-mn').style.display = m === 'MNEMONIC' ? 'block' : 'none';
      document.getElementById('box-ks').style.display = m === 'KEYSTORE' ? 'block' : 'none';
    }

    async function inspect() {
      const errEl = document.getElementById('err');
      errEl.textContent = 'Сканирование блокчейна Cyprus-1...';
      const input = document.getElementById('inp').value;
      try {
        const r = await fetch('/api/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input })
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'Ошибка запроса');
        errEl.textContent = '';
        currentRates = d.rates;

        document.getElementById('histAddr').value = d.address;
        loadHistory();

        document.getElementById('dashboard').innerHTML =
          '<div style="margin-bottom:12px;font-family:Consolas,monospace;font-size:12px">' +
            'Адрес кошелька: <b>' + d.address + '</b> (' + (d.isQi ? 'QI UTXO' : 'QUAI EVM') + ') · ' +
            '<a target="_blank" href="https://explorer.qu.ai/address/' + d.address + '">Открыть на explorer.qu.ai ↗</a>' +
          '</div>' +
          '<div class="grid4">' +
            '<div class="card" style="margin:0"><div class="kpi-title">Полный баланс (' + d.totalOutpoints + ' UTXO)</div><div class="kpi-val">' + (d.isQi ? d.totalQi + ' QI' : d.quaiBal + ' QUAI') + '</div><div class="kpi-sub rose">≈ ' + d.quaiBal + ' QUAI</div><div class="kpi-sub">$' + d.usdVal + ' · ' + d.rubVal + ' ₽ (ЦБ)</div></div>' +
            '<div class="card" style="margin:0"><div class="kpi-title">Доступно сейчас (' + d.unlockedCount + ' UTXO)</div><div class="kpi-val emerald">' + d.unlockedQi + ' QI</div><div class="kpi-sub">$' + d.unlockedUsd + ' · ' + d.unlockedRub + ' ₽ (ЦБ)</div></div>' +
            '<div class="card" style="margin:0"><div class="kpi-title">В разблокировке (' + d.lockedCount + ' UTXO)</div><div class="kpi-val amber">' + d.lockedQi + ' QI</div><div class="kpi-sub">$' + d.lockedUsd + ' · ' + d.lockedRub + ' ₽ (ЦБ)</div></div>' +
            '<div class="card" style="margin:0"><div class="kpi-title">Оценка по курсу ЦБ РФ</div><div class="kpi-val emerald">' + d.rubVal + ' ₽</div><div class="kpi-sub">В долларах: $' + d.usdVal + ' USD</div></div>' +
          '</div>';
      } catch (e) {
        errEl.textContent = 'Ошибка: ' + e.message;
      }
    }

    async function decryptQuai() {
      const out = document.getElementById('decOut');
      out.innerHTML = '<span class="sub">Расшифровка и запрос баланса...</span>';
      try {
        const r = await fetch('/api/wallet/decrypt-quai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: decMode,
            privateKey: document.getElementById('quaiPk').value,
            mnemonicPhrase: document.getElementById('quaiMn').value,
            keystoreJson: document.getElementById('quaiKs').value,
            password: document.getElementById('quaiKsPass').value
          })
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'Ошибка расшифровки');
        openedQuaiPrivateKey = d.privateKey;
        document.getElementById('histAddr').value = d.address;
        if (d.qiCompanionAddress && !document.getElementById('quaiToAddr').value) {
          document.getElementById('quaiToAddr').value = d.qiCompanionAddress;
        }
        loadHistory();

        out.innerHTML =
          '<div style="background:#0B0F17;border:1px solid #1E293B;padding:12px;border-radius:8px;line-height:1.7">' +
            '<div class="emerald" style="font-weight:600">' + d.sourceLabel + '</div>' +
            '<div>Адрес: <b>' + d.address + '</b></div>' +
            '<div>Баланс: <b>' + d.balanceQuai + ' QUAI</b> (≈ ' + d.balanceQiEquivalent + ' QI)</div>' +
            '<div class="emerald">Оценка: <b>$' + d.balanceUsd + ' USD · ' + d.balanceRub + ' ₽ (ЦБ)</b></div>' +
            (d.qiCompanionAddress ? '<div class="amber">Парный QI-адрес: ' + d.qiCompanionAddress + '</div>' : '') +
          '</div>';
      } catch (e) {
        out.innerHTML = '<span class="rose">Ошибка: ' + e.message + '</span>';
      }
    }

    async function runQuaiAction(broadcast) {
      const out = document.getElementById('quaiActionOut');
      const pk = openedQuaiPrivateKey || document.getElementById('quaiPk').value || document.getElementById('inp').value;
      out.innerHTML = '<span class="sub">Формирование транзакции QUAI...</span>';
      try {
        const r = await fetch('/api/wallet/quai-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privateKey: pk,
            toAddress: document.getElementById('quaiToAddr').value,
            amountQuai: document.getElementById('quaiSendAmt').value,
            slippagePercent: Number(document.getElementById('quaiSlip').value) || 10,
            broadcast
          })
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'Ошибка транзакции');
        if (d.txHash && !trackedTxHashes.includes(d.txHash)) {
          trackedTxHashes.unshift(d.txHash);
          loadHistory();
        }
        out.innerHTML =
          '<div style="background:#0B0F17;border:1px solid #1E293B;padding:12px;border-radius:8px;line-height:1.7">' +
            '<div class="emerald" style="font-weight:600">' + (d.mode === 'DRY_RUN' ? 'Тестовая подпись успешна (Без отправки)' : 'Транзакция отправлена в сеть Quai!') + '</div>' +
            '<div>Тип: ' + (d.actionType === 'CONVERT_QUAI_TO_QI' ? 'Протокольная конвертация QUAI → QI' : 'Перевод QUAI → QUAI') + '</div>' +
            '<div>Сумма: ' + d.amountQuai + ' QUAI ' + (d.expectedQiOutput ? '→ ≈ ' + d.expectedQiOutput + ' QI' : '') + '</div>' +
            '<div>Комиссия газа: ~' + d.estimatedFeeQuai + ' QUAI</div>' +
            '<div>txHash: <a target="_blank" href="https://explorer.qu.ai/tx/' + d.txHash + '">' + d.txHash + ' ↗</a></div>' +
          '</div>';
      } catch (e) {
        out.innerHTML = '<span class="rose">Ошибка: ' + e.message + '</span>';
      }
    }

    function toggleAutoPoll() {
      autoPoll = !autoPoll;
      const btn = document.getElementById('autoPollBtn');
      btn.textContent = autoPoll ? 'Автообновление: ВКЛ' : 'Автообновление: ВЫКЛ';
      btn.style.color = autoPoll ? '#34D399' : '#94A3B8';
    }

    function addTrackedHash() {
      const h = document.getElementById('trackHashInp').value.trim();
      if (h.startsWith('0x') && h.length === 66) {
        if (!trackedTxHashes.includes(h)) trackedTxHashes.unshift(h);
        document.getElementById('trackHashInp').value = '';
        loadHistory();
      } else {
        alert('Введите корректный 66-символьный хэш транзакции (0x...)');
      }
    }

    async function loadHistory() {
      const addr = document.getElementById('histAddr').value.trim();
      if (!addr) return;
      const cont = document.getElementById('histContainer');
      try {
        const r = await fetch('/api/wallet/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr, recentTxHashes: trackedTxHashes })
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'Ошибка загрузки истории');
        const list = d.transactions || [];
        if (list.length === 0) {
          cont.innerHTML = '<div class="sub" style="text-align:center;padding:16px">По адресу ' + d.address + ' операций пока не найдено.</div>';
          return;
        }
        let rows = '';
        for (const tx of list) {
          const stClass = tx.status === 'SUCCESS' ? 'emerald' : tx.status === 'PENDING' ? 'amber' : 'rose';
          rows += '<tr>' +
            '<td><a target="_blank" href="' + tx.explorerTxUrl + '">' + tx.txHash.slice(0, 14) + '...' + tx.txHash.slice(-8) + ' ↗</a></td>' +
            '<td>' + tx.operationLabel + '</td>' +
            '<td>' + tx.fromAddress.slice(0, 10) + '... → ' + tx.toAddress.slice(0, 10) + '...</td>' +
            '<td><b>' + tx.amount + ' ' + tx.currency + '</b></td>' +
            '<td>$' + tx.amountUsd + ' · <span class="emerald">' + tx.amountRub + ' ₽</span></td>' +
            '<td>' + (tx.blockNumber ? '<a target="_blank" href="https://explorer.qu.ai/block/' + tx.blockNumber + '">#' + tx.blockNumber + '</a>' : '<span class="amber">Мемпул</span>') + '</td>' +
            '<td class="' + stClass + '"><b>' + tx.statusLabel + '</b></td>' +
          '</tr>';
        }
        cont.innerHTML =
          '<table><thead><tr><th>Хэш транзакции (explorer.qu.ai)</th><th>Тип операции</th><th>Маршрут</th><th>Сумма</th><th>В USD ($) / RUB (₽ ЦБ)</th><th>Блок</th><th>Статус</th></tr></thead><tbody>' +
          rows + '</tbody></table>';
      } catch (e) {
        cont.innerHTML = '<div class="rose" style="font-size:12px">Ошибка: ' + e.message + '</div>';
      }
    }

    async function convertQi(broadcast) {
      const out = document.getElementById('convOut');
      out.textContent = 'Формирование UTXO-транзакции конвертации QI → QUAI...';
      try {
        const r = await fetch('/api/convert-qi-to-quai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privateKey: document.getElementById('inp').value,
            destQuaiAddress: document.getElementById('destQuai').value,
            amountQi: document.getElementById('amtQi').value,
            broadcast
          })
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'Ошибка конвертации');
        out.innerHTML = '<span class="emerald">' + (d.mode === 'DRY_RUN' ? 'Тестовая подпись успешна (Без отправки)!' : 'Транзакция отправлена в сеть Quai Mainnet!') + '</span> Хэш: <a target="_blank" href="' + d.explorerUrl + '">' + d.txHash + ' ↗</a>';
      } catch (e) {
        out.innerHTML = '<span class="rose">Ошибка: ' + e.message + '</span>';
      }
    }

    async function lookupExplorer() {
      const out = document.getElementById('expOut');
      const query = document.getElementById('expQuery').value.trim();
      if (!query) return;
      out.innerHTML = '<span class="sub">Поиск в RPC Cyprus-1...</span>';
      try {
        const r = await fetch('/api/explorer/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'Ошибка поиска');
        out.innerHTML =
          '<div style="margin-bottom:6px;font-size:12px"><span class="emerald">Результат (' + d.lookupType + ')</span> · <a target="_blank" href="' + d.explorerUrl + '">Смотреть на explorer.qu.ai ↗</a></div>' +
          '<pre>' + JSON.stringify(d, null, 2) + '</pre>';
      } catch (e) {
        out.innerHTML = '<span class="rose" style="font-size:12px">Ошибка: ' + e.message + '</span>';
      }
    }

    loadMarket();
    setInterval(() => {
      if (autoPoll && document.getElementById('histAddr').value.trim()) {
        loadHistory();
      }
    }, 12000);
  </script>
</body>
</html>\`);
});

const PORT = 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log('============================================================');
  console.log(' QuaiVault Windows Desktop GUI is running on:');
  console.log(' http://127.0.0.1:' + PORT);
  console.log('============================================================');
});
`;

    const packageJsonStr = JSON.stringify(
      {
        name: 'quaivault-windows-desktop',
        version: '2.0.0',
        private: true,
        type: 'module',
        dependencies: {
          express: '^4.21.2',
          quais: '1.0.0-alpha.53',
        },
      },
      null,
      2
    );

    const pkgBase64Lines = encodeUtf8ToBase64Lines(packageJsonStr);
    const serverBase64Lines = encodeUtf8ToBase64Lines(desktopServerMjs);

    // 100% Pure 7-bit ASCII Windows Batch script with explicit CRLF (\r\n) line endings and GOTO labels.
    const batLines: string[] = [
      '@echo off',
      'setlocal EnableExtensions',
      'title QuaiVault Desktop GUI Installer for Windows 10/11',
      'echo ============================================================================',
      'echo   QuaiVault Desktop GUI - Automatic Windows Installer (127.0.0.1:3000)',
      'echo ============================================================================',
      'echo.',
      'set "PATH=%ProgramFiles%\\nodejs;%ProgramFiles(x86)%\\nodejs;%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
      'where node >nul 2>nul',
      'if %errorlevel% equ 0 goto NODE_READY',
      '',
      'echo [INFO] Node.js was not found in PATH. Installing Node.js LTS automatically...',
      'where winget >nul 2>nul',
      'if %errorlevel% neq 0 goto DOWNLOAD_NODE_MSI',
      'call winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements',
      'set "PATH=%ProgramFiles%\\nodejs;%ProgramFiles(x86)%\\nodejs;%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
      'where node >nul 2>nul',
      'if %errorlevel% equ 0 goto NODE_READY',
      '',
      ':DOWNLOAD_NODE_MSI',
      'echo [INFO] Downloading official Node.js v20 LTS installer from nodejs.org...',
      'curl.exe -L "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -o "%TEMP%\\nodejs-lts-x64.msi"',
      'echo [INFO] Running Node.js installer (please accept the UAC prompt if shown)...',
      'msiexec.exe /i "%TEMP%\\nodejs-lts-x64.msi" /passive /norestart',
      'set "PATH=%ProgramFiles%\\nodejs;%ProgramFiles(x86)%\\nodejs;%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
      'where node >nul 2>nul',
      'if %errorlevel% equ 0 goto NODE_READY',
      'echo [ERROR] Could not find node.exe. Please install Node.js LTS from https://nodejs.org/ and run this file again.',
      'start https://nodejs.org/',
      'pause',
      'exit /b 1',
      '',
      ':NODE_READY',
      'for /f "delims=" %%v in (\'node -v\') do echo [OK] Node.js detected: %%v',
      'set "APP_DIR=%USERPROFILE%\\Desktop\\QuaiVault-Desktop"',
      'if not exist "%APP_DIR%" mkdir "%APP_DIR%"',
      'cd /d "%APP_DIR%"',
      '',
      'echo [1/4] Extracting package.json...',
      'if exist pkg.b64 del /f /q pkg.b64',
      ...pkgBase64Lines.map((line) => `echo ${line}>>pkg.b64`),
      'certutil -f -decode pkg.b64 package.json >nul',
      'del /f /q pkg.b64',
      '',
      'echo [2/4] Extracting desktop-server.mjs (Full Russian GUI)...',
      'if exist srv.b64 del /f /q srv.b64',
      ...serverBase64Lines.map((line) => `echo ${line}>>srv.b64`),
      'certutil -f -decode srv.b64 desktop-server.mjs >nul',
      'del /f /q srv.b64',
      '',
      'if exist "node_modules\\quais" goto SKIP_NPM',
      'echo [3/4] Installing Quai Network SDK (quais + express)... Please wait 20-40 seconds...',
      'call npm.cmd install --no-audit --no-fund',
      'goto LAUNCH_GUI',
      '',
      ':SKIP_NPM',
      'echo [3/4] Quai Network SDK already installed.',
      '',
      ':LAUNCH_GUI',
      'echo [4/4] Starting QuaiVault Desktop GUI on http://127.0.0.1:3000 ...',
      'start "" msedge --app=http://127.0.0.1:3000 2>nul || start "" http://127.0.0.1:3000',
      'node desktop-server.mjs',
      'pause',
    ];

    const crlfBatContent = batLines.join('\r\n') + '\r\n';
    const blob = new Blob([crlfBatContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'QuaiVault-Windows-GUI-Installer.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <section className="bg-emerald-950/30 border border-emerald-800/70 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            В установщик для Windows включены все 5 блоков (Отправка QUAI → QI, История операций с автообновлением и Поиск explorer.qu.ai)
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Установщик <code className="font-mono text-slate-100">QuaiVault-Windows-GUI-Installer.bat</code> теперь разворачивает на Windows полный интерфейс со всеми разделами: <strong>Проверка баланса QI/QUAI в USD и рублях ЦБ РФ</strong>, <strong>Расшифровка кошелька QUAI + Отправка QUAI / Конвертация QUAI → QI</strong>, <strong>История операций кошелька (Cyprus-1) с автообновлением и проверкой txHash</strong>, <strong>Конвертер QI → QUAI</strong> и <strong>Поиск транзакций, блоков и проверка адресов Quai Network</strong>.
        </p>
      </section>

      {/* 1. Primary Installer Download Card */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Для работы на домашнем ПК с Windows VPS-сервер НЕ требуется!</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 font-display">
              Скачать полный установщик GUI и CLI для Windows 10 / 11
            </h2>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Нажмите <strong>«Скачать установщик GUI (.bat)»</strong> и запустите его на Windows. Скрипт распакует новую версию <code className="font-mono text-slate-200">desktop-server.mjs</code> со всеми блоками и откроет окно приложения на <code className="font-mono text-slate-200">http://127.0.0.1:3000</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadWindowsGuiInstaller}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Monitor className="w-4 h-4" />
              <span>Скачать установщик GUI (.bat)</span>
            </button>
            <button
              type="button"
              onClick={onDownloadCliMjs}
              className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-slate-100 hover:bg-white rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Скачать CLI-скрипт (quai-wallet-win.mjs)</span>
            </button>
            <button
              type="button"
              onClick={onDownloadCliBat}
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Terminal className="w-4 h-4" />
              <span>Лаунчер консоли (.bat)</span>
            </button>
          </div>
        </div>

        {/* Explanation: Local Windows PC vs VPS Server */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-[#0B0F17] border border-emerald-800/60 rounded-xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" />
                  <span>Вариант 1: Локально на Windows</span>
                </span>
                <span className="font-mono">0 ₽ / мес</span>
              </div>
              <h3 className="text-base font-bold text-slate-100 font-display">
                Личное использование на домашнем ПК (Без VPS)
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Идеально, если кошелек нужен лично вам на Windows. Весь веб-интерфейс запускается локально на вашем компьютере и обращается напрямую к публичному узлу <code className="font-mono">rpc.quai.network/cyprus1</code>.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400 font-mono">
              <div>• Нужен ли VPS: <strong className="text-emerald-400">НЕТ</strong></div>
              <div>• Безопасность: Ключи не покидают ваш ПК</div>
              <div>• Запуск: Двойной клик по .bat файлу</div>
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-rose-400 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Server className="w-4 h-4" />
                  <span>Вариант 2: Облачный VPS-сервер</span>
                </span>
                <span className="font-mono">~$4–6 / мес</span>
              </div>
              <h3 className="text-base font-bold text-slate-100 font-display">
                Публичный онлайн-сервис для других пользователей 24/7
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                VPS нужен <strong>только если</strong> вы хотите разместить этот сайт в интернете на собственном домене (с SSL-сертификатом HTTPS), чтобы им могли пользоваться другие люди с телефонов и ПК.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400 font-mono">
              <div>• Нужен ли VPS: <strong className="text-slate-200">Да (базовый Linux VPS)</strong></div>
              <div>• ОЗУ / CPU: 1–2 vCPU, 2 ГБ RAM, 20 ГБ SSD</div>
              <div>• ОС: Ubuntu 22.04 / 24.04 LTS + Node.js 20</div>
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" />
                  <span>Вариант 3: Своя нода go-quai</span>
                </span>
                <span className="font-mono">Для майнеров / пулов</span>
              </div>
              <h3 className="text-base font-bold text-slate-100 font-display">
                Собственный полный RPC-узел Quai Network
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Требуется только в том случае, если вы хотите поднять собственную ноду <code className="font-mono">go-quai</code> для соло-майнинга или независимого RPC без использования публичного <code className="font-mono">rpc.quai.network</code>.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400 font-mono">
              <div>• ОЗУ / CPU: 8+ ядер CPU, 16–32 ГБ RAM</div>
              <div>• Диск: 500+ ГБ быстрый NVMe SSD</div>
              <div>• ОС: Ubuntu 22.04 LTS (или WSL2 на Windows)</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Detailed System Requirements Table */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-100 font-display flex items-center gap-2">
              <Cpu className="w-4 h-4 text-rose-400" />
              <span>Системные требования для запуска кошелька и конвертера QuaiVault</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Сравнение аппаратных и программных требований для Windows 10/11 и VPS-сервера
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                <th className="py-3 px-6 font-medium">Параметр</th>
                <th className="py-3 px-4 font-medium">Локально на Windows (GUI / CLI)</th>
                <th className="py-3 px-4 font-medium">Веб-сервис на VPS (Публичный сайт)</th>
                <th className="py-3 px-6 font-medium">Полная нода go-quai + Кошелек</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-6 font-medium text-slate-300">Операционная система</td>
                <td className="py-3.5 px-4 text-emerald-400 font-mono">Windows 10 / Windows 11 (64-bit)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">Ubuntu 22.04 / 24.04 LTS, Debian 12</td>
                <td className="py-3.5 px-6 text-slate-200 font-mono">Ubuntu 22.04 LTS (Linux x86_64)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-6 font-medium text-slate-300">Процессор (CPU)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">Любой 2-ядерный (Intel / AMD)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">1–2 vCPU (Shared или Dedicated)</td>
                <td className="py-3.5 px-6 text-amber-300 font-mono">8+ физических ядер (3.0+ ГГц)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-6 font-medium text-slate-300">Оперативная память (RAM)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">от 4 ГБ ОЗУ (приложение берет ~90 МБ)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">2 ГБ ОЗУ (рекомендуется)</td>
                <td className="py-3.5 px-6 text-amber-300 font-mono">16 ГБ минимум (32 ГБ рекомендуется)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-6 font-medium text-slate-300">Свободное место на диске</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">~250 МБ (включая Node.js и SDK quais)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">15–20 ГБ SSD</td>
                <td className="py-3.5 px-6 text-amber-300 font-mono">500+ ГБ NVMe SSD (высокий IOPS)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-6 font-medium text-slate-300">Необходимое ПО</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">Node.js v20+ LTS (ставится автоматически)</td>
                <td className="py-3.5 px-4 text-slate-200 font-mono">Node.js v20+, PM2 / Docker, Nginx</td>
                <td className="py-3.5 px-6 text-slate-200 font-mono">Go 1.22+, git, make, go-quai</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-6 font-medium text-slate-300">Сетевое подключение</td>
                <td className="py-3.5 px-4 text-slate-200">Обычный интернет (HTTPS 443 к rpc.quai.network)</td>
                <td className="py-3.5 px-4 text-slate-200">Белый IP, открытые порты 80 / 443</td>
                <td className="py-3.5 px-6 text-slate-200">Канал 100+ Мбит/с без лимита трафика</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Step-by-Step Guide for Windows + Optional VPS Deployment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <div className="text-xs text-emerald-400 font-medium">Инструкция для Windows 10 / 11</div>
            <h3 className="text-base font-bold text-slate-100 font-display">
              Как запустить этот полный интерфейс на Windows за 1 минуту
            </h3>
          </div>

          <ol className="space-y-3 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
            <li>
              <strong>Вариант А (Автоматический установщик в 1 клик):</strong> Нажмите кнопку{' '}
              <strong className="text-rose-400">«Скачать установщик GUI (.bat)»</strong> выше и запустите скачанный файл{' '}
              <code className="font-mono text-slate-100">QuaiVault-Windows-GUI-Installer.bat</code>. Если у вас уже было открыто старое окно терминала с сервером — закройте его перед запуском нового установщика, чтобы порт <code className="font-mono text-slate-100">3000</code> обновился.
            </li>
            <li>
              <strong>Вариант Б (Полная сборка всего проекта из архива AI Studio):</strong> Если вы скачали ZIP-архив всего проекта из меню AI Studio, распакуйте его в любую папку и выполните в PowerShell или CMD:
            </li>
          </ol>

          <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-200 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Команды для запуска полной версии на Windows (PowerShell / CMD):</span>
              <button
                type="button"
                onClick={() => copyCommand('npm install && npm run dev', 'win-full-cmd')}
                className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedCmd === 'win-full-cmd' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Копировать</span>
              </button>
            </div>
            <pre className="text-emerald-400 overflow-x-auto">
{`# 1. Установка зависимостей (один раз)
npm install

# 2. Запуск сервера и интерфейса на http://localhost:3000
npm run dev`}
            </pre>
          </div>
        </section>

        <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <div className="text-xs text-rose-400 font-medium">Инструкция для публичного релиза (Опционально)</div>
            <h3 className="text-base font-bold text-slate-100 font-display">
              Как развернуть сервис на VPS (Ubuntu 22.04/24.04) для общего доступа
            </h3>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Если вы решите выпустить сервис в интернет для других пользователей, арендуйте любой базовый VPS (2 ГБ ОЗУ, Ubuntu 22.04/24.04), загрузите файлы проекта и выполните следующие команды:
          </p>

          <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-200 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Команды установки на Ubuntu VPS (24/7 в фоне через PM2):</span>
              <button
                type="button"
                onClick={() =>
                  copyCommand(
                    'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs && npm install && npm run build && sudo npm install -g pm2 && NODE_ENV=production pm2 start "npx tsx server.ts" --name quaivault',
                    'vps-cmd'
                  )
                }
                className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedCmd === 'vps-cmd' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Копировать</span>
              </button>
            </div>
            <pre className="text-slate-200 overflow-x-auto leading-relaxed">
{`# 1. Установка Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Сборка фронтенда и запуск сервера в фоновом режиме 24/7
npm install
npm run build
sudo npm install -g pm2
NODE_ENV=production pm2 start "npx tsx server.ts" --name quaivault`}
            </pre>
          </div>
        </section>
      </div>

      {/* 4. GitHub Release Files & Publication Guide */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="text-xs text-rose-400 font-medium">
              Готовый комплект файлов в репозитории (public/downloads/ + README.md + GitHub Actions)
            </div>
            <h3 className="text-lg font-bold text-slate-100 font-display">
              Файлы для скачивания и инструкция по публикации на GitHub
            </h3>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              В проект уже добавлены готовый файл описания <code className="font-mono text-slate-100">README.md</code>, сценарий автоматической сборки релизов <code className="font-mono text-slate-100">.github/workflows/release.yml</code> и папка <code className="font-mono text-slate-100">public/downloads/</code> со всеми установочниками для Windows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href="/downloads/QuaiVault-Windows-GUI-Installer.bat"
              download="QuaiVault-Windows-GUI-Installer.bat"
              className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>QuaiVault-Windows-GUI-Installer.bat</span>
            </a>
            <a
              href="/downloads/desktop-server.mjs"
              download="desktop-server.mjs"
              className="px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>desktop-server.mjs</span>
            </a>
            <a
              href="/downloads/README.md"
              download="README.md"
              className="px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>README.md (Инструкция GitHub)</span>
            </a>
          </div>
        </div>

        {/* Files Table inside Repository */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                <th className="py-3 px-4 font-medium">Файл в репозитории</th>
                <th className="py-3 px-4 font-medium">Назначение для пользователей на GitHub</th>
                <th className="py-3 px-4 font-medium text-right">Прямая загрузка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              <tr>
                <td className="py-3 px-4 font-mono text-slate-200">/README.md</td>
                <td className="py-3 px-4 text-slate-300">
                  Главная документация репозитория на русском языке (возможности, безопасность, системные требования, ссылки на `.bat` и `.mjs`)
                </td>
                <td className="py-3 px-4 text-right">
                  <a href="/downloads/README.md" download="README.md" className="text-rose-400 hover:underline font-medium">
                    Скачать README.md
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-emerald-400">
                  /public/downloads/QuaiVault-Windows-GUI-Installer.bat
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Установщик полного графического интерфейса для Windows 10/11 (ASCII + CRLF + автоустановка Node.js LTS + распаковка через certutil)
                </td>
                <td className="py-3 px-4 text-right">
                  <a
                    href="/downloads/QuaiVault-Windows-GUI-Installer.bat"
                    download="QuaiVault-Windows-GUI-Installer.bat"
                    className="text-rose-400 hover:underline font-medium"
                  >
                    Скачать .bat (GUI)
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-slate-200">/public/downloads/desktop-server.mjs</td>
                <td className="py-3 px-4 text-slate-300">
                  Однофайловый автономный локальный сервер со всеми 5 модулями (QI/QUAI баланс, QUAI → QI, История операций, Конвертер, Explorer)
                </td>
                <td className="py-3 px-4 text-right">
                  <a
                    href="/downloads/desktop-server.mjs"
                    download="desktop-server.mjs"
                    className="text-rose-400 hover:underline font-medium"
                  >
                    Скачать .mjs (GUI)
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-slate-200">/public/downloads/run-quai-wallet.bat</td>
                <td className="py-3 px-4 text-slate-300">
                  Лаунчер консольной версии кошелька для Windows CMD / PowerShell
                </td>
                <td className="py-3 px-4 text-right">
                  <a
                    href="/downloads/run-quai-wallet.bat"
                    download="run-quai-wallet.bat"
                    className="text-rose-400 hover:underline font-medium"
                  >
                    Скачать .bat (CLI)
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-slate-200">/public/downloads/quai-wallet-win.mjs</td>
                <td className="py-3 px-4 text-slate-300">
                  Консольный скрипт проверки баланса QI и QUAI в USD ($) и рублях ЦБ РФ (₽)
                </td>
                <td className="py-3 px-4 text-right">
                  <a
                    href="/downloads/quai-wallet-win.mjs"
                    download="quai-wallet-win.mjs"
                    className="text-rose-400 hover:underline font-medium"
                  >
                    Скачать .mjs (CLI)
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-amber-300">/.github/workflows/release.yml</td>
                <td className="py-3 px-4 text-slate-300">
                  GitHub Actions пайплайн: автоматически проверяет сборку и прикрепляет `.bat` и `.mjs` файлы в раздел GitHub Releases при создании тега `v1.0.0`
                </td>
                <td className="py-3 px-4 text-right text-emerald-400 font-mono">Включен в проект</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Two ways to publish to GitHub */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="text-xs text-emerald-400 font-semibold">
              Способ 1: Публикация в 1 клик через верхнюю панель AI Studio
            </div>
            <ol className="space-y-2 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
              <li>
                На верхней панели Google AI Studio нажмите иконку <strong>GitHub (Save to GitHub / Export to GitHub)</strong>.
              </li>
              <li>
                Авторизуйте ваш аккаунт GitHub и укажите имя нового репозитория (например, <code className="font-mono text-slate-100">quaivault-wallet</code>).
              </li>
              <li>
                Весь обезличенный код проекта вместе с <code className="font-mono text-slate-100">README.md</code>, <code className="font-mono text-slate-100">.github/workflows/release.yml</code> и папкой <code className="font-mono text-slate-100">public/downloads/</code> будет автоматически опубликован в вашем репозитории!
              </li>
            </ol>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-rose-400 font-semibold">
                Способ 2: Загрузка через Git в терминале и выпуск релиза v1.0.0
              </span>
              <button
                type="button"
                onClick={() =>
                  copyCommand(
                    'git init && git add . && git commit -m "Initial public release of QuaiVault QI/QUAI Wallet" && git branch -M main && git remote add origin https://github.com/YOUR_USERNAME/quaivault-wallet.git && git push -u origin main && git tag v1.0.0 && git push origin v1.0.0',
                    'gh-push-cmd'
                  )
                }
                className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedCmd === 'gh-push-cmd' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Копировать команды</span>
              </button>
            </div>
            <pre className="text-slate-200 font-mono text-[11px] overflow-x-auto leading-relaxed">
{`git init
git add .
git commit -m "Initial public release of QuaiVault QI/QUAI Wallet"
git branch -M main
git remote add origin https://github.com/<ВАШ_ЛОГИН>/quaivault-wallet.git
git push -u origin main

# Автоматическое создание GitHub Release с прикреплением .bat и .mjs файлов:
git tag v1.0.0
git push origin v1.0.0`}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};

