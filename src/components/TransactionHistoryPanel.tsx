import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
} from 'lucide-react';
import type { WalletTransactionItem, WalletTransactionsResponse } from '../types';

interface TransactionHistoryPanelProps {
  activeWalletAddress: string | null;
  companionQiAddress: string | null;
  sessionTxHashes: string[];
  onAddTrackedTxHash: (txHash: string) => void;
}

export const TransactionHistoryPanel: React.FC<TransactionHistoryPanelProps> = ({
  activeWalletAddress,
  companionQiAddress,
  sessionTxHashes,
  onAddTrackedTxHash,
}) => {
  const [addressInput, setAddressInput] = useState<string>(activeWalletAddress || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<WalletTransactionsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'PENDING' | 'CONVERSION'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [trackTxInput, setTrackTxInput] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoPollEnabled, setAutoPollEnabled] = useState<boolean>(true);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const fetchTransactions = useCallback(
    async (targetAddr: string, silent = false) => {
      const clean = targetAddr.trim();
      if (!clean) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch('/api/wallet/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: clean,
            recentTxHashes: sessionTxHashes,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось загрузить историю операций кошелька.');
        }
        setHistoryData(data);
      } catch (err: any) {
        if (!silent) {
          setError(err?.message || 'Ошибка при загрузке истории транзакций.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [sessionTxHashes]
  );

  // Sync when decrypted wallet changes or new transaction is broadcasted
  useEffect(() => {
    if (activeWalletAddress) {
      setAddressInput(activeWalletAddress);
      fetchTransactions(activeWalletAddress);
    }
  }, [activeWalletAddress, sessionTxHashes, fetchTransactions]);

  // Auto-poll every 12 seconds if there are pending transactions or active address
  const hasPendingTxs = useMemo(() => {
    return historyData?.transactions.some((tx) => tx.status === 'PENDING') ?? false;
  }, [historyData]);

  useEffect(() => {
    if (!autoPollEnabled || !addressInput.trim() || !historyData) return;
    const intervalMs = hasPendingTxs ? 8000 : 20000;
    const timer = setInterval(() => {
      fetchTransactions(addressInput, true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoPollEnabled, addressInput, historyData, hasPendingTxs, fetchTransactions]);

  const filteredTransactions = useMemo(() => {
    if (!historyData?.transactions) return [];
    return historyData.transactions.filter((tx) => {
      if (statusFilter === 'SUCCESS' && tx.status !== 'SUCCESS') return false;
      if (statusFilter === 'PENDING' && tx.status !== 'PENDING') return false;
      if (statusFilter === 'CONVERSION' && tx.direction !== 'CONVERSION') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesHash = tx.txHash.toLowerCase().includes(q);
        const matchesFrom = tx.fromAddress.toLowerCase().includes(q);
        const matchesTo = tx.toAddress.toLowerCase().includes(q);
        const matchesOp = tx.operationLabel.toLowerCase().includes(q);
        if (!matchesHash && !matchesFrom && !matchesTo && !matchesOp) return false;
      }
      return true;
    });
  }, [historyData, statusFilter, searchQuery]);

  const handleAddManualTxHash = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHash = trackTxInput.trim();
    if (!cleanHash.startsWith('0x') || cleanHash.length !== 66) {
      setError('Введите корректный 66-символьный хэш транзакции (0x...) для отслеживания статуса.');
      return;
    }
    setError(null);
    onAddTrackedTxHash(cleanHash);
    setTrackTxInput('');
    if (addressInput.trim()) {
      fetchTransactions(addressInput);
    }
  };

  const counts = useMemo(() => {
    const list = historyData?.transactions || [];
    return {
      all: list.length,
      success: list.filter((t) => t.status === 'SUCCESS').length,
      pending: list.filter((t) => t.status === 'PENDING').length,
      conversion: list.filter((t) => t.direction === 'CONVERSION').length,
    };
  }, [historyData]);

  return (
    <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
      {/* Header Bar */}
      <div className="p-6 border-b border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>История операций кошелька (Cyprus-1)</span>
              <span aria-hidden="true">·</span>
              <span>Статусы RPC в реальном времени</span>
              <span aria-hidden="true">·</span>
              <span>Прямая интеграция с explorer.qu.ai</span>
            </div>
            <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
              <History className="w-5 h-5 text-rose-400" />
              <span>История операций и статусы транзакций (QUAI ↔ QI)</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {companionQiAddress && activeWalletAddress && (
              <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAddressInput(activeWalletAddress);
                    fetchTransactions(activeWalletAddress);
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    addressInput.toLowerCase() === activeWalletAddress.toLowerCase()
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Адрес QUAI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddressInput(companionQiAddress);
                    fetchTransactions(companionQiAddress);
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    addressInput.toLowerCase() === companionQiAddress.toLowerCase()
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Парный адрес QI
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setAutoPollEnabled((prev) => !prev)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                autoPollEnabled
                  ? 'bg-emerald-950/30 border-emerald-800/70 text-emerald-300'
                  : 'bg-[#0B0F17] border-slate-800 text-slate-400'
              }`}
            >
              {autoPollEnabled ? 'Автообновление: ВКЛ' : 'Автообновление: ВЫКЛ'}
            </button>

            <button
              type="button"
              onClick={() => fetchTransactions(addressInput)}
              disabled={loading || !addressInput.trim()}
              className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Обновить историю</span>
            </button>
          </div>
        </div>

        {/* Address Query Bar + Track Specific TxHash */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          <div className="lg:col-span-7 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Введите адрес кошелька QUAI или QI (0x00...) для загрузки истории операций..."
              className="flex-1 bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100"
            />
            <button
              type="button"
              onClick={() => fetchTransactions(addressInput)}
              disabled={loading || !addressInput.trim()}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              Загрузить операции
            </button>
          </div>

          <form onSubmit={handleAddManualTxHash} className="lg:col-span-5 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={trackTxInput}
              onChange={(e) => setTrackTxInput(e.target.value)}
              placeholder="Добавить хэш транзакции (0x...) для отслеживания статуса..."
              className="flex-1 bg-[#0B0F17] border border-slate-700 focus:border-rose-500 focus:outline-none rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100"
            />
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Проверить txHash
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-rose-950/50 border border-rose-800 rounded-lg p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Filter Tabs & Search */}
        {historyData && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  statusFilter === 'ALL' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Все ({counts.all})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('SUCCESS')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  statusFilter === 'SUCCESS'
                    ? 'bg-slate-800 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Успешно ({counts.success})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  statusFilter === 'PENDING'
                    ? 'bg-slate-800 text-amber-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                В ожидании ({counts.pending})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CONVERSION')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  statusFilter === 'CONVERSION'
                    ? 'bg-slate-800 text-rose-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Конвертации QUAI ↔ QI ({counts.conversion})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по txHash или адресу..."
                  className="bg-[#0B0F17] border border-slate-800 focus:border-rose-500 focus:outline-none rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100"
                />
              </div>

              <a
                href={`https://explorer.qu.ai/address/${historyData.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 font-medium whitespace-nowrap"
              >
                <span>Адрес на explorer.qu.ai</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      {!historyData && !loading ? (
        <div className="p-8 text-center space-y-2">
          <p className="text-sm text-slate-300 font-medium">
            Откройте кошелек QUAI слева или введите адрес кошелька (0x00...) в поле выше
          </p>
          <p className="text-xs text-slate-400">
            Здесь отобразятся последние транзакции по адресу кошелька, включая переводы QUAI, протокольные конвертации QUAI ↔ QI, статус подтверждения и прямые ссылки на explorer.qu.ai.
          </p>
        </div>
      ) : loading && !historyData ? (
        <div className="p-8 text-center text-xs text-slate-400 font-mono">
          Запрос истории транзакций из индексатора Quai Network и узла Cyprus-1...
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <p className="text-sm text-slate-300">
            По адресу <code className="font-mono text-slate-200">{historyData?.address}</code> операций по выбранному фильтру не найдено.
          </p>
          <p className="text-xs text-slate-400">
            Если вы только что отправили транзакцию, нажмите «Обновить историю» или вставьте ее txHash в поле отслеживания выше.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                <th className="py-3 px-5 font-medium">Хэш транзакции (explorer.qu.ai)</th>
                <th className="py-3 px-4 font-medium">Тип операции</th>
                <th className="py-3 px-4 font-medium">Маршрут (Отправитель → Получатель)</th>
                <th className="py-3 px-4 font-medium text-right">Сумма</th>
                <th className="py-3 px-4 font-medium text-right">В USD ($) / RUB (₽ ЦБ)</th>
                <th className="py-3 px-4 font-medium text-right">Блок / Время</th>
                <th className="py-3 px-5 font-medium text-right">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
              {filteredTransactions.map((tx: WalletTransactionItem) => (
                <tr key={tx.txHash} className="hover:bg-slate-800/30 transition-colors">
                  {/* txHash + copy + explorer link */}
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <a
                        href={tx.explorerTxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-200 hover:text-rose-400 inline-flex items-center gap-1 font-medium"
                        title={`Открыть транзакцию ${tx.txHash} на explorer.qu.ai`}
                      >
                        <span>
                          {tx.txHash.slice(0, 12)}...{tx.txHash.slice(-8)}
                        </span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(tx.txHash, `tx-${tx.txHash}`)}
                        className="text-slate-500 hover:text-slate-300 cursor-pointer"
                        title="Скопировать txHash"
                      >
                        {copiedId === `tx-${tx.txHash}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Operation Type */}
                  <td className="py-3.5 px-4 font-sans">
                    <div className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
                      {tx.direction === 'CONVERSION' ? (
                        <ArrowRightLeft className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : tx.direction === 'OUT' ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span>{tx.operationLabel}</span>
                    </div>
                  </td>

                  {/* From -> To with Explorer links */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      {tx.fromAddress.startsWith('0x') ? (
                        <a
                          href={tx.explorerFromUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-slate-200"
                        >
                          {tx.fromAddress.slice(0, 8)}...{tx.fromAddress.slice(-6)}
                        </a>
                      ) : (
                        <span>{tx.fromAddress}</span>
                      )}
                      <span aria-hidden="true" className="text-slate-600">→</span>
                      {tx.toAddress.startsWith('0x') ? (
                        <a
                          href={tx.explorerToUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-300 hover:text-rose-300"
                        >
                          {tx.toAddress.slice(0, 8)}...{tx.toAddress.slice(-6)}
                        </a>
                      ) : (
                        <span>{tx.toAddress}</span>
                      )}
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-100">
                    {tx.direction === 'OUT' ? '-' : '+'}
                    {tx.amount} {tx.currency}
                  </td>

                  {/* USD & RUB */}
                  <td className="py-3.5 px-4 text-right">
                    <span className="text-slate-200">${tx.amountUsd}</span>
                    <span aria-hidden="true" className="mx-1 text-slate-600">·</span>
                    <span className="text-emerald-400 font-semibold">
                      {Number(tx.amountRub).toLocaleString('ru-RU')} ₽
                    </span>
                  </td>

                  {/* Block & Timestamp */}
                  <td className="py-3.5 px-4 text-right text-slate-400">
                    {tx.blockNumber ? (
                      <a
                        href={`https://explorer.qu.ai/block/${tx.blockNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-300 hover:text-rose-400"
                      >
                        #{tx.blockNumber.toLocaleString('ru-RU')}
                      </a>
                    ) : (
                      <span className="text-amber-400">Мемпул</span>
                    )}
                    {tx.timestamp && (
                      <span className="block text-[11px] text-slate-500">
                        {new Date(tx.timestamp).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </td>

                  {/* Status (Success / Pending / Failed) */}
                  <td className="py-3.5 px-5 text-right font-sans">
                    {tx.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center justify-end gap-1.5 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{tx.statusLabel}</span>
                      </span>
                    ) : tx.status === 'PENDING' ? (
                      <span className="inline-flex items-center justify-end gap-1.5 text-amber-400 font-medium">
                        <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                        <span>{tx.statusLabel}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1.5 text-rose-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{tx.statusLabel}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
