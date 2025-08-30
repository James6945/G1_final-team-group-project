// apps/merchant/eth.js
let provider, signer, contract, myAddr;

// ===== Utilities =====
const $  = (id) => document.getElementById(id);
const log = (m) => { const el = $('log'); if (el) { el.textContent += m + '\n'; el.scrollTop = el.scrollHeight; } };

// ===== Load ABI / Contract Address =====
async function loadContractMeta() {
  const abi = await (await fetch('./abi.json', { cache: 'no-store' })).json();
  let addrJson;
  try {
    addrJson = await (await fetch('./contracts_address.json', { cache: 'no-store' })).json();
  } catch {
    // Fallback: read from parent directory
    addrJson = await (await fetch('../parent/contracts_address.json', { cache: 'no-store' })).json();
  }
  const address = addrJson.SpendingLimitWallet || addrJson.address || addrJson.SLWallet;
  if (!address) throw new Error('contracts_address.json 未包含 SpendingLimitWallet 地址');
  return { abi, address };
}

// ================== Connect Wallet ==================
async function connect() {
  try {
    if (!window.ethereum) { alert('MetaMask not found'); return; }
    await ethereum.request({ method: 'eth_requestAccounts' });

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer   = provider.getSigner();
    myAddr   = await signer.getAddress();
    const net = await provider.getNetwork();

    $('addr') && ($('addr').textContent = myAddr);
    $('net')  && ($('net').textContent  = `${net.name || 'unknown'} (${net.chainId})`);
    $('me')   && ($('me').value = myAddr);

    // Try to load contract (failure won't block other functions)
    try {
      const { abi, address } = await loadContractMeta();
      contract = new ethers.Contract(address, abi, provider); // use provider to listen to events
      log(`✅ Ready. Contract: ${address}`);
    } catch (metaErr) {
      contract = null;
      log('⚠️ Contract metadata not loaded: ' + (metaErr?.message || metaErr));
      log('   连接已完成，但依赖合约的功能（白名单/事件）会提示 "contract not ready".');
    }

    // For QR code usage
    await refreshChainId();
  } catch (e) {
    console.error(e);
    log('❌ connect failed: ' + (e?.message || e));
  }
}

// ================== Account / Balance / Whitelist ==================
async function copyMe() {
  try {
    await navigator.clipboard.writeText(myAddr || '');
    log('📋 Copied merchant address.');
  } catch (e) { log('Copy failed: ' + e.message); }
}

async function refreshBalance() {
  try {
    const bal = await provider.getBalance(myAddr);
    $('bal') && ($('bal').textContent = `Balance: ${ethers.utils.formatEther(bal)} ETH`);
  } catch (e) { log('Balance query failed: ' + (e?.message || e)); }
}

async function checkWhitelist() {
  try {
    if (!contract) return log('contract not ready');
    const parent = $('parentAddr').value.trim();
    if (!parent || !ethers.utils.isAddress(parent)) return log('Please input a valid Parent address');

    // public mapping(address=>mapping(address=>bool)) merchantWhitelist;
    const allowed = await contract.merchantWhitelist(parent, myAddr);
    const bd = $('wlBadge');
    if (!bd) return;
    if (allowed) { bd.className = 'badge ok';  bd.textContent = 'ALLOWED'; }
    else         { bd.className = 'badge bad'; bd.textContent = 'BLOCKED'; }
  } catch (e) {
    console.error(e);
    log('Whitelist check failed: ' + (e?.message || e));
  }
}

// ================== Events: Live + Historical ==================
let handler = null;

function addRow(ev) {
  const tb = $('tbl');
  if (!tb) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${new Date(ev.time * 1000).toLocaleString()}</td>
    <td class="mono">${ev.child}</td>
    <td class="mono">${ev.merchant}</td>
    <td>${ev.amount}</td>
    <td><a href="https://etherscan.io/tx/${ev.tx}" target="_blank">${ev.tx.slice(0,10)}...</a></td>
  `;
  tb.prepend(tr);
}

function startLive() {
  if (!contract) return log('contract not ready');
  if (handler) return log('Live stream already running');

  handler = async (child, merchant, amount, event) => {
    try {
      const toLower = (a) => String(a).toLowerCase();
      if (toLower(merchant) !== toLower(myAddr)) return; // Only payments sent to me
      const blk = await provider.getBlock(event.blockNumber);
      addRow({
        child,
        merchant,
        amount: ethers.utils.formatEther(amount),
        time: blk.timestamp,
        tx: event.transactionHash
      });
    } catch (e) { console.error(e); }
  };
  contract.on('Payment', handler);
  log('📡 Live stream started.');
}

function stopLive() {
  if (contract && handler) {
    contract.off('Payment', handler);
    handler = null;
    log('🛑 Live stream stopped.');
  }
}

async function fetchRecent() {
  if (!contract) return log('contract not ready');
  try {
    const current   = await provider.getBlockNumber();
    const fromBlock = Math.max(0, current - 5000);

    const iface  = new ethers.utils.Interface(contract.interface.fragments);
    const filter = { address: contract.address, fromBlock, toBlock: current };
    const logs   = await provider.getLogs(filter);
    const sig    = iface.getEventTopic('Payment');

    for (const lg of logs) {
      if (lg.topics[0] !== sig) continue;
      const parsed   = iface.parseLog(lg); // {args:[child, merchant, amount]}
      const child    = parsed.args[0];
      const merchant = parsed.args[1];
      const amount   = parsed.args[2];

      if (String(merchant).toLowerCase() !== String(myAddr).toLowerCase()) continue;

      const blk = await provider.getBlock(lg.blockNumber);
      addRow({
        child,
        merchant,
        amount: ethers.utils.formatEther(amount),
        time: blk.timestamp,
        tx: lg.transactionHash
      });
    }
    log('⏮️ fetched recent payments in last 5000 blocks.');
  } catch (e) {
    console.error(e);
    log('Fetch failed: ' + (e?.message || e));
  }
}

// ================== (2) Payment QR Code Feature ==================
let lastPaymentUri = null;
let currentChainId = null;

async function refreshChainId() {
  if (!provider) return;
  const net = await provider.getNetwork();
  currentChainId = net.chainId;
}

async function ensureBaseReady() {
  if (!provider || !myAddr) {
    alert('Connect wallet first');
    throw new Error('not ready');
  }
  if (!currentChainId) await refreshChainId();
}

function buildPaymentURI(amountEth) {
  const wei = ethers.utils.parseEther(String(amountEth)).toString();
  // EIP-681: ethereum:<toAddress>@<chainId>?value=<wei>
  return `ethereum:${myAddr}@${currentChainId}?value=${wei}`;
}

async function generateQR() {
  await ensureBaseReady();
  const amtEl = $('qrAmount');
  const canvas = $('qrCanvas');
  if (!amtEl || !canvas) { log('QR UI missing'); return; }

  const amt = amtEl.value.trim();
  if (!amt || Number(amt) <= 0) { alert('Invalid amount'); return; }

  const uri = buildPaymentURI(amt);
  lastPaymentUri = uri;

  // Draw onto canvas
  await QRCode.toCanvas(canvas, uri, { width: 320, margin: 1 });
  $('qrLink') && ($('qrLink').textContent = uri);
  log('✅ QR generated: ' + uri);
}

async function copyPaymentLink() {
  if (!lastPaymentUri) await generateQR();
  await navigator.clipboard.writeText(lastPaymentUri);
  log('📋 Copied link: ' + lastPaymentUri);
}

function downloadQR() {
  const canvas = $('qrCanvas');
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payment-qr.png';
  a.click();
}

// ================== Bind events (after DOMContentLoaded) ==================
window.addEventListener('DOMContentLoaded', () => {
  $('btnConnect')  && ($('btnConnect').onclick  = connect);
  $('btnCopy')     && ($('btnCopy').onclick     = copyMe);
  $('btnBal')      && ($('btnBal').onclick      = refreshBalance);
  $('btnCheckWL')  && ($('btnCheckWL').onclick  = checkWhitelist);
  $('btnStart')    && ($('btnStart').onclick    = startLive);
  $('btnStop')     && ($('btnStop').onclick     = stopLive);
  $('btnFetch')    && ($('btnFetch').onclick    = fetchRecent);

  // QR
  $('btnGenQR')    && ($('btnGenQR').onclick    = generateQR);
  $('btnCopyLink') && ($('btnCopyLink').onclick = copyPaymentLink);
  $('btnDlQR')     && ($('btnDlQR').onclick     = downloadQR);
});

// Sync state when switching chain/account (for QR code & events)
if (window.ethereum) {
  window.ethereum.on('chainChanged', () => { currentChainId = null; refreshChainId(); });
  window.ethereum.on('accountsChanged', () => { lastPaymentUri = null; });
}
