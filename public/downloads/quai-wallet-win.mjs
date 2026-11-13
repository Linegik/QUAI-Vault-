// QuaiVault Windows Standalone Inspector & QI <-> QUAI Converter
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
  console.log('==============================================================\n');

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
        { jsonrpc: '2.0', id: 4, method: 'quai_getBalance', params: [targetAddress, 'latest'] },
      ]),
    }).then((r) => r.json()),
    fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=QUAI_USDT')
      .then((r) => r.json())
      .catch(() => []),
    fetch('https://www.cbr-xml-daily.ru/daily_json.js')
      .then((r) => r.json())
      .catch(() => ({})),
  ]);

  const currentBlock = parseInt(rpcRes[0].result, 16);
  const outpoints = rpcRes[1].result || [];
  const oneQiInQuai = Number(quais.formatQuai(rpcRes[2].result));
  const quaiUsd = gateRes?.[0]?.last ? Number(gateRes[0].last) : 0.00676;
  const usdRub = cbrRes?.Valute?.USD?.Value ? Number(cbrRes.Valute.USD.Value) : 83.15;

  console.log('\nАдрес кошелька:          ', targetAddress);
  console.log('Explorer Quai:            https://explorer.qu.ai/address/' + targetAddress);
  console.log('Текущий блок Cyprus-1:   ', currentBlock);
  console.log(
    'Курс QUAI:                $' +
      quaiUsd.toFixed(5) +
      ' USD | ' +
      (quaiUsd * usdRub).toFixed(2) +
      ' ₽ (ЦБ РФ: ' +
      usdRub.toFixed(2) +
      ' ₽/$)'
  );
  console.log(
    'Протокольный курс 1 QI:  ',
    oneQiInQuai.toFixed(4),
    'QUAI ($' + (oneQiInQuai * quaiUsd).toFixed(2) + ' USD | ' + (oneQiInQuai * quaiUsd * usdRub).toFixed(2) + ' ₽)\n'
  );

  if (quais.isQiAddress(targetAddress)) {
    let totalQit = 0n,
      unlockedQit = 0n,
      lockedQit = 0n;
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
    console.log(
      'ВСЕГО НА КОШЕЛЬКЕ (UTXO):',
      totalQi.toFixed(3),
      'QI | ~' +
        totalQuai.toFixed(2) +
        ' QUAI | $' +
        (totalQuai * quaiUsd).toFixed(2) +
        ' | ' +
        (totalQuai * quaiUsd * usdRub).toFixed(2) +
        ' ₽'
    );
    console.log('ДОСТУПНО СЕЙЧАС:         ', unlockedQi.toFixed(3), 'QI | ~' + (unlockedQi * oneQiInQuai).toFixed(2) + ' QUAI');
    console.log('В РАЗБЛОКИРОВКЕ (2 нед.):', lockedQi.toFixed(3), 'QI | ~' + (lockedQi * oneQiInQuai).toFixed(2) + ' QUAI');
  } else {
    const quaiBal = Number(quais.formatQuai(BigInt(rpcRes[3].result || '0x0')));
    console.log(
      'БАЛАНС QUAI (EVM):       ',
      quaiBal.toFixed(4),
      'QUAI | $' + (quaiBal * quaiUsd).toFixed(2) + ' | ' + (quaiBal * quaiUsd * usdRub).toFixed(2) + ' ₽'
    );
  }
}

main().catch(console.error);
