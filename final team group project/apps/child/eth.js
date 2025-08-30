// apps/child/eth.js
let provider, signer, contract;
const $ = (id) => document.getElementById(id);
const toWei = (v) => ethers.utils.parseUnits(String(v || 0), 'wei');
const ethToWei = (v) => ethers.utils.parseEther(String(v || 0));
const nowSec = () => Math.floor(Date.now() / 1000);

// -------- Replace: refresh display of "Per-Tx Limit / Daily Limit / Spent Today / Remaining Today" ----------
async function refreshLimits() {
  try {
    if (!contract || !signer) {
      console.warn('refreshLimits: contract/signer not ready');
      return;
    }

    // 1) Check if DOM exists (prevent HTML not updated or cached)
    const box = document.getElementById('limitsBox');
    if (!box) {
      console.warn('refreshLimits: #limitsBox not found in DOM');
      return;
    }

    const me = await signer.getAddress();

    // 2) Read limits (compatible with object or array return)
    const L = await contract.limitsOf(me);
    const perTxBN = (L && (L.perTx ?? L[0])) || ethers.constants.Zero;
    const dailyBN = (L && (L.daily ?? L[1])) || ethers.constants.Zero;

    // 3) Read today's spending (compatible with object or array return)
    const spentData = await contract.dailySpent(me);
    const spentBN = (spentData && (spentData.spent ?? spentData[0])) || ethers.constants.Zero;

    // 4) Format
    const perTx = perTxBN.isZero() ? '∞' : ethers.utils.formatEther(perTxBN);
    const daily = dailyBN.isZero() ? '∞' : ethers.utils.formatEther(dailyBN);
    const spent = ethers.utils.formatEther(spentBN);
    const remain =
      dailyBN.isZero() ? '∞'
      : Math.max(Number(ethers.utils.formatEther(dailyBN.sub(spentBN))), 0).toString();

    // 5) Write to page
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('perTxShow', perTx);
    set('dailyShow', daily);
    set('spentShow', spent);
    set('remainShow', remain);
    box.style.display = 'block';

    console.log('[limits]', { perTx, daily, spent, remain }); // so you can see it in the console
  } catch (e) {
    console.error('refreshLimits failed:', e);
  }
}

// Attach to window for manual triggering from console
window.refreshLimits = refreshLimits;

// -------- Connect wallet & bind contract ----------
async function connect() {
  if (!window.ethereum) {
    alert('MetaMask not found'); return;
  }
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  provider = new ethers.providers.Web3Provider(window.ethereum);
  const net = await provider.getNetwork();
  $('net').textContent = `${net.name} (${net.chainId})`;
  if (net.chainId !== 31337) {
    alert('请把 MetaMask 切到 Localhost 8545 (chainId 31337)'); return;
  }
  signer = provider.getSigner();
  $('addr').textContent = await signer.getAddress();

  const abi = await (await fetch('./abi.json', { cache: 'no-store' })).json();
  const addrJson = await (await fetch('./contracts_address.json', { cache: 'no-store' })).json();
  const address = addrJson.SpendingLimitWallet;
  contract = new ethers.Contract(address, abi, signer);
  console.log('Child connected contract', address);

  // New: immediately refresh display after successful connection
  await refreshLimits();

  // Optional: listen for contract Payment event; auto-refresh after own payment
  try {
    const me = (await signer.getAddress()).toLowerCase();
    contract.on('Payment', (child, merchant, value) => {
      if (child.toLowerCase() !== me) return;
      refreshLimits();
    });
  } catch {}
}

if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => location.reload());
  window.ethereum.on('chainChanged', () => location.reload());
}
window.addEventListener('DOMContentLoaded', () => {
  $('btnConnect')?.addEventListener('click', connect);
  $('btnPay')?.addEventListener('click', initiatePayment);
  $('btnTemp')?.addEventListener('click', requestTempLimit);
});

function parseDailySpentSimple(spentData) {
  const [spentWei, dayIdx] = spentData;
  const spentETH = ethers.utils.formatEther(spentWei);
  const dayIndex = dayIdx.toNumber();
  const date = new Date(dayIndex * 86400 * 1000).toISOString().split('T')[0];
  return { spentETH, date };
}

// Pay
async function pay() {
  if (!contract) {
    showFeedback('payFeedback', 'Please connect wallet first', 'error');
    return;
  }

  const merchantAddress = document.getElementById('merchant').value.trim();
  const amount = document.getElementById('amount').value.trim();

  if (!merchantAddress || !amount) {
    showFeedback('payFeedback', 'Please fill all fields', 'error');
    return;
  }

  try {
    showFeedback('payFeedback', 'Processing payment...', 'info');
    const tx = await contract.pay(merchantAddress, { value: ethers.utils.parseEther(amount) });

    showFeedback('payFeedback', 'Transaction sent. Waiting for confirmation...', 'info');

    const receipt = await tx.wait();
    if (receipt.status === 1) {
      showFeedback('payFeedback', 'Payment successful!', 'success');
      // New: after successful payment, refresh limits and today’s remaining
      await refreshLimits();
    } else {
      showFeedback('payFeedback', 'Transaction failed', 'error');
    }
  } catch (error) {
    console.error(error);
    showFeedback('payFeedback', `Payment failed: Account has been restricted or frozen`, 'error');
  }
}

// Request temporary limit
async function requestTempLimit() {
  if (!contract) {
    showFeedback('tempLimitFeedback', 'Please connect wallet first', 'error');
    return;
  }

  const amount = document.getElementById('temp').value.trim();

  if (!amount) {
    showFeedback('tempLimitFeedback', 'Please enter an amount', 'error');
    return;
  }

  try {
    showFeedback('tempLimitFeedback', 'Requesting temporary limit...', 'info');
    const tx = await contract.requestTempLimit(ethers.utils.parseEther(amount));

    showFeedback('tempLimitFeedback', 'Request sent. Waiting for confirmation...', 'info');

    const receipt = await tx.wait();
    if (receipt.status === 1) {
      showFeedback('tempLimitFeedback', 'Limit increase requested successfully!', 'success');
    } else {
      showFeedback('tempLimitFeedback', 'Request failed', 'error');
    }
  } catch (error) {
    console.error(error);
    showFeedback('tempLimitFeedback', 'Request failed: Please check Parent address', 'error');
  }
}

// Check daily spending
async function check() {
  if (!contract) {
    showFeedback('result', 'Please connect wallet first', 'error');
    return;
  }

  try {
    showFeedback('result', 'Checking daily spending...', 'info');
    const address = await signer.getAddress();
    const dailySpent = await contract.dailySpent(address);
    const data = parseDailySpentSimple(dailySpent);
    console.log(data);
    showFeedback('result', `${data.date} spent: ${data.spentETH} ETH`, 'success');

    // New: after query, also refresh the right-side display
    await refreshLimits();
  } catch (error) {
    console.error(error);
    showFeedback('result', 'Failed to check daily spent ', 'error');
  }
}

// Helper: show feedback messages
function showFeedback(elementId, message, type) {
  const element = document.getElementById(elementId);
  element.innerHTML = `<i class="fas fa-${getIconName(type)}"></i> ${message}`;
  element.className = `feedback ${type}`;
  element.style.display = 'flex';

  // Automatically hide success/info messages after 5 seconds
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
}

function getIconName(type) {
  switch (type) {
    case 'success': return 'check-circle';
    case 'error': return 'exclamation-circle';
    case 'warning': return 'exclamation-triangle';
    default: return 'info-circle';
  }
}
//
// Attach to window for manual triggering from console
window.refreshLimits = refreshLimits;
