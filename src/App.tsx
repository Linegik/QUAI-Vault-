import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  ArrowRightLeft,
  Download,
  Search,
  KeyRound,
  Lock,
  Unlock,
  Terminal,
  PlusCircle,
  ExternalLink,
  Trash2,
  FileKey,
  Send,
  Compass,
} from 'lucide-react';
import type {
  MarketTelemetry,
  WalletInspectionResult,
  ConversionPreviewResult,
  GeneratedQuaiReceiver,
  DecryptedQuaiWallet,
  QuaiActionResult,
} from './types';
import { TransactionHistoryPanel } from './components/TransactionHistoryPanel';
import { WindowsSetupSection } from './components/WindowsSetupSection';

type ActiveSection = 'overview' | 'quai-wallet' | 'converter' | 'explorer' | 'windows';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [walletInput, setWalletInput] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [marketLoading, setMarketLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketTelemetry | null>(null);
  const [walletData, setWalletData] = useState<WalletInspectionResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // QI -> QUAI Converter state
  const [destQuaiAddress, setDestQuaiAddress] = useState<string>('');
  const [convertAmountQi, setConvertAmountQi] = useState<string>('0.05');
  const [convertLoading, setConvertLoading] = useState<boolean>(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertResult, setConvertResult] = useState<ConversionPreviewResult | null>(null);
  const [generatedReceiver, setGeneratedReceiver] = useState<GeneratedQuaiReceiver | null>(null);
  const [generatingReceiver, setGeneratingReceiver] = useState<boolean>(false);

  // QUAI Wallet Decryption & QUAI -> QI / Transfer state
  const [decryptMode, setDecryptMode] = useState<'PRIVATE_KEY' | 'MNEMONIC' | 'KEYSTORE'>('PRIVATE_KEY');
  const [quaiPkInput, setQuaiPkInput] = useState<string>('');
  const [quaiMnemonicInput, setQuaiMnemonicInput] = useState<string>('');
  const [quaiKeystoreInput, setQuaiKeystoreInput] = useState<string>('');
  const [quaiKeystorePassword, setQuaiKeystorePassword] = useState<string>('');
  const [decryptLoading, setDecryptLoading] = useState<boolean>(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptedQuaiWallet, setDecryptedQuaiWallet] = useState<DecryptedQuaiWallet | null>(null);

  // Export Keystore state
  const [exportPassword, setExportPassword] = useState<string>('');
  const [exportingKeystore, setExportingKeystore] = useState<boolean>(false);

  // QUAI Send / Convert to QI state
  const [quaiToAddress, setQuaiToAddress] = useState<string>('');
  const [quaiSendAmount, setQuaiSendAmount] = useState<string>('10');
  const [quaiSlippage, setQuaiSlippage] = useState<string>('10');
  const [quaiActionLoading, setQuaiActionLoading] = useState<boolean>(false);
  const [quaiActionError, setQuaiActionError] = useState<string | null>(null);
  const [quaiActionResult, setQuaiActionResult] = useState<QuaiActionResult | null>(null);
  const [sessionTxHashes, setSessionTxHashes] = useState<string[]>([]);

  const handleAddTrackedTxHash = useCallback((txHash: string) => {
    setSessionTxHashes((prev) => (prev.includes(txHash) ? prev : [txHash, ...prev]));
  }, []);

  // Explorer Lookup & UTXO Inspector state
  const [utxoFilter, setUtxoFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [utxoSearch, setUtxoSearch] = useState<string>('');
  const [explorerQuery, setExplorerQuery] = useState<string>('');
  const [explorerLoading, setExplorerLoading] = useState<boolean>(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerResult, setExplorerResult] = useState<any | null>(null);

  // Multi-currency calculator state
  const [calcQiInput, setCalcQiInput] = useState<string>('1');

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const fetchMarketTelemetry = useCallback(async () => {
    setMarketLoading(true);
    try {
      const res = await fetch('/api/market');
      if (res.ok) {
        const data = await res.json();
        setMarket(data);
      }
    } catch {
      // Ignore transient telemetry error
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketTelemetry();
  }, [fetchMarketTelemetry]);

  const inspectWallet = useCallback(async (targetInput: string) => {
    if (!targetInput.trim()) {
      setError('Введите приватный ключ (0x...) или адрес кошелька QI / QUAI для проверки.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/wallet/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: targetInput }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось загрузить состояние кошелька из Quai RPC.');
      }
      setWalletData(data);
      if (data.market) {
        setMarket(data.market);
      }
      if (data.balances?.totalQi && Number(data.balances.totalQi) > 0) {
        setCalcQiInput(data.balances.totalQi);
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка соединения с узлом Quai Network.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClearSession = () => {
    setWalletInput('');
    setWalletData(null);
    setError(null);
    setDestQuaiAddress('');
    setConvertResult(null);
    setConvertError(null);
    setGeneratedReceiver(null);
    setQuaiPkInput('');
    setQuaiMnemonicInput('');
    setQuaiKeystoreInput('');
    setQuaiKeystorePassword('');
    setDecryptedQuaiWallet(null);
    setQuaiActionResult(null);
    setQuaiActionError(null);
    setSessionTxHashes([]);
  };

  const handleDecryptQuaiWallet = async () => {
    setDecryptLoading(true);
    setDecryptError(null);
    try {
      const response = await fetch('/api/wallet/decrypt-quai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: decryptMode,
          privateKey: quaiPkInput,
          mnemonicPhrase: quaiMnemonicInput,
          keystoreJson: quaiKeystoreInput,
          password: quaiKeystorePassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось расшифровать кошелек.');
      }
      setDecryptedQuaiWallet(data);
      if (data.qiCompanionAddress && !quaiToAddress) {
        setQuaiToAddress(data.qiCompanionAddress);
      }
    } catch (err: any) {
      setDecryptError(err?.message || 'Ошибка расшифровки кошелька.');
    } finally {
      setDecryptLoading(false);
    }
  };

  const handleExportEncryptedKeystore = async () => {
    if (!decryptedQuaiWallet?.privateKey || !exportPassword) return;
    setExportingKeystore(true);
    try {
      const response = await fetch('/api/wallet/encrypt-keystore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: decryptedQuaiWallet.privateKey,
          password: exportPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка создания Keystore JSON.');
      }
      const blob = new Blob([data.keystoreJson], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quai-keystore-${data.address.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDecryptError(err?.message || 'Не удалось экспортировать Keystore JSON.');
    } finally {
      setExportingKeystore(false);
    }
  };

  const handleRunQuaiAction = async (broadcast: boolean) => {
    if (!decryptedQuaiWallet?.privateKey) {
      setQuaiActionError('Сначала расшифруйте или откройте ваш QUAI-кошелек слева.');
      return;
    }
    setQuaiActionLoading(true);
    setQuaiActionError(null);
    setQuaiActionResult(null);
    try {
      const response = await fetch('/api/wallet/quai-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: decryptedQuaiWallet.privateKey,
          toAddress: quaiToAddress,
          amountQuai: quaiSendAmount,
          slippagePercent: Number(quaiSlippage) || 10,
          broadcast,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка формирования транзакции QUAI.');
      }
      setQuaiActionResult(data);
      if (data.txHash) {
        handleAddTrackedTxHash(data.txHash);
      }
    } catch (err: any) {
      setQuaiActionError(err?.message || 'Ошибка при отправке/конвертации QUAI.');
    } finally {
      setQuaiActionLoading(false);
    }
  };

  const handleGenerateSafeQuaiReceiver = async () => {
    setGeneratingReceiver(true);
    setConvertError(null);
    try {
      const response = await fetch('/api/wallet/generate-quai-receiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка генерации адреса QUAI.');
      }
      setGeneratedReceiver(data);
      setDestQuaiAddress(data.address);
    } catch (err: any) {
      setConvertError(err?.message || 'Не удалось сгенерировать адрес QUAI.');
    } finally {
      setGeneratingReceiver(false);
    }
  };

  const handleRunConversion = async (broadcast: boolean) => {
    setConvertLoading(true);
    setConvertError(null);
    setConvertResult(null);
    try {
      const response = await fetch('/api/wallet/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: walletInput,
          destinationQuaiAddress: destQuaiAddress,
          amountQi: convertAmountQi,
          broadcast,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка выполнения конвертации.');
      }
      setConvertResult(data);
      if (data.txHash) {
        handleAddTrackedTxHash(data.txHash);
      }
      if (broadcast && walletInput.trim()) {
        inspectWallet(walletInput);
      }
    } catch (err: any) {
      setConvertError(err?.message || 'Ошибка при обращении к конвертеру протокола Quai.');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleExplorerLookup = async () => {
    if (!explorerQuery.trim()) return;
    setExplorerLoading(true);
    setExplorerError(null);
    setExplorerResult(null);
    try {
      const response = await fetch('/api/explorer/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: explorerQuery }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка запроса к эксплореру.');
      }
      setExplorerResult(data);
    } catch (err: any) {
      setExplorerError(err?.message || 'Не удалось выполнить поиск.');
    } finally {
      setExplorerLoading(false);
    }
  };

  const downloadWindowsBundle = (type: 'mjs' | 'bat') => {
    if (type === 'mjs') {
      const scriptContent = `// QuaiVault Windows Standalone Inspector & QI <-> QUAI Converter
// Обезличенная публичная версия: ключи не сохраняются на диск.
// Запуск на Windows:
// 1. Установите Node.js (https://nodejs.org)
// 2. Запустите файл run-quai-wallet.bat или выполните: node quai-wallet-win.mjs <ВАШ_КЛЮЧ_ИЛИ_АДРЕС>

import * as quais from 'quais';
import readline from 'readline';

const RPC_URL = 'https://rpc.quai.network/cyprus1';

async function promptInput(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  console.log('==============================================================');
  console.log(' QuaiVault Windows CLI — Кошелек QI / QUAI (Курс USD и ЦБ РФ)');
  console.log('==============================================================\\n');

  let input = process.argv[2] || process.env.QUAI_PRIVATE_KEY || '';
  if (!input) {
    input = await promptInput('Введите приватный ключ (0x...) или адрес кошелька (0x...): ');
  }
  const normalizedHex = input.startsWith('0x') ? input : '0x' + input;

  let targetAddress = '';
  if (quais.isHexString(normalizedHex, 32)) {
    const rawW = new quais.Wallet(normalizedHex);
    if (quais.isQiAddress(rawW.address)) {
      const entropy = quais.getBytes(quais.keccak256(normalizedHex)).slice(0, 16);
      const qiWallet = quais.QiHDWallet.fromMnemonic(quais.Mnemonic.fromEntropy(entropy));
      const addrInfo = await qiWallet.importPrivateKey(normalizedHex);
      targetAddress = addrInfo.address;
    } else {
      targetAddress = rawW.address;
    }
  } else {
    targetAddress = quais.getAddress(normalizedHex);
  }

  const [rpcRes, gateRes, cbrRes] = await Promise.all([
    fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'quai_blockNumber', params: [] },
        { jsonrpc: '2.0', id: 2, method: 'quai_getOutpointsByAddress', params: [targetAddress] },
        { jsonrpc: '2.0', id: 3, method: 'quai_qiToQuai', params: ['0x3e8', 'latest'] },
        { jsonrpc: '2.0', id: 4, method: 'quai_getBalance', params: [targetAddress, 'latest'] }
      ])
    }).then((r) => r.json()),
    fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=QUAI_USDT').then((r) => r.json()).catch(() => []),
    fetch('https://www.cbr-xml-daily.ru/daily_json.js').then((r) => r.json()).catch(() => ({}))
  ]);

  const currentBlock = parseInt(rpcRes[0].result, 16);
  const outpoints = rpcRes[1].result || [];
  const oneQiInQuai = Number(quais.formatQuai(rpcRes[2].result));
  const quaiUsd = gateRes?.[0]?.last ? Number(gateRes[0].last) : 0.00676;
  const usdRub = cbrRes?.Valute?.USD?.Value ? Number(cbrRes.Valute.USD.Value) : 83.15;

  console.log('\\nАдрес кошелька:          ', targetAddress);
  console.log('Explorer Quai:            https://explorer.qu.ai/address/' + targetAddress);
  console.log('Текущий блок Cyprus-1:   ', currentBlock);
  console.log('Курс QUAI:                $' + quaiUsd.toFixed(5) + ' USD | ' + (quaiUsd * usdRub).toFixed(2) + ' ₽ (ЦБ РФ: ' + usdRub.toFixed(2) + ' ₽/$)');
  console.log('Протокольный курс 1 QI:  ', oneQiInQuai.toFixed(4), 'QUAI ($' + (oneQiInQuai * quaiUsd).toFixed(2) + ' USD | ' + (oneQiInQuai * quaiUsd * usdRub).toFixed(2) + ' ₽)\\n');

  if (quais.isQiAddress(targetAddress)) {
    let totalQit = 0n, unlockedQit = 0n, lockedQit = 0n;
    for (const op of outpoints) {
      const val = quais.denominations[parseInt(op.denomination, 16)] || 0n;
      const lockBlock = parseInt(op.lock || '0x0', 16);
      totalQit += val;
      if (lockBlock === 0 || lockBlock <= currentBlock) unlockedQit += val;
      else lockedQit += val;
    }
    const totalQi = Number(quais.formatQi(totalQit));
    const unlockedQi = Number(quais.formatQi(unlockedQit));
    const lockedQi = Number(quais.formatQi(lockedQit));
    const totalQuai = totalQi * oneQiInQuai;
    console.log('ВСЕГО НА КОШЕЛЬКЕ (UTXO):', totalQi.toFixed(3), 'QI | ~' + totalQuai.toFixed(2) + ' QUAI | $' + (totalQuai * quaiUsd).toFixed(2) + ' | ' + (totalQuai * quaiUsd * usdRub).toFixed(2) + ' ₽');
    console.log('ДОСТУПНО СЕЙЧАС:         ', unlockedQi.toFixed(3), 'QI | ~' + (unlockedQi * oneQiInQuai).toFixed(2) + ' QUAI');
    console.log('В РАЗБЛОКИРОВКЕ (2 нед.):', lockedQi.toFixed(3), 'QI | ~' + (lockedQi * oneQiInQuai).toFixed(2) + ' QUAI');
  } else {
    const quaiBal = Number(quais.formatQuai(BigInt(rpcRes[3].result || '0x0')));
    console.log('БАЛАНС QUAI (EVM):       ', quaiBal.toFixed(4), 'QUAI | $' + (quaiBal * quaiUsd).toFixed(2) + ' | ' + (quaiBal * quaiUsd * usdRub).toFixed(2) + ' ₽');
  }
}

main().catch(console.error);
`;
      const blob = new Blob([scriptContent], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quai-wallet-win.mjs';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const batLines = [
        '@echo off',
        'setlocal EnableExtensions',
        'chcp 65001 >nul',
        'echo ==============================================================',
        'echo  QuaiVault Windows CLI Launcher (Cyprus-1 QI / QUAI)',
        'echo ==============================================================',
        'set "PATH=%ProgramFiles%\\nodejs;%ProgramFiles(x86)%\\nodejs;%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
        'where node >nul 2>nul',
        'if %errorlevel% equ 0 goto NODE_OK',
        'echo [INFO] Node.js not found. Downloading official Node.js v20 LTS installer...',
        'curl.exe -L "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -o "%TEMP%\\nodejs-lts-x64.msi"',
        'msiexec.exe /i "%TEMP%\\nodejs-lts-x64.msi" /passive /norestart',
        'set "PATH=%ProgramFiles%\\nodejs;%ProgramFiles(x86)%\\nodejs;%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
        'where node >nul 2>nul',
        'if %errorlevel% equ 0 goto NODE_OK',
        'echo [ERROR] Please install Node.js LTS from https://nodejs.org/ and run this file again.',
        'pause',
        'exit /b 1',
        ':NODE_OK',
        'if exist "node_modules\\quais" goto RUN_SCRIPT',
        'echo Installing official Quai Network SDK (quais)...',
        'call npm.cmd init -y >nul 2>nul',
        'call npm.cmd install quais --no-audit --no-fund',
        ':RUN_SCRIPT',
        'node quai-wallet-win.mjs',
        'pause',
      ];
      const crlfBat = batLines.join('\r\n') + '\r\n';
      const blob = new Blob([crlfBat], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'run-quai-wallet.bat';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const combinedOutpoints = useMemo(() => {
    if (!walletData) return [];
    const unlocked = walletData.unlockedOutpointsList.map((u) => ({
      ...u,
      blocksRemaining: 0,
      estimatedHoursRemaining: 0,
    }));
    const locked = walletData.lockedSampleList;
    let list =
      utxoFilter === 'unlocked'
        ? unlocked
        : utxoFilter === 'locked'
          ? locked
          : [...unlocked, ...locked];

    if (utxoSearch.trim()) {
      const q = utxoSearch.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.txHash.toLowerCase().includes(q) ||
          String(item.lockBlock).includes(q) ||
          item.qi.includes(q)
      );
    }
    return list;
  }, [walletData, utxoFilter, utxoSearch]);

  const activeMarket = walletData?.market || market;
  const rateQiToQuai = activeMarket?.oneQiInQuai ?? 153.5065;
  const quaiUsd = activeMarket?.quaiUsd ?? 0.00676;
  const usdRubCbr = activeMarket?.usdRubCbr ?? 83.15;
  const quaiRub = quaiUsd * usdRubCbr;
  const qiUsd = rateQiToQuai * quaiUsd;
  const qiRub = qiUsd * usdRubCbr;

  const calcQiNum = Number(calcQiInput || '0');
  const calcQuaiOutput = (calcQiNum * rateQiToQuai).toFixed(4);
  const calcUsdOutput = (calcQiNum * qiUsd).toFixed(2);
  const calcRubOutput = (calcQiNum * qiRub).toFixed(2);

  const expectedFromConverterInput = (Number(convertAmountQi || '0') * rateQiToQuai).toFixed(4);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 1 row, 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-slate-800/90 bg-[#0B0F17]/95 sticky top-0 z-30 backdrop-blur-sm">
        {/* Zone 1: Brand Title */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          QuaiVault
        </a>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveSection('overview')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'overview'
                ? 'text-slate-100 border-rose-500'
                : 'border-transparent'
            }`}
          >
            Кошелек QI и UTXO
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('quai-wallet')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'quai-wallet'
                ? 'text-slate-100 border-rose-500'
                : 'border-transparent'
            }`}
          >
            Кошелек QUAI → QI
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('converter')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'converter'
                ? 'text-slate-100 border-rose-500'
                : 'border-transparent'
            }`}
          >
            Конвертер QI → QUAI
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('explorer')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'explorer'
                ? 'text-slate-100 border-rose-500'
                : 'border-transparent'
            }`}
          >
            Эксплорер и курсы
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('windows')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'windows'
                ? 'text-slate-100 border-rose-500'
                : 'border-transparent'
            }`}
          >
            Версия для Windows
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClearSession}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить сессию</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto px-4 py-2.5 border-b border-slate-800 bg-[#111827]">
        {[
          { id: 'overview', label: 'Кошелек QI' },
          { id: 'quai-wallet', label: 'Кошелек QUAI → QI' },
          { id: 'converter', label: 'Конвертер QI → QUAI' },
          { id: 'explorer', label: 'Эксплорер' },
          { id: 'windows', label: 'Windows CLI' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id as ActiveSection)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
              activeSection === tab.id
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 lg:px-10 py-8 space-y-8">
        {/* Live Market & Currency Strip (USD + CBR RUB + Explorer Quai) */}
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-4 lg:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <span className="text-slate-400">Курс QUAI: </span>
              <span className="font-mono tabular-nums font-semibold text-slate-100">
                ${quaiUsd.toFixed(5)}
              </span>
              <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-400">
                {quaiRub.toFixed(3)} ₽
              </span>
              {activeMarket && (
                <span
                  className={`ml-1.5 font-mono tabular-nums ${
                    activeMarket.quaiChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  ({activeMarket.quaiChange24h >= 0 ? '+' : ''}
                  {activeMarket.quaiChange24h.toFixed(2)}%)
                </span>
              )}
            </div>

            <div>
              <span className="text-slate-400">1 QI (протокол): </span>
              <span className="font-mono tabular-nums font-semibold text-slate-100">
                {rateQiToQuai.toFixed(2)} QUAI
              </span>
              <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-200">${qiUsd.toFixed(2)}</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-400">
                {qiRub.toFixed(2)} ₽
              </span>
            </div>

            <div>
              <span className="text-slate-400">Курс ЦБ РФ (USD/RUB): </span>
              <span className="font-mono tabular-nums font-semibold text-slate-200">
                {usdRubCbr.toFixed(2)} ₽
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {activeMarket && (
              <span className="font-mono tabular-nums text-slate-400">
                Блок Cyprus-1: #{activeMarket.currentBlock.toLocaleString('ru-RU')}
              </span>
            )}
            <button
              type="button"
              onClick={fetchMarketTelemetry}
              disabled={marketLoading}
              className="text-slate-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${marketLoading ? 'animate-spin' : ''}`} />
              <span>Обновить котировки</span>
            </button>
            <a
              href="https://explorer.qu.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 font-medium whitespace-nowrap"
            >
              <span>explorer.qu.ai</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        {/* SECTION 1: QI WALLET & UTXO INSPECTOR */}
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Wallet Connection Bar (100% Anonymized, Zero Persistence) */}
            <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>Некастодиальный режим (данные не сохраняются)</span>
                    <span aria-hidden="true">·</span>
                    <span>Шард Cyprus-1 (0x00)</span>
                    <span aria-hidden="true">·</span>
                    <span>Поддержка обхода коллизии BIP44 derivation path</span>
                  </div>
                  <h1 className="text-xl lg:text-2xl font-bold text-slate-100 font-display tracking-tight">
                    Проверка баланса кошелька QI / QUAI в долларах ($) и рублях ЦБ РФ (₽)
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSection('quai-wallet')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Расшифровать кошелек QUAI → QI
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('converter')}
                    className="px-3.5 py-2 text-xs font-medium text-rose-200 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/70 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Конвертер QI → QUAI</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-9 space-y-1.5">
                  <label
                    htmlFor="wallet-key-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Введите адрес кошелька (0x...) или приватный ключ QI / QUAI (не сохраняется в браузере и на сервере)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="wallet-key-input"
                      type={showKeyInput ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={walletInput}
                      onChange={(e) => setWalletInput(e.target.value)}
                      placeholder="Вставьте адрес 0x00... или приватный ключ 0x... для расчета баланса"
                      className="w-full bg-[#0B0F17] border border-slate-700/90 focus:border-rose-500 focus:outline-none rounded-lg pl-3.5 pr-20 py-2.5 text-sm font-mono text-slate-100 tabular-nums"
                    />
                    <div className="absolute right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowKeyInput((prev) => !prev)}
                        title={showKeyInput ? 'Скрыть ввод' : 'Показать ввод'}
                        className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md transition-colors cursor-pointer"
                      >
                        {showKeyInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {walletInput && (
                        <button
                          type="button"
                          onClick={() => setWalletInput('')}
                          title="Очистить поле"
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <button
                    type="button"
                    onClick={() => inspectWallet(walletInput)}
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Сканирование блокчейна...' : 'Проверить баланс и UTXO'}
                  </button>
                </div>
              </div>

              {walletData && (
                <div className="pt-4 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400">Адрес кошелька:</span>
                    <code className="font-mono text-slate-100 bg-[#0B0F17] px-2.5 py-1 rounded border border-slate-800">
                      {walletData.address}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText(walletData.address, 'derived-addr')}
                      className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'derived-addr' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Копировать</span>
                    </button>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <a
                      href={`https://explorer.qu.ai/address/${walletData.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1"
                    >
                      <span>Открыть на explorer.qu.ai</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {walletData.bip44IsolatedInfo && (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <KeyRound className="w-3.5 h-3.5 shrink-0" />
                      <span>{walletData.bip44IsolatedInfo.status}</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {error && (
              <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 text-sm text-rose-200">
                {error}
              </div>
            )}

            {/* Empty State when no wallet is loaded yet */}
            {!walletData && !loading && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">
                      Публичный некастодиальный терминал Quai Network (Cyprus-1)
                    </div>
                    <h2 className="text-lg font-bold text-slate-100 font-display">
                      Введите адрес или приватный ключ выше для отображения баланса в QI, QUAI, USD ($) и RUB (₽ ЦБ РФ)
                    </h2>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Сервис работает напрямую с узлом <code className="font-mono text-slate-200">https://rpc.quai.network/cyprus1</code> и не сохраняет введенные ключи или адреса. Для кошельков QI автоматически проверяются все UTXO-выходы (<code className="font-mono text-slate-200">quai_getOutpointsByAddress</code>), включая монеты, находящиеся в 2-недельном периоде разблокировки майнинга (241 920 блоков), и обходится ошибка <code className="font-mono text-slate-200">already exists in BIP44 derivation path</code>.
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-800/80 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveSection('quai-wallet')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer"
                    >
                      Открыть / Расшифровать кошелек QUAI
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection('explorer')}
                      className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Проверить транзакцию или блок (explorer.qu.ai)
                    </button>
                  </div>
                </div>

                {/* Multi-Currency Calculator always available on Overview */}
                <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">Мультивалютный калькулятор</div>
                    <h3 className="text-base font-bold text-slate-100 font-display">
                      QI → QUAI · USD ($) · RUB (₽ ЦБ)
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="empty-calc-qi" className="block text-xs text-slate-400">
                        Количество QI
                      </label>
                      <input
                        id="empty-calc-qi"
                        type="number"
                        step="0.001"
                        value={calcQiInput}
                        onChange={(e) => setCalcQiInput(e.target.value)}
                        className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2 text-base font-mono tabular-nums text-slate-100"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800 space-y-1.5 font-mono tabular-nums text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans text-xs">В токенах QUAI:</span>
                        <span className="text-rose-400 font-bold">≈ {Number(calcQuaiOutput).toLocaleString('ru-RU')} QUAI</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans text-xs">В долларах США:</span>
                        <span className="text-slate-100 font-semibold">${calcUsdOutput} USD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans text-xs">В рублях (ЦБ РФ):</span>
                        <span className="text-emerald-400 font-bold">{Number(calcRubOutput).toLocaleString('ru-RU')} ₽</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Populated Wallet KPI Strip & Tables (with USD and CBR RUB) */}
            {walletData && (
              <>
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* KPI 1: Total Balance */}
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Полный баланс кошелька</span>
                      <span className="font-mono tabular-nums">
                        {walletData.ledgerType === 'QI_UTXO'
                          ? `${walletData.utxoSummary.totalOutpoints.toLocaleString('ru-RU')} UTXO`
                          : 'EVM Account'}
                      </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
                      {walletData.ledgerType === 'QI_UTXO'
                        ? `${walletData.balances.totalQi} QI`
                        : `${walletData.balances.totalQuaiEquivalent} QUAI`}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-rose-400 font-semibold">
                      ≈ {Number(walletData.balances.totalQuaiEquivalent).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      QUAI
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-200">${walletData.balances.totalUsd} USD</span>
                      <span className="text-emerald-400 font-semibold">
                        {Number(walletData.balances.totalRub).toLocaleString('ru-RU')} ₽ (ЦБ)
                      </span>
                    </div>
                  </div>

                  {/* KPI 2: Unlocked / Spendable Right Now */}
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-emerald-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Доступно сейчас</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {walletData.utxoSummary.unlockedOutpointsCount} UTXO
                      </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                      {walletData.balances.unlockedQi} QI
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-300">
                      ≈ {Number(walletData.balances.unlockedQuaiEquivalent).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}{' '}
                      QUAI
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-200">${walletData.balances.unlockedUsd} USD</span>
                      <span className="text-emerald-400 font-semibold">
                        {Number(walletData.balances.unlockedRub).toLocaleString('ru-RU')} ₽ (ЦБ)
                      </span>
                    </div>
                  </div>

                  {/* KPI 3: Locked / Maturing UTXOs */}
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-amber-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        <span>В разблокировке (Майнинг)</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {walletData.utxoSummary.lockedOutpointsCount.toLocaleString('ru-RU')} UTXO
                      </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                      {walletData.balances.lockedQi} QI
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-300">
                      ≈ {Number(walletData.balances.lockedQuaiEquivalent).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      QUAI
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-200">${walletData.balances.lockedUsd} USD</span>
                      <span className="text-amber-300 font-semibold">
                        {Number(walletData.balances.lockedRub).toLocaleString('ru-RU')} ₽ (ЦБ)
                      </span>
                    </div>
                  </div>

                  {/* KPI 4: Fiat & Protocol Valuation Summary */}
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Оценка по курсу ЦБ РФ</span>
                      <span className="font-mono tabular-nums">{usdRubCbr.toFixed(2)} ₽/$</span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                      {Number(walletData.balances.totalRub).toLocaleString('ru-RU')} ₽
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-300">
                      В долларах: ${walletData.balances.totalUsd} USD
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Старт разморозки:</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {walletData.utxoSummary.lockedOutpointsCount > 0
                          ? `через ~${walletData.utxoSummary.nextUnlockEstimatedHours} ч`
                          : 'Все разблокировано'}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Denominations & Unlock Schedule */}
                {walletData.denominationsBreakdown.length > 0 && (
                  <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-100 font-display">
                          Распределение UTXO по номиналам купюр QI (в QUAI, USD и RUB ЦБ РФ)
                        </h3>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-400">
                        Всего: {walletData.utxoSummary.totalOutpoints.toLocaleString('ru-RU')} UTXO
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                            <th className="py-3 px-5 font-medium">Номинал</th>
                            <th className="py-3 px-4 font-medium text-right">Разблокировано</th>
                            <th className="py-3 px-4 font-medium text-right">В заморозке</th>
                            <th className="py-3 px-4 font-medium text-right">Сумма QI</th>
                            <th className="py-3 px-4 font-medium text-right">В QUAI</th>
                            <th className="py-3 px-4 font-medium text-right">В USD ($)</th>
                            <th className="py-3 px-5 font-medium text-right">В RUB (₽ ЦБ)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 text-sm font-mono tabular-nums">
                          {walletData.denominationsBreakdown.map((row) => (
                            <tr key={row.denomIndex} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-5 font-sans text-slate-200 font-medium">{row.label}</td>
                              <td className="py-3 px-4 text-right text-emerald-400">
                                {row.unlockedCount.toLocaleString('ru-RU')}
                              </td>
                              <td className="py-3 px-4 text-right text-amber-400">
                                {row.lockedCount.toLocaleString('ru-RU')}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-slate-100">
                                {row.totalQi} QI
                              </td>
                              <td className="py-3 px-4 text-right text-rose-300">
                                ≈ {Number(row.totalQuaiEquivalent).toLocaleString('ru-RU')} QUAI
                              </td>
                              <td className="py-3 px-4 text-right text-slate-200">
                                ${row.totalUsdEquivalent}
                              </td>
                              <td className="py-3 px-5 text-right text-emerald-400 font-semibold">
                                {Number(row.totalRubEquivalent).toLocaleString('ru-RU')} ₽
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Unlock Schedule with USD & RUB */}
                {walletData.unlockSchedule.length > 0 && (
                  <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-bold text-slate-100 font-display">
                          Посуточный график разблокировки майнинга (в QI, QUAI, USD и RUB ЦБ РФ)
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Период созревания Coinbase UTXO: 241 920 блоков (~14 дней)
                        </p>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-300">
                        Текущий блок: #{walletData.currentBlock.toLocaleString('ru-RU')}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                            <th className="py-3 px-5 font-medium">Дата</th>
                            <th className="py-3 px-4 font-medium">Блоки разблокировки</th>
                            <th className="py-3 px-4 font-medium text-right">UTXO</th>
                            <th className="py-3 px-4 font-medium text-right">Сумма QI</th>
                            <th className="py-3 px-4 font-medium text-right">В QUAI</th>
                            <th className="py-3 px-4 font-medium text-right">В USD ($)</th>
                            <th className="py-3 px-5 font-medium text-right">В RUB (₽ ЦБ)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 text-sm font-mono tabular-nums">
                          {walletData.unlockSchedule.map((row) => (
                            <tr key={row.dayOffset} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-5 font-sans text-slate-200">
                                Через {row.dayOffset} дн. ({new Date(row.estimatedDate).toLocaleDateString('ru-RU')})
                              </td>
                              <td className="py-3 px-4 text-slate-400">
                                #{row.startBlock.toLocaleString('ru-RU')} – #{row.endBlock.toLocaleString('ru-RU')}
                              </td>
                              <td className="py-3 px-4 text-right text-amber-400">
                                {row.utxoCount.toLocaleString('ru-RU')}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-slate-100">
                                +{row.qiAmount} QI
                              </td>
                              <td className="py-3 px-4 text-right text-rose-300">
                                ≈ {Number(row.quaiEquivalent).toLocaleString('ru-RU')} QUAI
                              </td>
                              <td className="py-3 px-4 text-right text-slate-200">
                                ${row.usdEquivalent}
                              </td>
                              <td className="py-3 px-5 text-right text-emerald-400 font-semibold">
                                {Number(row.rubEquivalent).toLocaleString('ru-RU')} ₽
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* UTXO Outpoints Table */}
                {combinedOutpoints.length > 0 && (
                  <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <h3 className="text-base font-bold text-slate-100 font-display">
                        Инспектор UTXO-выходов ({walletData.address.slice(0, 10)}...)
                      </h3>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setUtxoFilter('all')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                              utxoFilter === 'all' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
                            }`}
                          >
                            Все
                          </button>
                          <button
                            type="button"
                            onClick={() => setUtxoFilter('unlocked')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                              utxoFilter === 'unlocked' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            Разблокированные ({walletData.utxoSummary.unlockedOutpointsCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setUtxoFilter('locked')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                              utxoFilter === 'locked' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
                            }`}
                          >
                            В заморозке
                          </button>
                        </div>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={utxoSearch}
                            onChange={(e) => setUtxoSearch(e.target.value)}
                            placeholder="Фильтр по txHash или блоку..."
                            className="bg-[#0B0F17] border border-slate-800 focus:border-rose-500 focus:outline-none rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                            <th className="py-3 px-6 font-medium">txHash (ссылка на explorer.qu.ai)</th>
                            <th className="py-3 px-4 font-medium text-right">Индекс</th>
                            <th className="py-3 px-4 font-medium text-right">Сумма QI</th>
                            <th className="py-3 px-4 font-medium text-right">Блок разблокировки</th>
                            <th className="py-3 px-4 font-medium text-right">Осталось блоков</th>
                            <th className="py-3 px-6 font-medium text-right">Статус</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
                          {combinedOutpoints.map((op, i) => (
                            <tr key={`${op.txHash}-${op.index}-${i}`} className="hover:bg-slate-800/30">
                              <td className="py-3 px-6">
                                <a
                                  href={`https://explorer.qu.ai/tx/${op.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-300 hover:text-rose-400 inline-flex items-center gap-1"
                                >
                                  <span>
                                    {op.txHash.slice(0, 16)}...{op.txHash.slice(-10)}
                                  </span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </td>
                              <td className="py-3 px-4 text-right text-slate-400">#{op.index}</td>
                              <td className="py-3 px-4 text-right font-semibold text-slate-100">{op.qi} QI</td>
                              <td className="py-3 px-4 text-right text-slate-300">
                                #{op.lockBlock.toLocaleString('ru-RU')}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-400">
                                {op.status === 'UNLOCKED'
                                  ? '0'
                                  : `${op.blocksRemaining.toLocaleString('ru-RU')} (~${op.estimatedHoursRemaining} ч)`}
                              </td>
                              <td className="py-3 px-6 text-right font-sans">
                                {op.status === 'UNLOCKED' ? (
                                  <span className="text-emerald-400 font-medium">Доступен</span>
                                ) : (
                                  <span className="text-amber-400 font-medium">В разблокировке</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* SECTION 2: DECRYPT QUAI WALLET & SEND QUAI / CONVERT QUAI -> QI + TRANSACTION HISTORY */}
        {(activeSection === 'overview' || activeSection === 'quai-wallet') && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Decrypt / Open QUAI Wallet (6 cols) */}
              <section className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">
                  Расшифровка кошелька QUAI (EVM) · Keystore JSON / BIP-39 Сид-фраза / Приватный ключ
                </div>
                <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                  <FileKey className="w-5 h-5 text-rose-400" />
                  <span>Открыть или расшифровать кошелек QUAI</span>
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Расшифруйте ваш кошелек QUAI из зашифрованного файла Keystore JSON с паролем, мнемонической фразы из 12/24 слов (Pelagus) или приватного ключа. Данные не сохраняются.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                {[
                  { id: 'PRIVATE_KEY', label: 'Приватный ключ' },
                  { id: 'MNEMONIC', label: 'Сид-фраза (12/24 слова)' },
                  { id: 'KEYSTORE', label: 'Keystore JSON + Пароль' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDecryptMode(m.id as any)}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      decryptMode === m.id
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {decryptMode === 'PRIVATE_KEY' && (
                <div className="space-y-1.5">
                  <label htmlFor="quai-pk-field" className="block text-xs font-medium text-slate-300">
                    Приватный ключ QUAI (0x...)
                  </label>
                  <input
                    id="quai-pk-field"
                    type="password"
                    autoComplete="off"
                    value={quaiPkInput}
                    onChange={(e) => setQuaiPkInput(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100"
                  />
                </div>
              )}

              {decryptMode === 'MNEMONIC' && (
                <div className="space-y-1.5">
                  <label htmlFor="quai-seed-field" className="block text-xs font-medium text-slate-300">
                    Мнемоническая фраза BIP-39 (12 или 24 слова через пробел)
                  </label>
                  <textarea
                    id="quai-seed-field"
                    rows={3}
                    autoComplete="off"
                    spellCheck={false}
                    value={quaiMnemonicInput}
                    onChange={(e) => setQuaiMnemonicInput(e.target.value)}
                    placeholder="word1 word2 word3 ... word12"
                    className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100"
                  />
                  <p className="text-xs text-slate-400">
                    Из сид-фразы будут одновременно вычислены ваш адрес QUAI (EVM) и ваш адрес QI (UTXO) в зоне Cyprus-1.
                  </p>
                </div>
              )}

              {decryptMode === 'KEYSTORE' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="quai-ks-field" className="block text-xs font-medium text-slate-300">
                      Содержимое JSON Keystore файла
                    </label>
                    <textarea
                      id="quai-ks-field"
                      rows={4}
                      value={quaiKeystoreInput}
                      onChange={(e) => setQuaiKeystoreInput(e.target.value)}
                      placeholder='{"version":3,"id":"...","address":"...","crypto":{...}}'
                      className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="quai-ks-pass" className="block text-xs font-medium text-slate-300">
                      Пароль расшифровки Keystore
                    </label>
                    <input
                      id="quai-ks-pass"
                      type="password"
                      autoComplete="off"
                      value={quaiKeystorePassword}
                      onChange={(e) => setQuaiKeystorePassword(e.target.value)}
                      placeholder="Введите пароль от Keystore..."
                      className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>
              )}

              {decryptError && (
                <div className="bg-rose-950/50 border border-rose-800 rounded-lg p-3 text-xs text-rose-200">
                  {decryptError}
                </div>
              )}

              <button
                type="button"
                onClick={handleDecryptQuaiWallet}
                disabled={decryptLoading}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {decryptLoading ? 'Расшифровка и запрос баланса...' : 'Расшифровать кошелек и загрузить баланс'}
              </button>

              {/* Decrypted QUAI Wallet Details */}
              {decryptedQuaiWallet && (
                <div className="pt-4 border-t border-slate-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between text-emerald-400 font-semibold">
                    <span>{decryptedQuaiWallet.sourceLabel}</span>
                    <span className="font-mono">{decryptedQuaiWallet.ledgerType}</span>
                  </div>

                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-2.5 font-mono tabular-nums">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 font-sans">Адрес кошелька:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-100">{decryptedQuaiWallet.address}</span>
                        <button
                          type="button"
                          onClick={() => copyText(decryptedQuaiWallet.address, 'dec-quai-addr')}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          {copiedId === 'dec-quai-addr' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 font-sans">Расшифрованный приватный ключ:</span>
                      <button
                        type="button"
                        onClick={() => copyText(decryptedQuaiWallet.privateKey, 'dec-quai-pk')}
                        className="text-rose-300 hover:text-rose-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>{decryptedQuaiWallet.privateKey.slice(0, 14)}...</span>
                        {copiedId === 'dec-quai-pk' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400 font-sans">Баланс QUAI:</span>
                      <span className="text-base font-bold text-slate-100">
                        {decryptedQuaiWallet.balanceQuai} QUAI (≈ {decryptedQuaiWallet.balanceQiEquivalent} QI)
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-sans">Оценка в валюте:</span>
                      <span className="text-emerald-400 font-semibold">
                        ${decryptedQuaiWallet.balanceUsd} USD · {Number(decryptedQuaiWallet.balanceRub).toLocaleString('ru-RU')} ₽ (ЦБ)
                      </span>
                    </div>

                    {decryptedQuaiWallet.qiCompanionAddress && (
                      <div className="pt-2 border-t border-slate-800 space-y-1">
                        <span className="text-slate-400 font-sans block">
                          Парный QI-адрес этой же сид-фразы (Cyprus-1 UTXO):
                        </span>
                        <div className="flex items-center justify-between text-amber-300">
                          <span>{decryptedQuaiWallet.qiCompanionAddress}</span>
                          <button
                            type="button"
                            onClick={() => copyText(decryptedQuaiWallet.qiCompanionAddress!, 'comp-qi')}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            {copiedId === 'comp-qi' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Export Encrypted Keystore JSON */}
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="password"
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      placeholder="Пароль для экспорта в Keystore JSON..."
                      className="flex-1 bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleExportEncryptedKeystore}
                      disabled={exportingKeystore || exportPassword.length < 4}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      Скачать Keystore JSON
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Right Column: Send QUAI or Convert QUAI -> QI (6 cols) */}
            <section className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">
                  Отправка QUAI (EVM) и Протокольная конвертация QUAI → QI
                </div>
                <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                  <Send className="w-5 h-5 text-rose-400" />
                  <span>Отправить QUAI или конвертировать QUAI → QI</span>
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Если указать в качестве получателя адрес <strong>QUAI</strong> (второй байт <code className="font-mono">&lt; 0x80</code>), выполнится обычный перевод QUAI. Если указать адрес <strong>QI</strong> (второй байт <code className="font-mono">&gt;= 0x80</code>, например <code className="font-mono">0x00AC...</code>), протокол Quai автоматически сконвертирует отправленные QUAI в UTXO-купюры QI!
                </p>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-800/80">
                <div className="space-y-1.5">
                  <label htmlFor="quai-to-addr" className="block text-xs font-medium text-slate-300">
                    Адрес получателя (QUAI-адрес для перевода или QI-адрес для конвертации в QI)
                  </label>
                  <input
                    id="quai-to-addr"
                    type="text"
                    value={quaiToAddress}
                    onChange={(e) => setQuaiToAddress(e.target.value)}
                    placeholder="0x00... (QUAI или QI адрес в зоне Cyprus-1)"
                    className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="quai-send-amt" className="block text-xs font-medium text-slate-300">
                      Сумма отправки (QUAI)
                    </label>
                    <input
                      id="quai-send-amt"
                      type="number"
                      step="0.1"
                      value={quaiSendAmount}
                      onChange={(e) => setQuaiSendAmount(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-100"
                    />
                    <span className="block text-[11px] text-slate-400 font-mono tabular-nums">
                      ≈ ${(Number(quaiSendAmount || '0') * quaiUsd).toFixed(2)} USD ·{' '}
                      {(Number(quaiSendAmount || '0') * quaiRub).toFixed(2)} ₽
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="quai-slippage" className="block text-xs font-medium text-slate-300">
                      Макс. проскальзывание для QUAI → QI (%)
                    </label>
                    <input
                      id="quai-slippage"
                      type="number"
                      step="1"
                      min="1"
                      max="50"
                      value={quaiSlippage}
                      onChange={(e) => setQuaiSlippage(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-100"
                    />
                    <span className="block text-[11px] text-slate-400 font-mono tabular-nums">
                      Ожидаемый выход в QI: ≈ {(Number(quaiSendAmount || '0') / rateQiToQuai).toFixed(3)} QI
                    </span>
                  </div>
                </div>

                {quaiActionError && (
                  <div className="bg-rose-950/50 border border-rose-800 rounded-lg p-3 text-xs text-rose-200">
                    {quaiActionError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleRunQuaiAction(false)}
                    disabled={quaiActionLoading}
                    className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    1. Предпросмотр и расчет газа (Без отправки)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunQuaiAction(true)}
                    disabled={quaiActionLoading}
                    className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    2. Подписать и отправить в сеть Quai
                  </button>
                </div>

                {quaiActionResult && (
                  <div className="pt-4 border-t border-slate-800 space-y-2 text-xs font-mono tabular-nums">
                    <div className="text-emerald-400 font-sans font-semibold">
                      {quaiActionResult.mode === 'DRY_RUN'
                        ? 'Тестовая подпись успешна (транзакция готова к отправке)'
                        : 'Транзакция отправлена в блокчейн Quai Network!'}
                    </div>
                    <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Тип операции:</span>
                        <span className="text-rose-300">
                          {quaiActionResult.actionType === 'CONVERT_QUAI_TO_QI'
                            ? 'Протокольная конвертация QUAI → QI'
                            : 'Перевод QUAI → QUAI'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Сумма QUAI:</span>
                        <span className="text-slate-100">{quaiActionResult.amountQuai} QUAI</span>
                      </div>
                      {quaiActionResult.expectedQiOutput && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Ожидаемое зачисление QI:</span>
                          <span className="text-emerald-400 font-semibold">
                            ≈ {quaiActionResult.expectedQiOutput} QI
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Комиссия газа:</span>
                        <span className="text-amber-400">~{quaiActionResult.estimatedFeeQuai} QUAI</span>
                      </div>
                      <div className="flex justify-between items-center gap-2 pt-1 border-t border-slate-800">
                        <span className="text-slate-400">Хэш транзакции:</span>
                        <a
                          href={`https://explorer.qu.ai/tx/${quaiActionResult.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rose-400 hover:underline truncate max-w-[260px]"
                        >
                          {quaiActionResult.txHash}
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </section>
            </div>

            {/* Transaction History Component for QUAI -> QI Wallet Section */}
            <TransactionHistoryPanel
              activeWalletAddress={decryptedQuaiWallet?.address || walletData?.address || null}
              companionQiAddress={decryptedQuaiWallet?.qiCompanionAddress || null}
              sessionTxHashes={sessionTxHashes}
              onAddTrackedTxHash={handleAddTrackedTxHash}
            />
          </div>
        )}

        {/* SECTION 3: BUILT-IN PROTOCOL CONVERTER (QI -> QUAI) */}
        {activeSection === 'converter' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">
                  Протокольная конвертация UTXO · QiHDWallet.convertToQuai (22-байтный payload go-quai)
                </div>
                <h2 className="text-lg font-bold text-slate-100 font-display">
                  Конвертация разблокированных QI → QUAI (Cyprus-1)
                </h2>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-800/80">
                <div className="space-y-1.5">
                  <label htmlFor="conv-pk-input" className="block text-xs font-medium text-slate-300">
                    Приватный ключ вашего QI-кошелька (0x...)
                  </label>
                  <input
                    id="conv-pk-input"
                    type="password"
                    autoComplete="off"
                    value={walletInput}
                    onChange={(e) => setWalletInput(e.target.value)}
                    placeholder="Введите приватный ключ QI-кошелька 0x..."
                    className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="convert-amount-qi" className="font-medium text-slate-300">
                      Сумма конвертации (QI)
                    </label>
                    <span className="text-slate-300 font-mono tabular-nums">
                      ≈ {expectedFromConverterInput} QUAI (${(Number(convertAmountQi || '0') * qiUsd).toFixed(2)} ·{' '}
                      {(Number(convertAmountQi || '0') * qiRub).toFixed(2)} ₽)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="convert-amount-qi"
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={convertAmountQi}
                      onChange={(e) => setConvertAmountQi(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setConvertAmountQi('0.05')}
                      className="px-3 py-2.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      0.05 QI
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="dest-quai-addr" className="font-medium text-slate-300">
                      Адрес получателя QUAI (Cyprus-1, второй байт &lt; 0x80)
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateSafeQuaiReceiver}
                      disabled={generatingReceiver}
                      className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Сгенерировать новый QUAI-кошелек</span>
                    </button>
                  </div>
                  <input
                    id="dest-quai-addr"
                    type="text"
                    value={destQuaiAddress}
                    onChange={(e) => setDestQuaiAddress(e.target.value)}
                    placeholder="0x00138F225c245A597D881bcE5bf95ffDFfa7A259"
                    className="w-full bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100"
                  />
                </div>

                {convertError && (
                  <div className="bg-rose-950/50 border border-rose-800 rounded-lg p-3.5 text-xs text-rose-200">
                    {convertError}
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRunConversion(false)}
                    disabled={convertLoading}
                    className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    1. Проверить комиссию и подпись (Без отправки)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunConversion(true)}
                    disabled={convertLoading}
                    className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    2. Подписать и отправить в сеть Quai Mainnet
                  </button>
                </div>
              </div>

              {convertResult && (
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400">
                      {convertResult.mode === 'DRY_RUN'
                        ? 'Предпросмотр подписанной транзакции (Без отправки)'
                        : 'Транзакция отправлена в сеть Quai Mainnet!'}
                    </span>
                  </div>

                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Отправитель (QI):</span>
                      <span className="text-slate-200">{convertResult.sourceQiAddress}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Получатель (QUAI):</span>
                      <span className="text-emerald-400">{convertResult.destinationQuaiAddress}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Сумма QI / Выход QUAI:</span>
                      <span className="text-rose-400 font-semibold">
                        {convertResult.requestedAmountQi} QI → ≈ {convertResult.expectedQuaiReceived} QUAI
                      </span>
                    </div>
                    {convertResult.conversionDataHex && (
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-400">Поле data (22 байта):</span>
                        <span className="text-emerald-300 truncate max-w-[260px]">
                          {convertResult.conversionDataHex}
                        </span>
                      </div>
                    )}
                    {convertResult.outputs && convertResult.outputs.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <span className="text-slate-400 block">Выходы транзакции (txOutputs):</span>
                        {convertResult.outputs.map((out, idx) => (
                          <div
                            key={`${out.address}-${idx}`}
                            className="bg-[#111827] border border-slate-800/90 rounded p-2 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={
                                  out.type === 'CONVERSION_TO_QUAI'
                                    ? 'text-rose-300 font-semibold'
                                    : 'text-emerald-300'
                                }
                              >
                                {out.type === 'CONVERSION_TO_QUAI'
                                  ? `Конвертация в QUAI (${out.qiAmount} QI)`
                                  : `Сдача QI (${out.qiAmount} QI)`}
                              </span>
                              <span className="text-slate-300 truncate max-w-[220px]">{out.address}</span>
                            </div>
                            {out.changePrivateKey && (
                              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                                <span>Приватный ключ сдачи:</span>
                                <button
                                  type="button"
                                  onClick={() => copyText(out.changePrivateKey!, `chg-pk-${idx}`)}
                                  className="text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{out.changePrivateKey.slice(0, 14)}...</span>
                                  {copiedId === `chg-pk-${idx}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Right Column: Safe QUAI Wallet Generator */}
            <section className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">Генератор нового кошелька QUAI (Cyprus-1)</div>
                <h3 className="text-base font-bold text-slate-100 font-display">
                  Создать чистый QUAI-адрес для получения средств
                </h3>
              </div>

              {generatedReceiver ? (
                <div className="bg-[#0B0F17] border border-emerald-800/70 rounded-lg p-4 space-y-3 text-xs font-mono">
                  <div className="text-emerald-400 font-sans font-semibold">
                    Новый кошелек QUAI создан (сохраните ключ и сид-фразу):
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-sans block">Адрес QUAI:</span>
                    <div className="flex items-center justify-between gap-2 bg-[#111827] p-2 rounded border border-slate-800">
                      <span className="text-slate-100 truncate">{generatedReceiver.address}</span>
                      <button
                        type="button"
                        onClick={() => copyText(generatedReceiver.address, 'gen-addr')}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {copiedId === 'gen-addr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-sans block">Приватный ключ:</span>
                    <div className="flex items-center justify-between gap-2 bg-[#111827] p-2 rounded border border-slate-800">
                      <span className="text-rose-300 truncate">{generatedReceiver.privateKey}</span>
                      <button
                        type="button"
                        onClick={() => copyText(generatedReceiver.privateKey, 'gen-pk')}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {copiedId === 'gen-pk' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-sans block">Сид-фраза (12 слов):</span>
                    <div className="flex items-center justify-between gap-2 bg-[#111827] p-2 rounded border border-slate-800">
                      <span className="text-amber-300 break-words">{generatedReceiver.mnemonicPhrase}</span>
                      <button
                        type="button"
                        onClick={() => copyText(generatedReceiver.mnemonicPhrase, 'gen-seed')}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {copiedId === 'gen-seed' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateSafeQuaiReceiver}
                  disabled={generatingReceiver}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-medium text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Сгенерировать новый чистый QUAI-кошелек
                </button>
              )}
            </section>
          </div>
        )}

        {/* SECTION 4: EXPLORER.QU.AI TOOLS & MARKET RATES */}
        {(activeSection === 'overview' || activeSection === 'quai-wallet' || activeSection === 'explorer') && (
          <div className="space-y-6">
            <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">
                    Интеграция с официальным обозревателем https://explorer.qu.ai/
                  </div>
                  <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                    <Compass className="w-5 h-5 text-rose-400" />
                    <span>Поиск транзакций, блоков и проверка адресов Quai Network</span>
                  </h2>
                </div>
                <a
                  href="https://explorer.qu.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>Открыть explorer.qu.ai</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={explorerQuery}
                  onChange={(e) => setExplorerQuery(e.target.value)}
                  placeholder="Введите хэш транзакции (0x...), адрес (0x...) или номер блока Cyprus-1..."
                  className="flex-1 bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleExplorerLookup}
                  disabled={explorerLoading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {explorerLoading ? 'Поиск в RPC...' : 'Найти в блокчейне'}
                </button>
              </div>

              {explorerError && (
                <div className="bg-rose-950/50 border border-rose-800 rounded-lg p-3 text-xs text-rose-200">
                  {explorerError}
                </div>
              )}

              {explorerResult && (
                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-sans font-semibold">
                      Результат проверки ({explorerResult.lookupType})
                    </span>
                    <a
                      href={explorerResult.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rose-400 hover:underline inline-flex items-center gap-1 font-sans"
                    >
                      <span>Смотреть на explorer.qu.ai</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed max-h-80">
                    {JSON.stringify(explorerResult, null, 2)}
                  </pre>
                </div>
              )}
            </section>
          </div>
        )}

        {/* SECTION 5: WINDOWS STANDALONE EXPORT, GUI INSTALLER & SYSTEM REQUIREMENTS */}
        {activeSection === 'windows' && (
          <WindowsSetupSection
            onDownloadCliMjs={() => downloadWindowsBundle('mjs')}
            onDownloadCliBat={() => downloadWindowsBundle('bat')}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-6 lg:px-10 text-xs text-slate-400 mt-auto">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>QuaiVault — Публичный некастодиальный сервис QI и QUAI (нулевое хранение ключей)</span>
          <span className="font-mono tabular-nums">
            Узел: https://rpc.quai.network/cyprus1 · Эксплорер: https://explorer.qu.ai/
          </span>
        </div>
      </footer>
    </div>
  );
}
